import React, { useState, useEffect } from 'react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword } from './lib/store';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock } from 'lucide-react';

// ============================================
// MOMO WALA OS — Complete Cart Management App
// Designed for: Saketpuri Yojna, Ayodhya
// Roles: Owner | Staff | Customer
// Works: Offline-first (localStorage based)
// ============================================

// ─── DESIGN TOKENS ───
const colors = {
  primary: '#FFD60A',      // Momo Wala signature yellow
  ink: '#0A0A0A',          // Deep black
  paper: '#FFFCF5',        // Warm off-white
  muted: '#6B6B6B',
  border: '#E8E5DE',
  accent: '#FF4D00',       // Action orange
  green: '#0F7B0F',
  red: '#C8102E',
  pilgrim: '#FF9933',      // Saffron
};

// ─── CARTLYFT BRAND (the QSR OS — used on admin chrome) ───
const brand = {
  navy: '#0A2F5C',
  navyDark: '#082446',
  teal: '#00A99B',
  tealDark: '#0E8C82',
  amber: '#FFC107',
  bg: '#EEF2F7',         // professional light surface for the launcher
  surface: '#FFFFFF',
  text: '#0A2F5C',
  muted: '#6B7A90',
  border: '#DCE3EC',
};

// ─── CARTLYFT LOGO (inline SVG: cart + cloche + flame + gear) ───
function CartlyftMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* speed lines */}
      <rect x="2" y="22" width="9" height="3" rx="1.5" fill={brand.teal} />
      <rect x="0" y="30" width="7" height="3" rx="1.5" fill={brand.teal} opacity="0.7" />
      <rect x="3" y="38" width="9" height="3" rx="1.5" fill={brand.teal} opacity="0.5" />
      {/* gear behind */}
      <circle cx="48" cy="34" r="11" fill={brand.navy} />
      <circle cx="48" cy="34" r="5" fill={brand.bg} />
      {[0,45,90,135,180,225,270,315].map(a => (
        <rect key={a} x="46.5" y="20" width="3" height="5" rx="1" fill={brand.navy} transform={`rotate(${a} 48 34)`} />
      ))}
      {/* cart body */}
      <path d="M14 40 L14 24 Q14 21 17 21 L40 21 Q43 21 43 24 L43 40 Z" fill={brand.teal} />
      <path d="M30 21 L43 21 L43 40 L30 40 Z" fill={brand.navy} opacity="0.85" />
      {/* cloche (food dome) */}
      <path d="M21 21 Q21 13 28.5 13 Q36 13 36 21 Z" fill={brand.surface} />
      <circle cx="28.5" cy="11.5" r="1.8" fill={brand.surface} />
      {/* flame */}
      <path d="M45 16 Q49 11 47 6 Q52 9 51 16 Q50 20 47 20 Q44 19 45 16 Z" fill={brand.amber} />
      {/* wheels */}
      <circle cx="22" cy="44" r="4.5" fill={brand.navy} />
      <circle cx="38" cy="44" r="4.5" fill={brand.navy} />
    </svg>
  );
}

// Full lockup: mark + "Cartlyft" wordmark + tagline. variant: 'light' | 'dark'
function CartlyftLogo({ size = 40, variant = 'dark', tagline = true }) {
  const wordColor = variant === 'light' ? '#FFFFFF' : brand.navy;
  const tagColor = variant === 'light' ? brand.amber : brand.teal;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <CartlyftMark size={size} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 800, fontSize: size * 0.62, color: wordColor, fontStyle: 'italic', letterSpacing: -0.5 }}>Cartlyft</div>
        {tagline && <div style={{ fontSize: size * 0.26, color: tagColor, letterSpacing: 1.5, fontWeight: 700, marginTop: 3 }}>QSR OPERATING SYSTEM</div>}
      </div>
    </div>
  );
}

// ─── MENU DATA (matches the printed cart menu) ───
const MENU_ITEMS = [
  // Steamed · 5/10 pcs
  { id: 'vs', name: 'Veg Steam', cat: 'Steamed', half: 35, full: 70, pcsHalf: 5, pcsFull: 10, type: 'veg', stockKey: 'veg' },
  { id: 'ps', name: 'Paneer Steam', cat: 'Steamed', half: 45, full: 90, pcsHalf: 5, pcsFull: 10, type: 'paneer', stockKey: 'paneer' },
  { id: 'cs', name: 'Corn Cheese Steam', cat: 'Steamed', half: 50, full: 90, pcsHalf: 5, pcsFull: 10, type: 'corn', stockKey: 'corn' },
  // Kurkure · 4/8 pcs · house bestseller
  { id: 'vk', name: 'Veg Kurkure', cat: 'Kurkure', half: 50, full: 90, pcsHalf: 4, pcsFull: 8, type: 'veg', stockKey: 'veg', star: true },
  { id: 'pk', name: 'Paneer Kurkure', cat: 'Kurkure', half: 65, full: 110, pcsHalf: 4, pcsFull: 8, type: 'paneer', stockKey: 'paneer', star: true },
  { id: 'ck', name: 'Corn Cheese Kurkure', cat: 'Kurkure', half: 70, full: 130, pcsHalf: 4, pcsFull: 8, type: 'corn', stockKey: 'corn' },
  // Afghani · 4/8 pcs
  { id: 'va', name: 'Veg Afghani', cat: 'Afghani', half: 60, full: 110, pcsHalf: 4, pcsFull: 8, type: 'veg', stockKey: 'veg' },
  { id: 'pa', name: 'Paneer Afghani', cat: 'Afghani', half: 70, full: 120, pcsHalf: 4, pcsFull: 8, type: 'paneer', stockKey: 'paneer', star: true },
  { id: 'ca', name: 'Corn Cheese Afghani', cat: 'Afghani', half: 80, full: 130, pcsHalf: 4, pcsFull: 8, type: 'corn', stockKey: 'corn' },
  // Fried · 5/10 pcs
  { id: 'vf', name: 'Veg Fried', cat: 'Fried', half: 45, full: 80, pcsHalf: 5, pcsFull: 10, type: 'veg', stockKey: 'veg' },
  { id: 'pf', name: 'Paneer Fried', cat: 'Fried', half: 55, full: 100, pcsHalf: 5, pcsFull: 10, type: 'paneer', stockKey: 'paneer' },
  { id: 'cf', name: 'Corn Cheese Fried', cat: 'Fried', half: 65, full: 110, pcsHalf: 5, pcsFull: 10, type: 'corn', stockKey: 'corn' },
  // Cocktail · 4/8 pcs
  { id: 'vc', name: 'Veg Cocktail', cat: 'Cocktail', half: 55, full: 100, pcsHalf: 4, pcsFull: 8, type: 'veg', stockKey: 'veg' },
  { id: 'pc', name: 'Paneer Cocktail', cat: 'Cocktail', half: 60, full: 110, pcsHalf: 4, pcsFull: 8, type: 'paneer', stockKey: 'paneer' },
  { id: 'cc', name: 'Corn Cheese Cocktail', cat: 'Cocktail', half: 75, full: 120, pcsHalf: 4, pcsFull: 8, type: 'corn', stockKey: 'corn' },
  // Tandoori · 4/8 pcs
  { id: 'vt', name: 'Veg Tandoori', cat: 'Tandoori', half: 65, full: 120, pcsHalf: 4, pcsFull: 8, type: 'veg', stockKey: 'veg' },
  { id: 'pt', name: 'Paneer Tandoori', cat: 'Tandoori', half: 75, full: 140, pcsHalf: 4, pcsFull: 8, type: 'paneer', stockKey: 'paneer', star: true },
  { id: 'ct', name: 'Corn Cheese Tandoori', cat: 'Tandoori', half: 85, full: 150, pcsHalf: 4, pcsFull: 8, type: 'corn', stockKey: 'corn' },
];

const LASSI = [
  { id: 'l1', name: 'Sweet Lassi', price: 40 },
  { id: 'l2', name: 'Mango Lassi', price: 40 },
  { id: 'l3', name: 'Rose Rabdi Lassi', price: 50 },
  { id: 'l4', name: 'Dry Fruit Blast Lassi', price: 60 },
];

// All add-ons free during the promotion period
const ADDONS = [
  { id: 'a1', name: 'Schezwan', price: 0 },
  { id: 'a2', name: 'Extra Mayo', price: 0 },
  { id: 'a3', name: 'Extra Chutney', price: 0 },
  { id: 'a4', name: 'Extra Ketchup', price: 0 },
];

