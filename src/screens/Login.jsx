import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../lib/store';
import { brand } from '../core';
import { LoginFields, LoginShell } from '../components/shared';
import { useStore } from '../store';

function TeamLogin() {
  const { state, updateState, login } = useStore();
  const nav = useNavigate();
  const [mobile, setMobile] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null); // { role, cartId } once a first-time set is needed

  const m = mobile.trim();

  // Legacy client-side verification — used ONLY if the auth RPC isn't deployed
  // yet (the brief window before the lockdown SQL is applied).
  const legacyLogin = async () => {
    const ownerCart = state.carts.find(c => c.ownerMobile === m && c.active);
    if (ownerCart) {
      if (!ownerCart.ownerPasswordHash) {
        if (pw !== pw2) { setError('The two passwords do not match.'); return; }
        const hash = await hashPassword(pw);
        updateState({ carts: state.carts.map(c => c.id === ownerCart.id ? { ...c, ownerPasswordHash: hash } : c) });
        login({ role: 'owner', cartId: ownerCart.id }); nav('/manage'); return;
      }
      if ((await hashPassword(pw)) !== ownerCart.ownerPasswordHash) { setError('Wrong password.'); return; }
      login({ role: 'owner', cartId: ownerCart.id }); nav('/manage'); return;
    }
    const rec = state.staff.find(s => s.mobile === m && s.active);
    if (!rec) { setError('This number is not registered. Ask your cart owner or the admin.'); return; }
    if (!rec.passwordHash) { setError('Your password has not been set yet. Ask your owner.'); return; }
    if ((await hashPassword(pw)) !== rec.passwordHash) { setError('Wrong password.'); return; }
    login({ role: 'staff', cartId: rec.cartId, name: rec.name }); nav('/work');
  };

  const submit = async () => {
    setError('');
    if (!/^\d{10}$/.test(m)) { setError('Enter a 10-digit mobile number.'); return; }
    if (pw.length < 4) { setError('Enter a password of at least 4 characters.'); return; }
    setBusy(true);
    try {
      if (setup) { // second step: confirm + set the first password
        if (pw !== pw2) { setError('The two passwords do not match.'); return; }
        const r = await authSetPassword(setup.role, m, setup.cartId, pw);
        if (r.status === 'ok') { login({ role: r.role, cartId: r.cart_id, token: r.token, expiresAt: r.expiresAt }); nav('/manage'); return; }
        setError(r.message || 'Could not set the password.'); return;
      }
      const r = await authLogin(m, pw);
      if (r.status === 'rpc_missing') { await legacyLogin(); return; }
      if (r.status === 'ok') { login({ role: r.role, cartId: r.cart_id, name: r.name, token: r.token, expiresAt: r.expiresAt }); nav(r.role === 'owner' ? '/manage' : '/work'); return; }
      if (r.status === 'needs_setup') { setSetup({ role: r.role, cartId: r.cart_id }); return; }
      if (r.status === 'no_password') { setError('Your password has not been set yet. Ask your owner.'); return; }
      if (r.status === 'wrong_password') { setError('Wrong password.'); return; }
      setError('This number is not registered. Ask your cart owner or the admin.');
    } finally { setBusy(false); }
  };

  return (
    <LoginShell
      title={setup ? 'Set your owner password' : 'Cart team login'}
      subtitle={setup ? `First time — set a password for ${m}` : 'Owners and staff sign in here'}
      footer={
        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <Link to="/" style={{ color: brand.tealDark, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Browse carts as a customer</Link>
          <div style={{ marginTop: 12 }}><Link to="/admin/login" style={{ color: brand.muted, fontSize: 12, textDecoration: 'none' }}>Cartlyft platform admin →</Link></div>
        </div>
      }>
      <LoginFields mobile={mobile} setMobile={setMobile} mobileLocked={!!setup} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2}
        showConfirm={!!setup} error={error} busy={busy} onSubmit={submit}
        cta={setup ? 'Set Password & Enter' : 'Login'} />
    </LoginShell>
  );
}


function AdminLogin() {
  const { state, updateState, login } = useStore();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false); // first-time admin password set

  const adminMobile = state.platform.adminMobile;

  // Legacy client-side path — only if the auth RPC isn't deployed yet.
  const legacyLogin = async () => {
    if (!state.platform.adminPasswordHash) {
      if (pw !== pw2) { setError('The two passwords do not match.'); return; }
      updateState({ platform: { ...state.platform, adminPasswordHash: await hashPassword(pw) } });
      login({ role: 'admin' }); nav('/admin'); return;
    }
    if ((await hashPassword(pw)) !== state.platform.adminPasswordHash) { setError('Wrong password.'); return; }
    login({ role: 'admin' }); nav('/admin');
  };

  const submit = async () => {
    setError('');
    if (pw.length < 4) { setError('Enter a password of at least 4 characters.'); return; }
    setBusy(true);
    try {
      if (setup) {
        if (pw !== pw2) { setError('The two passwords do not match.'); return; }
        const r = await authSetPassword('admin', adminMobile, null, pw);
        if (r.status === 'ok') { login({ role: 'admin', token: r.token, expiresAt: r.expiresAt }); nav('/admin'); return; }
        setError(r.message || 'Could not set the password.'); return;
      }
      const r = await authLogin(adminMobile, pw, 'admin');
      if (r.status === 'rpc_missing') { await legacyLogin(); return; }
      if (r.status === 'ok') { login({ role: 'admin', token: r.token, expiresAt: r.expiresAt }); nav('/admin'); return; }
      if (r.status === 'needs_setup') { setSetup(true); return; }
      setError('Wrong password.');
    } finally { setBusy(false); }
  };

  return (
    <LoginShell
      title={setup ? 'Set admin password' : 'Cartlyft admin'}
      subtitle={`Platform super-admin · ${adminMobile}`}
      footer={<div style={{ marginTop: 22, textAlign: 'center' }}><Link to="/login" style={{ color: brand.muted, fontSize: 13, textDecoration: 'none' }}>← Cart team login</Link></div>}>
      <LoginFields mobile={adminMobile} mobileLocked pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2}
        showConfirm={setup} error={error} busy={busy} onSubmit={submit}
        cta={setup ? 'Set Password & Enter' : 'Login'} />
    </LoginShell>
  );
}

// ═══════════════════════════════════════════════
// CARTLYFT ADMIN APP — platform / multi-tenant control
// ═══════════════════════════════════════════════

export { TeamLogin, AdminLogin };
