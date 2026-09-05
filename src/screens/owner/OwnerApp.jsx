import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob, pushMenus } from '../../lib/store';
import { TODAY, WARE_TYPES, PAY_BADGE, adminBtn, brand, cartOpenState, colors, cashPart, upiPart, isOnline, isPaid, istDateLabel, istNowMinutes, istTime, menuFor, menuLabelFor, onlineVendorsFor, printerCfgFor, vendorEnabledFor, wareLedger, orderStockDeltas } from '../../core';
import { CartProfileModal, MenuEditor } from '../MenuEditor';
import { InventoryView } from './Inventory';
import { Reconciliation } from './Reconciliation';
import { Reports } from './Reports';
import { StaffRegistry } from './StaffRegistry';
import { Alert, BottomNav, CartIcon, MetricCard, OrderRow, SectionHeader, TopBar } from '../../components/shared';
import { RemindersButton } from '../../components/RemindersButton';
import { PrepChecklist } from '../../components/PrepChecklist';
import { useStore } from '../../store';

function OwnerApp({ state, updateState, onExit, cartId }) {
  const [tab, setTab] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  // Deep-link target for the Reconcile tab (set by the dashboard nudge). Cleared
  // on any normal tab switch so opening Reconcile by hand still starts on today.
  const [reconcileDate, setReconcileDate] = useState(null);
  const goReconcile = (date) => { setReconcileDate(date || null); setTab('reconcile'); };
  const navTab = (t) => { setReconcileDate(null); setTab(t); };
  const cart = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);
  const saveProfile = (fields) => {
    // Printer config lives in the menus blob (synced via pushMenus, clobber-safe)
    // — split it out from the cart-table fields.
    const { printerEnabled, printerFooter, ...cartFields } = fields;
    const updated = { ...cart, ...cartFields };
    const newMenus = { ...state.menus, [cartId]: { ...menuFor(state, cartId), printer: { enabled: !!printerEnabled, footer: (printerFooter || '').trim() } } };
    updateState({ carts: state.carts.map(c => c.id === cartId ? updated : c), menus: newMenus });
    saveCartProfile(updated); // persist immediately so it survives a refresh
    pushMenus(newMenus, cartId);
    setShowProfile(false);
  };
  const toggleOpen = () => {
    const next = !cart?.closedManually;
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, closedManually: next } : c) });
    // Persist immediately (not via the debounced batch) so it survives a refresh.
    setCartClosed(cartId, next);
  };
  // Owner flips one aggregator (Zomato/Swiggy) on or off. It's a menu-config
  // write, so it goes through pushMenus (immediate, never the background sync).
  const toggleVendor = (v) => {
    const menus = {
      ...state.menus,
      [cartId]: {
        ...menuFor(state, cartId),
        vendors: {
          zomato: vendorEnabledFor(state, cartId, 'zomato'),
          swiggy: vendorEnabledFor(state, cartId, 'swiggy'),
          [v]: !vendorEnabledFor(state, cartId, v),
        },
      },
    };
    updateState({ menus });
    pushMenus(menus, cartId);
  };
  // Hard-reset / recount correction for a ware's live "should remain". Posts an
  // append-only WARE_RESET adjustment (qty = target − current) so the balance
  // lands exactly on the entered count — durable, sync-safe, and itself
  // reversible by another correction. Use after a miscount or handover mishap.
  const resetWare = (wareKey) => {
    const led = wareLedger(state, cartId, TODAY)[wareKey];
    const cur = led.opening + led.supplied - led.used; // live current
    const label = WARE_TYPES.find(w => w.key === wareKey)?.label || wareKey;
    const raw = window.prompt(`Recount "${label}".\nShown now: ${cur}. Enter the TRUE count on the cart (0 to hard-reset):`, '0');
    if (raw === null) return;
    const target = parseInt(raw, 10);
    if (!Number.isFinite(target) || target < 0) { alert('Enter a valid number (0 or more).'); return; }
    const delta = target - cur;
    if (delta === 0) return;
    const log = { id: Date.now(), cartId, date: TODAY, time: istTime(), type: 'WARE_RESET', item: wareKey, qty: delta, note: `Recount correction → set to ${target}` };
    updateState(s => ({ ...s, stockLogs: [...s.stockLogs, log] }));
  };

  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  // In-hand revenue only — cash + UPI. Zomato/Swiggy are paid out weekly by the
  // platform, so they are tracked separately and never part of TODAY's total.
  const todayRevenue = todayOrders.reduce((sum, o) => sum + ((isPaid(o) && !isOnline(o)) ? o.total : 0), 0);
  const cashRevenue = todayOrders.reduce((sum, o) => sum + cashPart(o), 0);
  const upiRevenue = todayOrders.reduce((sum, o) => sum + upiPart(o), 0);
  // Aggregator sales — real revenue, but paid out weekly by the platform, so
  // never part of the cash-box / PhonePe reconciliation.
  const onlineRevenue = todayOrders.filter(isOnline).reduce((sum, o) => sum + o.total, 0);
  const piecesSold = todayOrders.filter(o => isPaid(o)).reduce((sum, o) => {
    return sum + o.items.reduce((s, item) => {
      const m = menu.items.find(x => x.id === item.id);
      if (!m) return s;
      return s + (item.type === 'half' ? m.pcsHalf : m.pcsFull) * item.qty;
    }, 0);
  }, 0);

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cart?.name ?? 'Cart'} · Owner`} onExit={onExit} />

      {showProfile && <CartProfileModal cart={cart} printer={printerCfgFor(state, cartId)} onSave={saveProfile} onClose={() => setShowProfile(false)} />}

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'dashboard' && <Dashboard state={state} cartId={cartId} inv={inv} cart={cart} onEditProfile={() => setShowProfile(true)} onToggleOpen={toggleOpen} stockTypes={menu.stockTypes || []} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} onlineRevenue={onlineRevenue} piecesSold={piecesSold} todayOrders={todayOrders} onToggleVendor={toggleVendor} onReconcile={goReconcile} onSeeOrders={() => setTab('orders')} onResetWare={resetWare} updateState={updateState} />}
        {tab === 'orders' && <OrdersFeed state={state} cartId={cartId} onlineVendors={onlineVendorsFor(state, cartId)} />}
        {tab === 'inventory' && <InventoryView state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} />}
        {tab === 'reconcile' && <Reconciliation state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} initialDate={reconcileDate} />}
        {tab === 'menu' && <MenuEditor state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'staff' && <StaffRegistry state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'reports' && <Reports state={state} updateState={updateState} cartId={cartId} />}
      </div>

      <BottomNav tab={tab} setTab={navTab} tabs={[
        { id: 'dashboard', icon: <Home size={20}/>, label: 'Home' },
        { id: 'orders', icon: <ShoppingCart size={20}/>, label: 'Orders' },
        { id: 'inventory', icon: <Boxes size={20}/>, label: 'Stock' },
        { id: 'menu', icon: <Edit3 size={20}/>, label: 'Menu' },
        { id: 'reconcile', icon: <CheckCircle2 size={20}/>, label: 'Reconcile' },
        { id: 'staff', icon: <Users size={20}/>, label: 'Staff' },
        { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Reports' },
      ]} />
    </div>
  );
}


// Owner's daily order feed — "how's ordering going": running count, the latest
// token reached, money collected vs still uncollected, a status breakdown, and
// every order newest-first. Defaults to today (live via the dashboard poll) but
// the date navigator lets the owner scroll back to validate any past day; all
// history is already in state.orders (the initial cloud load pages through it).
function OrdersFeed({ state, cartId, onlineVendors = false }) {
  const { lastSync, refreshNow } = useStore();
  const [date, setDate] = useState(TODAY);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { if (refreshing) return; setRefreshing(true); try { await refreshNow?.(); } finally { setRefreshing(false); } };
  const isToday = date === TODAY;
  const agoSec = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;
  const shiftDate = (n) => { const [y, m, dd] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, dd + n)); return t.toISOString().split('T')[0]; };

  const dayOrders = (state.orders || []).filter(o => o.cartId === cartId && o.date === date);
  const cash = dayOrders.filter(o => o.payment === 'cash');
  const upi = dayOrders.filter(o => o.payment === 'upi');
  const split = dayOrders.filter(o => o.payment === 'split');
  const pending = dayOrders.filter(o => o.payment === 'pending');
  const online = dayOrders.filter(o => o.payment === 'zomato' || o.payment === 'swiggy');
  const cancelled = dayOrders.filter(o => o.payment === 'cancelled');
  const live = dayOrders.filter(o => o.payment !== 'cancelled');
  const inHand = dayOrders.reduce((s, o) => s + cashPart(o) + upiPart(o), 0);
  const uncollected = pending.reduce((s, o) => s + o.total, 0);
  const latestToken = dayOrders.reduce((m, o) => Math.max(m, parseInt(o.token) || 0), 0);
  const sorted = [...dayOrders].sort((a, b) => (b.id || 0) - (a.id || 0));
  const chip = (label, n, bg, fg) => n > 0 ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: bg, color: fg }}>{label} {n}</span> : null;
  const navBtn = { background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Orders</div>
        {isToday && <button onClick={doRefresh} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: brand.navy, cursor: refreshing ? 'wait' : 'pointer' }}>🔄 {refreshing ? '…' : 'Refresh'}</button>}
      </div>

      {/* Date navigator — scroll back to validate past days; can't go past today. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px' }}>
        <button onClick={() => setDate(shiftDate(-1))} style={navBtn} aria-label="Previous day">‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>
          {isToday ? 'Today' : istDateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}
          <input type="date" value={date} max={TODAY} onChange={e => e.target.value && setDate(e.target.value)} style={{ display: 'block', margin: '2px auto 0', border: 'none', background: 'transparent', fontSize: 11, color: colors.muted, textAlign: 'center', cursor: 'pointer' }} />
        </div>
        <button onClick={() => setDate(shiftDate(1))} disabled={isToday} style={{ ...navBtn, opacity: isToday ? 0.35 : 1, cursor: isToday ? 'default' : 'pointer' }} aria-label="Next day">›</button>
      </div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: 14, textAlign: 'center' }}>
        {isToday ? `${istDateLabel(new Date(), { weekday: 'long', day: 'numeric', month: 'short' })}${agoSec != null ? ` · live · updated ${agoSec}s ago` : ''}` : 'Past day — settled record'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <MetricCard label="Orders" value={`${live.length}`} icon={<ShoppingCart size={16} />} color={colors.ink} />
        <MetricCard label="Last token" value={latestToken ? `#${String(latestToken).padStart(3, '0')}` : '—'} icon={<FileText size={16} />} color={colors.ink} />
        <MetricCard label="Collected · cash + UPI" value={`₹${inHand.toLocaleString('en-IN')}`} icon={<IndianRupee size={16} />} color={colors.green} />
        <MetricCard label="Uncollected" value={`₹${uncollected.toLocaleString('en-IN')}`} icon={<Clock size={16} />} color={uncollected > 0 ? colors.red : colors.muted} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {chip('💵 Cash', cash.length, '#E7F6E7', '#0F7B0F')}
        {chip('📱 UPI', upi.length, '#EAF0FF', '#1A4FB0')}
        {chip('🔀 Split', split.length, '#EFE9FB', '#5B3FA6')}
        {chip('⏳ Uncollected', pending.length, '#FFF3E0', '#B5460B')}
        {onlineVendors ? chip('🛵 Online', online.length, '#FDE8EA', '#E23744') : null}
        {chip('✕ Cancelled', cancelled.length, '#F1EFE8', colors.muted)}
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.muted, padding: '40px 16px', fontSize: 14, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12 }}>{isToday ? <>No orders yet today.<br />New orders show up here live as staff punch them.</> : 'No orders recorded on this day.'}</div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {sorted.map(o => {
            const badge = PAY_BADGE[o.payment] || { bg: '#F1EFE8', fg: colors.muted };
            const itemsTxt = (o.items || []).map(i => `${i.qty}× ${i.name}`).join(', ');
            const cancelledRow = o.payment === 'cancelled';
            return (
              <div key={o.id} style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}`, opacity: cancelledRow ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, textDecoration: cancelledRow ? 'line-through' : 'none' }}>#{o.token} <span style={{ fontWeight: 400, color: colors.muted, fontSize: 12 }}>· {o.time}{o.staff ? ` · ${o.staff}` : ''}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontWeight: 800 }}>₹{o.total}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: badge.bg, color: badge.fg }}>{o.payment === 'pending' ? 'UNPAID' : o.payment === 'split' ? `SPLIT · 💵${o.split?.cash || 0}+📱${o.split?.upi || 0}` : o.payment.toUpperCase()}</span>
                  </div>
                </div>
                {itemsTxt && <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemsTxt}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ state, cartId, inv, cart, onEditProfile, onToggleOpen, stockTypes = [], todayRevenue, cashRevenue, upiRevenue, onlineRevenue = 0, piecesSold, todayOrders, onToggleVendor, onReconcile, onSeeOrders, onResetWare, updateState }) {
  // Day-close nudge: the plate/cash/stock theft audit only runs at day-close, so
  // a stretch of un-closed days means the audit is producing nothing. Warn when
  // today has sales but isn't closed, and count how long the streak has run.
  const cartCloses = (state.dayCloseLogs || []).filter(d => d.cartId === cartId);
  const closedToday = cartCloses.some(d => d.date === TODAY);
  const lastCloseDate = cartCloses.map(d => d.date).sort().pop() || null;
  const daysSinceClose = lastCloseDate ? Math.round((Date.parse(TODAY) - Date.parse(lastCloseDate)) / 86400000) : null;
  const showCloseNudge = (todayOrders?.length || 0) > 0 && !closedToday;
  // Deep-link the nudge to the OLDEST unreconciled day (with orders) in the last
  // week, so tapping it opens Reconcile right on the day that needs back-filling.
  const shiftDayD = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const closedSet = new Set(cartCloses.map(d => d.date));
  let nudgeDate = TODAY;
  for (let i = 6; i >= 0; i--) { const d = shiftDayD(TODAY, -i); if (state.orders.some(o => o.cartId === cartId && o.date === d) && !closedSet.has(d)) { nudgeDate = d; break; } }
  // "live · updated Xs ago" + manual 🔄 — surfaces how fresh the auto-poll is
  // and lets the owner pull on demand (no extra background traffic).
  const { lastSync, refreshNow } = useStore();
  const [, agoTick] = useState(0);
  useEffect(() => { const t = setInterval(() => agoTick(n => n + 1), 5000); return () => clearInterval(t); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshNow?.(); } finally { setRefreshing(false); }
  };
  const agoSec = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;
  const agoLabel = agoSec === null ? 'syncing…' : agoSec < 60 ? `updated ${agoSec}s ago` : `updated ${Math.floor(agoSec / 60)}m ago`;

  const pendingCount = todayOrders.filter(o => o.payment === 'pending').length;
  // Uncollected (unpaid) orders across ALL days — money not yet collected and not
  // counted in revenue. Surfaced so nothing rolls past its day unseen.
  const uncollected = (state?.orders || []).filter(o => o.cartId === cartId && o.payment === 'pending').sort((a, b) => a.id - b.id);
  const uncollectedTotal = uncollected.reduce((s, o) => s + o.total, 0);
  // Ware audit: how many small plates / large plates / glasses should
  // physically be on the cart right now, given what the owner supplied and
  // what punched orders served.
  const ware = wareLedger(state, cartId, TODAY);
  const activeWare = WARE_TYPES.filter(w => ware[w.key].supplied > 0 || ware[w.key].opening > 0);
  const lowTypes = stockTypes.filter(st => (inv[st.key]?.freezer ?? 0) < 100);
  const openState = cartOpenState(cart);

  // Per-day revenue (reconciled if the day was closed, else system) for trends.
  const closeByDate = Object.fromEntries((state?.dayCloseLogs || []).filter(d => d.cartId === cartId).map(d => [d.date, d]));
  // In-hand (cash + UPI) per day — online sales are excluded from the revenue trend.
  const paidByDate = {};
  (state?.orders || []).filter(o => o.cartId === cartId && isPaid(o) && !isOnline(o)).forEach(o => { paidByDate[o.date] = (paidByDate[o.date] || 0) + o.total; });
  // Closed days use counted money + that day's aggregator sales (platform money
  // is never in the count); open days use live system totals (already include online).
  const dayRev = (date) => { const dc = closeByDate[date]; return dc ? (dc.physicalCash || 0) + (dc.phonePeAmount || 0) : (paidByDate[date] || 0); };
  // last 7 IST calendar dates ending today (UTC-anchored to avoid drift)
  const [ty, tm, tdd] = TODAY.split('-').map(Number);
  const baseMs = Date.UTC(ty, tm - 1, tdd);
  const last7 = [...Array(7)].map((_, i) => new Date(baseMs - (6 - i) * 86400000).toISOString().split('T')[0]);
  const series = last7.map(dayRev);
  const maxRev = Math.max(...series, 1);
  const yesterdayRev = series[5];
  const deltaPct = yesterdayRev > 0 ? Math.round(((todayRevenue - yesterdayRev) / yesterdayRev) * 100) : null;
  const todayExpenses = (state?.expenses || []).filter(e => e.cartId === cartId && e.date === TODAY).reduce((s, e) => s + e.amount, 0);
  const todayNet = todayRevenue - todayExpenses;

  // Stock run-out estimate: today's selling pace vs remaining (freezer + cart).
  const menuItems = (menuFor(state, cartId).items) || [];
  const soldToday = todayOrders.filter(isPaid).reduce((acc, o) => {
    const d = orderStockDeltas(o.items, menuItems);
    Object.keys(d).forEach(k => { acc[k] = (acc[k] || 0) + d[k]; });
    return acc;
  }, {});
  const openMin = cart?.openTime ? (() => { const [h, m] = cart.openTime.split(':').map(Number); return h * 60 + (m || 0); })() : null;
  const nowMin = istNowMinutes();
  const hoursOpen = openMin != null && nowMin > openMin ? (nowMin - openMin) / 60 : (Object.keys(soldToday).length ? 3 : null);
  const runOut = stockTypes.map(st => {
    const remaining = (inv[st.key]?.freezer || 0) + (inv[st.key]?.cart || 0);
    const sold = soldToday[st.key] || 0;
    const rate = hoursOpen && hoursOpen > 0 ? sold / hoursOpen : 0; // pcs/hr
    const hrsLeft = remaining === 0 ? 0 : (rate > 0 ? remaining / rate : null);
    return { key: st.key, label: st.label, remaining, hrsLeft };
  });
  const showRunOut = openState.open && runOut.some(r => r.hrsLeft !== null);

  const shareToday = async () => {
    const text =
      `${menuLabelFor(state, cartId).emoji} ${cart?.name || 'Cart'} — ${istDateLabel(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}\n` +
      `In-hand: ₹${todayRevenue.toLocaleString('en-IN')}  (💵 ₹${cashRevenue} · 📱 ₹${upiRevenue})\n` +
      (onlineRevenue > 0 ? `🛵 Zomato/Swiggy: ₹${onlineRevenue.toLocaleString('en-IN')}  (weekly payout)\n` : '') +
      `Orders: ${todayOrders.filter(isPaid).length}${stockTypes.length > 0 ? ` · Pieces sold: ${piecesSold}` : ''}\n` +
      `Expenses: ₹${todayExpenses.toLocaleString('en-IN')} · Net: ₹${todayNet.toLocaleString('en-IN')}`;
    try { if (navigator.share) { await navigator.share({ title: `${cart?.name} — today`, text }); return; } } catch { /* cancelled */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div>
      {/* 1) Cart profile banner — slim, full width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
        <CartIcon cart={cart} size={40} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{cart?.name}</div>
          <div style={{ fontSize: 11.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {cart?.location || '—'} · 🕒 {cart?.timing || '—'}</div>
        </div>
        <button onClick={onEditProfile} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Edit3 size={13}/> Edit</button>
      </div>

      {/* 2) Open/closed + reminders share one compact row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${openState.open ? '#BFE3BF' : '#F3C2C2'}`, borderRadius: 12, padding: '10px 12px' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: openState.open ? colors.green : colors.red, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: openState.open ? '#0F7B0F' : colors.red, lineHeight: 1.1 }}>{openState.open ? 'Open' : 'Closed'}</div>
            <div style={{ fontSize: 10.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cart?.closedManually ? 'You closed it' : openState.open ? 'Taking orders' : openState.reason}</div>
          </div>
          <button onClick={onToggleOpen} style={{ background: cart?.closedManually ? colors.green : colors.red, color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 20, fontWeight: 800, fontSize: 12, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {cart?.closedManually ? 'Open' : 'Close'}
          </button>
        </div>
        <RemindersButton cartId={cartId} role="owner" />
        {/* Pack-for-today tile — its expanded checklist wraps full-width below */}
        <PrepChecklist state={state} updateState={updateState} cartId={cartId} />
      </div>

      {showCloseNudge && (
        <button onClick={() => onReconcile(nudgeDate)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: (daysSinceClose == null || daysSinceClose >= 2) ? '#FDE8EA' : '#FFF3E0', border: `1px solid ${(daysSinceClose == null || daysSinceClose >= 2) ? '#F5B5BC' : '#F5CFA4'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, cursor: 'pointer' }}>
          <AlertTriangle size={20} color={(daysSinceClose == null || daysSinceClose >= 2) ? '#C81E1E' : '#B5460B'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: (daysSinceClose == null || daysSinceClose >= 2) ? '#C81E1E' : '#B5460B' }}>
              {daysSinceClose == null ? 'Day-end audit never run' : daysSinceClose === 0 ? "Today isn't closed yet" : `${daysSinceClose} day${daysSinceClose !== 1 ? 's' : ''} since last day-close`}
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 1 }}>The plate, glass, cash and stock theft audit only runs at day-close. Tap to reconcile →</div>
          </div>
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
        <SectionHeader title="Today's Snapshot" subtitle={istDateLabel(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} />
        <button onClick={doRefresh} disabled={refreshing} title="Pull the latest orders now"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, color: colors.muted, cursor: refreshing ? 'wait' : 'pointer', whiteSpace: 'nowrap', marginBottom: 14, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.green, display: 'inline-block' }} />
          live · {refreshing ? 'refreshing…' : agoLabel} 🔄
        </button>
      </div>

      {/* Hero metric */}
      <div style={{ background: colors.ink, color: colors.primary, padding: '18px 20px', borderRadius: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1, marginBottom: 4 }}>REVENUE TODAY · CASH + UPI</div>
          {deltaPct !== null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: deltaPct >= 0 ? '#7CE38B' : '#FF8A8A', background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '3px 10px' }}>
              {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}% vs yest
            </span>
          )}
        </div>
        <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>₹{todayRevenue.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{todayOrders.filter(isPaid).length} orders{stockTypes.length > 0 ? ` · ${piecesSold} pieces sold` : ''}</span>
          <button onClick={onSeeOrders} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>See live orders →</button>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,214,10,0.2)', fontSize: 13 }}>
          <div><span style={{ opacity: 0.7 }}>Expenses </span><strong>₹{todayExpenses.toLocaleString('en-IN')}</strong></div>
          <div><span style={{ opacity: 0.7 }}>Net profit </span><strong style={{ color: todayNet >= 0 ? '#7CE38B' : '#FF8A8A' }}>₹{todayNet.toLocaleString('en-IN')}</strong></div>
        </div>
      </div>

      {/* 7-day revenue trend */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>LAST 7 DAYS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 80 }}>
          {series.map((v, i) => {
            const isToday = i === 6;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: colors.muted, fontWeight: 700 }}>{v > 0 ? `${Math.round(v / 1000 * 10) / 10}k` : ''}</div>
                <div style={{ width: '100%', maxWidth: 26, height: Math.max(4, (v / maxRev) * 56), background: isToday ? colors.ink : '#E8E5DC', borderRadius: 5 }} />
                <div style={{ fontSize: 9.5, color: isToday ? colors.ink : colors.muted, fontWeight: isToday ? 800 : 600 }}>{istDateLabel(last7[i], { weekday: 'short' }).slice(0, 2)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Split metrics — the online card only shows for carts that opted into
          Zomato/Swiggy (or that have online money today from before opting out). */}
      {(() => { const showOnline = onlineVendorsFor(state, cartId) || onlineRevenue > 0; return (
      <div style={{ display: 'grid', gridTemplateColumns: showOnline ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <MetricCard label="Cash" value={`₹${cashRevenue}`} icon={<IndianRupee size={16}/>} color={colors.green} />
        <MetricCard label="UPI" value={`₹${upiRevenue}`} icon={<Smartphone size={16}/>} color={colors.ink} />
        {showOnline && <MetricCard label="🛵 Online" value={`₹${onlineRevenue}`} icon={<Smartphone size={16}/>} color={colors.accent} />}
      </div>
      ); })()}

      {/* Per-vendor switches — owner turns Zomato/Swiggy on or off for their
          cart (staff buttons + report cards follow). Admin's opt-in gates the
          whole row. */}
      {onlineVendorsFor(state, cartId) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, flex: 1 }}>🛵 ONLINE VENDORS</span>
          {[['zomato', 'Zomato', '#E23744'], ['swiggy', 'Swiggy', '#FC8019']].map(([key, lab, col]) => {
            const on = vendorEnabledFor(state, cartId, key);
            return (
              <button key={key} onClick={() => onToggleVendor(key)}
                style={{ border: `1.5px solid ${on ? col : colors.border}`, background: on ? col : '#fff', color: on ? '#fff' : colors.muted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                {lab} {on ? 'On' : 'Off'}
              </button>
            );
          })}
        </div>
      )}

      {/* Share today's summary */}
      <button onClick={shareToday} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', border: `1px solid ${colors.border}`, color: brand.navy, padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 16 }}>
        📤 Share today's summary
      </button>

      {/* Stock run-out estimate (today's selling pace) */}
      {showRunOut && (
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>WILL LAST (AT TODAY'S PACE)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runOut.map(r => {
              const out = r.remaining === 0;
              const txt = out ? 'Out of stock' : r.hrsLeft === null ? 'No sales yet' : r.hrsLeft >= 6 ? 'Plenty (6h+)' : `~${r.hrsLeft.toFixed(1)} hrs left`;
              const col = out || (r.hrsLeft !== null && r.hrsLeft < 1) ? colors.red : (r.hrsLeft !== null && r.hrsLeft < 2) ? '#B5460B' : colors.muted;
              return (
                <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{r.label} <span style={{ color: colors.muted, fontSize: 12 }}>· {r.remaining} pcs</span></span>
                  <span style={{ fontWeight: 800, color: col }}>{txt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uncollected orders — all days, not just today. Unpaid orders aren't in
          revenue until settled; this makes sure none stay hidden if they roll
          past their day. Staff collect them in the Pending tab. */}
      {uncollected.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${colors.accent}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#FFF4E5' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#B5460B' }}>⏳ {uncollected.length} uncollected order{uncollected.length > 1 ? 's' : ''}</div>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#B5460B' }}>₹{uncollectedTotal.toLocaleString('en-IN')}</div>
          </div>
          {uncollected.map(o => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${colors.border}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>#{o.token} · ₹{o.total}</div>
                <div style={{ fontSize: 11.5, color: colors.muted }}>{o.date !== TODAY ? `${o.date} · ` : ''}{o.time}{o.staff ? ` · ${o.staff}` : ''}{o.source === 'staff-entry' ? ' · counter' : ' · QR'}</div>
              </div>
              <span style={{ fontSize: 10, padding: '3px 9px', background: '#FFF1E7', color: '#FF4D00', borderRadius: 10, fontWeight: 700, letterSpacing: 0.5 }}>UNPAID</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: colors.muted, padding: '8px 14px', borderTop: `1px solid ${colors.border}` }}>Staff collect these in the Pending tab. Revenue updates only after payment.</div>
        </div>
      )}

      {/* Stock alerts — compact one-line chip */}
      {lowTypes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF4E5', border: '1px solid #FFD9A0', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12.5 }}>
          <AlertTriangle size={15} color="#B5460B" style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 800, color: '#B5460B' }}>Low freezer stock:</span>
          <span style={{ color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lowTypes.map(st => st.label).join(', ')}</span>
        </div>
      )}

      {stockTypes.length > 0 && <>
      <SectionHeader title="Live Inventory" />
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '10px 16px', background: '#FAF8F2', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: colors.muted }}>
          <div style={{ flex: 1 }}>ITEM</div>
          <div style={{ width: 88, textAlign: 'right' }}>❄️ FREEZER</div>
          <div style={{ width: 88, textAlign: 'right' }}>🛒 ON CART</div>
        </div>
        {stockTypes.map(st => {
          const b = inv[st.key] || { freezer: 0, cart: 0 };
          const low = b.freezer < 100;
          return (
            <div key={st.key} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderTop: `1px solid ${colors.border}` }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{st.label}</div>
              <div style={{ width: 88, textAlign: 'right' }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: low ? colors.red : colors.ink }}>{b.freezer}</span>
                <span style={{ fontSize: 11, color: colors.muted }}> pcs</span>
                {low && <span style={{ display: 'block', fontSize: 10, color: colors.red, fontWeight: 700 }}>LOW</span>}
              </div>
              <div style={{ width: 88, textAlign: 'right' }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{b.cart}</span>
                <span style={{ fontSize: 11, color: colors.muted }}> pcs</span>
              </div>
            </div>
          );
        })}
        {stockTypes.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13, borderTop: `1px solid ${colors.border}` }}>No stock types yet.</div>}
      </div>
      </>}

      {/* Ware audit — live "should remain" per serving type so the owner can
          spot-check the physical stacks anytime; a shortfall means unpunched
          servings (half → 6" plate, full → 7" plate, mocktail → glass). */}
      {activeWare.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: '#FAF8F2', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: colors.muted }}>🍽️ PLATES / GLASSES SHOULD REMAIN</div>
          {activeWare.map(w => { const l = ware[w.key]; return (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: `1px solid ${colors.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{w.label}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{l.closed ? '✓ reconciled — day closed' : `${l.opening > 0 ? `${l.opening} carried + ` : ''}${l.supplied} given − ${l.used} served`}</div>
              </div>
              {!l.closed && onResetWare && (
                <button onClick={() => onResetWare(w.key)} title="Recount / hard-reset this count" style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 700, color: colors.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>↺ Reset</button>
              )}
              <div style={{ fontSize: 20, fontWeight: 900, color: l.expected < 0 ? colors.red : colors.ink, minWidth: 30, textAlign: 'right' }}>{l.expected}</div>
            </div>
          ); })}
        </div>
      )}

      <SectionHeader title="Recent Orders" />
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {todayOrders.slice(-5).reverse().map(o => (
          <OrderRow key={o.id} order={o} />
        ))}
        {todayOrders.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.muted, fontSize: 14 }}>No orders yet today</div>
        )}
      </div>
    </div>
  );
}


export { OwnerApp, Dashboard };