// ─── ACCOUNTS & TENANCY ───
// Three tiers: Cartlyft platform admin → cart owner (one per cart) → staff
// (belong to one cart). Passwords are stored as SHA-256 hashes, never plain.
// The platform admin number is the single configurable super-account.
const PLATFORM_ADMIN_MOBILE = '9452661608';

// Seed cart so the existing Momo Wala data has a home. New carts are
// onboarded by the admin at runtime; this is just the starting tenant.
const SEED_CARTS = [
  {
    id: 'momowala',
    name: 'Momo Wala',
    tagline: 'मोमो वाला',
    cuisine: 'Steamed, Kurkure, Afghani & Tandoori momos · 100% pure veg',
    location: 'Saketpuri Yojna, Ayodhya',
    timing: 'Daily 4 PM – 11 PM',
    emoji: '🥟',
    accent: '#FFD60A',
    ownerMobile: '9452661608',
    ownerPasswordHash: null,
    active: true,
    createdAt: '2026-06-01',
  },
];

const PAY_BADGE = {
  cash: { bg: '#E7F5E7', fg: '#0F7B0F' },
  upi: { bg: '#E7EEFF', fg: '#0050B3' },
  pending: { bg: '#FFF1E7', fg: '#FF4D00' },
};

// Deduct an order's pieces from cart stock. Returns a new inventory object.
function deductInventory(inventory, items) {
  const next = { ...inventory };
  items.forEach(item => {
    const menu = MENU_ITEMS.find(m => m.id === item.id);
    if (menu) {
      const pcs = (item.type === 'half' ? menu.pcsHalf : menu.pcsFull) * item.qty;
      next[menu.stockKey] = { ...next[menu.stockKey], cart: next[menu.stockKey].cart - pcs };
    }
  });
  return next;
}

// ─── STORAGE ───
// localStorage (offline-first) + Supabase cloud sync — see src/lib/store.js

const TODAY = new Date().toISOString().split('T')[0];

// ─── INITIAL STATE ───
const DEFAULT_INVENTORY = {
  veg: { freezer: 500, cart: 100 },     // pieces
  paneer: { freezer: 200, cart: 50 },
  corn: { freezer: 200, cart: 50 },
  consumables: {
    oil: { unit: 'L', stock: 5, perOrder: 0.02 },
    cream: { unit: 'ml', stock: 1000, perOrder: 15 },
    cheese: { unit: 'slices', stock: 50, perOrder: 1 },
    schezwan: { unit: 'ml', stock: 500, perOrder: 10 },
  },
};

const freshInventory = () => JSON.parse(JSON.stringify(DEFAULT_INVENTORY));

const getInitialState = () => {
  // Legacy single-tenant keys (pre multi-cart) — read only, for migration.
  const legacyStaff = storage.get('staff', null);
  const legacyInv = storage.get('inventory', null);

  // ── carts ──
  let carts = storage.get('carts', null);
  if (!carts) {
    const ownerRec = Array.isArray(legacyStaff) ? legacyStaff.find(s => s.role === 'owner') : null;
    carts = SEED_CARTS.map(c => ({ ...c, ownerPasswordHash: ownerRec?.passwordHash ?? c.ownerPasswordHash }));
  }

  // ── inventory, keyed by cartId ──
  let inventory = storage.get('inventoryByCart', null);
  if (!inventory) {
    const base = (legacyInv && legacyInv.veg) ? legacyInv : freshInventory();
    if (!base.corn) base.corn = { ...DEFAULT_INVENTORY.corn };
    inventory = { momowala: base };
  }
  carts.forEach(c => { if (!inventory[c.id]) inventory[c.id] = freshInventory(); });

  // ── staff, each tied to a cartId ──
  let staff = storage.get('staffV2', null);
  if (!staff) {
    staff = Array.isArray(legacyStaff)
      ? legacyStaff.filter(s => s.role === 'staff').map(s => ({
          id: s.id, cartId: 'momowala', name: s.name, mobile: s.mobile,
          passwordHash: s.passwordHash, active: s.active,
        }))
      : [];
  }

  const platform = storage.get('platform', { adminMobile: PLATFORM_ADMIN_MOBILE, adminPasswordHash: null });

  // tag any legacy event rows with the momowala cart
  const tag = (arr) => (arr || []).map(x => x.cartId ? x : { ...x, cartId: 'momowala' });

  return {
    platform,
    carts,
    inventory,
    staff,
    orders: tag(storage.get('orders', [])),
    stockLogs: tag(storage.get('stockLogs', [])),
    cartLoadings: tag(storage.get('cartLoadings', [])),
    dayCloseLogs: tag(storage.get('dayCloseLogs', [])),
    staffOnDuty: storage.get('staffOnDuty', null),
  };
};

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function MomoWalaOS() {
  // session: null | { role: 'admin'|'owner'|'staff'|'customer', cartId?, name? }
  const [session, setSession] = useState(null);
  const [state, setState] = useState(getInitialState());
  const [online, setOnline] = useState(true);

  // Hydrate from Supabase once on load (no-op when env keys are missing)
  useEffect(() => {
    loadCloudState().then(cloud => {
      if (cloud) setState(prev => mergeStates(prev, cloud));
    });
  }, []);

  useEffect(() => {
    storage.set('platform', state.platform);
    storage.set('carts', state.carts);
    storage.set('inventoryByCart', state.inventory);
    storage.set('staffV2', state.staff);
    storage.set('orders', state.orders);
    storage.set('stockLogs', state.stockLogs);
    storage.set('cartLoadings', state.cartLoadings);
    storage.set('dayCloseLogs', state.dayCloseLogs);
    storage.set('staffOnDuty', state.staffOnDuty);
    syncToCloud(state);
  }, [state]);

  const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));
  const exit = () => setSession(null);

  if (!session) return <RoleSelector state={state} updateState={updateState} onLogin={setSession} onCustomer={() => setSession({ role: 'customer' })} online={online} setOnline={setOnline} />;

  const props = { state, updateState, onExit: exit };
  if (session.role === 'admin') return <AdminApp {...props} />;
  if (session.role === 'owner') return <OwnerApp {...props} cartId={session.cartId} />;
  if (session.role === 'staff') return <StaffApp {...props} cartId={session.cartId} staffName={session.name} />;
  if (session.role === 'customer') return <CustomerApp {...props} />;
}

// ═══════════════════════════════════════════════
// ROLE SELECTOR — Splash Screen
// ═══════════════════════════════════════════════
function RoleSelector({ state, updateState, onLogin, onCustomer, online, setOnline }) {
  const [loginMode, setLoginMode] = useState(null); // 'admin' | 'owner' | 'staff' | null
  return (
    <div style={{ minHeight: '100vh', background: brand.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Navy header band */}
      <div style={{ background: brand.navy, padding: '36px 24px 28px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
          <CartlyftLogo size={48} variant="light" />
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: brand.text }}>Welcome back</div>
          <div style={{ color: brand.muted, fontSize: 13, marginTop: 4 }}>Choose how you're signing in today</div>
        </div>

        {/* Status indicator */}
        <button
          onClick={() => setOnline(!online)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: brand.surface, border: `1px solid ${online ? brand.teal : colors.accent}`, borderRadius: 20, marginBottom: 24, fontSize: 12, color: online ? brand.tealDark : colors.accent, fontWeight: 600, margin: '0 auto 24px', cursor: 'pointer' }}>
          {online ? <Wifi size={14}/> : <WifiOff size={14}/>}
          {online ? 'Online · Auto-sync ready' : 'Offline · Saving locally'}
        </button>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RoleCard
            icon={<Settings size={28} />}
            title="Cartlyft Admin"
            subtitle="Platform control"
            description="Onboard & manage carts, owners, platform reports"
            color={brand.amber}
            textColor={brand.navy}
            onClick={() => setLoginMode('admin')}
          />
          <RoleCard
            icon={<BarChart3 size={28} />}
            title="Cart Owner"
            subtitle="Run your cart"
            description="Dashboard, inventory, staff, reconciliation"
            color={brand.navy}
            textColor="#fff"
            onClick={() => setLoginMode('owner')}
          />
          <RoleCard
            icon={<ChefHat size={28} />}
            title="Staff (Chef / Helper)"
            subtitle="Order entry · Stock updates"
            description="Take orders, mark payments, manage shift"
            color={brand.teal}
            textColor="#fff"
            onClick={() => setLoginMode('staff')}
          />
          <RoleCard
            icon={<Smartphone size={28} />}
            title="Customer"
            subtitle="Self-order via QR menu"
            description="Browse the Momo Wala menu, place order, get token"
            color={brand.surface}
            textColor={brand.text}
            border={`1.5px solid ${brand.border}`}
            onClick={onCustomer}
          />
        </div>

        {loginMode && (
          <LoginSheet
            mode={loginMode}
            state={state}
            onClose={() => setLoginMode(null)}
            onSetAdminPw={(hash) => updateState({ platform: { ...state.platform, adminPasswordHash: hash } })}
            onSetOwnerPw={(cartId, hash) => updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, ownerPasswordHash: hash } : c) })}
            onSuccess={(sess) => { setLoginMode(null); onLogin(sess); }}
          />
        )}

        <div style={{ marginTop: 28, padding: 16, border: `1px dashed ${brand.border}`, borderRadius: 12, fontSize: 12, color: brand.muted, lineHeight: 1.6, background: brand.surface }}>
          <strong style={{ color: brand.text }}>Install on your phone:</strong><br/>
          Open this page in Chrome → tap ⋮ menu → "Add to Home screen" → behaves like a native app, works offline.
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', color: brand.muted, fontSize: 11 }}>
          Cartlyft QSR OS · powering Momo Wala, Ayodhya
        </div>
      </div>
    </div>
  );
}

