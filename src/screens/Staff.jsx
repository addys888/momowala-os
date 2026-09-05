import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../lib/store';
import { CANCEL_REASONS, CategoryBand, PAY_BADGE, TODAY, WARE_TYPES, brand, colors, deductInventory, editInput, editLabel, groupByCat, isPaid, istTime, localNextToken, menuFor, menuLabelFor, onlineVendorsFor, orderStockDeltas, printerCfgFor, vendorEnabledFor, persistInv, playOrderAlert, restoreInventory, staffCancellable, unlockAudio, wareForOrder, wareLedger } from '../core';
import { Alert, BottomNav, EditModalShell, MenuItemRow, MetricCard, OrderItemLines, SectionHeader, SimpleItemRow, StockRow, TopBar } from '../components/shared';
import { RemindersButton } from '../components/RemindersButton';
import { printReceipt } from '../lib/escpos';

function StaffApp({ state, updateState, onExit, cartId, staffName }) {
  const [tab, setTab] = useState('order');
  const [cart, setCart] = useState([]);
  const [addTarget, setAddTarget] = useState(null); // pending order we're adding items to
  const [cancelTarget, setCancelTarget] = useState(null);
  const [justPlaced, setJustPlaced] = useState(null); // success toast after a staff order
  const [placing, setPlacing] = useState(false); // in-flight guard for the pay buttons
  const placingRef = React.useRef(false); // synchronous guard — blocks rapid double-taps before re-render
  const settlingRef = React.useRef(new Set()); // per-order guard against double-settle on pending orders
  const [settling, setSettling] = useState(() => new Set());
  const [splitSettle, setSplitSettle] = useState(null); // pending order being settled as split
  const [orderAlert, setOrderAlert] = useState(null); // new incoming customer order
  const [soundOn, setSoundOn] = useState(() => storage.get('alertSound', true) !== false);
  const prevPendingRef = React.useRef(null);
  const soundOnRef = React.useRef(soundOn); // latest value for the (non-reactive) detect effect
  const toggleSound = () => {
    const v = !soundOn;
    setSoundOn(v); soundOnRef.current = v; storage.set('alertSound', v);
    if (v) { unlockAudio(); playOrderAlert(); } // give an audible confirmation when turning on
  };

  // Unlock the audio context on the first tap so the alert beep can play later.
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  // Detect a newly-arrived pending (customer QR) order → beep + voice + banner.
  useEffect(() => {
    // Only CUSTOMER QR orders should trigger the incoming-order alert — not the
    // staff's own 'unpaid' counter orders (also stored as pending).
    const pend = state.orders.filter(o => o.cartId === cartId && o.date === TODAY && o.payment === 'pending' && o.source !== 'staff-entry');
    const ids = pend.map(o => o.id);
    if (prevPendingRef.current === null) { prevPendingRef.current = new Set(ids); return; } // skip first load
    const fresh = pend.find(o => !prevPendingRef.current.has(o.id));
    prevPendingRef.current = new Set(ids);
    if (fresh) { if (soundOnRef.current) playOrderAlert(); setOrderAlert(fresh); }
  }, [state.orders, cartId]);

  const cartInfo = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);

  // Login is gated at the role selector; this is just a safety net.
  if (!staffName) { onExit(); return null; }

  // Staff only ever sees orders for their own cart.
  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const myOrders = todayOrders.filter(o => o.staff === staffName);
  // Uncollected orders across ALL days — an unpaid order that rolled past its
  // day must still be collectable, or it's lost (invisible to owner revenue too).
  // Oldest first so stuck ones surface at the top.
  const pendingOrders = state.orders.filter(o => o.cartId === cartId && o.payment === 'pending').sort((a, b) => a.id - b.id);
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });

  const placeOrder = async (payment, extra) => {
    // Re-entrancy guard: the counter person can tap Cash/UPI again while the
    // token RPC is still in flight (laggy network). Without this, every tap
    // burned a server token AND fired a stock-deduction delta, while only the
    // last order save survived — producing the gaps (#047→#072) and silent
    // over-deduction. The ref blocks the second tap synchronously, before any
    // re-render can disable the button.
    if (cart.length === 0 || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
      // Shared per-cart/day counter (same RPC the customer QR flow uses) so staff
      // and customer tokens never collide; local count is the offline fallback.
      const serverNum = await nextOrderToken(cartId, TODAY);
      const token = String(serverNum ?? localNextToken(state.orders, cartId)).padStart(3, '0');
      const order = {
        id: Date.now(),
        cartId,
        token,
        date: TODAY,
        time: istTime(),
        items: cart,
        total,
        // 'unpaid' parks the order (payment collected later in the Pending tab);
        // cash/upi settle on the spot. Either way the food is made now.
        payment: payment === 'unpaid' ? 'pending' : payment,
        split: payment === 'split' ? { cash: extra?.cash || 0, upi: extra?.upi || 0 } : null,
        staff: staffName,
        source: 'staff-entry',
        stockDeducted: true, // counter food leaves the cart at punch, paid or not
      };
      // Counter food is made immediately, so deduct stock now (atomic delta) —
      // even for an unpaid order. Settling it later won't deduct again.
      const newInv = deductInventory(inv, cart, menu.items);
      // Functional update so the new order appends to the freshest orders list,
      // never a stale closure snapshot.
      updateState(s => ({ inventory: { ...s.inventory, [cartId]: newInv }, orders: [...s.orders, order] }));
      const deltas = orderStockDeltas(cart, menu.items);
      persistInv(cartId, Object.fromEntries(Object.entries(deltas).map(([k, p]) => [k, { dc: -p }])), { ...state.inventory, [cartId]: newInv });
      setCart([]);
      setJustPlaced({ token, total, payment, order });
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  // Append items to an existing pending order (customer added more before paying).
  // The original items already deducted stock at punch, so we deduct ONLY the
  // newly-added items and recompute the total — same token, still pending. Plates/
  // glasses re-derive from the items, so the theft audit stays correct too.
  const addToOrder = (target, extraItems) => {
    const reset = () => { setCart([]); setAddTarget(null); setTab('pending'); };
    if (!target || !extraItems?.length) { reset(); return; }
    const order = state.orders.find(o => o.id === target.id);
    if (!order || order.payment !== 'pending') { reset(); return; }
    const newItems = [...order.items, ...extraItems];
    const newTotal = newItems.reduce((s, it) => s + it.price * it.qty, 0);
    const newInv = deductInventory(inv, extraItems, menu.items);
    updateState(s => ({
      inventory: { ...s.inventory, [cartId]: newInv },
      orders: s.orders.map(o => o.id === target.id ? { ...o, items: newItems, total: newTotal } : o),
    }));
    const deltas = orderStockDeltas(extraItems, menu.items);
    persistInv(cartId, Object.fromEntries(Object.entries(deltas).map(([k, p]) => [k, { dc: -p }])), { ...state.inventory, [cartId]: newInv });
    reset();
  };

  // Customer QR orders arrive as 'pending'; staff confirms payment here,
  // and only then is stock deducted.
  const settleOrder = (orderId, payment, extra) => {
    if (settlingRef.current.has(orderId)) return;
    const order = state.orders.find(o => o.id === orderId);
    if (!order || order.payment !== 'pending') return;
    settlingRef.current.add(orderId);
    setSettling(s => new Set([...s, orderId]));
    try {
      // Unpaid counter orders already deducted stock at punch; QR orders deduct now.
      // Keyed on `source` (persisted) so it stays correct after a cloud reload,
      // where the transient stockDeducted flag would be lost.
      const alreadyDeducted = order.source === 'staff-entry' || !!order.stockDeducted;
      const newInv = alreadyDeducted ? inv : deductInventory(inv, order.items, menu.items);
      const split = payment === 'split' ? { cash: extra?.cash || 0, upi: extra?.upi || 0 } : null;
      setCartInv(newInv, {
        orders: state.orders.map(o => o.id === orderId ? { ...o, payment, split, staff: staffName, settledAt: new Date().toISOString(), stockDeducted: true } : o),
      });
      if (!alreadyDeducted) {
        const deltas = orderStockDeltas(order.items, menu.items);
        persistInv(cartId, Object.fromEntries(Object.entries(deltas).map(([k, p]) => [k, { dc: -p }])), { ...state.inventory, [cartId]: newInv });
      }
    } finally {
      settlingRef.current.delete(orderId);
      setSettling(s => { const n = new Set(s); n.delete(orderId); return n; });
    }
  };
  // Staff advances the kitchen status (preparing → ready) the customer sees live.
  const setPrepStatus = (orderId, status) => {
    updateState({ orders: state.orders.map(o => o.id === orderId ? { ...o, prepStatus: status } : o) });
  };
  // Cancelling keeps the order (marked 'cancelled' with a required reason) so it
  // stays in records and surfaces in the admin's activity feed — never deleted.
  // Works for pending QR orders AND already-settled staff orders (e.g. a counter
  // customer backs out): if the order was paid, its pieces are returned to stock.
  const confirmCancel = (orderId, reason) => {
    const order = state.orders.find(o => o.id === orderId);
    if (!order || order.payment === 'cancelled') { setCancelTarget(null); return; }
    // A settled (paid) COUNTER order can only be cancelled inside the 5-minute
    // window. Unpaid parked orders (pending) can be cancelled anytime — a no-show.
    if (isPaid(order) && !staffCancellable(order)) { setCancelTarget(null); return; }
    // Restore stock if this order had deducted it — paid counter orders AND unpaid
    // parked orders (both deducted at punch). Never-deducted QR pending: nothing back.
    // Reload-safe: paid orders and staff-entry (counter) orders both deducted at
    // punch/settle; never-deducted QR pending orders (source !== staff-entry) don't.
    const wasDeducted = isPaid(order) || order.source === 'staff-entry' || !!order.stockDeducted;
    const newInv = wasDeducted ? restoreInventory(inv, order.items, menu.items) : inv;
    updateState({
      inventory: { ...state.inventory, [cartId]: newInv },
      orders: state.orders.map(o => o.id === orderId
        ? { ...o, payment: 'cancelled', cancelReason: reason, staff: o.staff || staffName, settledAt: new Date().toISOString(), stockDeducted: false }
        : o),
    });
    if (wasDeducted) {
      const deltas = orderStockDeltas(order.items, menu.items);
      persistInv(cartId, Object.fromEntries(Object.entries(deltas).map(([k, p]) => [k, { dc: p }])), { ...state.inventory, [cartId]: newInv });
    }
    setCancelTarget(null);
  };

  // Staff adjusts the live prep/wait time customers see on their token screen.
  const setPrepMins = (mins) => {
    const m = Math.max(2, Math.min(10, mins));
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, defaultPrepMins: m } : c) });
  };

  // Staff logs damaged/wasted momos — deducts from cart stock + records it.
  const logWastage = (stockKey, qty, reason) => {
    const st = (menu.stockTypes || []).find(s => s.key === stockKey);
    const newInv = { ...inv };
    if (newInv[stockKey]) newInv[stockKey] = { ...newInv[stockKey], cart: Math.max(0, newInv[stockKey].cart - qty) };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: istTime(),
      stockKey, label: st?.label || stockKey, qty, reason, staff: staffName,
    };
    setCartInv(newInv, { wastageLogs: [...state.wastageLogs, log] });
    persistInv(cartId, { [stockKey]: { dc: -qty } }, { ...state.inventory, [cartId]: newInv });
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cartInfo?.name ?? 'Cart'} · ${staffName}`} onExit={() => { updateState({ staffOnDuty: null }); onExit(); }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={toggleSound} title={soundOn ? 'Order sound on — tap to mute' : 'Order sound off — tap to unmute'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: soundOn ? colors.ink : '#fff', color: soundOn ? colors.primary : colors.muted, border: `1px solid ${soundOn ? colors.ink : colors.border}`, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Order sound {soundOn ? 'On' : 'Off'}
          </button>
        </div>
        {tab === 'order' && <RemindersButton cartId={cartId} role="staff" />}
        {tab === 'order' && <NewOrderScreen cart={cart} setCart={setCart} onPlaceOrder={placeOrder} placing={placing} menu={menu} foodLabel={menuLabelFor(state, cartId)} inv={inv} ware={wareLedger(state, cartId, TODAY)} prepMins={cartInfo?.defaultPrepMins || 8} onSetPrep={setPrepMins} vendors={{ zomato: vendorEnabledFor(state, cartId, 'zomato'), swiggy: vendorEnabledFor(state, cartId, 'swiggy') }} addTarget={addTarget} onAddToOrder={(items) => addToOrder(addTarget, items)} onCancelAdd={() => { setAddTarget(null); setCart([]); }} />}
        {tab === 'pending' && <PendingOrders orders={pendingOrders} onSettle={settleOrder} onSplitSettle={setSplitSettle} onCancel={(id) => setCancelTarget(id)} onPrep={setPrepStatus} settling={settling} onAddItems={(o) => { setCart([]); setAddTarget(o); setTab('order'); }} />}
        {tab === 'myorders' && <MyOrdersScreen orders={myOrders} onSettle={settleOrder} onSplitSettle={setSplitSettle} onCancel={(id) => setCancelTarget(id)} settling={settling} onlineVendors={onlineVendorsFor(state, cartId)} printer={printerCfgFor(state, cartId)} cart={cartInfo} />}
        {tab === 'wastage' && <WastageScreen stockTypes={menu.stockTypes || []} inv={inv} logs={state.wastageLogs.filter(l => l.cartId === cartId && l.date === TODAY)} onLog={logWastage} />}
        {tab === 'shift' && <ShiftStatus inv={inv} stockTypes={menu.stockTypes || []} ware={wareLedger(state, cartId, TODAY)} myOrders={myOrders} staffName={staffName} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'order', icon: <Plus size={20}/>, label: 'New Order' },
        { id: 'pending', icon: <Clock size={20}/>, label: 'Pending', badge: pendingOrders.length },
        { id: 'myorders', icon: <FileText size={20}/>, label: 'My Orders' },
        { id: 'wastage', icon: <Trash2 size={20}/>, label: 'Wastage' },
        { id: 'shift', icon: <Award size={20}/>, label: 'Shift' },
      ]} />

      {cancelTarget != null && (
        <CancelReasonModal
          order={state.orders.find(o => o.id === cancelTarget)}
          onCancel={() => setCancelTarget(null)}
          onConfirm={(reason) => confirmCancel(cancelTarget, reason)}
        />
      )}

      {splitSettle && (
        <SplitPayModal
          total={splitSettle.total}
          onConfirm={({ cash, upi }) => { settleOrder(splitSettle.id, 'split', { cash, upi }); setSplitSettle(null); }}
          onClose={() => setSplitSettle(null)}
        />
      )}

      {justPlaced && <OrderPlacedToast info={justPlaced} printer={printerCfgFor(state, cartId)} cart={cartInfo} onClose={() => setJustPlaced(null)} />}

      {orderAlert && (
        <div style={{ position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 70, background: colors.ink, color: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 12, animation: 'none' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.primary, color: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>🔔</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>New order #{orderAlert.token} received!</div>
            <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orderAlert.items.map(i => `${i.qty}× ${i.name}`).join(', ')} · ₹{orderAlert.total}</div>
          </div>
          <button onClick={() => { setTab('pending'); setOrderAlert(null); }} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '8px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>View</button>
          <button onClick={() => setOrderAlert(null)} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

// Brief success confirmation after a staff order is registered.

function OrderPlacedToast({ info, printer = {}, cart, onClose }) {
  // Printing needs a deliberate tap (and navigates to RawBT), so don't auto-close
  // when the printer is on — otherwise keep the quick 2.6s dismiss.
  useEffect(() => { if (printer.enabled) return; const t = setTimeout(onClose, 2600); return () => clearTimeout(t); }, [info]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.ink, color: colors.primary, borderRadius: 20, padding: '32px 28px', textAlign: 'center', maxWidth: 320, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <CheckCircle2 size={56} color={colors.primary} style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: 18, fontWeight: 800 }}>Order registered!</div>
        <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.1, margin: '6px 0' }}>#{info.token}</div>
        <div style={{ fontSize: 15, opacity: 0.9 }}>₹{info.total} · {info.payment === 'unpaid' ? '⏳ Unpaid — collect in Pending' : info.payment === 'zomato' ? '🛵 Zomato — weekly payout' : info.payment === 'swiggy' ? '🛵 Swiggy — weekly payout' : info.payment === 'split' ? '🔀 Split — cash + UPI' : `${info.payment === 'cash' ? '💵 Cash' : '📱 UPI'} received`}</div>
        {printer.enabled && info.order && (
          <button onClick={() => printReceipt(info.order, cart, { footer: printer.footer })} style={{ marginTop: 16, background: '#fff', color: colors.ink, border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', width: '100%' }}>🖨️ Print bill</button>
        )}
        <button onClick={onClose} style={{ marginTop: 10, background: printer.enabled ? 'transparent' : colors.primary, color: printer.enabled ? colors.primary : colors.ink, border: printer.enabled ? `1.5px solid ${colors.primary}` : 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', width: '100%' }}>Next order</button>
      </div>
    </div>
  );
}

// Required-reason modal shown before a pending QR order is cancelled.

function CancelReasonModal({ order, onCancel, onConfirm }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [other, setOther] = useState('');
  const submit = () => {
    const r = reason === 'Other' ? other.trim() : reason;
    if (!r) return;
    onConfirm(r);
  };
  return (
    <EditModalShell title={`Cancel order #${order?.token ?? ''}`} onClose={onCancel} onSave={submit} saveLabel="Cancel order" closeLabel="Keep order" danger>
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>Pick a reason — this is kept in records and shown to the platform admin.</div>
      <div style={editLabel}>REASON</div>
      <select value={reason} onChange={e => setReason(e.target.value)} style={editInput}>{CANCEL_REASONS.map(r => <option key={r}>{r}</option>)}</select>
      {reason === 'Other' && (
        <>
          <div style={editLabel}>DETAILS</div>
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="Type the reason" style={editInput} autoFocus />
        </>
      )}
    </EditModalShell>
  );
}

