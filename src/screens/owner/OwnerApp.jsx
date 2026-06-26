import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, adminBtn, brand, cartOpenState, colors, isPaid, istDateLabel, istNowMinutes, menuFor, orderStockDeltas } from '../../core';
import { CartProfileModal, MenuEditor } from '../MenuEditor';
import { InventoryView } from './Inventory';
import { Reconciliation } from './Reconciliation';
import { Reports } from './Reports';
import { StaffRegistry } from './StaffRegistry';
import { Alert, BottomNav, CartIcon, MetricCard, OrderRow, SectionHeader, TopBar } from '../../components/shared';

function OwnerApp({ state, updateState, onExit, cartId }) {
  const [tab, setTab] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const cart = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);
  const saveProfile = (fields) => {
    const updated = { ...cart, ...fields };
    updateState({ carts: state.carts.map(c => c.id === cartId ? updated : c) });
    saveCartProfile(updated); // persist immediately so it survives a refresh
    setShowProfile(false);
  };
  const toggleOpen = () => {
    const next = !cart?.closedManually;
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, closedManually: next } : c) });
    // Persist immediately (not via the debounced batch) so it survives a refresh.
    setCartClosed(cartId, next);
  };

  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (isPaid(o) ? o.total : 0), 0);
  const cashRevenue = todayOrders.filter(o => o.payment === 'cash').reduce((sum, o) => sum + o.total, 0);
  const upiRevenue = todayOrders.filter(o => o.payment === 'upi').reduce((sum, o) => sum + o.total, 0);
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

      {showProfile && <CartProfileModal cart={cart} onSave={saveProfile} onClose={() => setShowProfile(false)} />}

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'dashboard' && <Dashboard state={state} cartId={cartId} inv={inv} cart={cart} onEditProfile={() => setShowProfile(true)} onToggleOpen={toggleOpen} stockTypes={menu.stockTypes || []} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} todayOrders={todayOrders} />}
        {tab === 'inventory' && <InventoryView state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} />}
        {tab === 'reconcile' && <Reconciliation state={state} updateState={updateState} cartId={cartId} inv={inv} stockTypes={menu.stockTypes || []} todayOrders={todayOrders} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} />}
        {tab === 'menu' && <MenuEditor state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'staff' && <StaffRegistry state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'reports' && <Reports state={state} updateState={updateState} cartId={cartId} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'dashboard', icon: <Home size={20}/>, label: 'Home' },
        { id: 'inventory', icon: <Boxes size={20}/>, label: 'Stock' },
        { id: 'menu', icon: <Edit3 size={20}/>, label: 'Menu' },
        { id: 'reconcile', icon: <CheckCircle2 size={20}/>, label: 'Reconcile' },
        { id: 'staff', icon: <Users size={20}/>, label: 'Staff' },
        { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Reports' },
      ]} />
    </div>
  );
}


function Dashboard({ state, cartId, inv, cart, onEditProfile, onToggleOpen, stockTypes = [], todayRevenue, cashRevenue, upiRevenue, piecesSold, todayOrders }) {
  const pendingCount = todayOrders.filter(o => o.payment === 'pending').length;
  const lowTypes = stockTypes.filter(st => (inv[st.key]?.freezer ?? 0) < 100);
  const openState = cartOpenState(cart);

  // Per-day revenue (reconciled if the day was closed, else system) for trends.
  const closeByDate = Object.fromEntries((state?.dayCloseLogs || []).filter(d => d.cartId === cartId).map(d => [d.date, d]));
  const paidByDate = {};
  (state?.orders || []).filter(o => o.cartId === cartId && isPaid(o)).forEach(o => { paidByDate[o.date] = (paidByDate[o.date] || 0) + o.total; });
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
      `🥟 ${cart?.name || 'Cart'} — ${istDateLabel(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}\n` +
      `Revenue: ₹${todayRevenue.toLocaleString('en-IN')}  (💵 ₹${cashRevenue} · 📱 ₹${upiRevenue})\n` +
      `Orders: ${todayOrders.length} · Pieces sold: ${piecesSold}\n` +
      `Expenses: ₹${todayExpenses.toLocaleString('en-IN')} · Net: ₹${todayNet.toLocaleString('en-IN')}`;
    try { if (navigator.share) { await navigator.share({ title: `${cart?.name} — today`, text }); return; } } catch { /* cancelled */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div>
      {/* Profile (≈3/4) + open-close (≈1/4) in one responsive row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Cart profile */}
        <div style={{ flex: '3 1 300px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12 }}>
          <CartIcon cart={cart} size={44} radius={11} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{cart?.name}</div>
            <div style={{ fontSize: 11.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {cart?.location || '—'} · 🕒 {cart?.timing || '—'}</div>
          </div>
          <button onClick={onEditProfile} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Edit3 size={13}/> Edit</button>
        </div>

        {/* Open / closed control */}
        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, background: '#fff', border: `1px solid ${openState.open ? '#BFE3BF' : '#F3C2C2'}`, borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: openState.open ? colors.green : colors.red, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: openState.open ? '#0F7B0F' : colors.red, lineHeight: 1.1 }}>{openState.open ? 'Open' : 'Closed'}</div>
              <div style={{ fontSize: 10.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cart?.closedManually ? 'You closed it' : openState.open ? 'Taking orders' : openState.reason}</div>
            </div>
          </div>
          <button onClick={onToggleOpen} style={{ width: '100%', background: cart?.closedManually ? colors.green : colors.red, color: '#fff', border: 'none', padding: '9px 12px', borderRadius: 10, fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
            {cart?.closedManually ? '🟢 Open cart' : '🔴 Close cart'}
          </button>
        </div>
      </div>

      <SectionHeader title="Today's Snapshot" subtitle={istDateLabel(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} />

      {/* Hero metric */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 24, borderRadius: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1, marginBottom: 4 }}>TOTAL REVENUE TODAY</div>
          {deltaPct !== null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: deltaPct >= 0 ? '#7CE38B' : '#FF8A8A', background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '3px 10px' }}>
              {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}% vs yest
            </span>
          )}
        </div>
        <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>₹{todayRevenue.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>{todayOrders.length} orders · {piecesSold} pieces sold</div>
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

      {/* Split metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <MetricCard label="Cash" value={`₹${cashRevenue}`} icon={<IndianRupee size={16}/>} color={colors.green} />
        <MetricCard label="UPI / Online" value={`₹${upiRevenue}`} icon={<Smartphone size={16}/>} color={colors.ink} />
      </div>

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

      {/* Pending QR orders awaiting payment */}
      {pendingCount > 0 && (
        <Alert type="warn" title={`${pendingCount} order${pendingCount > 1 ? 's' : ''} awaiting payment`} message="Customer QR orders not yet collected. Staff settles these in the Pending tab — stock and revenue update only after payment." />
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