function RoleCard({ icon, title, subtitle, description, color, textColor, border, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, background: color, color: textColor, border: border || 'none', borderRadius: 16, textAlign: 'left', cursor: 'pointer', width: '100%', transition: 'transform 0.1s' }}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>{subtitle}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{description}</div>
      </div>
      <ArrowRight size={20} />
    </button>
  );
}

// ─── LOGIN SHEET (admin · owner · staff) ───
// The cart is derived from the account: an owner's cart is the one whose
// ownerMobile matches; a staff member's cart is on their record.
function LoginSheet({ mode, state, onClose, onSetAdminPw, onSetOwnerPw, onSuccess }) {
  const [mobile, setMobile] = useState(mode === 'admin' ? state.platform.adminMobile : '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const adminNeedsSetup = mode === 'admin' && !state.platform.adminPasswordHash;
  // owner-first-time only applies to a cart whose owner password isn't set yet
  const ownerCart = mode === 'owner' ? state.carts.find(c => c.ownerMobile === mobile.trim() && c.active) : null;
  const ownerNeedsSetup = mode === 'owner' && ownerCart && !ownerCart.ownerPasswordHash;
  const needsSetup = adminNeedsSetup || ownerNeedsSetup;

  const submit = async () => {
    setError('');
    const m = mobile.trim();
    if (!/^\d{10}$/.test(m)) { setError('Enter a 10-digit mobile number.'); return; }

    const verify = async (hash) => (await hashPassword(pw)) === hash;
    const doSetup = async (save, session) => {
      if (pw.length < 4) { setError('Choose a password of at least 4 digits.'); return; }
      if (pw !== pw2) { setError('The two passwords do not match.'); return; }
      setBusy(true);
      save(await hashPassword(pw));
      onSuccess(session);
    };

    if (mode === 'admin') {
      if (m !== state.platform.adminMobile) { setError('That is not the Cartlyft admin number.'); return; }
      if (adminNeedsSetup) return doSetup(onSetAdminPw, { role: 'admin' });
      setBusy(true); const ok = await verify(state.platform.adminPasswordHash); setBusy(false);
      if (!ok) { setError('Wrong password.'); return; }
      onSuccess({ role: 'admin' });
      return;
    }

    if (mode === 'owner') {
      const cart = state.carts.find(c => c.ownerMobile === m && c.active);
      if (!cart) { setError('This number is not a registered cart owner. Ask the Cartlyft admin.'); return; }
      if (!cart.ownerPasswordHash) return doSetup((h) => onSetOwnerPw(cart.id, h), { role: 'owner', cartId: cart.id });
      setBusy(true); const ok = await verify(cart.ownerPasswordHash); setBusy(false);
      if (!ok) { setError('Wrong password.'); return; }
      onSuccess({ role: 'owner', cartId: cart.id });
      return;
    }

    // staff
    const rec = state.staff.find(s => s.mobile === m && s.active);
    if (!rec) { setError('This number is not registered. Ask your cart owner to add you.'); return; }
    if (!rec.passwordHash) { setError('Your password has not been set yet. Ask your owner.'); return; }
    setBusy(true); const ok = await verify(rec.passwordHash); setBusy(false);
    if (!ok) { setError('Wrong password.'); return; }
    onSuccess({ role: 'staff', cartId: rec.cartId, name: rec.name });
  };

  const title = mode === 'admin' ? (adminNeedsSetup ? 'Set Admin Password' : 'Cartlyft Admin')
    : mode === 'owner' ? (ownerNeedsSetup ? 'Set Owner Password' : 'Cart Owner Login')
    : 'Staff Login';
  const mobileLocked = mode === 'admin';
  const inputStyle = { width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 10 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <CartlyftMark size={44} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
          <Lock size={18} color={brand.navy} />
          <div style={{ fontSize: 20, fontWeight: 800, color: brand.navy }}>{title}</div>
        </div>
        {needsSetup
          ? <div style={{ fontSize: 12, color: colors.muted, marginBottom: 16, textAlign: 'center' }}>First time here — set a password for {mobile}. You'll use it every time after this.</div>
          : <div style={{ height: 12 }} />}

        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>MOBILE NUMBER</div>
        <input
          type="tel" inputMode="numeric" value={mobile} placeholder="10-digit number"
          disabled={mobileLocked}
          onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
          style={{ ...inputStyle, background: mobileLocked ? '#F5F4F0' : '#fff', fontWeight: 700, letterSpacing: 1 }} />

        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>{needsSetup ? 'NEW PASSWORD' : 'PASSWORD'}</div>
        <input type="password" inputMode="numeric" value={pw} placeholder="••••"
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !needsSetup && submit()}
          style={inputStyle} />

        {needsSetup && (
          <>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>CONFIRM PASSWORD</div>
            <input type="password" inputMode="numeric" value={pw2} placeholder="••••"
              onChange={e => setPw2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={inputStyle} />
          </>
        )}

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 14, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {needsSetup ? 'Set Password & Enter' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// CARTLYFT ADMIN APP — platform / multi-tenant control
// ═══════════════════════════════════════════════
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
  const [showAdd, setShowAdd] = useState(false);

  const addCart = async (form) => {
    let id = slugify(form.name) || `cart-${Date.now()}`;
    if (state.carts.some(c => c.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`;
    const ownerPasswordHash = form.ownerPassword ? await hashPassword(form.ownerPassword) : null;
    const cart = {
      id, name: form.name.trim(), tagline: form.tagline.trim(), cuisine: form.cuisine.trim(),
      location: form.location.trim(), timing: form.timing.trim(), emoji: form.emoji || '🛒',
      accent: form.accent || brand.teal, ownerMobile: form.ownerMobile,
      ownerPasswordHash, active: true, createdAt: TODAY,
    };
    updateState({ carts: [...state.carts, cart], inventory: { ...state.inventory, [id]: freshInventory() } });
    setShowAdd(false);
  };

  const toggleActive = (id) => updateState({ carts: state.carts.map(c => c.id === id ? { ...c, active: !c.active } : c) });
  const resetOwnerPw = async (cart) => {
    const np = prompt(`New owner password for ${cart.name} (min 4 chars):`);
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const hash = await hashPassword(np);
    updateState({ carts: state.carts.map(c => c.id === cart.id ? { ...c, ownerPasswordHash: hash } : c) });
    alert(`Owner password updated for ${cart.name}.`);
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.carts.map(c => (
          <div key={c.id} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 16, opacity: c.active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: `2px solid ${c.accent}` }}>{c.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name} {!c.active && <span style={{ fontSize: 11, color: colors.red, fontWeight: 600 }}>· disabled</span>}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>{c.location} · owner {c.ownerMobile}</div>
                <div style={{ fontSize: 11, color: c.ownerPasswordHash ? colors.green : colors.accent, fontWeight: 600, marginTop: 2 }}>{c.ownerPasswordHash ? 'Owner password set' : 'Owner sets password on first login'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

const adminBtn = { background: '#fff', border: `1px solid ${colors.border}`, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: brand.text };

function AddCartModal({ onAdd, onClose }) {
  const [f, setF] = useState({ name: '', tagline: '', cuisine: '', location: '', timing: 'Daily 4 PM – 11 PM', emoji: '🛒', accent: brand.teal, ownerMobile: '', ownerPassword: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const submit = () => {
    setError('');
    if (!f.name.trim()) { setError('Enter a cart name.'); return; }
    if (!f.cuisine.trim()) { setError('Describe the food served.'); return; }
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

        <div style={label}>CART NAME</div>
        <input value={f.name} onChange={set('name')} placeholder="e.g. Chaat Junction" style={inputStyle} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>EMOJI / LOGO</div>
            <input value={f.emoji} onChange={set('emoji')} placeholder="🛒" style={inputStyle} />
          </div>
          <div style={{ flex: 2 }}>
            <div style={label}>TAGLINE (optional)</div>
            <input value={f.tagline} onChange={set('tagline')} placeholder="चाट जंक्शन" style={inputStyle} />
          </div>
        </div>
        <div style={label}>FOOD DESCRIPTION</div>
        <input value={f.cuisine} onChange={set('cuisine')} placeholder="Pani puri, tikki, dahi chaat…" style={inputStyle} />
        <div style={label}>LOCATION</div>
        <input value={f.location} onChange={set('location')} placeholder="Area, city" style={inputStyle} />
        <div style={label}>TIMING</div>
        <input value={f.timing} onChange={set('timing')} style={inputStyle} />
        <div style={label}>OWNER MOBILE</div>
        <input type="tel" inputMode="numeric" value={f.ownerMobile} onChange={e => setF(p => ({ ...p, ownerMobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit number" style={{ ...inputStyle, fontWeight: 700, letterSpacing: 1 }} />
        <div style={label}>OWNER PASSWORD (optional — owner can set on first login)</div>
        <input type="text" value={f.ownerPassword} onChange={set('ownerPassword')} placeholder="min 4 characters, or leave blank" style={inputStyle} />

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

function AdminReports({ state }) {
  const rows = state.carts.map(c => {
    const orders = state.orders.filter(o => o.cartId === c.id);
    const today = orders.filter(o => o.date === TODAY && o.payment !== 'pending');
    const allTime = orders.filter(o => o.payment !== 'pending');
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
              <div style={{ width: 36, height: 36, borderRadius: 10, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: `2px solid ${r.cart.accent}` }}>{r.cart.emoji}</div>
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
    </div>
  );
}

// ═══════════════════════════════════════════════
// OWNER APP
// ═══════════════════════════════════════════════
function OwnerApp({ state, updateState, onExit, cartId }) {
  const [tab, setTab] = useState('dashboard');
  const cart = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];

  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.payment === 'pending' ? 0 : o.total), 0);
  const cashRevenue = todayOrders.filter(o => o.payment === 'cash').reduce((sum, o) => sum + o.total, 0);
  const upiRevenue = todayOrders.filter(o => o.payment === 'upi').reduce((sum, o) => sum + o.total, 0);
  const piecesSold = todayOrders.filter(o => o.payment !== 'pending').reduce((sum, o) => {
    return sum + o.items.reduce((s, item) => {
      const m = MENU_ITEMS.find(x => x.id === item.id);
      if (!m) return s;
      return s + (item.type === 'half' ? m.pcsHalf : m.pcsFull) * item.qty;
    }, 0);
  }, 0);

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cart?.name ?? 'Cart'} · Owner`} onExit={onExit} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'dashboard' && <Dashboard inv={inv} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} todayOrders={todayOrders} />}
        {tab === 'inventory' && <InventoryView state={state} updateState={updateState} cartId={cartId} inv={inv} />}
        {tab === 'reconcile' && <Reconciliation state={state} updateState={updateState} cartId={cartId} inv={inv} todayOrders={todayOrders} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} />}
        {tab === 'staff' && <StaffRegistry state={state} updateState={updateState} cartId={cartId} cart={cart} />}
        {tab === 'reports' && <Reports state={state} cartId={cartId} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'dashboard', icon: <Home size={20}/>, label: 'Home' },
        { id: 'inventory', icon: <Boxes size={20}/>, label: 'Stock' },
        { id: 'reconcile', icon: <CheckCircle2 size={20}/>, label: 'Reconcile' },
        { id: 'staff', icon: <Users size={20}/>, label: 'Staff' },
        { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Reports' },
      ]} />
    </div>
  );
}

