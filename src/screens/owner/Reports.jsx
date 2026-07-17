import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, WARE_TYPES, adminBtn, brand, colors, dayCloseWare, editInput, editLabel, isPaid, istDateLabel, localDate, menuFor, wareForOrder } from '../../core';
import { Reconciliation } from './Reconciliation';
import { EditModalShell, MetricCard, SectionHeader } from '../../components/shared';

const EXPENSE_CATEGORIES = ['Frozen momo stock', 'Vegetables / paneer', 'Oil & consumables', 'Gas / fuel', 'Packaging', 'Rent / pitch', 'Other'];
// Inclusive start date (YYYY-MM-DD, IST) for a period. Derived from the IST
// calendar date so week/month boundaries are correct regardless of device zone.

function periodStart(period) {
  const today = localDate(); // IST YYYY-MM-DD
  if (period === 'today') return today;
  const [y, m, dd] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd)); // anchor on that calendar date
  if (period === 'week') { const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); } // Monday
  else if (period === 'month') { d.setUTCDate(1); }
  return d.toISOString().split('T')[0];
}

// Aggregate sold pieces from a set of paid orders against the cart's menu.
// Returns pieces per stock category (veg/paneer/corn) and a per-item breakdown
// (portions sold + pieces), sorted by portions sold descending.

function soldBreakdown(orders, menuItems) {
  const byCat = {};   // stockKey -> pieces
  const byItem = {};  // key -> { name, qty, pieces }
  (orders || []).forEach(o => (o.items || []).forEach(it => {
    const m = menuItems.find(x => x.id === it.id);
    if (!m) { // lassi / add-ons (no piece count)
      const k = 'x:' + it.id;
      byItem[k] = byItem[k] || { name: it.name, qty: 0, pieces: 0 };
      byItem[k].qty += it.qty;
      return;
    }
    const pcs = (it.type === 'half' ? m.pcsHalf : m.pcsFull) * it.qty;
    if (m.stockKey) byCat[m.stockKey] = (byCat[m.stockKey] || 0) + pcs;
    byItem[m.id] = byItem[m.id] || { name: m.name, qty: 0, pieces: 0 };
    byItem[m.id].qty += it.qty;
    byItem[m.id].pieces += pcs;
  }));
  const items = Object.values(byItem).sort((a, b) => b.qty - a.qty || b.pieces - a.pieces);
  return { byCat, items };
}

// Net stock discrepancy (pieces) for a day-close — prefers the generic stock
// array; falls back to the legacy veg/paneer/corn diffs for old records.

function dayCloseStockRows(d) {
  // '_'-prefixed rows are the ware audit ('_ware:*'), not momo stock — keep
  // them out of the stock-gap math (read them via dayCloseWare instead).
  if (Array.isArray(d.stock)) return d.stock.filter(r => !String(r.key).startsWith('_'));
  return [
    d.vegDiff != null ? { label: 'Veg', diff: d.vegDiff } : null,
    d.paneerDiff != null ? { label: 'Paneer', diff: d.paneerDiff } : null,
    d.cornDiff != null ? { label: 'Corn', diff: d.cornDiff } : null,
  ].filter(Boolean);
}

const dayCloseStockDiff = (d) => dayCloseStockRows(d).reduce((s, x) => s + (x.diff || 0), 0);
// "+50" / "−50" / "✓" with a colour; negative = short/missing.

const fmtDiff = (n) => n === 0 ? '✓ matched' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

const diffColor = (n) => n === 0 ? '#0F7B0F' : (n < 0 ? '#C81E1E' : '#B5460B');