// ─── STAFF: PENDING CUSTOMER ORDERS ───

function PendingOrders({ orders, onSettle, onSplitSettle, onCancel, onPrep, onAddItems, settling = new Set() }) {
  return (
    <div>
      <SectionHeader title="Pending Payment" subtitle="QR orders waiting to be collected" />
      {orders.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: `1px solid ${colors.border}` }}>
          <CheckCircle2 size={36} color={colors.green} style={{ margin: '0 auto 12px' }}/>
          <div style={{ color: colors.muted, fontSize: 14 }}>No pending orders. All collected!</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map(o => { const busy = settling.has(o.id); return (
          <div key={o.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.accent}`, overflow: 'hidden' }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>#{o.token}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>{o.date !== TODAY && <span style={{ color: colors.red, fontWeight: 700 }}>{o.date} · </span>}{o.time} · {o.source === 'staff-entry' ? '⏳ counter · unpaid' : 'self-order'}</div>
              </div>
              {(o.customerName || o.customerPhone) && (
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <User size={13} color={colors.muted} /> {o.customerName || 'Customer'}
                  {o.customerPhone && <a href={`tel:${o.customerPhone}`} style={{ color: brand.tealDark, textDecoration: 'none', fontWeight: 700 }}>· {o.customerPhone}</a>}
                </div>
              )}
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
                {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>₹{o.total}</div>

              {/* Kitchen status the customer sees live */}
              <div style={{ fontSize: 10, color: colors.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>KITCHEN STATUS</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['preparing', '👨‍🍳 Preparing'], ['ready', '✅ Ready']].map(([s, lab]) => (
                  <button key={s} onClick={() => onPrep(o.id, s)} style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${o.prepStatus === s ? colors.ink : colors.border}`, background: o.prepStatus === s ? colors.ink : '#fff', color: o.prepStatus === s ? colors.primary : colors.ink }}>{lab}</button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: colors.accent, marginBottom: 8, fontWeight: 700 }}>{(o.stockDeducted || o.source === 'staff-entry') ? 'Mark how the customer paid — Cash or UPI.' : 'Only after receiving money — this serves the order & deducts stock'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onSettle(o.id, 'cash')} disabled={busy} style={{ flex: 1, background: colors.green, color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>💵 Cash</button>
                <button onClick={() => onSettle(o.id, 'upi')} disabled={busy} style={{ flex: 1, background: '#0050B3', color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>📱 UPI</button>
                <button onClick={() => onCancel(o.id)} style={{ background: '#fff', color: colors.red, border: `1px solid ${colors.border}`, padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✕</button>
              </div>
              {onSplitSettle && <button onClick={() => onSplitSettle(o)} disabled={busy} style={{ width: '100%', marginTop: 8, background: 'transparent', color: '#5B3FA6', border: '1.5px solid #D9CFF0', padding: '8px', borderRadius: 10, fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>🔀 Split cash + UPI</button>}
              {onAddItems && o.source === 'staff-entry' && <button onClick={() => onAddItems(o)} disabled={busy} style={{ width: '100%', marginTop: 8, background: 'transparent', color: brand.navy, border: `1.5px solid ${colors.border}`, padding: '8px', borderRadius: 10, fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>➕ Add more items</button>}
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}


// Part-payment entry: split a bill across cash + UPI. Enforces cash + UPI =
// bill total so every rupee is attributed to a counted bucket (leak-proof).
// Entering one amount auto-fills the other with the remainder.
function SplitPayModal({ total, onConfirm, onClose }) {
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [error, setError] = useState('');
  const c = parseInt(cash) || 0, u = parseInt(upi) || 0;
  const sum = c + u;
  const setCashV = (v) => { const n = v.replace(/\D/g, ''); setCash(n); setUpi(n === '' ? '' : String(Math.max(0, total - (parseInt(n) || 0)))); };
  const setUpiV = (v) => { const n = v.replace(/\D/g, ''); setUpi(n); setCash(n === '' ? '' : String(Math.max(0, total - (parseInt(n) || 0)))); };
  const submit = () => {
    if (sum !== total) { setError(`Cash + UPI must equal ₹${total} (now ₹${sum}).`); return; }
    if (c <= 0 || u <= 0) { setError('Enter a non-zero amount for both cash and UPI.'); return; }
    onConfirm({ cash: c, upi: u });
  };
  return (
    <EditModalShell title={`Split payment · ₹${total}`} onClose={onClose} onSave={submit} error={error}>
      <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 12 }}>How much of the ₹{total} bill is paid each way? They must add up to the bill.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={editLabel}>💵 CASH ₹</div>
          <input type="tel" inputMode="numeric" value={cash} onChange={e => setCashV(e.target.value)} placeholder="0" style={{ ...editInput, fontWeight: 800, fontSize: 18 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={editLabel}>📱 UPI ₹</div>
          <input type="tel" inputMode="numeric" value={upi} onChange={e => setUpiV(e.target.value)} placeholder="0" style={{ ...editInput, fontWeight: 800, fontSize: 18 }} />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: sum === total ? '#0F7B0F' : colors.muted, marginTop: 2 }}>
        {sum === total ? '✓ Adds up to ₹' + total : `₹${sum} of ₹${total} · ₹${total - sum} left`}
      </div>
    </EditModalShell>
  );
}

function NewOrderScreen({ cart, setCart, onPlaceOrder, placing, menu, foodLabel = { emoji: '🥟', label: 'Momos' }, inv, ware = {}, prepMins, onSetPrep, vendors = {}, addTarget = null, onAddToOrder, onCancelAdd }) {
  const [showSplit, setShowSplit] = useState(false);
  const [category, setCategory] = useState('momos');
  const items = menu?.items || [], lassi = menu?.lassi || [], addons = menu?.addons || [];

  // Live "momos left on cart" per stock category — owner loads these from the
  // freezer at open; each placed order deducts. We also subtract the pieces in
  // the order being punched right now, so staff see what will remain AFTER it.
  // Sorted by remaining count, highest first.
  const stockTypes = menu?.stockTypes || [];
  const pending = orderStockDeltas(cart, items);
  const stockLeft = stockTypes
    .map(st => ({ key: st.key, label: st.label, left: (inv?.[st.key]?.cart ?? 0) - (pending[st.key] || 0) }))
    .sort((a, b) => b.left - a.left);

  // Live "plates / glasses left" — same accountability the owner sees. Half →
  // 6" plate, full → 7" plate, mocktail → glass. Subtracts the ware the current
  // order would use ("after this order"). Only shown for ware the owner has
  // actually handed over today (supplied or carried), and a compact label.
  const pendingWare = wareForOrder({ items: cart }, menu);
  const WARE_SHORT = { plate_s: '🍽️ 6" plate', plate_l: '🍽️ 7" plate', glass: '🥤 Glass' };
  const wareLeft = WARE_TYPES
    .filter(t => (ware[t.key]?.supplied || 0) + (ware[t.key]?.opening || 0) > 0)
    .map(t => ({ key: t.key, label: WARE_SHORT[t.key] || t.short, left: (ware[t.key]?.expected ?? 0) - (pendingWare[t.key] || 0) }));

  const addToCart = (id, name, price, type = null, qty = 1) => {
    const itemKey = `${id}-${type || 'std'}`;
    const existing = cart.find(c => c.key === itemKey);
    if (existing) {
      setCart(cart.map(c => c.key === itemKey ? { ...c, qty: c.qty + qty } : c));
    } else {
      setCart([...cart, { key: itemKey, id, name, price, type, qty }]);
    }
  };

  const removeFromCart = (key) => {
    const existing = cart.find(c => c.key === key);
    if (existing.qty > 1) {
      setCart(cart.map(c => c.key === key ? { ...c, qty: c.qty - 1 } : c));
    } else {
      setCart(cart.filter(c => c.key !== key));
    }
  };

  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);

  return (
    <div>
      {addTarget
        ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#EAF0FF', border: `1px solid #BFD0F0`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>➕</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: brand.navy }}>Adding to order #{addTarget.token}</div>
              <div style={{ fontSize: 11.5, color: colors.muted }}>Pick the extra items, then tap “Add to #{addTarget.token}”. It stays unpaid.</div>
            </div>
            <button onClick={() => onCancelAdd?.()} style={{ background: '#fff', border: `1px solid ${colors.border}`, color: colors.muted, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        : <SectionHeader title="New Order" subtitle="Tap items to add" />}

      {/* Live momos left on cart — updates as items are added and after each order */}
      {stockLeft.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: colors.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{foodLabel.emoji} {foodLabel.label.toUpperCase()} LEFT ON CART {cart.length > 0 && <span style={{ color: colors.accent }}>· after this order</span>}</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {stockLeft.map(s => {
              const state = s.left <= 0 ? 'out' : s.left <= 10 ? 'low' : 'ok';
              const bg = state === 'out' ? '#FFE7E7' : state === 'low' ? '#FFF1E7' : colors.ink;
              const fg = state === 'out' ? colors.red : state === 'low' ? colors.accent : colors.primary;
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: bg, color: fg, borderRadius: 12, padding: '8px 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{s.left}</span>
                  {state === 'out' && <span style={{ fontSize: 10, fontWeight: 800 }}>OUT</span>}
                  {state === 'low' && <span style={{ fontSize: 10, fontWeight: 800 }}>LOW</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live plates / glasses left — staff accountability, mirrors the owner's
          ware audit so nothing goes missing without being noticed. */}
      {wareLeft.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: colors.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>🍽️ PLATES / GLASSES SHOULD REMAIN {cart.length > 0 && <span style={{ color: colors.accent }}>· after this order</span>}</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {wareLeft.map(s => {
              const st = s.left <= 0 ? 'out' : s.left <= 6 ? 'low' : 'ok';
              const bg = st === 'out' ? '#FFE7E7' : st === 'low' ? '#FFF1E7' : colors.ink;
              const fg = st === 'out' ? colors.red : st === 'low' ? colors.accent : colors.primary;
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: bg, color: fg, borderRadius: 12, padding: '8px 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{s.left}</span>
                  {st === 'out' && <span style={{ fontSize: 10, fontWeight: 800 }}>OUT</span>}
                  {st === 'low' && <span style={{ fontSize: 10, fontWeight: 800 }}>LOW</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live prep/wait time shown to customers on their token screen */}
      {onSetPrep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
          <Clock size={16} color={colors.muted} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Wait time shown to customers</div>
          <button onClick={() => onSetPrep(prepMins - 1)} disabled={prepMins <= 2} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', fontSize: 18, fontWeight: 800, cursor: prepMins <= 2 ? 'not-allowed' : 'pointer', opacity: prepMins <= 2 ? 0.4 : 1 }}>−</button>
          <div style={{ minWidth: 56, textAlign: 'center', fontWeight: 800, fontSize: 15 }}>{prepMins} min</div>
          <button onClick={() => onSetPrep(prepMins + 1)} disabled={prepMins >= 10} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', fontSize: 18, fontWeight: 800, cursor: prepMins >= 10 ? 'not-allowed' : 'pointer', opacity: prepMins >= 10 ? 0.4 : 1 }}>+</button>
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'momos', label: `${foodLabel.emoji} ${foodLabel.label}` },
          { id: 'lassi', label: '🥤 Lassi' },
          { id: 'addons', label: '➕ Add-ons' },
        ].map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            style={{ padding: '8px 14px', background: category === c.id ? colors.ink : '#fff', color: category === c.id ? colors.primary : colors.ink, border: `1px solid ${category === c.id ? colors.ink : colors.border}`, borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      {/* Bottom clearance must outsize the fixed cart sheet (item list + total
          + two payment rows) or the last menu items hide behind it. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: cart.length > 0 ? 400 : 100 }}>
        {category === 'momos' && groupByCat(items).map(g => (
          <div key={g.cat} style={{ marginBottom: 6 }}>
            <CategoryBand cat={g.cat} count={g.items.length} styles={menu?.catStyles} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map(item => <MenuItemRow key={item.id} item={item} onAdd={addToCart} />)}
            </div>
          </div>
        ))}
        {category === 'lassi' && lassi.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
        {category === 'addons' && addons.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
        {((category === 'momos' && !items.length) || (category === 'lassi' && !lassi.length) || (category === 'addons' && !addons.length)) && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.muted, fontSize: 14 }}>Nothing in this section yet.</div>
        )}
      </div>

      {/* Cart bottom sheet */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, background: colors.ink, color: colors.primary, padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            {/* Compact, scrollable — a big order must not grow the sheet over
                the menu (staff couldn't reach the items at the bottom). */}
            <div style={{ maxHeight: 128, overflowY: 'auto', marginBottom: 12 }}>
              {cart.map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,214,10,0.2)' }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{item.name} {item.type && <span style={{ opacity: 0.7 }}>({item.type})</span>}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>₹{item.price} × {item.qty} = ₹{item.price * item.qty}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => removeFromCart(item.key)} style={{ background: 'rgba(255,214,10,0.2)', color: colors.primary, border: 'none', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={14}/></button>
                    <div style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{item.qty}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{addTarget ? `ADDING TO #${addTarget.token}` : 'TOTAL'}</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>₹{total}{addTarget ? <span style={{ fontSize: 13, opacity: 0.7, fontWeight: 600 }}> → new total ₹{addTarget.total + total}</span> : null}</div>
            </div>
            {addTarget ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onCancelAdd?.()} disabled={placing} style={{ background: 'transparent', color: colors.muted, border: `1.5px solid ${colors.border}`, padding: '13px 14px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => onAddToOrder?.(cart)} disabled={placing || cart.length === 0} style={{ flex: 1, background: brand.navy, color: '#fff', border: 'none', padding: '13px 8px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: (placing || cart.length === 0) ? 'default' : 'pointer', opacity: (placing || cart.length === 0) ? 0.5 : 1 }}>➕ Add {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''} to #{addTarget.token}</button>
              </div>
            ) : (<>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onPlaceOrder('cash')} disabled={placing} style={{ flex: 1, background: colors.green, color: '#fff', border: 'none', padding: '13px 8px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1 }}>{placing ? '…' : '💵 Cash'}</button>
              <button onClick={() => onPlaceOrder('upi')} disabled={placing} style={{ flex: 1, background: colors.primary, color: colors.ink, border: 'none', padding: '13px 8px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1 }}>{placing ? '…' : '📱 UPI'}</button>
              <button onClick={() => onPlaceOrder('unpaid')} disabled={placing} style={{ flex: 1, background: 'transparent', color: colors.primary, border: `1.5px solid ${colors.primary}`, padding: '13px 8px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1 }}>{placing ? '…' : '⏳ Unpaid'}</button>
            </div>
            {/* Rarely-used routes — split + aggregators — share one compact line. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowSplit(true)} disabled={placing} style={{ flex: 1, background: 'transparent', color: '#5B3FA6', border: '1.5px solid #D9CFF0', padding: '10px 8px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1, whiteSpace: 'nowrap' }}>🔀 Split</button>
              {vendors.zomato && <button onClick={() => onPlaceOrder('zomato')} disabled={placing} style={{ flex: 1, background: '#E23744', color: '#fff', border: 'none', padding: '10px 8px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1, whiteSpace: 'nowrap' }}>{placing ? '…' : '🛵 Zomato'}</button>}
              {vendors.swiggy && <button onClick={() => onPlaceOrder('swiggy')} disabled={placing} style={{ flex: 1, background: '#FC8019', color: '#fff', border: 'none', padding: '10px 8px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.6 : 1, whiteSpace: 'nowrap' }}>{placing ? '…' : '🛵 Swiggy'}</button>}
            </div>
            {showSplit && <SplitPayModal total={total} onConfirm={({ cash, upi }) => { setShowSplit(false); onPlaceOrder('split', { cash, upi }); }} onClose={() => setShowSplit(false)} />}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}


// A per-order price stays visible for 10 minutes after it's punched/collected,
// then masks to ₹••• so staff can't add up recent orders to reconcile the cash
// box. Reference time = when it was collected (settledAt for QR orders, else the
// punch time). Full money figures stay on the owner side.
const PRICE_MASK_MS = 10 * 60 * 1000;
const priceVisible = (o) => {
  const t = o.settledAt ? new Date(o.settledAt).getTime() : o.id;
  return Date.now() - t <= PRICE_MASK_MS;
};

function MyOrdersScreen({ orders, onSettle, onSplitSettle, onCancel, settling = new Set(), onlineVendors = false, printer = {}, cart }) {
  // Re-render every 20s so the cancel window AND the price-mask close on their own.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 20000); return () => clearInterval(t); }, []);
  const liveCount = orders.filter(o => o.payment !== 'cancelled').length;
  const cashCount = orders.filter(o => o.payment === 'cash').length;
  const upiCount = orders.filter(o => o.payment === 'upi').length;
  const onlineCount = orders.filter(o => o.payment === 'zomato' || o.payment === 'swiggy').length;

  return (
    <div>
      <SectionHeader title="My Shift Orders" subtitle={`${liveCount} order${liveCount !== 1 ? 's' : ''} so far`} />

      {/* Counts only — money totals live on the owner side so staff focus on punching, not reconciling the cash box. */}
      <div style={{ display: 'grid', gridTemplateColumns: (onlineVendors || onlineCount > 0) ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <MetricCard label="Cash orders" value={`${cashCount}`} icon={<IndianRupee size={16}/>} color={colors.green} />
        <MetricCard label="UPI orders" value={`${upiCount}`} icon={<Smartphone size={16}/>} color={colors.ink} />
        {(onlineVendors || onlineCount > 0) && <MetricCard label="Online orders" value={`${onlineCount}`} icon={<Smartphone size={16}/>} color={colors.accent} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.slice().reverse().map(o => {
          const cancelled = o.payment === 'cancelled';
          const pending = o.payment === 'pending';
          const busy = settling.has(o.id);
          const showPrice = priceVisible(o);
          return (
            <div key={o.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${pending ? colors.accent : colors.border}`, padding: 14, opacity: cancelled ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>#{o.token} <span style={{ fontWeight: 500, fontSize: 12, color: colors.muted }}>· {o.time}</span></div>
                <div style={{ fontWeight: 800, fontSize: 16, textDecoration: (cancelled && showPrice) ? 'line-through' : 'none', color: showPrice ? (cancelled ? colors.muted : colors.ink) : colors.muted }}>{showPrice ? `₹${o.total}` : '₹•••'}</div>
              </div>
              <OrderItemLines items={o.items} muted={cancelled} />
              {printer.enabled && !cancelled && <button onClick={() => printReceipt(o, cart, { footer: printer.footer })} style={{ marginTop: 10, background: '#fff', border: `1px solid ${colors.border}`, color: colors.ink, padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>🖨️ Print bill</button>}
              {pending ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, padding: '3px 9px', background: PAY_BADGE.pending.bg, color: PAY_BADGE.pending.fg, borderRadius: 10, fontWeight: 700, letterSpacing: 0.5 }}>UNPAID</span>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Mark how they paid ↓</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onSettle(o.id, 'cash')} disabled={busy} style={{ flex: 1, background: colors.green, color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>💵 Cash</button>
                    <button onClick={() => onSettle(o.id, 'upi')} disabled={busy} style={{ flex: 1, background: '#0050B3', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>📱 UPI</button>
                    {onSplitSettle && <button onClick={() => onSplitSettle(o)} disabled={busy} title="Split cash + UPI" style={{ background: '#fff', color: '#5B3FA6', border: '1.5px solid #D9CFF0', padding: 11, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>🔀</button>}
                    <button onClick={() => onCancel(o.id)} title="Cancel (no-show)" style={{ background: '#fff', color: colors.red, border: `1px solid ${colors.border}`, padding: 11, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ fontSize: 10, padding: '3px 9px', background: PAY_BADGE[o.payment].bg, color: PAY_BADGE[o.payment].fg, borderRadius: 10, fontWeight: 700, letterSpacing: 0.5 }}>{cancelled ? 'CANCELLED' : o.payment.toUpperCase()}</span>
                  {cancelled
                    ? (o.cancelReason && <span style={{ fontSize: 11, color: colors.red, fontWeight: 600 }}>{o.cancelReason}</span>)
                    : staffCancellable(o)
                      ? <button onClick={() => onCancel(o.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, color: colors.red, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><X size={13} /> Cancel</button>
                      : (o.source === 'staff-entry' && <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Cancel window closed</span>)}
                </div>
              )}
            </div>
          );
        })}
        {orders.length === 0 && <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, textAlign: 'center', color: colors.muted }}>No orders yet · Tap "New Order" to start</div>}
      </div>
    </div>
  );
}


function ShiftStatus({ inv, stockTypes = [], ware = {}, myOrders, staffName }) {
  const orderCount = myOrders.filter(o => o.payment !== 'cancelled').length;
  const WARE_SHORT = { plate_s: '🍽️ 6" plate (half)', plate_l: '🍽️ 7" plate (full)', glass: '🥤 Glass (mocktail)' };
  const wareRows = WARE_TYPES.filter(t => (ware[t.key]?.supplied || 0) + (ware[t.key]?.opening || 0) > 0);

  return (
    <div>
      <SectionHeader title="Shift Summary" subtitle={`${staffName} on duty`} />

      {/* Order count only — money totals live on the owner side. */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 24, borderRadius: 16, marginBottom: 16, textAlign: 'center' }}>
        <Clock size={32} style={{ margin: '0 auto 8px' }}/>
        <div style={{ fontSize: 13, opacity: 0.7 }}>ORDERS THIS SHIFT</div>
        <div style={{ fontSize: 36, fontWeight: 900 }}>{orderCount}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>punched so far</div>
      </div>

      <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>STOCK ON CART</div>
        {stockTypes.map(st => (
          <StockRow key={st.key} label={`${st.label} (pcs)`} value={inv[st.key]?.cart ?? 0} unit="pcs"/>
        ))}
        {stockTypes.length === 0 && <div style={{ fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 }}>No stock tracked</div>}
      </div>

      {/* Plates / glasses that should physically be on the cart right now. */}
      {wareRows.length > 0 && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>PLATES / GLASSES SHOULD REMAIN</div>
          {wareRows.map(t => (
            <StockRow key={t.key} label={WARE_SHORT[t.key] || t.label} value={ware[t.key]?.expected ?? 0} unit="left" low={(ware[t.key]?.expected ?? 0) <= 6} />
          ))}
        </div>
      )}

      <Alert
        type="info"
        title="Late shift handover?"
        message="If you're staying late after chef leaves, your orders are still tracked separately. Owner sees both shifts clearly."
      />
    </div>
  );
}

// ─── STAFF: WASTAGE LOG ───

const WASTE_REASONS = ['Damaged while cooking', 'Dropped / spilled', 'Burnt', 'Expired / spoiled', 'Other'];

function WastageScreen({ stockTypes, inv, logs, onLog }) {
  const [stockKey, setStockKey] = useState(stockTypes[0]?.key || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(WASTE_REASONS[0]);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  const n = parseInt(qty) || 0;
  const onCart = inv[stockKey]?.cart ?? 0;
  const submit = () => {
    setErr('');
    if (!stockKey || n <= 0) { setErr('Enter how many pieces.'); return; }
    // Can't waste more than is physically on the cart.
    if (n > onCart) { setErr(`Only ${onCart} ${stockTypes.find(s => s.key === stockKey)?.label || ''} pcs on the cart — can't log ${n}.`); return; }
    onLog(stockKey, n, reason);
    setDone(`Logged ${n} ${stockTypes.find(s => s.key === stockKey)?.label || ''} as wastage.`);
    setQty(''); setTimeout(() => setDone(''), 2500);
  };
  const todayTotal = logs.reduce((s, l) => s + l.qty, 0);

  return (
    <div>
      <SectionHeader title="Wastage" subtitle="Damaged / spoiled stock" />
      {stockTypes.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', border: `1px solid ${colors.border}`, color: colors.muted }}>No stock types set up for this cart.</div>
      ) : (
        <>
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>ITEM</div>
            <select value={stockKey} onChange={e => setStockKey(e.target.value)} style={{ ...editInput, marginBottom: 12 }}>
              {stockTypes.map(st => <option key={st.key} value={st.key}>{st.label} (cart: {inv[st.key]?.cart ?? 0})</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>PIECES</div>
                <input type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" style={editInput} /></div>
              <div style={{ flex: 2 }}><div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>REASON</div>
                <select value={reason} onChange={e => setReason(e.target.value)} style={editInput}>{WASTE_REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
            </div>
            <button onClick={submit} style={{ width: '100%', background: colors.red, color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Log wastage (removes from cart)</button>
            {err && <div style={{ marginTop: 10, background: '#FFE7E7', color: colors.red, borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{err}</div>}
            {done && <div style={{ marginTop: 10, background: '#E7F5E7', color: colors.green, borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{done}</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>TODAY'S WASTAGE</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: colors.red }}>{todayTotal} pcs</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {logs.slice().reverse().map(l => (
              <div key={l.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>{l.qty}× {l.label}</div><div style={{ fontSize: 12, color: colors.muted }}>{l.reason} · {l.time} · {l.staff}</div></div>
              </div>
            ))}
            {logs.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No wastage logged today</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// CUSTOMER APP — QR Self-Order
// ═══════════════════════════════════════════════
// Customers may add at most this many distinct add-ons, 1 of each.

export { StaffApp, OrderPlacedToast, CancelReasonModal, PendingOrders, NewOrderScreen, MyOrdersScreen, ShiftStatus, WASTE_REASONS, WastageScreen };