function TopBar({ title, onExit }) {
  return (
    <div style={{ background: brand.navy, color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CartlyftMark size={30} />
        <div>
          <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, fontWeight: 700, color: brand.amber }}>CARTLYFT QSR OS</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        </div>
      </div>
      <button onClick={onExit} style={{ background: 'transparent', border: `1px solid rgba(255,255,255,0.5)`, color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <LogOut size={12}/> Exit
      </button>
    </div>
  );
}

function BottomNav({ tab, setTab, tabs }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${colors.border}`, padding: '8px 0' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', justifyContent: 'space-around' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: 'transparent', border: 'none', padding: '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: tab === t.id ? colors.ink : colors.muted, fontWeight: tab === t.id ? 700 : 500, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              {t.icon}
              {t.badge > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -10, background: colors.accent, color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{t.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 11 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── OWNER: DASHBOARD ───
function Dashboard({ inv, todayRevenue, cashRevenue, upiRevenue, piecesSold, todayOrders }) {
  const expectedRevenue = piecesSold * 12; // avg ₹12/piece
  const variance = todayRevenue - expectedRevenue;
  const pendingCount = todayOrders.filter(o => o.payment === 'pending').length;
  const vegLow = inv.veg.freezer < 100;
  const paneerLow = inv.paneer.freezer < 50;
  const cornLow = inv.corn.freezer < 50;

  return (
    <div>
      <SectionHeader title="Today's Snapshot" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />

      {/* Hero metric */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 24, borderRadius: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1, marginBottom: 4 }}>TOTAL REVENUE TODAY</div>
        <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>₹{todayRevenue.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>{todayOrders.length} orders · {piecesSold} pieces sold</div>
      </div>

      {/* Split metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Cash" value={`₹${cashRevenue}`} icon={<IndianRupee size={16}/>} color={colors.green} />
        <MetricCard label="UPI / Online" value={`₹${upiRevenue}`} icon={<Smartphone size={16}/>} color={colors.ink} />
      </div>

      {/* Variance alert */}
      {Math.abs(variance) > 100 && (
        <Alert
          type={variance > 0 ? 'warn' : 'danger'}
          title={variance > 0 ? 'Revenue HIGHER than expected' : 'Possible stock leakage'}
          message={`Recorded ₹${todayRevenue} vs expected ₹${expectedRevenue} (based on pieces sold × avg ₹12). Difference: ₹${variance}`}
        />
      )}

      {/* Pending QR orders awaiting payment */}
      {pendingCount > 0 && (
        <Alert type="warn" title={`${pendingCount} order${pendingCount > 1 ? 's' : ''} awaiting payment`} message="Customer QR orders not yet collected. Staff settles these in the Pending tab — stock and revenue update only after payment." />
      )}

      {/* Stock alerts */}
      {(vegLow || paneerLow || cornLow) && (
        <Alert type="danger" title="Low stock alert" message={`${[vegLow && 'Veg', paneerLow && 'Paneer', cornLow && 'Corn Cheese'].filter(Boolean).join(' & ')} momo running low. Order before tomorrow.`} />
      )}

      <SectionHeader title="Live Inventory" />
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <StockRow label="Veg Momo · Freezer" value={inv.veg.freezer} unit="pcs" low={vegLow} />
        <StockRow label="Veg Momo · On Cart" value={inv.veg.cart} unit="pcs" />
        <StockRow label="Paneer Momo · Freezer" value={inv.paneer.freezer} unit="pcs" low={paneerLow} />
        <StockRow label="Paneer Momo · On Cart" value={inv.paneer.cart} unit="pcs" />
        <StockRow label="Corn Cheese · Freezer" value={inv.corn.freezer} unit="pcs" low={cornLow} />
        <StockRow label="Corn Cheese · On Cart" value={inv.corn.cart} unit="pcs" />
      </div>

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

function MetricCard({ label, value, icon, color }) {
  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 11, marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Alert({ type, title, message }) {
  const bgColor = type === 'danger' ? '#FFE7E7' : type === 'warn' ? '#FFF7E0' : '#E7F5E7';
  const borderColor = type === 'danger' ? colors.red : type === 'warn' ? '#D4A017' : colors.green;
  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, padding: 14, borderRadius: 12, marginBottom: 16, display: 'flex', gap: 12 }}>
      <AlertCircle size={20} color={borderColor} style={{ flexShrink: 0 }}/>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: borderColor }}>{title}</div>
        <div style={{ fontSize: 13, marginTop: 4, color: colors.ink }}>{message}</div>
      </div>
    </div>
  );
}

function StockRow({ label, value, unit, low }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: 14, color: colors.ink }}>{label}</div>
      <div style={{ fontWeight: 700, color: low ? colors.red : colors.ink, display: 'flex', alignItems: 'center', gap: 4 }}>
        {value} <span style={{ fontSize: 11, color: colors.muted, fontWeight: 500 }}>{unit}</span>
        {low && <AlertTriangle size={14} color={colors.red} />}
      </div>
    </div>
  );
}

function OrderRow({ order }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 12, color: colors.muted }}>#{order.token} · {order.time}</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>{order.items.length} items</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>₹{order.total}</div>
        <div style={{ fontSize: 10, padding: '2px 8px', background: PAY_BADGE[order.payment].bg, color: PAY_BADGE[order.payment].fg, borderRadius: 10, marginTop: 2, display: 'inline-block', fontWeight: 600 }}>{order.payment.toUpperCase()}</div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12, marginTop: 8 }}>
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1.5, fontWeight: 700 }}>{subtitle?.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: colors.ink }}>{title}</div>
    </div>
  );
}

// ─── OWNER: INVENTORY ───
function InventoryView({ state, updateState, cartId, inv }) {
  const [showAddStock, setShowAddStock] = useState(false);
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });
  const cartStockLogs = state.stockLogs.filter(l => l.cartId === cartId);
  const cartLoadLogs = state.cartLoadings.filter(l => l.cartId === cartId);

  const addStock = (type, qty) => {
    const newInv = { ...inv };
    newInv[type] = { ...newInv[type], freezer: newInv[type].freezer + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'STOCK_IN', item: type, qty, note: `Added ${qty} pieces of ${type}`
    };
    setCartInv(newInv, { stockLogs: [...state.stockLogs, log] });
    setShowAddStock(false);
  };

  const loadToCart = (type, qty) => {
    const newInv = { ...inv };
    if (newInv[type].freezer < qty) { alert('Not enough stock in freezer!'); return; }
    newInv[type] = { freezer: newInv[type].freezer - qty, cart: newInv[type].cart + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'CART_LOAD', item: type, qty, note: `Moved ${qty} ${type} pieces to cart`
    };
    setCartInv(newInv, { cartLoadings: [...state.cartLoadings, log] });
  };

  return (
    <div>
      <SectionHeader title="Inventory Control" subtitle="Stock In · Cart Loading · Consumables" />

      {/* Stock In Action */}
      <button onClick={() => setShowAddStock(true)}
        style={{ width: '100%', background: colors.ink, color: colors.primary, padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Plus size={18}/> Record New Supplier Delivery
      </button>

      {showAddStock && <StockInModal onAdd={addStock} onClose={() => setShowAddStock(false)} />}

      {/* Freezer Status */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>FREEZER (KITCHEN)</div>
        <FreezerItem type="veg" stock={inv.veg.freezer} cart={inv.veg.cart} onLoad={loadToCart} />
        <FreezerItem type="paneer" stock={inv.paneer.freezer} cart={inv.paneer.cart} onLoad={loadToCart} />
        <FreezerItem type="corn" stock={inv.corn.freezer} cart={inv.corn.cart} onLoad={loadToCart} />
      </div>

      {/* Consumables */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>CONSUMABLES (AUTO-TRACKED)</div>
        {Object.entries(inv.consumables).map(([key, item]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 14, textTransform: 'capitalize' }}>{key}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{item.stock.toFixed(item.unit === 'L' ? 2 : 0)} <span style={{ fontSize: 11, color: colors.muted }}>{item.unit}</span></div>
              <div style={{ fontSize: 10, color: colors.muted }}>~{item.perOrder}{item.unit}/order</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Logs */}
      <SectionHeader title="Activity Log" />
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[...cartStockLogs, ...cartLoadLogs].sort((a, b) => b.id - a.id).slice(0, 8).map(log => (
          <div key={log.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>{log.type.replace('_', ' ')}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{log.note}</div>
            </div>
            <div style={{ fontSize: 11, color: colors.muted }}>{log.time}</div>
          </div>
        ))}
        {cartStockLogs.length === 0 && cartLoadLogs.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.muted, fontSize: 14 }}>No activity logged yet</div>
        )}
      </div>
    </div>
  );
}

function FreezerItem({ type, stock, cart, onLoad }) {
  const [loadQty, setLoadQty] = useState(50);
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{type === 'corn' ? 'Corn Cheese' : type} Momo</div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: colors.muted }}>Freezer: </span><strong>{stock}</strong> · <span style={{ color: colors.muted }}>Cart: </span><strong>{cart}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" value={loadQty} onChange={e => setLoadQty(parseInt(e.target.value) || 0)} style={{ width: 80, padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13 }} />
        <button onClick={() => onLoad(type, loadQty)} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}>
          Load to Cart
        </button>
      </div>
    </div>
  );
}

function StockInModal({ onAdd, onClose }) {
  const [type, setType] = useState('veg');
  const [qty, setQty] = useState(500);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>New Stock Delivery</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>ITEM TYPE</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['veg', 'Veg'], ['paneer', 'Paneer'], ['corn', 'Corn Cheese']].map(([key, label]) => (
              <button key={key} onClick={() => setType(key)} style={{ flex: 1, padding: 12, border: `2px solid ${type === key ? colors.ink : colors.border}`, background: type === key ? colors.ink : '#fff', color: type === key ? colors.primary : colors.ink, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>QUANTITY (PIECES)</div>
          <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 16, fontWeight: 700, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>1 packet = 50 pieces · So {Math.floor(qty/50)} packets</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onAdd(type, qty)} style={{ flex: 2, padding: 14, background: colors.ink, color: colors.primary, border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Confirm Delivery</button>
        </div>
      </div>
    </div>
  );
}

// ─── OWNER: RECONCILIATION ───
function Reconciliation({ state, updateState, cartId, inv, todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remainingVeg, setRemainingVeg] = useState('');
  const [remainingPaneer, setRemainingPaneer] = useState('');
  const [remainingCorn, setRemainingCorn] = useState('');
  const [closed, setClosed] = useState(false);

  // Stock is deducted as orders are settled, so the cart count already
  // reflects sales — expected remaining is simply the current cart stock.
  const expectedVeg = inv.veg.cart;
  const expectedPaneer = inv.paneer.cart;
  const expectedCorn = inv.corn.cart;

  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - upiRevenue : null;
  const vegDiff = remainingVeg !== '' ? parseInt(remainingVeg) - expectedVeg : null;
  const paneerDiff = remainingPaneer !== '' ? parseInt(remainingPaneer) - expectedPaneer : null;
  const cornDiff = remainingCorn !== '' ? parseInt(remainingCorn) - expectedCorn : null;

  const closeDay = () => {
    const dayClose = {
      id: Date.now(),
      cartId,
      date: TODAY,
      totalOrders: todayOrders.length,
      systemCash: cashRevenue,
      physicalCash: parseInt(physicalCash) || 0,
      cashDiff: cashDiff || 0,
      systemUpi: upiRevenue,
      phonePeAmount: parseInt(phonePeAmount) || 0,
      upiDiff: upiDiff || 0,
      expectedVeg, actualVeg: parseInt(remainingVeg) || 0, vegDiff: vegDiff || 0,
      expectedPaneer, actualPaneer: parseInt(remainingPaneer) || 0, paneerDiff: paneerDiff || 0,
      expectedCorn, actualCorn: parseInt(remainingCorn) || 0, cornDiff: cornDiff || 0,
      piecesSold,
      revenue: cashRevenue + upiRevenue,
      closedAt: new Date().toISOString()
    };
    updateState({ dayCloseLogs: [...state.dayCloseLogs, dayClose] });
    setClosed(true);
  };

  if (closed) {
    return (
      <div>
        <div style={{ background: colors.green, color: '#fff', padding: 32, borderRadius: 16, textAlign: 'center' }}>
          <CheckCircle2 size={48} style={{ marginBottom: 12 }}/>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Day Closed Successfully</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>All logs saved. Good work today!</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="End of Day Reconciliation" subtitle="The 10:30 PM ritual" />

      {/* System totals */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, marginBottom: 8 }}>SYSTEM RECORDED TODAY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Total Orders</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{todayOrders.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Total Revenue</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>₹{cashRevenue + upiRevenue}</div>
          </div>
        </div>
      </div>

      {/* Cash reconciliation */}
      <ReconcileBlock
        title="💰 Cash Box"
        systemValue={`₹${cashRevenue}`}
        label="Physical cash in box"
        value={physicalCash}
        onChange={setPhysicalCash}
        diff={cashDiff}
        unit="₹"
      />

      {/* UPI reconciliation */}
      <ReconcileBlock
        title="📱 UPI / PhonePe"
        systemValue={`₹${upiRevenue}`}
        label="Total in PhonePe Business app"
        value={phonePeAmount}
        onChange={setPhonePeAmount}
        diff={upiDiff}
        unit="₹"
      />

      {/* Stock reconciliation */}
      <ReconcileBlock
        title="🥟 Veg Momo Stock"
        systemValue={`${expectedVeg} pcs expected`}
        label="Actual pieces remaining on cart"
        value={remainingVeg}
        onChange={setRemainingVeg}
        diff={vegDiff}
        unit="pcs"
      />

      <ReconcileBlock
        title="🥟 Paneer Momo Stock"
        systemValue={`${expectedPaneer} pcs expected`}
        label="Actual pieces remaining on cart"
        value={remainingPaneer}
        onChange={setRemainingPaneer}
        diff={paneerDiff}
        unit="pcs"
      />

      <ReconcileBlock
        title="🥟 Corn Cheese Stock"
        systemValue={`${expectedCorn} pcs expected`}
        label="Actual pieces remaining on cart"
        value={remainingCorn}
        onChange={setRemainingCorn}
        diff={cornDiff}
        unit="pcs"
      />

      {/* Close day button */}
      <button onClick={closeDay}
        disabled={physicalCash === '' || phonePeAmount === '' || remainingVeg === '' || remainingPaneer === '' || remainingCorn === ''}
        style={{ width: '100%', background: physicalCash === '' || phonePeAmount === '' ? colors.border : colors.ink, color: colors.primary, padding: 18, borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 16 }}>
        Close Day & Save Report
      </button>
    </div>
  );
}

function ReconcileBlock({ title, systemValue, label, value, onChange, diff, unit }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 13, color: colors.muted }}>System: <strong style={{ color: colors.ink }}>{systemValue}</strong></div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>{label}</div>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
        style={{ width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 18, fontWeight: 700, boxSizing: 'border-box' }} />
      {diff !== null && value !== '' && (
        <div style={{ marginTop: 8, padding: 10, background: diff === 0 ? '#E7F5E7' : Math.abs(diff) < 50 ? '#FFF7E0' : '#FFE7E7', borderRadius: 8, fontSize: 13, fontWeight: 600, color: diff === 0 ? colors.green : Math.abs(diff) < 50 ? '#D4A017' : colors.red, display: 'flex', alignItems: 'center', gap: 6 }}>
          {diff === 0 ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
          {diff === 0 ? 'Perfect match!' : `Difference: ${diff > 0 ? '+' : ''}${diff}${unit}`}
        </div>
      )}
    </div>
  );
}

// ─── OWNER: STAFF REGISTRY ───
function StaffRegistry({ state, updateState, cartId, cart }) {
  const [showAdd, setShowAdd] = useState(false);
  const staff = state.staff.filter(s => s.cartId === cartId);

  const addStaff = async (name, mobile, password) => {
    const hash = await hashPassword(password);
    const rec = { id: Date.now(), cartId, name, mobile, passwordHash: hash, active: true };
    updateState({ staff: [...state.staff, rec] });
    setShowAdd(false);
  };

  const toggleActive = (id) => updateState({ staff: state.staff.map(s => s.id === id ? { ...s, active: !s.active } : s) });
  const removeStaff = (id) => { if (confirm('Remove this staff member? They will no longer be able to log in.')) updateState({ staff: state.staff.filter(s => s.id !== id) }); };
  const resetPassword = async (id) => {
    const np = prompt('Enter a new password for this staff member (min 4 characters):');
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const hash = await hashPassword(np);
    updateState({ staff: state.staff.map(s => s.id === id ? { ...s, passwordHash: hash } : s) });
    alert('Password updated.');
  };
  const changeOwnerPassword = async () => {
    const np = prompt('Enter a new owner password (min 4 characters):');
    if (!np) return;
    if (np.length < 4) { alert('Password must be at least 4 characters.'); return; }
    const hash = await hashPassword(np);
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, ownerPasswordHash: hash } : c) });
    alert('Owner password updated.');
  };

  return (
    <div>
      <SectionHeader title="Staff Registry" subtitle={`${cart?.name} · only registered staff can log in`} />

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
          <div style={{ fontSize: 11, opacity: 0.7 }}>{cart?.ownerPasswordHash ? 'Password set' : 'Password not set yet'}</div>
        </div>
        <button onClick={changeOwnerPassword} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: `1px solid rgba(255,255,255,0.4)`, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Change Password</button>
      </div>

      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>STAFF MEMBERS ({staff.length})</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {staff.map(s => (
          <div key={s.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: s.active ? 1 : 0.5 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name} {!s.active && <span style={{ fontSize: 11, color: colors.red }}>· disabled</span>}</div>
              <div style={{ fontSize: 13, color: colors.muted }}>{s.mobile}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => resetPassword(s.id)} title="Reset password" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Lock size={14}/></button>
              <button onClick={() => toggleActive(s.id)} title={s.active ? 'Disable login' : 'Enable login'} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}>{s.active ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
              <button onClick={() => removeStaff(s.id)} title="Remove" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color={colors.red}/></button>
            </div>
          </div>
        ))}
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
function Reports({ state, cartId }) {
  const last7 = state.dayCloseLogs.filter(d => d.cartId === cartId).slice(-7);
  const totalRevenue = last7.reduce((s, d) => s + d.revenue, 0);
  const totalLeakage = last7.reduce((s, d) => s + Math.min(0, d.cashDiff) + Math.min(0, d.upiDiff), 0);

  return (
    <div>
      <SectionHeader title="7-Day Performance" subtitle="Trends & insights" />

      {last7.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: `1px solid ${colors.border}` }}>
          <BarChart3 size={40} color={colors.muted} style={{ margin: '0 auto 12px' }}/>
          <div style={{ color: colors.muted, fontSize: 14 }}>Close a few days first to see trends here</div>
        </div>
      ) : (
        <>
          <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, marginBottom: 4 }}>LAST 7 DAYS</div>
            <div style={{ fontSize: 34, fontWeight: 900 }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Avg ₹{Math.round(totalRevenue/last7.length).toLocaleString('en-IN')}/day</div>
          </div>

          {totalLeakage < 0 && (
            <Alert type="danger" title={`Total cash leakage: ₹${Math.abs(totalLeakage)}`} message="Investigate days with cash shortfall. Tighten controls." />
          )}

          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {last7.reverse().map(d => (
              <div key={d.id} style={{ padding: 16, borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>₹{d.revenue}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: colors.muted }}>
                  <span>📦 {d.totalOrders} orders</span>
                  <span>🥟 {d.piecesSold} pcs</span>
                  {d.cashDiff !== 0 && <span style={{ color: d.cashDiff < 0 ? colors.red : colors.green }}>Cash: {d.cashDiff > 0 ? '+' : ''}₹{d.cashDiff}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// STAFF APP — Order Entry
// ═══════════════════════════════════════════════
function StaffApp({ state, updateState, onExit, cartId, staffName }) {
  const [tab, setTab] = useState('order');
  const [cart, setCart] = useState([]);
  const cartInfo = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];

  // Login is gated at the role selector; this is just a safety net.
  if (!staffName) { onExit(); return null; }

  // Staff only ever sees orders for their own cart.
  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const myOrders = todayOrders.filter(o => o.staff === staffName);
  const pendingOrders = todayOrders.filter(o => o.payment === 'pending');
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });

  const placeOrder = (payment) => {
    if (cart.length === 0) return;
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    const order = {
      id: Date.now(),
      cartId,
      token: String(todayOrders.length + 1).padStart(3, '0'),
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      total,
      payment,
      staff: staffName,
      source: 'staff-entry'
    };
    // Staff order is settled on the spot, so deduct stock now.
    setCartInv(deductInventory(inv, cart), { orders: [...state.orders, order] });
    setCart([]);
  };

  // Customer QR orders arrive as 'pending'; staff confirms payment here,
  // and only then is stock deducted.
  const settleOrder = (orderId, payment) => {
    const order = state.orders.find(o => o.id === orderId);
    if (!order || order.payment !== 'pending') return;
    setCartInv(deductInventory(inv, order.items), {
      orders: state.orders.map(o => o.id === orderId ? { ...o, payment, staff: staffName, settledAt: new Date().toISOString() } : o),
    });
  };
  const cancelOrder = (orderId) => {
    if (!confirm('Cancel this unpaid order?')) return;
    updateState({ orders: state.orders.filter(o => o.id !== orderId) });
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cartInfo?.name ?? 'Cart'} · ${staffName}`} onExit={() => { updateState({ staffOnDuty: null }); onExit(); }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'order' && <NewOrderScreen cart={cart} setCart={setCart} onPlaceOrder={placeOrder} />}
        {tab === 'pending' && <PendingOrders orders={pendingOrders} onSettle={settleOrder} onCancel={cancelOrder} />}
        {tab === 'myorders' && <MyOrdersScreen orders={myOrders} />}
        {tab === 'shift' && <ShiftStatus inv={inv} myOrders={myOrders} staffName={staffName} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'order', icon: <Plus size={20}/>, label: 'New Order' },
        { id: 'pending', icon: <Clock size={20}/>, label: 'Pending', badge: pendingOrders.length },
        { id: 'myorders', icon: <FileText size={20}/>, label: 'My Orders' },
        { id: 'shift', icon: <Award size={20}/>, label: 'Shift' },
      ]} />
    </div>
  );
}

