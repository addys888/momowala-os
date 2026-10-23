import { useNotificationNavigation } from '../../lib/useNotificationNavigation';
import { DailyProfitSummary } from '../../components/DailyProfit';
import { ClosingWorkflow } from '../../components/ClosingWorkflow';
import { OpeningAlerts } from '../../components/OpeningAlerts';
import { useState, useEffect } from 'react';
import { ShoppingCart, Users, Clock, BarChart3, Settings, Home, IndianRupee, ArrowRight, Edit3, Boxes, FileText, CheckCircle2 } from 'lucide-react';
import { setCartClosed, saveCartProfile, pushMenus } from '../../lib/store';
import { TODAY, WARE_TYPES, PAY_BADGE, brand, cartOpenState, partnerColors as colors, cashPart, upiPart, isOnline, isPaid, istDateLabel, istTime, menuFor, menuLabelFor, onlineVendorsFor, printerCfgFor, vendorLinksFor, vendorEnabledFor, wareLedger } from '../../core';
import { CartProfileModal, MenuEditor } from '../MenuEditor';
import { InventoryView } from './Inventory';
import { Reconciliation } from './Reconciliation';
import { Reports } from './Reports';
import { StaffRegistry } from './StaffRegistry';
import { BottomNav, MetricCard, OrderRow, TopBar } from '../../components/shared';
import { RemindersButton, OrderAlertsPrompt } from '../../components/RemindersButton';
import { PrepChecklist } from '../../components/PrepChecklist';
import { useStore } from '../../store';

