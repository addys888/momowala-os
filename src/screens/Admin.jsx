import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../lib/store';
import { TODAY, adminBtn, brand, colors, editInput, editLabel, fileToBase64, freshInventory, isPaid, persistConsumables, persistInv, slugify } from '../core';
import { MenuEditor } from './MenuEditor';
import { Reports } from './owner/Reports';
import { BottomNav, CartIcon, EditModalShell, SectionHeader, TopBar } from '../components/shared';
import { useStore } from '../store';

function AdminApp({ state, updateState, onExit }) {
  const [tab, setTab] = useState('carts');
  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title="Platform Admin" onExit={onExit} />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'carts' && <AdminCarts state={state} updateState={updateState} />}
        {tab === 'reports' && <AdminReports state={state} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'carts', icon: <Boxes size={20}/>, label: 'Carts' },
        { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Reports' },
      ]} />
    </div>
  );
}


function AdminCarts({ state, updateState }) {
  const { session } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [menuCartId, setMenuCartId] = useState(null);
  const [editOwnerCart, setEditOwnerCart] = useState(null);

  const saveOwner = (cartId, fields) => {
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, ...fields } : c) });
    setEditOwnerCart(null);
  };

  if (menuCartId) {
    const c = state.carts.find(x => x.id === menuCartId);
    return (
      <div>
        <button onClick={() => setMenuCartId(null)} style={{ background: 'transparent', border: 'none', color: brand.tealDark, fontSize: 14, cursor: 'pointer', marginBottom: 12, fontWeight: 600 }}>← Back to carts</button>
        <MenuEditor state={state} updateState={updateState} cartId={menuCartId} cart={c} />
      </div>
    );
  }

  const addCart = async (form) => {
    let id = slugify(form.name) || `cart-${Date.now()}`;
    if (state.carts.some(c => c.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`;
    // The owner sets their own password on first login (needs_setup flow) — the
    // admin never sets or sees it, and no hash is written from the browser.
    const cart = {
      id, name: form.name.trim(), tagline: form.tagline.trim(), cuisine: form.cuisine.trim(),
      location: form.location.trim(), timing: form.timing.trim(), emoji: form.emoji || '🛒',
      logo: form.logo || null,
      accent: form.accent || brand.teal, ownerName: form.ownerName.trim(), ownerMobile: form.ownerMobile,
      ownerPasswordHash: null, active: true, createdAt: TODAY,
    };
    const freshInv = freshInventory();
    updateState({ carts: [...state.carts, cart], inventory: { ...state.inventory, [id]: freshInv }, menus: { ...state.menus, [id]: { items: [], lassi: [], addons: [] } } });
    // New carts can't be created via the recurring PATCH sync — insert explicitly.
    const r = await insertCart(cart);
    if (r.error) alert('Cart saved locally, but cloud insert failed: ' + r.error.message);
    // Seed the new cart's inventory in the cloud (scoped to this cart_id only).
    const seedOps = {};
    Object.entries(freshInv).forEach(([k, v]) => { if (v && (v.freezer != null || v.cart != null)) seedOps[k] = { fset: v.freezer || 0, cset: v.cart || 0 }; });
    if (Object.keys(seedOps).length) await persistInv(id, seedOps, { ...state.inventory, [id]: freshInv });
    if (freshInv.consumables) await persistConsumables(id, freshInv.consumables, { ...state.inventory, [id]: freshInv });
    setShowAdd(false);
  };

  const toggleActive = (id) => updateState({ carts: state.carts.map(c => c.id === id ? { ...c, active: !c.active } : c) });
  const resetOwnerPw = async (cart) => {
    const np = prompt(`New owner password for ${cart.name} (min 4 chars):`);
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const r = await authAdminResetOwner(session?.token, cart.id, np);
    if (r.status === 'ok') { alert(`Owner password updated for ${cart.name}.`); return; }
    alert(r.message || 'Could not update the password — log in again and retry.');
  };
  const removeCart = (cart) => {
    const orders = state.orders.filter(o => o.cartId === cart.id).length;
    if (!confirm(`Remove ${cart.name}? This hides the cart and removes its staff. ${orders} order(s) stay in records.`)) return;
    updateState({
      carts: state.carts.filter(c => c.id !== cart.id),
      staff: state.staff.filter(s => s.cartId !== cart.id),
    });
  };

  return (
    <div>
      <SectionHeader title="QSR Carts" subtitle={`${state.carts.length} on the platform`} />
      <button onClick={() => setShowAdd(true)}
        style={{ width: '100%', background: brand.navy, color: '#fff', padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Plus size={18}/> Onboard New Cart
      </button>

      {showAdd && <AddCartModal onAdd={addCart} onClose={() => setShowAdd(false)} />}
      {editOwnerCart && <EditOwnerModal cart={editOwnerCart} onSave={(fields) => saveOwner(editOwnerCart.id, fields)} onClose={() => setEditOwnerCart(null)} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.carts.map(c => (
          <div key={c.id} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 16, opacity: c.active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <CartIcon cart={c} size={46} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name} {!c.active && <span style={{ fontSize: 11, color: colors.red, fontWeight: 600 }}>· disabled</span>}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>{c.location}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>Owner: {c.ownerName ? `${c.ownerName} · ` : ''}{c.ownerMobile}</div>
                <div style={{ fontSize: 11, color: colors.muted, fontWeight: 600, marginTop: 2 }}>Owner sets/changes password at login</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setMenuCartId(c.id)} style={{ ...adminBtn, color: brand.tealDark, borderColor: brand.teal }}>📋 Set up menu</button>
              <button onClick={() => setEditOwnerCart(c)} style={adminBtn}>Edit owner</button>
              <button onClick={() => resetOwnerPw(c)} style={adminBtn}>Reset owner password</button>
              <button onClick={() => toggleActive(c.id)} style={adminBtn}>{c.active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => removeCart(c)} style={{ ...adminBtn, color: colors.red }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AddCartModal({ onAdd, onClose }) {
  const [f, setF] = useState({ name: '', tagline: '', cuisine: '', location: '', timing: 'Daily 4 PM – 11 PM', emoji: '🛒', logo: '', accent: brand.teal, ownerName: '', ownerMobile: '', ownerPassword: '' });
  const [error, setError] = useState('');
  const logoRef = React.useRef();
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const setFile = (k, max) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { const b64 = await fileToBase64(file, max, 0.8); setF(p => ({ ...p, [k]: `data:image/jpeg;base64,${b64}` })); }
    catch { setError('Could not read that image.'); }
  };

  const submit = () => {
    setError('');
    if (!f.name.trim()) { setError('Enter a cart name.'); return; }
    if (!f.cuisine.trim()) { setError('Describe the food served.'); return; }
    if (!f.ownerName.trim()) { setError('Enter the owner\'s name.'); return; }
    if (!/^\d{10}$/.test(f.ownerMobile)) { setError('Enter the owner\'s 10-digit mobile number.'); return; }
    if (f.ownerPassword && f.ownerPassword.length < 4) { setError('Owner password must be at least 4 characters (or leave blank for owner to set).'); return; }
    onAdd(f);
  };

  const label = { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 };
  const inputStyle = { width: '100%', padding: '11px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: brand.navy }}>Onboard New Cart</div>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>Create a QSR cart and assign its owner. The owner logs in with their mobile + this password.</div>

        <div style={label}>CART LOGO</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `2px solid ${f.accent}`, overflow: 'hidden', flexShrink: 0 }}>
            {f.logo ? <img src={f.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.emoji}
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={setFile('logo', 400)} />
          <button onClick={() => logoRef.current?.click()} style={{ ...adminBtn, color: brand.navy }}>{f.logo ? 'Change' : 'Upload'} image</button>
          {f.logo && <button onClick={() => setF(p => ({ ...p, logo: '' }))} style={{ ...adminBtn, color: colors.red }}>Remove</button>}
        </div>

        <div style={label}>CART NAME</div>
        <input value={f.name} onChange={set('name')} placeholder="e.g. Chaat Junction" style={inputStyle} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 86 }}>
            <div style={label}>EMOJI</div>
            <input value={f.emoji} onChange={set('emoji')} placeholder="🛒" style={{ ...inputStyle, textAlign: 'center', fontSize: 22 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>TAGLINE (optional)</div>
            <input value={f.tagline} onChange={set('tagline')} placeholder="चाट जंक्शन" style={inputStyle} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Uploaded logo is shown when present; otherwise the emoji is used.</div>
        <div style={label}>FOOD DESCRIPTION</div>
        <input value={f.cuisine} onChange={set('cuisine')} placeholder="Pani puri, tikki, dahi chaat…" style={inputStyle} />
        <div style={label}>LOCATION</div>
        <input value={f.location} onChange={set('location')} placeholder="Area, city" style={inputStyle} />
        <div style={label}>TIMING</div>
        <input value={f.timing} onChange={set('timing')} style={inputStyle} />

        <div style={{ borderTop: `1px solid ${brand.border}`, margin: '4px 0 14px', paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: brand.navy, marginBottom: 2 }}>Cart owner</div>
          <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 12 }}>This person logs in at the cart team page and runs the cart.</div>
          <div style={label}>OWNER NAME</div>
          <input value={f.ownerName} onChange={set('ownerName')} placeholder="e.g. Ramesh Kumar" style={inputStyle} />
          <div style={label}>OWNER MOBILE</div>
          <input type="tel" inputMode="numeric" value={f.ownerMobile} onChange={e => setF(p => ({ ...p, ownerMobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit number" style={{ ...inputStyle, fontWeight: 700, letterSpacing: 1 }} />
          <div style={label}>OWNER PASSWORD (optional — owner can set on first login)</div>
          <input type="text" value={f.ownerPassword} onChange={set('ownerPassword')} placeholder="min 4 characters, or leave blank" style={inputStyle} />
        </div>

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: 14, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Create Cart</button>
        </div>
      </div>
    </div>
  );
}

// Platform admin edits a cart owner's name + contact number.

function EditOwnerModal({ cart, onSave, onClose }) {
  const [ownerName, setOwnerName] = useState(cart.ownerName || '');
  const [ownerMobile, setOwnerMobile] = useState(cart.ownerMobile || '');
  const [error, setError] = useState('');
  const submit = () => {
    if (!ownerName.trim()) { setError("Enter the owner's name."); return; }
    if (!/^\d{10}$/.test(ownerMobile)) { setError('Enter a 10-digit mobile number.'); return; }
    onSave({ ownerName: ownerName.trim(), ownerMobile });
  };
  return (
    <EditModalShell title={`Edit owner · ${cart.name}`} onClose={onClose} onSave={submit} error={error}>
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>The owner logs in with this mobile number. Changing it changes their login.</div>
      <div style={editLabel}>OWNER NAME</div>
      <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="e.g. Ramesh Kumar" style={editInput} />
      <div style={editLabel}>OWNER MOBILE</div>
      <input value={ownerMobile} onChange={e => setOwnerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="10-digit number" style={editInput} />
    </EditModalShell>
  );
}


function AdminReports({ state }) {
  const rows = state.carts.map(c => {
    const orders = state.orders.filter(o => o.cartId === c.id);
    const today = orders.filter(o => o.date === TODAY && isPaid(o));
    const allTime = orders.filter(o => isPaid(o));
    return {
      cart: c,
      todayRevenue: today.reduce((s, o) => s + o.total, 0),
      todayOrders: today.length,
      pending: orders.filter(o => o.date === TODAY && o.payment === 'pending').length,
      allRevenue: allTime.reduce((s, o) => s + o.total, 0),
      allOrders: allTime.length,
    };
  });
  const platformToday = rows.reduce((s, r) => s + r.todayRevenue, 0);
  const cartName = (id) => state.carts.find(c => c.id === id)?.name || id;
  // Recent cancellations across all carts — the admin activity feed.
  const cancellations = state.orders
    .filter(o => o.payment === 'cancelled')
    .sort((a, b) => b.id - a.id)
    .slice(0, 25);

  return (
    <div>
      <SectionHeader title="Platform Reports" subtitle="Per-cart performance" />
      <div style={{ background: brand.navy, color: '#fff', padding: 20, borderRadius: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: brand.amber, fontWeight: 700 }}>ALL CARTS · TODAY</div>
        <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4 }}>₹{platformToday.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{rows.reduce((s, r) => s + r.todayOrders, 0)} orders across {rows.length} cart{rows.length !== 1 ? 's' : ''}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(r => (
          <div key={r.cart.id} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CartIcon cart={r.cart} size={36} radius={10} />
              <div style={{ fontWeight: 800, fontSize: 16 }}>{r.cart.name}</div>
              {r.pending > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: colors.accent }}>{r.pending} pending</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: colors.muted }}>Today</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>₹{r.todayRevenue.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{r.todayOrders} orders</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.muted }}>All-time</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>₹{r.allRevenue.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{r.allOrders} orders</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity feed — cancelled orders across all carts */}
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, margin: '24px 0 8px' }}>RECENT CANCELLATIONS</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {cancellations.map(o => (
          <div key={o.id} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>#{o.token} · {cartName(o.cartId)} <span style={{ color: colors.muted, fontWeight: 500 }}>· ₹{o.total}</span></div>
              <div style={{ fontSize: 12, color: colors.red, fontWeight: 600 }}>{o.cancelReason || 'No reason given'}</div>
              <div style={{ fontSize: 11, color: colors.muted }}>{o.date} {o.time}{o.staff ? ` · by ${o.staff}` : ''}</div>
            </div>
            <X size={16} color={colors.red} />
          </div>
        ))}
        {cancellations.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No cancellations. 🎉</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MENU EDITOR (admin per-cart + owner) — manual + AI photo extract
// ═══════════════════════════════════════════════

export { AdminApp, AdminCarts, AddCartModal, EditOwnerModal, AdminReports };