// ─── STAFF: PENDING CUSTOMER ORDERS ───
function PendingOrders({ orders, onSettle, onCancel }) {
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
        {orders.map(o => (
          <div key={o.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.accent}`, overflow: 'hidden' }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>#{o.token}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>{o.time} · self-order</div>
              </div>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
                {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>₹{o.total}</div>
              <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: 600 }}>MARK AS PAID (deducts stock)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onSettle(o.id, 'cash')} style={{ flex: 1, background: colors.green, color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>💵 Cash</button>
                <button onClick={() => onSettle(o.id, 'upi')} style={{ flex: 1, background: '#0050B3', color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>📱 UPI</button>
                <button onClick={() => onCancel(o.id)} style={{ background: '#fff', color: colors.red, border: `1px solid ${colors.border}`, padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewOrderScreen({ cart, setCart, onPlaceOrder }) {
  const [category, setCategory] = useState('momos');

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
      <SectionHeader title="New Order" subtitle="Tap items to add" />

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'momos', label: '🥟 Momos' },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 100 }}>
        {category === 'momos' && MENU_ITEMS.map(item => (
          <MenuItemRow key={item.id} item={item} onAdd={addToCart} />
        ))}
        {category === 'lassi' && LASSI.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} extra="Made with Greek yogurt" onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
        {category === 'addons' && ADDONS.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} extra="Free during promotion" onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
      </div>

      {/* Cart bottom sheet */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, background: colors.ink, color: colors.primary, padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>TOTAL</div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>₹{total}</div>
              </div>
              <button onClick={() => onPlaceOrder('cash')} style={{ background: colors.green, color: '#fff', border: 'none', padding: '12px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>💵 Cash</button>
              <button onClick={() => onPlaceOrder('upi')} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '12px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>📱 UPI</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItemRow({ item, onAdd }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name} {item.star && '⭐'}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>{item.cat}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onAdd(item.id, `${item.name} Half`, item.half, 'half')} style={{ flex: 1, padding: '8px 10px', background: '#fff', border: `1.5px solid ${colors.ink}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Half · ₹{item.half} <span style={{ fontSize: 10, opacity: 0.6 }}>({item.pcsHalf}pc)</span>
        </button>
        <button onClick={() => onAdd(item.id, `${item.name} Full`, item.full, 'full')} style={{ flex: 1, padding: '8px 10px', background: colors.ink, color: colors.primary, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Full · ₹{item.full} <span style={{ fontSize: 10, opacity: 0.7 }}>({item.pcsFull}pc)</span>
        </button>
      </div>
    </div>
  );
}

function SimpleItemRow({ id, name, price, extra, onAdd, picked }) {
  return (
    <button onClick={onAdd} style={{ background: picked ? '#E7F5E7' : '#fff', borderRadius: 10, padding: 14, border: `1px solid ${picked ? colors.green : colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', width: '100%' }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        {extra && <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>+ {extra}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: price === 0 ? colors.green : colors.ink }}>{price === 0 ? 'FREE' : `₹${price}`}</div>
        {picked ? <Check size={18} color={colors.green}/> : <Plus size={18} color={colors.ink}/>}
      </div>
    </button>
  );
}

function MyOrdersScreen({ orders }) {
  const totalCash = orders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const totalUpi = orders.filter(o => o.payment === 'upi').reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <SectionHeader title="My Shift Orders" subtitle={`${orders.length} orders so far`} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Cash" value={`₹${totalCash}`} icon={<IndianRupee size={16}/>} color={colors.green} />
        <MetricCard label="UPI" value={`₹${totalUpi}`} icon={<Smartphone size={16}/>} color={colors.ink} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {orders.slice().reverse().map(o => (
          <div key={o.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>#{o.token} · {o.time}</div>
              <div style={{ fontWeight: 800 }}>₹{o.total}</div>
            </div>
            <div style={{ fontSize: 12, color: colors.muted }}>
              {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
            </div>
            <div style={{ fontSize: 10, padding: '2px 8px', background: PAY_BADGE[o.payment].bg, color: PAY_BADGE[o.payment].fg, borderRadius: 10, marginTop: 6, display: 'inline-block', fontWeight: 600 }}>{o.payment.toUpperCase()}</div>
          </div>
        ))}
        {orders.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>No orders yet · Tap "New Order" to start</div>}
      </div>
    </div>
  );
}

function ShiftStatus({ inv, myOrders, staffName }) {
  const cashTotal = myOrders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const upiTotal = myOrders.filter(o => o.payment === 'upi').reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <SectionHeader title="Shift Summary" subtitle={`${staffName} on duty`} />

      <div style={{ background: colors.ink, color: colors.primary, padding: 24, borderRadius: 16, marginBottom: 16, textAlign: 'center' }}>
        <Clock size={32} style={{ margin: '0 auto 8px' }}/>
        <div style={{ fontSize: 13, opacity: 0.7 }}>SHIFT TOTAL</div>
        <div style={{ fontSize: 36, fontWeight: 900 }}>₹{cashTotal + upiTotal}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{myOrders.length} orders</div>
      </div>

      <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>STOCK ON CART</div>
        <StockRow label="Veg Momo (pcs)" value={inv.veg.cart} unit="pcs"/>
        <StockRow label="Paneer Momo (pcs)" value={inv.paneer.cart} unit="pcs"/>
        <StockRow label="Corn Cheese (pcs)" value={inv.corn.cart} unit="pcs"/>
      </div>

      <Alert
        type="info"
        title="Late shift handover?"
        message="If you're staying late after chef leaves, your orders are still tracked separately. Owner sees both shifts clearly."
      />
    </div>
  );
}

// ═══════════════════════════════════════════════
// CUSTOMER APP — QR Self-Order
// ═══════════════════════════════════════════════
// Customers may add at most this many distinct add-ons, 1 of each.
const MAX_ADDON_ITEMS = 2;

// ─── QSR CARTS (tenants on the Cartlyft platform) ───
// ─── CUSTOMER: CART MARKETPLACE LISTING ───
// Reads the live, admin-managed carts from app state.
function CartListing({ carts, onSelect, onExit }) {
  return (
    <div style={{ minHeight: '100vh', background: brand.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: brand.navy, padding: '22px 20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CartlyftLogo size={34} variant="light" tagline={false} />
          <button onClick={onExit} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer' }}>← Back</button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
        <div style={{ marginBottom: 4, fontSize: 22, fontWeight: 800, color: brand.text }}>Order from a cart</div>
        <div style={{ fontSize: 13, color: brand.muted, marginBottom: 20 }}>Pick a QSR cart to see its menu and place an order</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {carts.map(c => (
            <button key={c.id} onClick={() => onSelect(c)}
              style={{ display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', width: '100%', background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 16, padding: 16, cursor: 'pointer' }}>
              <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 14, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, border: `2px solid ${c.accent}` }}>{c.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: brand.text }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: brand.muted }}>{c.tagline}</div>
                </div>
                <div style={{ fontSize: 12.5, color: brand.muted, margin: '3px 0 6px', lineHeight: 1.4 }}>{c.cuisine}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: brand.muted }}>
                  <span>📍 {c.location}</span>
                  <span>🕒 {c.timing}</span>
                </div>
              </div>
              <ArrowRight size={20} color={brand.navy} style={{ flexShrink: 0 }} />
            </button>
          ))}

          {/* Forward-looking placeholder so the directory reads as a platform */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'transparent', border: `1px dashed ${brand.border}`, borderRadius: 16, padding: 16, color: brand.muted }}>
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 14, background: brand.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `1px dashed ${brand.border}` }}>🛒</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: brand.text }}>More carts coming soon</div>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>New QSR carts onboarding to Cartlyft will appear here.</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', color: brand.muted, fontSize: 11 }}>Powered by Cartlyft QSR OS</div>
      </div>
    </div>
  );
}

function CustomerApp({ state, updateState, onExit }) {
  const [venue, setVenue] = useState(null);
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState('menu'); // menu | confirm | success
  const [orderToken, setOrderToken] = useState('');
  const [addonNote, setAddonNote] = useState('');

  const isAddon = (id) => ADDONS.some(a => a.id === id);

  // Functional updates so rapid taps always see the latest cart (no stale state).
  const addToCart = (id, name, price, type = null) => {
    const itemKey = `${id}-${type || 'std'}`;
    setCart(prev => {
      const existing = prev.find(c => c.key === itemKey);
      // Add-on rules: max 1 of each, at most MAX_ADDON_ITEMS different add-ons.
      if (isAddon(id)) {
        if (existing) { flashAddonNote('You can add only 1 of each add-on.'); return prev; }
        if (prev.filter(c => isAddon(c.id)).length >= MAX_ADDON_ITEMS) { flashAddonNote(`Add-ons are limited to ${MAX_ADDON_ITEMS} items.`); return prev; }
        return [...prev, { key: itemKey, id, name, price, type, qty: 1 }];
      }
      return existing
        ? prev.map(c => c.key === itemKey ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { key: itemKey, id, name, price, type, qty: 1 }];
    });
  };

  const addonNoteTimer = React.useRef();
  function flashAddonNote(msg) {
    setAddonNote(msg);
    clearTimeout(addonNoteTimer.current);
    addonNoteTimer.current = setTimeout(() => setAddonNote(''), 2500);
  }

  const removeFromCart = (key) => {
    setCart(prev => {
      const existing = prev.find(c => c.key === key);
      if (existing && existing.qty > 1) return prev.map(c => c.key === key ? { ...c, qty: c.qty - 1 } : c);
      return prev.filter(c => c.key !== key);
    });
  };

  const placeOrder = () => {
    if (cart.length === 0) return;
    const venueOrders = state.orders.filter(o => o.cartId === venue.id && o.date === TODAY);
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    const token = String(venueOrders.length + 1).padStart(3, '0');
    const order = {
      id: Date.now(),
      cartId: venue.id,
      token,
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      total,
      payment: 'pending',     // not paid until staff confirms at the cart
      staff: null,
      source: 'qr-order',
      outlet: venue.id,
      outletName: venue.name,
    };
    // Stock is NOT deducted here — only when staff marks the order paid,
    // so fake/abandoned QR orders never touch inventory or revenue.
    updateState({ orders: [...state.orders, order] });
    setOrderToken(token);
    setStep('success');
    setCart([]);
  };

  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);

  // Customer first picks a cart from the marketplace listing.
  if (!venue) return <CartListing carts={state.carts.filter(c => c.active)} onSelect={(v) => { setVenue(v); setStep('menu'); }} onExit={onExit} />;

  if (step === 'confirm') {
    return (
      <div style={{ minHeight: '100vh', background: colors.paper, fontFamily: 'system-ui, sans-serif', padding: 20 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => setStep('menu')} style={{ background: 'transparent', border: 'none', color: colors.muted, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>← Back to menu</button>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Review your order</div>

          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden', marginBottom: 16 }}>
            {cart.map(item => (
              <div key={item.key} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name} {item.type && <span style={{ color: colors.muted, fontWeight: 400 }}>({item.type})</span>}</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>{item.price === 0 ? 'Free' : `₹${item.price}`} × {item.qty}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => removeFromCart(item.key)} style={{ background: '#F5F4F0', border: 'none', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>−</button>
                  <div style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{item.qty}</div>
                  <button onClick={() => addToCart(item.id, item.name, item.price, item.type)} style={{ background: colors.ink, color: colors.primary, border: 'none', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>+</button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: colors.muted }}>Your cart is empty.</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '0 4px' }}>
            <div style={{ fontWeight: 700 }}>Total</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>₹{total}</div>
          </div>

          <Alert type="warn" title="Pay at the cart" message="Place your order to get a token number, then pay by cash or UPI at the cart. Your order is confirmed only after payment." />

          <button onClick={placeOrder} disabled={cart.length === 0}
            style={{ width: '100%', background: cart.length === 0 ? colors.border : colors.ink, color: colors.primary, border: 'none', padding: 18, borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}>
            Confirm Order & Get Token
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', background: colors.ink, color: colors.primary, padding: 40, borderRadius: 20, maxWidth: 360 }}>
          <CheckCircle2 size={60} style={{ margin: '0 auto 16px' }} color={colors.primary}/>
          <div style={{ fontSize: 16, opacity: 0.7, letterSpacing: 1 }}>YOUR ORDER TOKEN</div>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, margin: '8px 0' }}>#{orderToken}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24 }}>Show this number at the cart<br/>Ready in 5-8 minutes</div>
          <div style={{ borderTop: '1px solid rgba(255,214,10,0.3)', paddingTop: 20 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>💵 Pay at the cart — cash or UPI</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>UPI:</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>momowala@upi</div>
          </div>
          <button onClick={() => { setStep('menu'); setVenue(null); }} style={{ marginTop: 24, background: colors.primary, color: colors.ink, border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 100, fontFamily: 'system-ui, sans-serif' }}>
      {/* Customer header — printed-menu style */}
      <div style={{ background: colors.ink, padding: '16px 20px 22px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <button onClick={() => { setVenue(null); setCart([]); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>← All carts</button>
        </div>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: colors.primary, fontWeight: 900, fontSize: 32, letterSpacing: 3, lineHeight: 1 }}>MOMO WALA</div>
          <div style={{ color: '#fff', fontSize: 16, marginTop: 6, fontWeight: 600 }}>मोमो वाला</div>
          <div style={{ color: colors.primary, fontSize: 10, letterSpacing: 2.5, marginTop: 8, fontWeight: 700 }}>PURE DELIGHT ON EVERY PLATE</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {['🌱 100% Pure Veg', '🙏 Jain Friendly', '🛕 रामभक्त स्पेशल'].map(b => (
              <span key={b} style={{ border: '1px solid rgba(255,214,10,0.5)', color: colors.primary, fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 12 }}>{b}</span>
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 10 }}>Saketpuri, Ayodhya · Order in 30 seconds</div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {/* Bestsellers banner */}
        <div style={{ background: colors.ink, color: colors.primary, padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: 1 }}>
          ⭐ BESTSELLERS — KURKURE · PANEER AFGHANI · PANEER TANDOORI ⭐
        </div>

        <SectionHeader title="🥟 Momos" subtitle="Veg · Paneer · Corn Cheese" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {MENU_ITEMS.map(item => (
            <MenuItemRow key={item.id} item={item} onAdd={addToCart} />
          ))}
        </div>

        <SectionHeader title="🥤 Special Lassi" subtitle="Made with Greek yogurt" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {LASSI.map(item => (
            <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
          ))}
        </div>

        <SectionHeader title="➕ Perfect Add-ons" subtitle={`Free · pick any ${MAX_ADDON_ITEMS}`} />
        {addonNote && (
          <div style={{ background: '#FFF1E7', color: colors.accent, border: `1px solid ${colors.accent}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15}/> {addonNote}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {ADDONS.map(item => {
            const picked = cart.some(c => c.id === item.id);
            return (
              <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} picked={picked} onAdd={() => addToCart(item.id, item.name, item.price)} />
            );
          })}
        </div>

        {/* Contact footer — from the printed menu */}
        <div style={{ background: colors.ink, color: colors.primary, padding: 16, borderRadius: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, lineHeight: 1.9, marginBottom: 100 }}>
          📞 +91 63075 16898 · 📷 @momowalaindia<br/>
          🛵 Free delivery nearby on orders above ₹200<br/>
          <span style={{ color: colors.pilgrim, fontWeight: 700 }}>|| जय श्री राम ||</span>
        </div>
      </div>

      {/* Customer cart bar */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: colors.ink, color: colors.primary, padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
              {cart.map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                  <div>{item.qty}× {item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => removeFromCart(item.key)} style={{ background: 'rgba(255,214,10,0.2)', color: colors.primary, border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>−</button>
                    <div>₹{item.price * item.qty}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>TOTAL</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>₹{total}</div>
              </div>
              <button onClick={() => setStep('confirm')} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '14px 24px', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                Review Order <ArrowRight size={16}/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