function OwnerApp({ state, updateState, onExit, cartId }) {
  const [tab, setTab] = useState('dashboard');
  useNotificationNavigation(cartId,true,setTab);
  const [reportView,setReportView]=useState('revenue');
  const goProfit=()=>{setReportView('profit');setTab('reports');};
  const [showProfile, setShowProfile] = useState(false);
  // Deep-link target for the Reconcile tab (set by the dashboard nudge). Cleared
  // on any normal tab switch so opening Reconcile by hand still starts on today.
  const [reconcileDate, setReconcileDate] = useState(null);
  const goReconcile = (date) => { setReconcileDate(date || null); setTab('reconcile'); };
  // Deep-link the orders feed to a specific day — the Uncollected card uses it to
  // land straight on the OLDEST unsettled day, not today (where the stale orders
  // wouldn't be visible at all, since the feed shows one date at a time).
  const [ordersDate, setOrdersDate] = useState(null);
  const goOrders = (date) => { setOrdersDate(date || TODAY); setTab('orders'); };
  const navTab = (t) => { setReportView('revenue'); setReconcileDate(null); setOrdersDate(null); setTab(t); };
  const cart = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);
  const saveProfile = (fields) => {
    // Printer config lives in the menus blob (synced via pushMenus, clobber-safe)
    // — split it out from the cart-table fields.
    const { printerEnabled, printerFooter, printerAutoPrint, zomatoUrl, swiggyUrl, vendors, ...cartFields } = fields;
    const updated = { ...cart, ...cartFields };
    const newMenus = { ...state.menus, [cartId]: { ...menuFor(state, cartId),
      printer: { enabled: !!printerEnabled, footer: (printerFooter || '').trim(), autoPrint: !!printerAutoPrint },
      vendors: vendors || menuFor(state, cartId).vendors,
      vendorLinks: { zomato: (zomatoUrl || '').trim(), swiggy: (swiggyUrl || '').trim() },
    } };
    if (!updateState({ carts: state.carts.map(c => c.id === cartId ? updated : c), menus: newMenus })) return;
    saveCartProfile(updated); // persist immediately so it survives a refresh
    pushMenus(newMenus, cartId);
    setShowProfile(false);
  };
  const toggleOpen = () => {
    const next = !cart?.closedManually;
    if (!updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, closedManually: next } : c) })) return;
    // Persist immediately (not via the debounced batch) so it survives a refresh.
    setCartClosed(cartId, next);
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
    <div className="partner-app" style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cart?.name ?? 'Cart'} · Owner`} onExit={onExit} />

      {showProfile && <CartProfileModal cart={cart} printer={printerCfgFor(state, cartId)} vendorLinks={vendorLinksFor(state, cartId)} vendors={onlineVendorsFor(state,cartId)?{zomato:vendorEnabledFor(state,cartId,'zomato'),swiggy:vendorEnabledFor(state,cartId,'swiggy')}:undefined} onSave={saveProfile} onClose={() => setShowProfile(false)} />}

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {/* Nags until this device has push on — otherwise the owner's phone stays
            silent for incoming customer orders and daily reminders. */}
        <OrderAlertsPrompt cartId={cartId} role="owner" />
        {__ANDROID_APP__ && <RemindersButton cartId={cartId} role="owner" />}

        <ClosingWorkflow key={`closing-${cartId}`} cartId={cartId} owner expanded={tab==='reconcile'} onOpen={()=>setTab('reconcile')} />
        {tab === 'dashboard' && <Dashboard onProfit={goProfit} state={state} cartId={cartId} inv={inv} cart={cart} onEditProfile={() => setShowProfile(true)} onOpeningStock={()=>setTab('inventory')} onToggleOpen={toggleOpen} stockTypes={menu.stockTypes || []} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} onlineRevenue={onlineRevenue} piecesSold={piecesSold} todayOrders={todayOrders} onReconcile={goReconcile} onSeeOrders={() => goOrders(TODAY)} onSeeUncollected={goOrders} updateState={updateState} />}
        {tab === 'orders' && <OrdersFeed state={state} cartId={cartId} onlineVendors={onlineVendorsFor(state, cartId)} initialDate={ordersDate} />}
        {tab === 'inventory' && <InventoryView state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} />}
        {tab === 'inventory' && <details className="partner-card"><summary>Opening history & alerts</summary><OpeningAlerts key={cartId} cartId={cartId}/></details>}
        {tab === 'inventory' && <details className="partner-card"><summary>Serving supplies · spot check</summary>{WARE_TYPES.map(w=>{const l=wareLedger(state,cartId,TODAY)[w.key];return <div className="stock-item" key={w.key}><span>{w.label}</span><strong>{l.expected}</strong>{!l.closed&&<button className="quiet-button" onClick={()=>resetWare(w.key)}>Recount</button>}</div>;})}</details>}
        {tab === 'reconcile' && <Reconciliation state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} initialDate={reconcileDate} />}
        {tab === 'menu' && <MenuEditor state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'staff' && <StaffRegistry state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'reports' && <Reports initialView={reportView} state={state} updateState={updateState} cartId={cartId} />}
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
function OrdersFeed({ state, cartId, onlineVendors = false, initialDate }) {
  const { lastSync, refreshNow } = useStore();
  const [date, setDate] = useState(initialDate || TODAY);
  useEffect(() => { if (initialDate) setDate(initialDate); }, [initialDate]);
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
        <div style={{ fontSize: 20, fontWeight: 650 }}>Orders</div>
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

      <div className="partner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
                  <div style={{ fontWeight: 650, fontSize: 14, textDecoration: cancelledRow ? 'line-through' : 'none' }}>#{o.token} <span style={{ fontWeight: 400, color: colors.muted, fontSize: 12 }}>· {o.time}{o.staff ? ` · ${o.staff}` : ''}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontWeight: 650 }}>₹{o.total}</span>
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

function Dashboard({ onProfit, state, cartId, inv, cart, onEditProfile, onOpeningStock, onToggleOpen, stockTypes = [], todayRevenue, cashRevenue, upiRevenue, onlineRevenue = 0, piecesSold, todayOrders, onReconcile, onSeeOrders, onSeeUncollected, updateState }) {
  // Day-close nudge: the plate/cash/stock theft audit only runs at day-close, so
  // a stretch of un-closed days means the audit is producing nothing. Warn when
  // today has sales but isn't closed, and count how long the streak has run.
  const cartCloses = (state.dayCloseLogs || []).filter(d => d.cartId === cartId);
  const closedToday = cartCloses.some(d => d.date === TODAY);
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

  // Uncollected (unpaid) orders across ALL days — money not yet collected and not
  // counted in revenue. Surfaced so nothing rolls past its day unseen.
  const uncollected = (state?.orders || []).filter(o => o.cartId === cartId && o.payment === 'pending').sort((a, b) => a.id - b.id);
  const uncollectedTotal = uncollected.reduce((s, o) => s + o.total, 0);
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
  const todayExpenses = (state?.expenses || []).filter(e => e.cartId === cartId && e.date === TODAY).reduce((s, e) => s + e.amount, 0);
  const todayNet = todayRevenue - todayExpenses;

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

  return <div className="owner-dashboard">
    <div className="dashboard-heading">
      <div><span className="eyebrow">{istDateLabel(new Date(), {weekday:'short',day:'numeric',month:'short'})}</span><h1>Overview</h1></div>
      <button className="quiet-button" onClick={onEditProfile}><Settings size={17}/> Cart settings</button>
    </div>
    <div className="store-status">
      <span className={openState.open?'status-dot open':'status-dot'}/><strong>{openState.open?'Open':'Closed'}</strong>
      <button role="switch" aria-label="Allow orders during opening hours" aria-checked={openState.open} disabled={!openState.open&&!cart?.closedManually} title={!openState.open&&!cart?.closedManually?'Outside scheduled opening hours':'Pause or resume orders'} className="store-switch" onClick={onToggleOpen}><span/></button>
      <details className="hours-info"><summary aria-label="Opening hours and availability">ⓘ</summary><div>Hours: {cart?.openTime || 'Not set'}–{cart?.closeTime || 'Not set'} IST.<br/>{cart?.closedManually?'Manually paused.':'Orders follow these opening hours.'}</div></details>
      <button className="sync-button" disabled={refreshing} onClick={doRefresh}>{refreshing?'Refreshing…':agoLabel} ↻</button>
    </div>
    <OpeningAlerts cartId={cartId} compact openTime={cart?.openTime} onOpenStock={onOpeningStock}/>
    <section className="revenue-overview">
      <span>Collected today · Cash + UPI</span><strong>₹{todayRevenue.toLocaleString('en-IN')}</strong>
      <div>{todayOrders.filter(isPaid).length} paid orders · {piecesSold} pieces</div>
      <div className="revenue-detail"><span>Cash <b>₹{cashRevenue.toLocaleString('en-IN')}</b></span><span>UPI <b>₹{upiRevenue.toLocaleString('en-IN')}</b></span><span>Expenses <b>₹{todayExpenses.toLocaleString('en-IN')}</b></span></div>
      <DailyProfitSummary cartId={cartId} onOpen={onProfit}/>
    </section>
    <section className="partner-card"><div className="card-heading"><h2>Daily operations</h2><span>{closedToday?'Reconciled':'In progress'}</span></div>
      <div className="operation-grid"><button onClick={onOpeningStock}><Boxes size={20}/><span>Opening stock<small>Manager & quantities</small></span><ArrowRight size={16}/></button><button onClick={()=>onReconcile(nudgeDate)}><CheckCircle2 size={20}/><span>Close the day<small>{closedToday?'View saved report':'Cash & stock check'}</small></span><ArrowRight size={16}/></button></div>
      <PrepChecklist state={state} updateState={updateState} cartId={cartId}/>
    </section>
    {uncollected.length>0 && <button className="attention-row" onClick={()=>onSeeUncollected(uncollected.map(o=>o.date).sort()[0])}><Clock size={18}/>{uncollected.length} unpaid orders · ₹{uncollectedTotal.toLocaleString('en-IN')}<ArrowRight size={16}/></button>}
    <section className="partner-card"><div className="card-heading"><h2>Sales trend</h2><span>Last 7 days</span></div><div className="mini-trend" role="img" aria-label="Cash and UPI revenue over the last seven days">{series.map((v,i)=><div key={last7[i]}><small>₹{v.toLocaleString('en-IN')}</small><i style={{height:Math.max(3,v/maxRev*64)}}/><span>{istDateLabel(last7[i],{weekday:'short'})}</span></div>)}</div></section>
    {stockTypes.length>0 && <section className="partner-card"><div className="card-heading"><h2>Live stock</h2><button className="text-button" onClick={onOpeningStock}>Manage →</button></div><div className="stock-table-heading"><span>Item</span><span>Freezer</span><span>On cart</span></div>{stockTypes.map(st=>{const b=inv?.[st.key] || {freezer:0,cart:0};return <div className="stock-item" key={st.key}><div><strong>{st.label}</strong><small className={b.cart===0?'warning-text':''}>{b.cart===0?'Cart empty':b.freezer<100?'Low freezer stock':'Available'}</small></div><span>{b.freezer}<small>pcs</small></span><span>{b.cart}<small>pcs</small></span></div>;})}</section>}
    <section className="partner-card"><div className="card-heading"><h2>Recent orders</h2><button className="text-button" onClick={onSeeOrders}>View all →</button></div>{todayOrders.slice(-3).reverse().map(o=><OrderRow key={o.id} order={o}/>)}{!todayOrders.length&&<p className="empty-state">Today’s orders will appear here.</p>}</section>
    <button className="quiet-button share-summary" onClick={shareToday}>Share today’s summary</button>
  </div>;
}


export { OwnerApp, Dashboard };
