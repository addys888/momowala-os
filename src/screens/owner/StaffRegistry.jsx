import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { PAY_BADGE, TODAY, brand, colors, isPaid } from '../../core';
import { MetricCard, OrderItemLines, SectionHeader } from '../../components/shared';
import { useStore } from '../../store';

function StaffRegistry({ state, updateState, cartId, cart }) {
  const { session } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [viewStaff, setViewStaff] = useState(null); // drill into one staff's day
  const staff = state.staff.filter(s => s.cartId === cartId);
  const needsSql = 'Apply the security update (run schema.sql in Supabase) to manage passwords.';

  // Today's per-staff activity (orders are linked to staff by name).
  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const statFor = (name) => {
    const os = todayOrders.filter(o => o.staff === name);
    const paid = os.filter(isPaid);
    return { paid: paid.length, revenue: paid.reduce((s, o) => s + o.total, 0), cancelled: os.filter(o => o.payment === 'cancelled').length };
  };
  const cartStats = {
    paid: todayOrders.filter(isPaid).length,
    pending: todayOrders.filter(o => o.payment === 'pending').length,
    cancelled: todayOrders.filter(o => o.payment === 'cancelled').length,
  };

  // Registration goes through an authorised RPC so the row + password hash land
  // together server-side; the browser never writes the hash column.
  const addStaff = async (name, mobile, password) => {
    const id = Date.now();
    const r = await authRegisterStaff(session?.token, id, name, mobile, password);
    if (r.status === 'ok') {
      updateState({ staff: [...state.staff, { id, cartId, name, mobile, active: true }] });
      setShowAdd(false); return;
    }
    alert(r.status === 'rpc_missing' ? needsSql : (r.message || 'Could not register staff.'));
  };

  const toggleActive = (id) => updateState({ staff: state.staff.map(s => s.id === id ? { ...s, active: !s.active } : s) });
  const removeStaff = (id) => { if (confirm('Remove this staff member? They will no longer be able to log in.')) updateState({ staff: state.staff.filter(s => s.id !== id) }); };
  const resetPassword = async (id) => {
    const np = prompt('Enter a new password for this staff member (min 4 characters):');
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const r = await authSetStaffPassword(session?.token, id, np);
    alert(r.status === 'ok' ? 'Password updated.' : (r.status === 'rpc_missing' ? needsSql : (r.message || 'Could not update password.')));
  };
  const changeOwnerPassword = async () => {
    const np = prompt('Enter a new owner password (min 4 characters):');
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const r = await authChangeOwnerPassword(session?.token, np);
    alert(r.status === 'ok' ? 'Owner password updated.' : (r.status === 'rpc_missing' ? needsSql : (r.message || 'Could not update password.')));
  };

  if (viewStaff) {
    const os = todayOrders.filter(o => o.staff === viewStaff.name).slice().reverse();
    const st = statFor(viewStaff.name);
    return (
      <div>
        <button onClick={() => setViewStaff(null)} style={{ background: 'transparent', border: 'none', color: brand.tealDark, fontSize: 14, cursor: 'pointer', marginBottom: 12, fontWeight: 600 }}>← Back to staff</button>
        <SectionHeader title={viewStaff.name} subtitle={`Today · ${st.paid} order${st.paid !== 1 ? 's' : ''} · ₹${st.revenue}${st.cancelled ? ` · ${st.cancelled} cancelled` : ''}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {os.map(o => {
            const cancelled = o.payment === 'cancelled';
            return (
              <div key={o.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 14, opacity: cancelled ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>#{o.token} <span style={{ fontWeight: 500, fontSize: 12, color: colors.muted }}>· {o.time}</span></div>
                  <div style={{ fontWeight: 800, fontSize: 16, textDecoration: cancelled ? 'line-through' : 'none', color: cancelled ? colors.muted : colors.ink }}>₹{o.total}</div>
                </div>
                <OrderItemLines items={o.items} muted={cancelled} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ fontSize: 10, padding: '3px 9px', background: PAY_BADGE[o.payment].bg, color: PAY_BADGE[o.payment].fg, borderRadius: 10, fontWeight: 700, letterSpacing: 0.5 }}>{cancelled ? 'CANCELLED' : o.payment.toUpperCase()}</span>
                  {cancelled && o.cancelReason && <span style={{ fontSize: 11, color: colors.red, fontWeight: 600 }}>{o.cancelReason}</span>}
                </div>
              </div>
            );
          })}
          {os.length === 0 && <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, textAlign: 'center', color: colors.muted }}>No orders by {viewStaff.name} today yet.</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Staff Registry" subtitle={`${cart?.name} · only registered staff can log in`} />

      {/* Today summary across the cart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <MetricCard label="Orders today" value={cartStats.paid} icon={<FileText size={16}/>} color={colors.green} />
        <MetricCard label="Pending" value={cartStats.pending} icon={<Clock size={16}/>} color={colors.accent} />
        <MetricCard label="Cancelled" value={cartStats.cancelled} icon={<X size={16}/>} color={colors.red} />
      </div>

      <button onClick={() => setShowAdd(true)}
        style={{ width: '100%', background: brand.navy, color: '#fff', padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Plus size={18}/> Register New Staff
      </button>

      {showAdd && <AddStaffModal existing={state.staff} ownerMobile={cart?.ownerMobile} onAdd={addStaff} onClose={() => setShowAdd(false)} />}

      {/* Owner card */}
      <div style={{ background: brand.navy, color: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, fontWeight: 700, color: brand.amber }}>CART OWNER</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{cart?.ownerMobile}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Tap to change your password</div>
        </div>
        <button onClick={changeOwnerPassword} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: `1px solid rgba(255,255,255,0.4)`, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Change Password</button>
      </div>

      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>STAFF MEMBERS ({staff.length})</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {staff.map(s => {
          const st = statFor(s.name);
          return (
          <div key={s.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: s.active ? 1 : 0.5 }}>
            <div onClick={() => setViewStaff(s)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} title="View today's orders">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name} {!s.active && <span style={{ fontSize: 11, color: colors.red }}>· disabled</span>} <ArrowRight size={13} style={{ verticalAlign: 'middle', opacity: 0.4 }} /></div>
              <div style={{ fontSize: 13, color: colors.muted }}>{s.mobile}</div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 3, fontWeight: 600 }}>Today: {st.paid} order{st.paid !== 1 ? 's' : ''} · ₹{st.revenue}{st.cancelled ? ` · ${st.cancelled} cancelled` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => resetPassword(s.id)} title="Reset password" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Lock size={14}/></button>
              <button onClick={() => toggleActive(s.id)} title={s.active ? 'Disable login' : 'Enable login'} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}>{s.active ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
              <button onClick={() => removeStaff(s.id)} title="Remove" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color={colors.red}/></button>
            </div>
          </div>
          );
        })}
        {staff.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: colors.muted, fontSize: 14 }}>No staff registered yet. Add your chef and helper above.</div>}
      </div>
    </div>
  );
}


function AddStaffModal({ existing, ownerMobile, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    setError('');
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (!/^\d{10}$/.test(mobile)) { setError('Enter a 10-digit mobile number.'); return; }
    if (mobile === ownerMobile || existing.some(s => s.mobile === mobile)) { setError('That number is already registered.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    onAdd(name.trim(), mobile, password);
  };

  const inputStyle = { width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Register New Staff</div>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>You set their password now. Share it with them — they log in with their mobile number and this password.</div>

        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>NAME</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ramesh" style={inputStyle} />

        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>MOBILE NUMBER</div>
        <input type="tel" inputMode="numeric" value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" style={{ ...inputStyle, fontWeight: 700, letterSpacing: 1 }} />

        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>SET PASSWORD</div>
        <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="min 4 characters" style={inputStyle} />

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: 14, background: colors.ink, color: colors.primary, border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Register Staff</button>
        </div>
      </div>
    </div>
  );
}

// ─── OWNER: REPORTS ───

export { StaffRegistry, AddStaffModal };