function Reports({ state, updateState, cartId }) {
  const [view, setView] = useState('revenue'); // 'revenue' | 'expense' sub-tab
  const [period, setPeriod] = useState('today');
  const [pickedDate, setPickedDate] = useState(TODAY); // for the single-day view
  const [expMonth, setExpMonth] = useState(TODAY.slice(0, 7)); // YYYY-MM for the expense tab
  const [showExpense, setShowExpense] = useState(false);
  const [editExpenseItem, setEditExpenseItem] = useState(null); // expense being edited
  const [showAllItems, setShowAllItems] = useState(false);
  const [delExpense, setDelExpense] = useState(null); // expense pending delete-confirm
  const menu = menuFor(state, cartId);
  // Inclusive date range for the chosen view. 'day' is a single picked date.
  const from = period === 'day' ? pickedDate : periodStart(period);
  const to = period === 'day' ? pickedDate : TODAY;
  const inRange = (d) => d >= from && d <= to;

  const orders = state.orders.filter(o => o.cartId === cartId && isPaid(o) && inRange(o.date));
  const expenses = (state.expenses || []).filter(e => e.cartId === cartId && inRange(e.date));
  const wastage = (state.wastageLogs || []).filter(w => w.cartId === cartId && inRange(w.date));

  // Reconciliation roll-up + revenue basis. Money "of record" is what the owner
  // counted at day-close (cash box + PhonePe); days not yet closed fall back to
  // live system order totals. So a closed day reflects actual money collected.
  const closes = state.dayCloseLogs.filter(d => d.cartId === cartId);
  const periodCloses = closes.filter(d => inRange(d.date));
  const closedDates = new Set(periodCloses.map(d => d.date));
  const cashGap = periodCloses.reduce((s, d) => s + (d.cashDiff || 0), 0);
  const upiGap = periodCloses.reduce((s, d) => s + (d.upiDiff || 0), 0);
  const stockGap = periodCloses.reduce((s, d) => s + dayCloseStockDiff(d), 0);
  // Ware audit roll-up: per-type counted-vs-expected gap across the period's
  // audited closes (6" plates for half momos, 7" for full, glasses for drinks).
  const wareCloseRows = periodCloses.flatMap(dayCloseWare);
  const wareGaps = WARE_TYPES
    .map(w => ({ ...w, gap: wareCloseRows.filter(r => r.key === `_ware:${w.key}`).reduce((s, r) => s + (r.diff || 0), 0), audited: wareCloseRows.some(r => r.key === `_ware:${w.key}`) }))
    .filter(w => w.audited);

  // Closed days → counted money; open days (incl. today) → live system orders.
  const openOrders = orders.filter(o => !closedDates.has(o.date));
  const openCash = openOrders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const openUpi = openOrders.filter(o => o.payment === 'upi').reduce((s, o) => s + o.total, 0);
  const closedCash = periodCloses.reduce((s, d) => s + (d.physicalCash || 0), 0);
  const closedUpi = periodCloses.reduce((s, d) => s + (d.phonePeAmount || 0), 0);
  const cash = openCash + closedCash;
  const upi = openUpi + closedUpi;
  const revenue = cash + upi;
  // Price each ware type's shortfall at its own average line price this period
  // (half-portion price for 6" plates, full for 7", drink price for glasses) —
  // a shortfall ≈ servings that were never punched (possible leakage).
  const unitAvg = (match) => {
    let amt = 0, n = 0;
    orders.forEach(o => (o.items || []).forEach(it => { if (match(it)) { amt += it.price * it.qty; n += it.qty; } }));
    return n > 0 ? amt / n : 0;
  };
  const isMomoLine = (it) => (menu.items || []).some(m => m.id === it.id);
  const isDrinkLine = (it) => (menu.lassi || []).some(l => l.id === it.id);
  const wareUnitAvg = {
    plate_s: unitAvg(it => isMomoLine(it) && it.type === 'half'),
    plate_l: unitAvg(it => isMomoLine(it) && it.type !== 'half'),
    glass: unitAvg(isDrinkLine),
  };
  const missingWare = wareGaps.filter(w => w.gap < 0).map(w => ({ ...w, missing: -w.gap }));
  const estLeakage = Math.round(missingWare.reduce((s, w) => s + w.missing * (wareUnitAvg[w.key] || 0), 0));
  const ordersCount = openOrders.length + periodCloses.reduce((s, d) => s + (d.totalOrders || 0), 0);
  const spend = expenses.reduce((s, e) => s + e.amount, 0);
  const wasted = wastage.reduce((s, w) => s + w.qty, 0);
  const net = revenue - spend;

  // Complete daily history: reconciled days show counted money; days that had
  // sales but were never reconciled fall back to system totals (so a forgotten
  // day-close is never lost from history/reporting).
  const menuItemsForHist = menu.items || [];
  const sysByDate = {};
  state.orders.filter(o => o.cartId === cartId && isPaid(o)).forEach(o => {
    const e = sysByDate[o.date] || { date: o.date, revenue: 0, orders: 0, pieces: 0 };
    e.revenue += o.total; e.orders += 1;
    (o.items || []).forEach(it => { const m = menuItemsForHist.find(x => x.id === it.id); if (m && m.stockKey) e.pieces += (it.type === 'half' ? m.pcsHalf : m.pcsFull) * it.qty; });
    sysByDate[o.date] = e;
  });
  const closeByDate = Object.fromEntries(closes.map(d => [d.date, d]));
  const historyDates = [...new Set([...Object.keys(sysByDate), ...Object.keys(closeByDate)])]
    .filter(d => period === 'today' || period === 'day' ? inRange(d) : d >= from)
    .sort().reverse().slice(0, 31);

  // Sold pieces by category + top-selling items for the chosen period.
  const { byCat, items: soldItems } = soldBreakdown(orders, menu.items || []);
  const catRows = (menu.stockTypes || []).map(st => ({ key: st.key, label: st.label, pcs: byCat[st.key] || 0 }));
  const maxQty = soldItems[0]?.qty || 1;
  const shownItems = showAllItems ? soldItems : soldItems.slice(0, 5);

  const addExpense = (category, amount, note, date = TODAY, fund = 'cart') => {
    const e = { id: Date.now(), cartId, date: date || TODAY, category, amount, note, fund };
    updateState({ expenses: [...(state.expenses || []), e] });
    setShowExpense(false);
  };
  const removeExpense = (id) => { updateState({ expenses: state.expenses.filter(e => e.id !== id) }); setDelExpense(null); };
  const updateExpense = (id, category, amount, note, date = TODAY, fund = 'cart') => {
    updateState({ expenses: state.expenses.map(e => e.id === id ? { ...e, category, amount, note, date: date || TODAY, fund } : e) });
    setEditExpenseItem(null);
  };

  // Expense sub-tab: every expense in the picked month, grouped by its logged
  // date (newest first). Older entries carry under whatever date they were saved.
  const monthExpenses = (state.expenses || []).filter(e => e.cartId === cartId && (e.date || '').startsWith(expMonth));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const expByDate = {};
  monthExpenses.forEach(e => { (expByDate[e.date] = expByDate[e.date] || []).push(e); });
  const expDates = Object.keys(expByDate).sort().reverse();
  const monthLabel = istDateLabel(expMonth + '-01', { month: 'long', year: 'numeric' });
  // Funding-source split: 'personal' = borrowed from the owner's Axis account,
  // 'cart' (or unset legacy) = paid from cart earnings (Kotak/UPI).
  const axisMonth = monthExpenses.filter(e => e.fund === 'personal').reduce((s, e) => s + e.amount, 0);
  const cartMonth = monthTotal - axisMonth;
  const axisAllTime = (state.expenses || []).filter(e => e.cartId === cartId && e.fund === 'personal').reduce((s, e) => s + e.amount, 0);

  const label = period === 'day'
    ? (pickedDate === TODAY ? 'Today' : istDateLabel(pickedDate, { weekday: 'short', day: 'numeric', month: 'short' }))
    : { today: 'Today', week: 'This week', month: 'This month' }[period];

  return (
    <div>
      <SectionHeader title="Records" subtitle="Sales · expenses · wastage" />

      {/* Earnings | Expenses sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['revenue', '📈 Earnings'], ['expense', '💸 Expenses']].map(([k, lab]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: '11px 0', background: view === k ? colors.ink : '#fff', color: view === k ? colors.primary : colors.ink, border: `1px solid ${view === k ? colors.ink : colors.border}`, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{lab}</button>
        ))}
      </div>

      {view === 'revenue' && (<>
      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['day', '📅 Pick day']].map(([k, lab]) => (
          <button key={k} onClick={() => setPeriod(k)} style={{ flex: 1, padding: '9px 0', background: period === k ? colors.ink : '#fff', color: period === k ? colors.primary : colors.ink, border: `1px solid ${period === k ? colors.ink : colors.border}`, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{lab}</button>
        ))}
      </div>
      {period === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>Date:</span>
          <input type="date" value={pickedDate} max={TODAY} onChange={e => setPickedDate(e.target.value || TODAY)}
            style={{ flex: 1, padding: '9px 12px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 14, fontWeight: 700, boxSizing: 'border-box' }} />
        </div>
      )}
      {period !== 'day' && <div style={{ marginBottom: 6 }} />}

      {/* Sales + net */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5 }}>{label.toUpperCase()} · SALES</div>
        <div style={{ fontSize: 34, fontWeight: 900 }}>₹{revenue.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{ordersCount} orders · 💵 ₹{cash} · 📱 ₹{upi}</div>
        {periodCloses.length > 0 && <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 4 }}>Closed days use money counted at day-close; today is live.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Expenses" value={`₹${spend.toLocaleString('en-IN')}`} icon={<IndianRupee size={16}/>} color={colors.red} />
        <MetricCard label="Net (sales − spend)" value={`₹${net.toLocaleString('en-IN')}`} icon={<TrendingUp size={16}/>} color={net >= 0 ? colors.green : colors.red} />
      </div>
      {/* Momos sold by category (pieces) — #5 */}
      {catRows.length > 0 && (<>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>MOMOS SOLD {label.toUpperCase()} (PIECES)</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(catRows.length, 3)}, 1fr)`, gap: 10, marginBottom: 16 }}>
          {catRows.map(c => (
            <div key={c.key} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{c.pcs}</div>
              <div style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </>)}

      {/* Top selling items — #3 (period-aware, top 5 + see all) */}
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>TOP SELLERS — {label.toUpperCase()}</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 14, marginBottom: 16 }}>
        {shownItems.map((it, i) => (
          <div key={it.name + i} style={{ marginBottom: i === shownItems.length - 1 ? 0 : 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{i + 1}. {it.name}</span>
              <span style={{ fontWeight: 700, color: colors.muted }}>{it.qty} sold{it.pieces ? ` · ${it.pieces} pcs` : ''}</span>
            </div>
            <div style={{ height: 8, background: colors.paper, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, (it.qty / maxQty) * 100)}%`, height: '100%', background: colors.ink, borderRadius: 6 }} />
            </div>
          </div>
        ))}
        {soldItems.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No sales {label.toLowerCase()} yet.</div>}
        {soldItems.length > 5 && (
          <button onClick={() => setShowAllItems(v => !v)} style={{ width: '100%', marginTop: 12, background: 'transparent', border: `1px solid ${colors.border}`, color: brand.navy, padding: 9, borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            {showAllItems ? 'Show top 5' : `See all ${soldItems.length} items`}
          </button>
        )}
      </div>

      {/* Wastage — owner day-wise view #1 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>WASTAGE — {label.toUpperCase()}</div>
        {wasted > 0 && <div style={{ fontSize: 12, fontWeight: 800, color: colors.red }}>{wasted} pcs</div>}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden', marginBottom: 16 }}>
        {wastage.slice().reverse().map(w => (
          <div key={w.id} style={{ padding: '11px 14px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{w.qty}× {w.label}</div><div style={{ fontSize: 11.5, color: colors.muted }}>{w.reason} · {w.date}{w.staff ? ` · ${w.staff}` : ''}</div></div>
            <div style={{ fontSize: 12, color: colors.red, fontWeight: 700 }}>−{w.qty}</div>
          </div>
        ))}
        {wastage.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No wastage logged {label.toLowerCase()}. 👍</div>}
      </div>

      {/* Reconciliation roll-up for the period (cash short/over, UPI, stock) */}
      {periodCloses.length > 0 && (<>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>RECONCILIATION GAPS — {label.toUpperCase()}</div>
        <div style={{ display: 'grid', gridTemplateColumns: wareGaps.length > 0 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[['💵 Cash', cashGap, '₹'], ['📱 UPI', upiGap, '₹'], ['🥟 Stock', stockGap, ' pcs'], ...wareGaps.map(w => [`${w.key === 'glass' ? '🥤 Glasses' : `🍽️ ${w.short} plates`}`, w.gap, ' pcs'])].map(([lab, val, unit]) => (
            <div key={lab} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: diffColor(val) }}>{val === 0 ? '✓' : `${val > 0 ? '+' : '−'}${unit === '₹' ? '₹' : ''}${Math.abs(val)}${unit === '₹' ? '' : unit}`}</div>
              <div style={{ fontSize: 10.5, color: colors.muted, fontWeight: 600, marginTop: 2 }}>{lab}</div>
            </div>
          ))}
        </div>
        {estLeakage > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFE7E7', border: '1px solid #F5B5B5', borderRadius: 10, padding: '10px 12px', marginBottom: 12, marginTop: -6, fontSize: 12.5, color: colors.red }}>
            <span>🍽️</span><span><strong>{missingWare.map(w => `${w.missing}× ${w.key === 'glass' ? 'glass' : w.short + ' plate'}`).join(' · ')} unaccounted</strong> ≈ <strong>₹{estLeakage.toLocaleString('en-IN')}</strong> of possibly unpunched servings (each priced at this period's avg for that serving type).</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 16, marginTop: -6 }}>− = short / missing vs system · + = extra · ✓ = matched, across {periodCloses.length} day-close{periodCloses.length > 1 ? 's' : ''}.</div>
      </>)}

      {/* Day-close history */}
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>DAY-CLOSE HISTORY</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {historyDates.map(date => {
          const d = closeByDate[date];
          const sys = sysByDate[date] || { revenue: 0, orders: 0, pieces: 0 };
          if (!d) {
            // Day had sales but was never reconciled → system totals are final.
            return (
              <div key={date} style={{ padding: 14, borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700 }}>{istDateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontWeight: 800 }}>₹{sys.revenue.toLocaleString('en-IN')}</div>
                </div>
                <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>📦 {sys.orders} orders · 🥟 {sys.pieces} pcs · system</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FFF4E5', color: '#B5460B' }}>Not reconciled</span>
              </div>
            );
          }
          const sd = dayCloseStockDiff(d);
          const stockRows = dayCloseStockRows(d).filter(x => (x.diff || 0) !== 0);
          const collected = (d.physicalCash || 0) + (d.phonePeAmount || 0); // money actually counted
          const system = (d.systemCash || 0) + (d.systemUpi || 0);
          return (
            <div key={date} style={{ padding: 14, borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 700 }}>{istDateLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800 }}>₹{collected.toLocaleString('en-IN')}</div>
                  {system !== collected && <div style={{ fontSize: 10.5, color: colors.muted }}>system ₹{system.toLocaleString('en-IN')}</div>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>📦 {d.totalOrders} orders · 🥟 {d.piecesSold} pcs · counted money</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F5F4F0', color: diffColor(d.cashDiff || 0) }}>💵 {fmtDiff(d.cashDiff || 0)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F5F4F0', color: diffColor(d.upiDiff || 0) }}>📱 {fmtDiff(d.upiDiff || 0)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F5F4F0', color: diffColor(sd) }}>🥟 {sd === 0 ? '✓' : `${fmtDiff(sd)} pcs`}</span>
                {dayCloseWare(d).map(r => { const w = WARE_TYPES.find(t => `_ware:${t.key}` === r.key); if (!w) return null; return (
                  <span key={r.key} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F5F4F0', color: diffColor(r.diff || 0) }}>{w.key === 'glass' ? '🥤' : `🍽️${w.short}`} {(r.diff || 0) === 0 ? '✓' : fmtDiff(r.diff)}</span>
                ); })}
              </div>
              {stockRows.length > 0 && (
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 5 }}>{stockRows.map(x => `${x.label}: ${x.diff > 0 ? '+' : '−'}${Math.abs(x.diff)}`).join(' · ')}</div>
              )}
              {(() => { const dmg = dayCloseWare(d).filter(r => (r.damaged || 0) > 0); return dmg.length > 0 ? (
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 5 }}>Damaged: {dmg.map(r => { const w = WARE_TYPES.find(t => `_ware:${t.key}` === r.key); return `${w?.key === 'glass' ? '🥤' : `🍽️${w?.short}`} ×${r.damaged}`; }).join(' · ')}</div>
              ) : null; })()}
            </div>
          );
        })}
        {historyDates.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No sales history yet.</div>}
      </div>
      </>)}

      {view === 'expense' && (<>
        {/* Month picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>Month:</span>
          <input type="month" value={expMonth} max={TODAY.slice(0, 7)} onChange={e => setExpMonth(e.target.value || TODAY.slice(0, 7))}
            style={{ flex: 1, padding: '9px 12px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 14, fontWeight: 700, boxSizing: 'border-box' }} />
        </div>

        {/* Month total + add */}
        <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5 }}>{monthLabel.toUpperCase()} · TOTAL SPEND</div>
            <div style={{ fontSize: 34, fontWeight: 900 }}>₹{monthTotal.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{monthExpenses.length} entr{monthExpenses.length === 1 ? 'y' : 'ies'} · {expDates.length} day{expDates.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setShowExpense(true)} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}><Plus size={15}/> Add</button>
        </div>
        {showExpense && <ExpenseModal onSubmit={addExpense} onClose={() => setShowExpense(false)} />}

        {/* Funding-source split: cart earnings vs personal (Axis) credit */}
        {monthTotal > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: colors.muted, fontWeight: 700 }}>💳 Cart (Kotak/UPI)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: colors.green }}>₹{cartMonth.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: axisMonth > 0 ? '#FFF4E5' : '#fff', border: `1px solid ${axisMonth > 0 ? '#F0C27B' : colors.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: colors.muted, fontWeight: 700 }}>🏦 Axis credit (borrowed)</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: axisMonth > 0 ? '#B5460B' : colors.muted }}>₹{axisMonth.toLocaleString('en-IN')}</div>
              {axisAllTime > 0 && <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 2 }}>all-time: ₹{axisAllTime.toLocaleString('en-IN')}</div>}
            </div>
          </div>
        )}

        {/* Date-wise groups, newest first */}
        {expDates.map(date => {
          const dayItems = expByDate[date];
          const dayTotal = dayItems.reduce((s, e) => s + e.amount, 0);
          return (
            <div key={date} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: brand.navy }}>{istDateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: colors.red }}>₹{dayTotal.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                {dayItems.map(e => (
                  <div key={e.id} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>{e.category}{e.fund === 'personal' && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 6, background: '#FFF4E5', color: '#B5460B' }}>🏦 AXIS</span>}</div>
                      {e.note && <div style={{ fontSize: 12, color: colors.muted }}>{e.note}</div>}
                    </div>
                    <div style={{ fontWeight: 800 }}>₹{e.amount}</div>
                    <button onClick={() => setEditExpenseItem(e)} title="Edit" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Edit3 size={13} color={brand.navy}/></button>
                    <button onClick={() => setDelExpense(e)} title="Delete" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color={colors.red}/></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {monthExpenses.length === 0 && <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 32, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No expenses logged in {monthLabel}. Tap Add to record stock / raw-material spend.</div>}
      </>)}

      {editExpenseItem && <ExpenseModal initial={editExpenseItem} onSubmit={(c, a, n, d, f) => updateExpense(editExpenseItem.id, c, a, n, d, f)} onClose={() => setEditExpenseItem(null)} />}

      {delExpense && (
        <EditModalShell title="Delete expense?" onClose={() => setDelExpense(null)} onSave={() => removeExpense(delExpense.id)} saveLabel="Delete" closeLabel="Keep" danger>
          <div style={{ fontSize: 14, color: colors.ink }}>Remove <strong>{delExpense.category} · ₹{delExpense.amount}</strong>{delExpense.note ? ` (${delExpense.note})` : ''} from {delExpense.date}? This can't be undone.</div>
        </EditModalShell>
      )}
    </div>
  );
}


function ExpenseModal({ initial, onSubmit, onClose }) {
  const [category, setCategory] = useState(initial?.category || EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || TODAY);
  const [fund, setFund] = useState(initial?.fund || 'cart'); // 'cart' (Kotak/UPI) | 'personal' (Axis credit)
  const [error, setError] = useState('');
  const submit = () => { const a = parseInt(amount) || 0; if (a <= 0) { setError('Enter an amount.'); return; } onSubmit(category, a, note.trim(), date, fund); };
  return (
    <EditModalShell title={initial ? 'Edit expense' : 'Add expense'} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>PAID FROM</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['cart', '💳 Cart (Kotak/UPI)'], ['personal', '🏦 Personal (Axis credit)']].map(([k, lab]) => (
          <button key={k} onClick={() => setFund(k)} style={{ flex: 1, padding: '10px 6px', borderRadius: 10, border: `2px solid ${fund === k ? colors.ink : colors.border}`, background: fund === k ? colors.ink : '#fff', color: fund === k ? colors.primary : colors.ink, fontWeight: 700, fontSize: 12, cursor: 'pointer', lineHeight: 1.3 }}>{lab}</button>
        ))}
      </div>
      <div style={editLabel}>DATE</div>
      <input type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value || TODAY)} style={editInput} />
      <div style={editLabel}>CATEGORY</div>
      <select value={category} onChange={e => setCategory(e.target.value)} style={editInput}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
      <div style={editLabel}>AMOUNT ₹</div>
      <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 1200" style={editInput} />
      <div style={editLabel}>NOTE (optional)</div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 6 packets veg momo" style={editInput} />
    </EditModalShell>
  );
}

// ═══════════════════════════════════════════════
// STAFF APP — Order Entry
// ═══════════════════════════════════════════════

export { EXPENSE_CATEGORIES, periodStart, soldBreakdown, dayCloseStockRows, dayCloseStockDiff, fmtDiff, diffColor, Reports, ExpenseModal };
