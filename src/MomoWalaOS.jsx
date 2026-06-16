import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken } from './lib/store';
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
    phone: '+91 63075 16898',
    instagram: '@momowalaindia',
    upiId: 'Q424348747@ybl',
    openTime: '16:00',
    closeTime: '23:00',
    closedManually: false,
    ownerName: 'Momo Wala Owner',
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

// ─── PER-CART MENUS ───
// Each cart owns its menu. Momo Wala is seeded from the constants above;
// carts onboarded later start empty and are filled via the menu editor
// (manually or by AI photo extraction).
// stockTypes: the freezer item types this cart tracks (configurable per cart).
const MOMO_STOCK_TYPES = [
  { key: 'veg', label: 'Veg Momo' },
  { key: 'paneer', label: 'Paneer Momo' },
  { key: 'corn', label: 'Corn Cheese Momo' },
];
const SEED_MENUS = {
  momowala: { items: MENU_ITEMS, lassi: LASSI, addons: ADDONS, stockTypes: MOMO_STOCK_TYPES },
};
const EMPTY_MENU = { items: [], lassi: [], addons: [], stockTypes: [] };
const menuFor = (state, cartId) => state.menus?.[cartId] || EMPTY_MENU;
const stockTypesFor = (state, cartId) => menuFor(state, cartId).stockTypes || [];

// Group momo items by category (Steamed, Kurkure…), preserving first-seen order,
// so the menu reads category → variants (Veg / Paneer / Corn) under it.
const groupByCat = (items) => {
  const order = [], map = {};
  (items || []).forEach(it => {
    const c = (it.cat || 'Other').trim() || 'Other';
    if (!map[c]) { map[c] = []; order.push(c); }
    map[c].push(it);
  });
  return order.map(c => ({ cat: c, items: map[c] }));
};

// Per-category band colour + Hindi name. Picked to feel like the dish:
// teal=steam/water, oranges/browns=fried & crispy, red=tandoor, olive=herby
// afghani malai, purple=mixed cocktail. Falls back to ink for unknown cats.
const CAT_STYLE = {
  Steamed:  { bg: '#0E7490', hi: 'स्टीम' },
  Kurkure:  { bg: '#C2410C', hi: 'कुरकुरे' },
  Fried:    { bg: '#B45309', hi: 'फ्राइड' },
  Tandoori: { bg: '#B91C1C', hi: 'तंदूरी' },
  Afghani:  { bg: '#4D7C0F', hi: 'अफ़ग़ानी' },
  Cocktail: { bg: '#7C3AED', hi: 'कॉकटेल' },
};
const HINDI_FONT = "'Noto Sans Devanagari','Hind','Mangal','Nirmala UI',system-ui,sans-serif";

// Distinct, dish-appropriate header band shown above each menu category, used
// by both the staff order screen and the customer menu.
function CategoryBand({ cat, count }) {
  const cs = CAT_STYLE[cat] || { bg: '#0A0A0A', hi: '' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: cs.bg, color: '#fff', borderRadius: 8, padding: '9px 13px', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>🥟 {cat}</span>
      {cs.hi && <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.92, fontFamily: HINDI_FONT }}>{cs.hi}</span>}
      {typeof count === 'number' && (
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, opacity: 0.95, background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 9px' }}>{count}</span>
      )}
    </div>
  );
}

// Whether a cart is currently open: respects a manual close, then the
// daily open/close window (HH:MM). No window set ⇒ treated as open.
function cartOpenState(cart) {
  if (!cart) return { open: false, reason: 'Cart unavailable' };
  if (cart.closedManually) return { open: false, reason: 'Closed by the owner right now' };
  const { openTime, closeTime } = cart;
  if (!openTime || !closeTime) return { open: true, reason: '' };
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const o = toMin(openTime), c = toMin(closeTime);
  // handle windows that cross midnight (e.g. 16:00–01:00)
  const open = o <= c ? (mins >= o && mins < c) : (mins >= o || mins < c);
  return { open, reason: open ? '' : `Open ${openTime}–${closeTime}` };
}

// Deduct an order's pieces from cart stock, looking item details up in the
// cart's own menu. Returns a new inventory object.
function deductInventory(inventory, items, menuItems = MENU_ITEMS) {
  const next = { ...inventory };
  items.forEach(item => {
    const menu = menuItems.find(m => m.id === item.id);
    if (menu && !next[menu.stockKey]) return; // item not tied to a tracked stock type
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

// Offline fallback only: highest token seen today for this cart + 1. The
// server RPC (nextOrderToken) is the source of truth when online.
const localNextToken = (orders, cartId) => {
  const nums = (orders || [])
    .filter(o => o.cartId === cartId && o.date === TODAY)
    .map(o => parseInt(o.token, 10) || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
};

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

  // ── menus, keyed by cartId ──
  let menus = storage.get('menus', null);
  if (!menus) menus = { ...SEED_MENUS };
  carts.forEach(c => { if (!menus[c.id]) menus[c.id] = { items: [], lassi: [], addons: [], stockTypes: [] }; });
  // back-fill stockTypes for menus saved before stock types existed
  Object.entries(menus).forEach(([id, m]) => {
    if (!m.stockTypes) m.stockTypes = id === 'momowala' ? MOMO_STOCK_TYPES : [];
  });
  // make sure every tracked stock type has an inventory bucket
  Object.entries(menus).forEach(([id, m]) => {
    if (!inventory[id]) inventory[id] = freshInventory();
    (m.stockTypes || []).forEach(st => {
      if (!inventory[id][st.key]) inventory[id][st.key] = { freezer: 0, cart: 0 };
    });
  });

  // tag any legacy event rows with the momowala cart
  const tag = (arr) => (arr || []).map(x => x.cartId ? x : { ...x, cartId: 'momowala' });

  return {
    platform,
    carts,
    inventory,
    menus,
    staff,
    orders: tag(storage.get('orders', [])),
    stockLogs: tag(storage.get('stockLogs', [])),
    cartLoadings: tag(storage.get('cartLoadings', [])),
    dayCloseLogs: tag(storage.get('dayCloseLogs', [])),
    wastageLogs: tag(storage.get('wastageLogs', [])),
    expenses: tag(storage.get('expenses', [])),
    staffOnDuty: storage.get('staffOnDuty', null),
  };
};

// Ensure every menu has stockTypes and every stock type has an inventory bucket.
// Runs on init AND after cloud merge (cloud blobs saved before stock types
// existed have no stockTypes — back-fill momowala's defaults).
function normalize(state) {
  const menus = { ...(state.menus || {}) };
  const inventory = { ...(state.inventory || {}) };
  Object.keys(menus).forEach(id => {
    const m = menus[id] || {};
    const stockTypes = m.stockTypes === undefined
      ? (id === 'momowala' ? MOMO_STOCK_TYPES : [])
      : m.stockTypes;
    menus[id] = { ...m, stockTypes };
    if (!inventory[id]) inventory[id] = freshInventory();
    stockTypes.forEach(st => { if (!inventory[id][st.key]) inventory[id][st.key] = { freezer: 0, cart: 0 }; });
  });
  return { ...state, menus, inventory };
}

// ═══════════════════════════════════════════════
// STORE CONTEXT + SESSION
// ═══════════════════════════════════════════════
const StoreContext = createContext(null);
const useStore = () => useContext(StoreContext);

const SESSION_MS = 8 * 60 * 60 * 1000; // stay logged in for an 8-hour shift
const liveSession = (s) => (s && (!s.expiresAt || s.expiresAt > Date.now())) ? s : null;

export default function App() {
  const [state, setState] = useState(() => normalize(getInitialState()));
  // session: null | { role, cartId?, name?, expiresAt } — persisted, 8h lifetime
  const [session, setSession] = useState(() => liveSession(storage.get('session', null)));

  // Hydrate from Supabase once on load (no-op when env keys are missing)
  useEffect(() => {
    loadCloudState().then(cloud => {
      if (cloud) setState(prev => normalize(mergeStates(prev, cloud)));
    });
  }, []);

  useEffect(() => {
    storage.set('platform', state.platform);
    storage.set('carts', state.carts);
    storage.set('inventoryByCart', state.inventory);
    storage.set('menus', state.menus);
    storage.set('staffV2', state.staff);
    storage.set('orders', state.orders);
    storage.set('stockLogs', state.stockLogs);
    storage.set('cartLoadings', state.cartLoadings);
    storage.set('dayCloseLogs', state.dayCloseLogs);
    storage.set('wastageLogs', state.wastageLogs);
    storage.set('expenses', state.expenses);
    syncToCloud(state);
  }, [state]);

  useEffect(() => { storage.set('session', session); }, [session]);

  // expire the session 8h after login (no idle logout in between)
  useEffect(() => {
    if (!session?.expiresAt) return;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { setSession(null); return; }
    const t = setTimeout(() => setSession(null), ms);
    return () => clearTimeout(t);
  }, [session]);

  const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));
  const login = (sess) => setSession({ ...sess, expiresAt: Date.now() + SESSION_MS });
  const logout = () => setSession(null);

  return (
    <StoreContext.Provider value={{ state, updateState, session, login, logout }}>
      <BrowserRouter>
        <Routes>
          {/* Public — customer */}
          <Route path="/" element={<MarketplaceRoute />} />
          <Route path="/c/:cartId" element={<CartMenuRoute />} />
          {/* Cart team — owner + staff share one login */}
          <Route path="/login" element={<TeamLogin />} />
          <Route path="/manage" element={<RequireRole role="owner"><OwnerRoute /></RequireRole>} />
          <Route path="/work" element={<RequireRole role="staff"><StaffRoute /></RequireRole>} />
          {/* Platform admin */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireRole role="admin"><AdminRoute /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreContext.Provider>
  );
}

// Route guards — bounce to the right login if the session doesn't match.
function RequireRole({ role, children }) {
  const { session } = useStore();
  if (!liveSession(session) || session.role !== role) {
    return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  }
  return children;
}

// ── Route wrappers: pull state/session/params, render the app screens ──
function MarketplaceRoute() {
  const { state } = useStore();
  const nav = useNavigate();
  return <CartListing carts={state.carts.filter(c => c.active)} onSelect={(c) => nav(`/c/${c.id}`)} />;
}

function CartMenuRoute() {
  const { state, updateState } = useStore();
  const { cartId } = useParams();
  const nav = useNavigate();
  const venue = state.carts.find(c => c.id === cartId && c.active);
  if (!venue) return <Navigate to="/" replace />;
  return <CartMenu state={state} updateState={updateState} venue={venue} onBack={() => nav('/')} onDone={() => nav('/')} />;
}

function AdminRoute() {
  const { state, updateState, logout } = useStore();
  const nav = useNavigate();
  return <AdminApp state={state} updateState={updateState} onExit={() => { logout(); nav('/admin/login'); }} />;
}

function OwnerRoute() {
  const { state, updateState, session, logout } = useStore();
  const nav = useNavigate();
  // cart could have been removed while logged in
  if (!state.carts.some(c => c.id === session.cartId)) { logout(); return <Navigate to="/login" replace />; }
  return <OwnerApp state={state} updateState={updateState} cartId={session.cartId} onExit={() => { logout(); nav('/login'); }} />;
}

function StaffRoute() {
  const { state, updateState, session, logout } = useStore();
  const nav = useNavigate();
  if (!state.staff.some(s => s.mobile && s.cartId === session.cartId && s.name === session.name && s.active)) {
    logout(); return <Navigate to="/login" replace />;
  }
  return <StaffApp state={state} updateState={updateState} cartId={session.cartId} staffName={session.name} onExit={() => { logout(); nav('/login'); }} />;
}

// ═══════════════════════════════════════════════
// LOGIN PAGES (routed) — cart team + platform admin
// ═══════════════════════════════════════════════
function LoginShell({ title, subtitle, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', background: brand.bg, fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: brand.navy, padding: '28px 24px' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
          <CartlyftLogo size={40} variant="light" />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: brand.text }}>{title}</div>
            {subtitle && <div style={{ color: brand.muted, fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

function LoginFields({ mobile, setMobile, mobileLocked, pw, setPw, pw2, setPw2, showConfirm, error, busy, onSubmit, cta }) {
  const inputStyle = { width: '100%', padding: '13px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 12, background: '#fff' };
  return (
    <div style={{ background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>MOBILE NUMBER</div>
      <input type="tel" inputMode="numeric" value={mobile} disabled={mobileLocked}
        onChange={e => setMobile && setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder="10-digit number"
        style={{ ...inputStyle, background: mobileLocked ? '#F5F4F0' : '#fff', fontWeight: 700, letterSpacing: 1 }} />
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>{showConfirm ? 'NEW PASSWORD' : 'PASSWORD'}</div>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !showConfirm && onSubmit()} placeholder="••••" style={inputStyle} />
      {showConfirm && (<>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>CONFIRM PASSWORD</div>
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit()} placeholder="••••" style={inputStyle} />
      </>)}
      {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><AlertCircle size={15} /> {error}</div>}
      <button onClick={onSubmit} disabled={busy} style={{ width: '100%', padding: 15, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{cta}</button>
    </div>
  );
}

// One login for the whole cart team — owner and staff. The role is detected
// from the number: an owner matches a cart's ownerMobile, a staff matches a
// staff record. Owners with no password yet set one here on first login.
function TeamLogin() {
  const { state, updateState, login } = useStore();
  const nav = useNavigate();
  const [mobile, setMobile] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const m = mobile.trim();
  const ownerCart = state.carts.find(c => c.ownerMobile === m && c.active);
  const ownerNeedsSetup = ownerCart && !ownerCart.ownerPasswordHash;

  const submit = async () => {
    setError('');
    if (!/^\d{10}$/.test(m)) { setError('Enter a 10-digit mobile number.'); return; }

    if (ownerCart) {
      if (ownerNeedsSetup) {
        if (pw.length < 4) { setError('Choose a password of at least 4 digits.'); return; }
        if (pw !== pw2) { setError('The two passwords do not match.'); return; }
        setBusy(true);
        const hash = await hashPassword(pw);
        updateState({ carts: state.carts.map(c => c.id === ownerCart.id ? { ...c, ownerPasswordHash: hash } : c) });
        login({ role: 'owner', cartId: ownerCart.id });
        nav('/manage'); return;
      }
      setBusy(true);
      const ok = (await hashPassword(pw)) === ownerCart.ownerPasswordHash;
      setBusy(false);
      if (!ok) { setError('Wrong password.'); return; }
      login({ role: 'owner', cartId: ownerCart.id });
      nav('/manage'); return;
    }

    const rec = state.staff.find(s => s.mobile === m && s.active);
    if (!rec) { setError('This number is not registered. Ask your cart owner or the admin.'); return; }
    if (!rec.passwordHash) { setError('Your password has not been set yet. Ask your owner.'); return; }
    setBusy(true);
    const ok = (await hashPassword(pw)) === rec.passwordHash;
    setBusy(false);
    if (!ok) { setError('Wrong password.'); return; }
    login({ role: 'staff', cartId: rec.cartId, name: rec.name });
    nav('/work');
  };

  return (
    <LoginShell
      title={ownerNeedsSetup ? 'Set your owner password' : 'Cart team login'}
      subtitle={ownerNeedsSetup ? `First time — set a password for ${m}` : 'Owners and staff sign in here'}
      footer={
        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <Link to="/" style={{ color: brand.tealDark, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Browse carts as a customer</Link>
          <div style={{ marginTop: 12 }}><Link to="/admin/login" style={{ color: brand.muted, fontSize: 12, textDecoration: 'none' }}>Cartlyft platform admin →</Link></div>
        </div>
      }>
      <LoginFields mobile={mobile} setMobile={setMobile} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2}
        showConfirm={ownerNeedsSetup} error={error} busy={busy} onSubmit={submit}
        cta={ownerNeedsSetup ? 'Set Password & Enter' : 'Login'} />
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

  const adminMobile = state.platform.adminMobile;
  const needsSetup = !state.platform.adminPasswordHash;

  const submit = async () => {
    setError('');
    if (needsSetup) {
      if (pw.length < 4) { setError('Choose a password of at least 4 digits.'); return; }
      if (pw !== pw2) { setError('The two passwords do not match.'); return; }
      setBusy(true);
      const hash = await hashPassword(pw);
      updateState({ platform: { ...state.platform, adminPasswordHash: hash } });
      login({ role: 'admin' }); nav('/admin'); return;
    }
    setBusy(true);
    const ok = (await hashPassword(pw)) === state.platform.adminPasswordHash;
    setBusy(false);
    if (!ok) { setError('Wrong password.'); return; }
    login({ role: 'admin' }); nav('/admin');
  };

  return (
    <LoginShell
      title={needsSetup ? 'Set admin password' : 'Cartlyft admin'}
      subtitle={`Platform super-admin · ${adminMobile}`}
      footer={<div style={{ marginTop: 22, textAlign: 'center' }}><Link to="/login" style={{ color: brand.muted, fontSize: 13, textDecoration: 'none' }}>← Cart team login</Link></div>}>
      <LoginFields mobile={adminMobile} mobileLocked pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2}
        showConfirm={needsSetup} error={error} busy={busy} onSubmit={submit}
        cta={needsSetup ? 'Set Password & Enter' : 'Login'} />
    </LoginShell>
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
  const [menuCartId, setMenuCartId] = useState(null);

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
    const ownerPasswordHash = form.ownerPassword ? await hashPassword(form.ownerPassword) : null;
    const cart = {
      id, name: form.name.trim(), tagline: form.tagline.trim(), cuisine: form.cuisine.trim(),
      location: form.location.trim(), timing: form.timing.trim(), emoji: form.emoji || '🛒',
      accent: form.accent || brand.teal, ownerName: form.ownerName.trim(), ownerMobile: form.ownerMobile,
      ownerPasswordHash, active: true, createdAt: TODAY,
    };
    updateState({ carts: [...state.carts, cart], inventory: { ...state.inventory, [id]: freshInventory() }, menus: { ...state.menus, [id]: { items: [], lassi: [], addons: [] } } });
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
                <div style={{ fontSize: 12, color: colors.muted }}>{c.location}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>Owner: {c.ownerName ? `${c.ownerName} · ` : ''}{c.ownerMobile}</div>
                <div style={{ fontSize: 11, color: c.ownerPasswordHash ? colors.green : colors.accent, fontWeight: 600, marginTop: 2 }}>{c.ownerPasswordHash ? 'Owner password set' : 'Owner sets password on first login'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setMenuCartId(c.id)} style={{ ...adminBtn, color: brand.tealDark, borderColor: brand.teal }}>📋 Set up menu</button>
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
  const [f, setF] = useState({ name: '', tagline: '', cuisine: '', location: '', timing: 'Daily 4 PM – 11 PM', emoji: '🛒', accent: brand.teal, ownerName: '', ownerMobile: '', ownerPassword: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

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
// MENU EDITOR (admin per-cart + owner) — manual + AI photo extract
// ═══════════════════════════════════════════════
const newId = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// Downscale a photo to keep the upload under Vercel's request limit.
async function fileToBase64(file, maxDim = 1600, quality = 0.8) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

// A menu item's identity for duplicate detection: name (case-insensitive),
// plus stock type for momos (Veg Steam vs Paneer Steam aren't dupes).
const menuKeyOf = (section, it) => {
  const n = (it.name || '').toLowerCase().trim();
  return section === 'items' ? `${n}|${it.type || ''}` : n;
};
// ids of every row whose key appears more than once in the list
const duplicateIds = (section, list) => {
  const counts = {};
  list.forEach(it => { const k = menuKeyOf(section, it); counts[k] = (counts[k] || 0) + 1; });
  return new Set(list.filter(it => counts[menuKeyOf(section, it)] > 1).map(it => it.id));
};

function MenuEditor({ state, updateState, cartId, cart }) {
  const menu = menuFor(state, cartId);
  const items = menu.items || [], lassi = menu.lassi || [], addons = menu.addons || [];
  const [edit, setEdit] = useState(null);   // { section, item } — null when closed
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const fileRef = React.useRef();

  const dupItems = duplicateIds('items', items), dupLassi = duplicateIds('lassi', lassi), dupAddons = duplicateIds('addons', addons);

  const setMenu = (next) => updateState({ menus: { ...state.menus, [cartId]: next } });
  const dedupe = (section) => {
    const list = menu[section] || [];
    const seen = new Set(), kept = [];
    list.forEach(it => { const k = menuKeyOf(section, it); if (!seen.has(k)) { seen.add(k); kept.push(it); } });
    setMenu({ ...menu, [section]: kept });
  };
  const saveItem = (section, item) => {
    const list = menu[section] || [];
    const exists = item.id && list.some(x => x.id === item.id);
    const nextList = exists ? list.map(x => x.id === item.id ? item : x) : [...list, { ...item, id: item.id || newId(section[0]) }];
    setMenu({ ...menu, [section]: nextList });
    setEdit(null);
  };
  const removeItem = (section, id) => { if (confirm('Remove this item?')) setMenu({ ...menu, [section]: (menu[section] || []).filter(x => x.id !== id) }); };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAiNote(''); setBusy(true);
    try {
      const image = await fileToBase64(file);
      const res = await fetch('/api/extract-menu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      const tag = (arr, p) => (arr || []).map(x => ({ ...x, id: newId(p) }));
      const extracted = {
        items: tag(data.items, 'm'),
        lassi: tag(data.lassi, 'l'),
        addons: tag(data.addons, 'a'),
      };
      const count = extracted.items.length + extracted.lassi.length + extracted.addons.length;
      if (count === 0) { setAiNote('No menu items detected in that photo. Try a clearer shot.'); return; }
      const hasExisting = items.length + lassi.length + addons.length > 0;
      const merge = hasExisting && confirm(`Found ${count} items. OK = add to the current menu (skipping any already present), Cancel = replace it.`);
      if (merge) {
        // only add items whose name (+type for momos) isn't already on the menu — avoids double-scan duplicates
        const addUnique = (section, cur, add) => {
          const have = new Set(cur.map(it => menuKeyOf(section, it)));
          return [...cur, ...add.filter(it => !have.has(menuKeyOf(section, it)))];
        };
        const next = {
          items: addUnique('items', items, extracted.items),
          lassi: addUnique('lassi', lassi, extracted.lassi),
          addons: addUnique('addons', addons, extracted.addons),
        };
        const added = (next.items.length - items.length) + (next.lassi.length - lassi.length) + (next.addons.length - addons.length);
        setMenu({ ...menu, ...next });
        setAiNote(`Added ${added} new item${added !== 1 ? 's' : ''}, skipped ${count - added} already on the menu. Review below.`);
      } else {
        setMenu({ ...menu, ...extracted });
        setAiNote(`Imported ${count} items — review and edit below, then they're saved automatically.`);
      }
    } catch (err) {
      setAiNote(`Couldn't read the menu: ${err.message}. You can still add items manually.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Menu Setup" subtitle={cart?.name} />

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhoto} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        style={{ width: '100%', background: brand.teal, color: '#fff', padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
        {busy ? '📷 Reading menu…' : '📷 Scan menu photo (AI auto-fill)'}
      </button>
      {aiNote && <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: brand.text, marginBottom: 16 }}>{aiNote}</div>}

      <MenuSection title="🥟 Momos" hint="Half / full price + pieces" grouped
        rows={items.map(i => ({ id: i.id, dup: dupItems.has(i.id), group: (i.cat || 'Other'), primary: `${i.name}${i.star ? ' ⭐' : ''}`, secondary: `${i.type} · ₹${i.half}/${i.full} · ${i.pcsHalf}/${i.pcsFull}pc` }))}
        dupCount={dupItems.size} onDedupe={() => dedupe('items')}
        onAdd={() => setEdit({ section: 'items', item: { type: 'veg', cat: 'Steamed', pcsHalf: 5, pcsFull: 10 } })}
        onEdit={(id) => setEdit({ section: 'items', item: items.find(x => x.id === id) })}
        onRemove={(id) => removeItem('items', id)} />

      <MenuSection title="🥤 Drinks" hint="Single price"
        rows={lassi.map(i => ({ id: i.id, dup: dupLassi.has(i.id), primary: i.name, secondary: `₹${i.price}` }))}
        dupCount={dupLassi.size} onDedupe={() => dedupe('lassi')}
        onAdd={() => setEdit({ section: 'lassi', item: { price: 0 } })}
        onEdit={(id) => setEdit({ section: 'lassi', item: lassi.find(x => x.id === id) })}
        onRemove={(id) => removeItem('lassi', id)} />

      <MenuSection title="➕ Add-ons" hint="₹0 = free"
        rows={addons.map(i => ({ id: i.id, dup: dupAddons.has(i.id), primary: i.name, secondary: i.price === 0 ? 'Free' : `₹${i.price}` }))}
        dupCount={dupAddons.size} onDedupe={() => dedupe('addons')}
        onAdd={() => setEdit({ section: 'addons', item: { price: 0 } })}
        onEdit={(id) => setEdit({ section: 'addons', item: addons.find(x => x.id === id) })}
        onRemove={(id) => removeItem('addons', id)} />

      {edit?.section === 'items' && <MomoItemModal initial={edit.item} stockTypes={menu.stockTypes || []} onSave={(it) => saveItem('items', it)} onClose={() => setEdit(null)} />}
      {edit && edit.section !== 'items' && <SimpleItemModal initial={edit.item} section={edit.section} onSave={(it) => saveItem(edit.section, it)} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MenuSection({ title, hint, rows, grouped = false, dupCount = 0, onDedupe, onAdd, onEdit, onRemove }) {
  const rowEl = (r) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, background: r.dup ? '#FFF7E0' : '#fff' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.primary}
          {r.dup && <span style={{ fontSize: 10, fontWeight: 800, color: '#8A6D00', background: '#FCEAB0', borderRadius: 6, padding: '2px 6px' }}>DUPLICATE</span>}
        </div>
        <div style={{ fontSize: 12, color: colors.muted }}>{r.secondary}</div>
      </div>
      <button onClick={() => onEdit(r.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 7, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Edit3 size={14}/></button>
      <button onClick={() => onRemove(r.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 7, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color={colors.red}/></button>
    </div>
  );
  const groups = grouped ? groupByCat(rows.map(r => ({ ...r, cat: r.group }))) : null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div><div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div><div style={{ fontSize: 11, color: colors.muted }}>{hint}</div></div>
        <button onClick={onAdd} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14}/> Add</button>
      </div>
      {dupCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF7E0', border: `1px solid #E0B100`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: '#8A6D00', fontWeight: 600, marginBottom: 8 }}>
          <AlertTriangle size={15} />
          <span style={{ flex: 1 }}>{dupCount} duplicate row{dupCount > 1 ? 's' : ''} found (highlighted below).</span>
          <button onClick={onDedupe} style={{ background: '#fff', border: `1px solid #E0B100`, color: '#8A6D00', padding: '5px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Remove duplicates</button>
        </div>
      )}
      {grouped && rows.length > 0 ? (
        groups.map(g => (
          <div key={g.cat} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 2px 6px' }}>{g.cat}</div>
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>{g.items.map(rowEl)}</div>
          </div>
        ))
      ) : (
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {rows.map(rowEl)}
        {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>None yet</div>}
      </div>
      )}
    </div>
  );
}

const editLabel = { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 };
const editInput = { width: '100%', padding: '11px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 12 };
function EditModalShell({ title, onClose, onSave, error, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, color: brand.navy }}>{title}</div>
        {children}
        {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><AlertCircle size={15}/> {error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>Cancel</button>
          <button onClick={onSave} style={{ flex: 2, padding: 14, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function MomoItemModal({ initial, stockTypes = [], onSave, onClose }) {
  const [f, setF] = useState({ cat: 'Steamed', type: stockTypes[0]?.key || '', pcsHalf: 5, pcsFull: 10, half: '', full: '', name: '', star: false, ...initial });
  const [error, setError] = useState('');
  const num = (v) => parseInt(v) || 0;
  const submit = () => {
    if (!f.name?.trim()) { setError('Enter an item name.'); return; }
    if (!num(f.half) && !num(f.full)) { setError('Enter at least one price.'); return; }
    onSave({ ...f, name: f.name.trim(), half: num(f.half), full: num(f.full), pcsHalf: num(f.pcsHalf), pcsFull: num(f.pcsFull), stockKey: f.type || null });
  };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <EditModalShell title={initial?.id ? 'Edit momo' : 'Add momo'} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>NAME</div>
      <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Veg Steam" style={editInput} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>CATEGORY</div><input value={f.cat} onChange={e => set('cat', e.target.value)} placeholder="Steamed" style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>STOCK TYPE</div>
          <select value={f.type} onChange={e => set('type', e.target.value)} style={editInput}>
            {stockTypes.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
            <option value="">No stock tracking</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>HALF ₹</div><input type="number" value={f.half} onChange={e => set('half', e.target.value)} style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>HALF PCS</div><input type="number" value={f.pcsHalf} onChange={e => set('pcsHalf', e.target.value)} style={editInput} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>FULL ₹</div><input type="number" value={f.full} onChange={e => set('full', e.target.value)} style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>FULL PCS</div><input type="number" value={f.pcsFull} onChange={e => set('pcsFull', e.target.value)} style={editInput} /></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.star} onChange={e => set('star', e.target.checked)} /> Mark as bestseller ⭐
      </label>
    </EditModalShell>
  );
}

function SimpleItemModal({ initial, section, onSave, onClose }) {
  const [f, setF] = useState({ name: '', price: 0, ...initial });
  const [error, setError] = useState('');
  const submit = () => {
    if (!f.name?.trim()) { setError('Enter a name.'); return; }
    onSave({ ...f, name: f.name.trim(), price: parseInt(f.price) || 0 });
  };
  return (
    <EditModalShell title={`${initial?.id ? 'Edit' : 'Add'} ${section === 'addons' ? 'add-on' : 'drink'}`} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>NAME</div>
      <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder={section === 'addons' ? 'e.g. Extra Cheese' : 'e.g. Mango Lassi'} style={editInput} />
      <div style={editLabel}>PRICE ₹ {section === 'addons' && '(0 = free)'}</div>
      <input type="number" value={f.price} onChange={e => setF(p => ({ ...p, price: e.target.value }))} style={editInput} />
    </EditModalShell>
  );
}

// Owner edits their cart's display + contact details (same fields as onboarding,
// minus login credentials, which stay admin-managed).
function CartProfileModal({ cart, onSave, onClose }) {
  const [f, setF] = useState({
    name: cart?.name || '', emoji: cart?.emoji || '🛒', logo: cart?.logo || '', tagline: cart?.tagline || '',
    cuisine: cart?.cuisine || '', location: cart?.location || '', timing: cart?.timing || '',
    phone: cart?.phone || '', instagram: cart?.instagram || '', accent: cart?.accent || brand.teal,
    upiId: cart?.upiId || '', upiQr: cart?.upiQr || '',
    openTime: cart?.openTime || '', closeTime: cart?.closeTime || '',
  });
  const [error, setError] = useState('');
  const logoRef = React.useRef(), qrRef = React.useRef();
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const setFile = (k, max) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { const b64 = await fileToBase64(file, max, 0.8); setF(p => ({ ...p, [k]: `data:image/jpeg;base64,${b64}` })); }
    catch { setError('Could not read that image.'); }
  };
  const submit = () => {
    if (!f.name.trim()) { setError('Cart name is required.'); return; }
    if (!f.cuisine.trim()) { setError('Add a short food description.'); return; }
    onSave({
      name: f.name.trim(), emoji: f.emoji.trim() || '🛒', logo: f.logo || null, tagline: f.tagline.trim(),
      cuisine: f.cuisine.trim(), location: f.location.trim(), timing: f.timing.trim(),
      phone: f.phone.trim(), instagram: f.instagram.trim(), accent: f.accent,
      upiId: f.upiId.trim(), upiQr: f.upiQr || null,
      openTime: f.openTime || null, closeTime: f.closeTime || null,
    });
  };
  return (
    <EditModalShell title="Edit cart details" onClose={onClose} onSave={submit} error={error}>
      {/* Logo / icon */}
      <div style={editLabel}>CART LOGO</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `2px solid ${f.accent}`, overflow: 'hidden', flexShrink: 0 }}>
          {f.logo ? <img src={f.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.emoji}
        </div>
        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={setFile('logo', 400)} />
        <button onClick={() => logoRef.current?.click()} style={{ ...adminBtn, color: brand.navy }}>{f.logo ? 'Change' : 'Upload'} image</button>
        {f.logo && <button onClick={() => setF(p => ({ ...p, logo: '' }))} style={{ ...adminBtn, color: colors.red }}>Remove</button>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 86 }}><div style={editLabel}>EMOJI</div><input value={f.emoji} onChange={set('emoji')} placeholder="🛒" style={{ ...editInput, textAlign: 'center', fontSize: 22 }} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>CART NAME</div><input value={f.name} onChange={set('name')} style={editInput} /></div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Uploaded logo is shown when present; otherwise the emoji is used.</div>

      <div style={editLabel}>TAGLINE (optional)</div>
      <input value={f.tagline} onChange={set('tagline')} placeholder="मोमो वाला" style={editInput} />
      <div style={editLabel}>FOOD DESCRIPTION</div>
      <input value={f.cuisine} onChange={set('cuisine')} placeholder="Steamed, Kurkure & Tandoori momos…" style={editInput} />
      <div style={editLabel}>LOCATION / ADDRESS</div>
      <input value={f.location} onChange={set('location')} placeholder="Area, city" style={editInput} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}><div style={editLabel}>TIMING (display)</div><input value={f.timing} onChange={set('timing')} placeholder="Daily 4 PM – 11 PM" style={editInput} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>OPENS</div><input type="time" value={f.openTime} onChange={set('openTime')} style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>CLOSES</div><input type="time" value={f.closeTime} onChange={set('closeTime')} style={editInput} /></div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Outside these hours customers see the cart as closed and can't order.</div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>CONTACT PHONE</div><input type="tel" value={f.phone} onChange={set('phone')} placeholder="+91 …" style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>INSTAGRAM</div><input value={f.instagram} onChange={set('instagram')} placeholder="@handle" style={editInput} /></div>
      </div>

      <div style={editLabel}>UPI ID (for online payment)</div>
      <input value={f.upiId} onChange={set('upiId')} placeholder="name@bank" style={editInput} />
      <div style={editLabel}>UPI QR CODE (optional)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {f.upiQr && <img src={f.upiQr} alt="UPI QR" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain', background: '#fff', border: `1px solid ${colors.border}` }} />}
        <input ref={qrRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={setFile('upiQr', 600)} />
        <button onClick={() => qrRef.current?.click()} style={{ ...adminBtn, color: brand.navy }}>{f.upiQr ? 'Change' : 'Upload'} QR</button>
        {f.upiQr && <button onClick={() => setF(p => ({ ...p, upiQr: '' }))} style={{ ...adminBtn, color: colors.red }}>Remove</button>}
      </div>

      <div style={editLabel}>BRAND COLOUR</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input type="color" value={f.accent} onChange={set('accent')} style={{ width: 48, height: 40, border: `1px solid ${colors.border}`, borderRadius: 8, cursor: 'pointer', background: '#fff' }} />
        <span style={{ fontSize: 13, color: colors.muted }}>{f.accent}</span>
      </div>
    </EditModalShell>
  );
}

// Small reusable cart icon — uploaded logo if present, else emoji.
function CartIcon({ cart, size = 44, radius = 12 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, border: `2px solid ${cart?.accent || brand.teal}`, overflow: 'hidden', flexShrink: 0 }}>
      {cart?.logo ? <img src={cart.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (cart?.emoji || '🛒')}
    </div>
  );
}

// ═══════════════════════════════════════════════
// OWNER APP
// ═══════════════════════════════════════════════
function OwnerApp({ state, updateState, onExit, cartId }) {
  const [tab, setTab] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const cart = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);
  const saveProfile = (fields) => {
    updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, ...fields } : c) });
    setShowProfile(false);
  };
  const toggleOpen = () => updateState({ carts: state.carts.map(c => c.id === cartId ? { ...c, closedManually: !c.closedManually } : c) });

  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.payment === 'pending' ? 0 : o.total), 0);
  const cashRevenue = todayOrders.filter(o => o.payment === 'cash').reduce((sum, o) => sum + o.total, 0);
  const upiRevenue = todayOrders.filter(o => o.payment === 'upi').reduce((sum, o) => sum + o.total, 0);
  const piecesSold = todayOrders.filter(o => o.payment !== 'pending').reduce((sum, o) => {
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
        {tab === 'dashboard' && <Dashboard inv={inv} cart={cart} onEditProfile={() => setShowProfile(true)} onToggleOpen={toggleOpen} stockTypes={menu.stockTypes || []} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} todayOrders={todayOrders} />}
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
function Dashboard({ inv, cart, onEditProfile, onToggleOpen, stockTypes = [], todayRevenue, cashRevenue, upiRevenue, piecesSold, todayOrders }) {
  const expectedRevenue = piecesSold * 12; // avg ₹12/piece
  const variance = todayRevenue - expectedRevenue;
  const pendingCount = todayOrders.filter(o => o.payment === 'pending').length;
  const lowTypes = stockTypes.filter(st => (inv[st.key]?.freezer ?? 0) < 100);
  const openState = cartOpenState(cart);

  return (
    <div>
      {/* Cart profile bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <CartIcon cart={cart} size={42} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{cart?.name}</div>
          <div style={{ fontSize: 11.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {cart?.location || '—'} · 🕒 {cart?.timing || '—'}</div>
        </div>
        <button onClick={onEditProfile} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Edit3 size={13}/> Edit</button>
      </div>

      {/* Open / closed control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: openState.open ? '#E7F5E7' : '#FFE7E7', border: `1px solid ${openState.open ? colors.green : colors.red}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: openState.open ? colors.green : colors.red }}>{openState.open ? '🟢 Cart is OPEN' : '🔴 Cart is CLOSED'}</div>
          <div style={{ fontSize: 11.5, color: colors.muted }}>{cart?.closedManually ? 'Closed manually — customers can’t order' : openState.open ? 'Taking online orders' : openState.reason}</div>
        </div>
        <button onClick={onToggleOpen} style={{ background: cart?.closedManually ? colors.green : colors.red, color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {cart?.closedManually ? 'Re-open' : 'Close now'}
        </button>
      </div>

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
      {lowTypes.length > 0 && (
        <Alert type="danger" title="Low stock alert" message={`${lowTypes.map(st => st.label).join(' & ')} running low. Order before tomorrow.`} />
      )}

      {stockTypes.length > 0 && <>
      <SectionHeader title="Live Inventory" />
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        {stockTypes.map(st => {
          const b = inv[st.key] || { freezer: 0, cart: 0 };
          return (
            <React.Fragment key={st.key}>
              <StockRow label={`${st.label} · Freezer`} value={b.freezer} unit="pcs" low={b.freezer < 100} />
              <StockRow label={`${st.label} · On Cart`} value={b.cart} unit="pcs" />
            </React.Fragment>
          );
        })}
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
function InventoryView({ state, updateState, cartId, inv, stockTypes = [] }) {
  const [showAddStock, setShowAddStock] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [adjusting, setAdjusting] = useState(null); // { key, label } | null
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });
  const cartStockLogs = state.stockLogs.filter(l => l.cartId === cartId);
  const cartLoadLogs = state.cartLoadings.filter(l => l.cartId === cartId);
  const labelFor = (key) => stockTypes.find(st => st.key === key)?.label || key;

  const setStockTypes = (next) => {
    const menu = menuFor(state, cartId);
    const newInv = { ...inv };
    next.forEach(st => { if (!newInv[st.key]) newInv[st.key] = { freezer: 0, cart: 0 }; });
    updateState({
      menus: { ...state.menus, [cartId]: { ...menu, stockTypes: next } },
      inventory: { ...state.inventory, [cartId]: newInv },
    });
  };

  const addStock = (type, qty) => {
    const newInv = { ...inv };
    newInv[type] = { ...newInv[type], freezer: newInv[type].freezer + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'STOCK_IN', item: type, qty, note: `Added ${qty} pieces of ${labelFor(type)}`
    };
    setCartInv(newInv, { stockLogs: [...state.stockLogs, log] });
    setShowAddStock(false);
  };

  // Adjust freezer up or down (wastage, spoilage, recount correction).
  const adjustStock = (type, delta, reason) => {
    const newInv = { ...inv };
    const cur = newInv[type]?.freezer ?? 0;
    const next = Math.max(0, cur + delta);
    const applied = next - cur; // actual change after clamping at 0
    newInv[type] = { ...newInv[type], freezer: next };
    const verb = applied >= 0 ? 'Added' : 'Removed';
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'STOCK_ADJUST', item: type, qty: applied,
      note: `${verb} ${Math.abs(applied)} ${labelFor(type)} in freezer — ${reason}`
    };
    setCartInv(newInv, { stockLogs: [...state.stockLogs, log] });
    setAdjusting(null);
  };

  const loadToCart = (type, qty) => {
    const newInv = { ...inv };
    if (newInv[type].freezer < qty) { alert('Not enough stock in freezer!'); return; }
    newInv[type] = { freezer: newInv[type].freezer - qty, cart: newInv[type].cart + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'CART_LOAD', item: type, qty, note: `Moved ${qty} ${labelFor(type)} pieces to cart`
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

      {showAddStock && <StockInModal stockTypes={stockTypes} onAdd={addStock} onClose={() => setShowAddStock(false)} />}
      {showTypes && <StockTypesModal stockTypes={stockTypes} onSave={setStockTypes} onClose={() => setShowTypes(false)} />}
      {adjusting && <AdjustStockModal label={adjusting.label} current={inv[adjusting.key]?.freezer ?? 0} onApply={(delta, reason) => adjustStock(adjusting.key, delta, reason)} onClose={() => setAdjusting(null)} />}

      {/* Freezer Status */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>FREEZER (KITCHEN)</div>
          <button onClick={() => setShowTypes(true)} style={{ ...adminBtn, color: brand.navy }}>Edit stock types</button>
        </div>
        {stockTypes.map(st => {
          const b = inv[st.key] || { freezer: 0, cart: 0 };
          return <FreezerItem key={st.key} typeKey={st.key} label={st.label} stock={b.freezer} cart={b.cart} onLoad={loadToCart} onAdjust={() => setAdjusting({ key: st.key, label: st.label })} />;
        })}
        {stockTypes.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No stock types yet. Tap "Edit stock types" to add the items this cart freezes.</div>}
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

function FreezerItem({ typeKey, label, stock, cart, onLoad, onAdjust }) {
  const [loadQty, setLoadQty] = useState(50);
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: colors.muted }}>Freezer: </span><strong>{stock}</strong> · <span style={{ color: colors.muted }}>Cart: </span><strong>{cart}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" value={loadQty} onChange={e => setLoadQty(parseInt(e.target.value) || 0)} style={{ width: 70, padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13 }} />
        <button onClick={() => onLoad(typeKey, loadQty)} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}>
          Load to Cart
        </button>
        <button onClick={onAdjust} style={{ background: '#fff', color: brand.navy, border: `1px solid ${colors.border}`, padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          Adjust
        </button>
      </div>
    </div>
  );
}

// Reduce or correct freezer stock (wastage, spoilage, recount).
const ADJUST_REASONS = ['Wastage', 'Spoilage', 'Recount correction', 'Other'];
function AdjustStockModal({ label, current, onApply, onClose }) {
  const [dir, setDir] = useState('remove'); // remove | add
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [error, setError] = useState('');
  const n = parseInt(qty) || 0;
  const submit = () => {
    if (n <= 0) { setError('Enter a quantity.'); return; }
    onApply(dir === 'remove' ? -n : n, reason);
  };
  const after = Math.max(0, current + (dir === 'remove' ? -n : n));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: brand.navy }}>Adjust {label}</div>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>Freezer now: <strong>{current}</strong> pcs → after: <strong>{after}</strong> pcs</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['remove', 'Remove'], ['add', 'Add']].map(([k, lab]) => (
            <button key={k} onClick={() => setDir(k)} style={{ flex: 1, padding: 12, border: `2px solid ${dir === k ? colors.ink : colors.border}`, background: dir === k ? colors.ink : '#fff', color: dir === k ? colors.primary : colors.ink, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{lab}</button>
          ))}
        </div>

        <div style={editLabel}>QUANTITY (PIECES)</div>
        <input type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" style={editInput} />

        <div style={editLabel}>REASON</div>
        <select value={reason} onChange={e => setReason(e.target.value)} style={editInput}>
          {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><AlertCircle size={15}/> {error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: 14, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// Add / rename / remove the freezer stock types this cart tracks.
function StockTypesModal({ stockTypes, onSave, onClose }) {
  const [rows, setRows] = useState(stockTypes.map(st => ({ ...st })));
  const [name, setName] = useState('');
  const add = () => {
    const label = name.trim();
    if (!label) return;
    const key = slugify(label) || `s${Date.now().toString(36)}`;
    if (rows.some(r => r.key === key)) { setName(''); return; }
    setRows([...rows, { key, label }]);
    setName('');
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: brand.navy }}>Stock types</div>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>The freezer items this cart tracks (e.g. Veg Momo, Paneer Momo). Menu items link to these for stock counting.</div>
        {rows.map((r, i) => (
          <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input value={r.label} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...editInput, marginBottom: 0 }} />
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 9, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={15} color={colors.red}/></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="New stock type, e.g. Chicken Momo" style={{ ...editInput, marginBottom: 0 }} />
          <button onClick={add} style={{ ...adminBtn, color: brand.navy }}><Plus size={16}/></button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>Cancel</button>
          <button onClick={() => { onSave(rows.filter(r => r.label.trim()).map(r => ({ key: r.key, label: r.label.trim() }))); onClose(); }} style={{ flex: 2, padding: 14, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function StockInModal({ stockTypes = [], onAdd, onClose }) {
  const [type, setType] = useState(stockTypes[0]?.key || '');
  const [qty, setQty] = useState(500);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>New Stock Delivery</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>ITEM TYPE</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stockTypes.map(st => (
              <button key={st.key} onClick={() => setType(st.key)} style={{ flex: '1 1 30%', padding: 12, border: `2px solid ${type === st.key ? colors.ink : colors.border}`, background: type === st.key ? colors.ink : '#fff', color: type === st.key ? colors.primary : colors.ink, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{st.label}</button>
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
function Reconciliation({ state, updateState, cartId, inv, stockTypes = [], todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remaining, setRemaining] = useState({}); // { [stockKey]: '' }
  const [closed, setClosed] = useState(false);

  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - upiRevenue : null;
  // Stock is deducted as orders settle, so expected remaining = current cart count.
  const stockRows = stockTypes.map(st => {
    const expected = inv[st.key]?.cart ?? 0;
    const val = remaining[st.key] ?? '';
    const diff = val !== '' ? parseInt(val) - expected : null;
    return { ...st, expected, val, diff };
  });
  const allStockFilled = stockRows.every(r => r.val !== '');

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
      stock: stockRows.map(r => ({ key: r.key, label: r.label, expected: r.expected, actual: parseInt(r.val) || 0, diff: r.diff || 0 })),
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

      {/* Stock reconciliation — one block per stock type */}
      {stockRows.map(r => (
        <ReconcileBlock
          key={r.key}
          title={`🥟 ${r.label}`}
          systemValue={`${r.expected} pcs expected`}
          label="Actual pieces remaining on cart"
          value={r.val}
          onChange={(v) => setRemaining(prev => ({ ...prev, [r.key]: v }))}
          diff={r.diff}
          unit="pcs"
        />
      ))}

      {/* Close day button */}
      <button onClick={closeDay}
        disabled={physicalCash === '' || phonePeAmount === '' || !allStockFilled}
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
const EXPENSE_CATEGORIES = ['Frozen momo stock', 'Vegetables / paneer', 'Oil & consumables', 'Gas / fuel', 'Packaging', 'Rent / pitch', 'Other'];
// inclusive date-string range for a period, computed from real settled orders.
function periodStart(period) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (period === 'today') return d;
  if (period === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; } // Monday
  if (period === 'month') { d.setDate(1); return d; }
  return new Date(0);
}
const dstr = (d) => d.toISOString().split('T')[0];

function Reports({ state, updateState, cartId }) {
  const [period, setPeriod] = useState('today');
  const [showExpense, setShowExpense] = useState(false);
  const from = dstr(periodStart(period));

  const orders = state.orders.filter(o => o.cartId === cartId && o.payment !== 'pending' && o.date >= from);
  const expenses = (state.expenses || []).filter(e => e.cartId === cartId && e.date >= from);
  const wastage = (state.wastageLogs || []).filter(w => w.cartId === cartId && w.date >= from);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const cash = orders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const upi = orders.filter(o => o.payment === 'upi').reduce((s, o) => s + o.total, 0);
  const spend = expenses.reduce((s, e) => s + e.amount, 0);
  const wasted = wastage.reduce((s, w) => s + w.qty, 0);
  const net = revenue - spend;

  const addExpense = (category, amount, note) => {
    const e = { id: Date.now(), cartId, date: TODAY, category, amount, note };
    updateState({ expenses: [...(state.expenses || []), e] });
    setShowExpense(false);
  };
  const removeExpense = (id) => { if (confirm('Delete this expense?')) updateState({ expenses: state.expenses.filter(e => e.id !== id) }); };

  const label = { today: 'Today', week: 'This week', month: 'This month' }[period];

  return (
    <div>
      <SectionHeader title="Records" subtitle="Sales · expenses · wastage" />

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, lab]) => (
          <button key={k} onClick={() => setPeriod(k)} style={{ flex: 1, padding: '9px 0', background: period === k ? colors.ink : '#fff', color: period === k ? colors.primary : colors.ink, border: `1px solid ${period === k ? colors.ink : colors.border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{lab}</button>
        ))}
      </div>

      {/* Sales + net */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5 }}>{label.toUpperCase()} · SALES</div>
        <div style={{ fontSize: 34, fontWeight: 900 }}>₹{revenue.toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{orders.length} orders · 💵 ₹{cash} · 📱 ₹{upi}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Expenses" value={`₹${spend.toLocaleString('en-IN')}`} icon={<IndianRupee size={16}/>} color={colors.red} />
        <MetricCard label="Net (sales − spend)" value={`₹${net.toLocaleString('en-IN')}`} icon={<TrendingUp size={16}/>} color={net >= 0 ? colors.green : colors.red} />
      </div>
      {wasted > 0 && <Alert type="warn" title={`${wasted} pcs wasted ${label.toLowerCase()}`} message={`${wastage.length} wastage entr${wastage.length > 1 ? 'ies' : 'y'} logged by staff.`} />}

      {/* Expenses */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 4 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>EXPENSES — {label.toUpperCase()}</div>
        <button onClick={() => setShowExpense(true)} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14}/> Add</button>
      </div>
      {showExpense && <ExpenseModal onAdd={addExpense} onClose={() => setShowExpense(false)} />}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden', marginBottom: 16 }}>
        {expenses.slice().reverse().map(e => (
          <div key={e.id} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{e.category}</div><div style={{ fontSize: 12, color: colors.muted }}>{e.date}{e.note ? ` · ${e.note}` : ''}</div></div>
            <div style={{ fontWeight: 800 }}>₹{e.amount}</div>
            <button onClick={() => removeExpense(e.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color={colors.red}/></button>
          </div>
        ))}
        {expenses.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No expenses logged {label.toLowerCase()}. Tap Add to record stock/raw-material spend.</div>}
      </div>

      {/* Day-close history */}
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>DAY-CLOSE HISTORY</div>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {state.dayCloseLogs.filter(d => d.cartId === cartId).slice(-14).reverse().map(d => (
          <div key={d.id} style={{ padding: 14, borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div style={{ fontWeight: 800 }}>₹{d.revenue}</div>
            </div>
            <div style={{ fontSize: 11, color: colors.muted }}>📦 {d.totalOrders} orders · 🥟 {d.piecesSold} pcs</div>
          </div>
        ))}
        {state.dayCloseLogs.filter(d => d.cartId === cartId).length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>Close a day to start the history.</div>}
      </div>
    </div>
  );
}

function ExpenseModal({ onAdd, onClose }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = () => { const a = parseInt(amount) || 0; if (a <= 0) { setError('Enter an amount.'); return; } onAdd(category, a, note.trim()); };
  return (
    <EditModalShell title="Add expense" onClose={onClose} onSave={submit} error={error}>
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
function StaffApp({ state, updateState, onExit, cartId, staffName }) {
  const [tab, setTab] = useState('order');
  const [cart, setCart] = useState([]);
  const cartInfo = state.carts.find(c => c.id === cartId);
  const inv = state.inventory[cartId];
  const menu = menuFor(state, cartId);

  // Login is gated at the role selector; this is just a safety net.
  if (!staffName) { onExit(); return null; }

  // Staff only ever sees orders for their own cart.
  const todayOrders = state.orders.filter(o => o.cartId === cartId && o.date === TODAY);
  const myOrders = todayOrders.filter(o => o.staff === staffName);
  const pendingOrders = todayOrders.filter(o => o.payment === 'pending');
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });

  const placeOrder = async (payment) => {
    if (cart.length === 0) return;
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
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      total,
      payment,
      staff: staffName,
      source: 'staff-entry'
    };
    // Staff order is settled on the spot, so deduct stock now.
    setCartInv(deductInventory(inv, cart, menu.items), { orders: [...state.orders, order] });
    setCart([]);
  };

  // Customer QR orders arrive as 'pending'; staff confirms payment here,
  // and only then is stock deducted.
  const settleOrder = (orderId, payment) => {
    const order = state.orders.find(o => o.id === orderId);
    if (!order || order.payment !== 'pending') return;
    setCartInv(deductInventory(inv, order.items, menu.items), {
      orders: state.orders.map(o => o.id === orderId ? { ...o, payment, staff: staffName, settledAt: new Date().toISOString() } : o),
    });
  };
  const cancelOrder = (orderId) => {
    if (!confirm('Cancel this unpaid order?')) return;
    updateState({ orders: state.orders.filter(o => o.id !== orderId) });
  };

  // Staff logs damaged/wasted momos — deducts from cart stock + records it.
  const logWastage = (stockKey, qty, reason) => {
    const st = (menu.stockTypes || []).find(s => s.key === stockKey);
    const newInv = { ...inv };
    if (newInv[stockKey]) newInv[stockKey] = { ...newInv[stockKey], cart: Math.max(0, newInv[stockKey].cart - qty) };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      stockKey, label: st?.label || stockKey, qty, reason, staff: staffName,
    };
    setCartInv(newInv, { wastageLogs: [...state.wastageLogs, log] });
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`${cartInfo?.name ?? 'Cart'} · ${staffName}`} onExit={() => { updateState({ staffOnDuty: null }); onExit(); }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'order' && <NewOrderScreen cart={cart} setCart={setCart} onPlaceOrder={placeOrder} menu={menu} />}
        {tab === 'pending' && <PendingOrders orders={pendingOrders} onSettle={settleOrder} onCancel={cancelOrder} />}
        {tab === 'myorders' && <MyOrdersScreen orders={myOrders} />}
        {tab === 'wastage' && <WastageScreen stockTypes={menu.stockTypes || []} inv={inv} logs={state.wastageLogs.filter(l => l.cartId === cartId && l.date === TODAY)} onLog={logWastage} />}
        {tab === 'shift' && <ShiftStatus inv={inv} stockTypes={menu.stockTypes || []} myOrders={myOrders} staffName={staffName} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'order', icon: <Plus size={20}/>, label: 'New Order' },
        { id: 'pending', icon: <Clock size={20}/>, label: 'Pending', badge: pendingOrders.length },
        { id: 'myorders', icon: <FileText size={20}/>, label: 'My Orders' },
        { id: 'wastage', icon: <Trash2 size={20}/>, label: 'Wastage' },
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

function NewOrderScreen({ cart, setCart, onPlaceOrder, menu }) {
  const [category, setCategory] = useState('momos');
  const items = menu?.items || [], lassi = menu?.lassi || [], addons = menu?.addons || [];

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
        {category === 'momos' && groupByCat(items).map(g => (
          <div key={g.cat} style={{ marginBottom: 6 }}>
            <CategoryBand cat={g.cat} count={g.items.length} />
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

const TYPE_CHIP = {
  veg: { bg: '#E7F5E7', fg: '#0F7B0F', label: 'Veg' },
  paneer: { bg: '#FFF1E7', fg: '#B5460B', label: 'Paneer' },
  corn: { bg: '#FFF7E0', fg: '#8A6D00', label: 'Corn Cheese' },
};
function MenuItemRow({ item, onAdd }) {
  const chip = TYPE_CHIP[item.type];
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {chip && <span style={{ fontSize: 11, fontWeight: 800, color: chip.fg, background: chip.bg, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>{chip.label}</span>}
          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name} {item.star && '⭐'}</div>
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

function ShiftStatus({ inv, stockTypes = [], myOrders, staffName }) {
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
        {stockTypes.map(st => (
          <StockRow key={st.key} label={`${st.label} (pcs)`} value={inv[st.key]?.cart ?? 0} unit="pcs"/>
        ))}
        {stockTypes.length === 0 && <div style={{ fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 }}>No stock tracked</div>}
      </div>

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
  const n = parseInt(qty) || 0;
  const submit = () => {
    if (!stockKey || n <= 0) return;
    onLog(stockKey, n, reason);
    setDone(`Logged ${n} ${stockTypes.find(s => s.key === stockKey)?.label || ''} as wastage.`);
    setQty(''); setTimeout(() => setDone(''), 2500);
  };
  const todayTotal = logs.reduce((s, l) => s + l.qty, 0);

  return (
    <div>
      <SectionHeader title="Wastage" subtitle="Damaged / spoiled momos" />
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
const MAX_ADDON_ITEMS = 2;

// ─── QSR CARTS (tenants on the Cartlyft platform) ───
// ─── CUSTOMER: CART MARKETPLACE LISTING ───
// Reads the live, admin-managed carts from app state.
function CartListing({ carts, onSelect }) {
  return (
    <div style={{ minHeight: '100vh', background: brand.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: brand.navy, padding: '22px 20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CartlyftLogo size={34} variant="light" tagline={false} />
          <Link to="/login" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', textDecoration: 'none' }}>Cart team login</Link>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
        <div style={{ marginBottom: 4, fontSize: 22, fontWeight: 800, color: brand.text }}>Order from a cart</div>
        <div style={{ fontSize: 13, color: brand.muted, marginBottom: 20 }}>Pick a QSR cart to see its menu and place an order</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {carts.map(c => {
            const st = cartOpenState(c);
            return (
            <button key={c.id} onClick={() => onSelect(c)}
              style={{ display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', width: '100%', background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 16, padding: 16, cursor: 'pointer', opacity: st.open ? 1 : 0.6 }}>
              <CartIcon cart={c} size={56} radius={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: brand.text }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: brand.muted }}>{c.tagline}</div>
                  {!st.open && <span style={{ fontSize: 10, fontWeight: 800, color: colors.red, background: '#FFE7E7', borderRadius: 6, padding: '2px 6px' }}>CLOSED</span>}
                </div>
                <div style={{ fontSize: 12.5, color: brand.muted, margin: '3px 0 6px', lineHeight: 1.4 }}>{c.cuisine}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: brand.muted }}>
                  <span>📍 {c.location}</span>
                  <span>🕒 {c.timing}</span>
                </div>
              </div>
              <ArrowRight size={20} color={brand.navy} style={{ flexShrink: 0 }} />
            </button>
          );})}

          {/* Forward-looking placeholder so the directory reads as a platform */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'transparent', border: `1px dashed ${brand.border}`, borderRadius: 16, padding: 16, color: brand.muted }}>
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 14, background: brand.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `1px dashed ${brand.border}` }}>🛒</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: brand.text }}>More carts coming soon</div>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>New QSR carts onboarding to Cartlyft will appear here.</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11 }}>
          <Link to="/admin/login" style={{ color: brand.muted, textDecoration: 'none' }}>Powered by Cartlyft QSR OS</Link>
        </div>
      </div>
    </div>
  );
}

// One cart's customer menu + ordering flow. The cart (`venue`) comes from
// the /c/:cartId route; onBack/onDone navigate back to the marketplace.
function CartMenu({ state, updateState, venue, onBack, onDone }) {
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState('menu'); // menu | confirm | success
  const [orderToken, setOrderToken] = useState('');
  const [addonNote, setAddonNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const menu = menuFor(state, venue.id);
  const items = menu.items || [], lassi = menu.lassi || [], addons = menu.addons || [];
  const isAddon = (id) => addons.some(a => a.id === id);
  const openState = cartOpenState(venue);

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

  const placeOrder = async () => {
    if (!openState.open) { setStep('menu'); return; }
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    // Token is allocated atomically server-side so two phones can't clash;
    // only when offline do we fall back to a local count.
    const serverNum = await nextOrderToken(venue.id, TODAY);
    const token = String(serverNum ?? localNextToken(state.orders, venue.id)).padStart(3, '0');
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
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
    setPlacing(false);
  };

  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);

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

          <button onClick={placeOrder} disabled={cart.length === 0 || placing}
            style={{ width: '100%', background: (cart.length === 0 || placing) ? colors.border : colors.ink, color: colors.primary, border: 'none', padding: 18, borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: (cart.length === 0 || placing) ? 'not-allowed' : 'pointer' }}>
            {placing ? 'Getting your token…' : 'Confirm Order & Get Token'}
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
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24 }}>Show this number at the cart<br/>Ready in ~{venue.defaultPrepMins || 8} minutes</div>
          <div style={{ borderTop: '1px solid rgba(255,214,10,0.3)', paddingTop: 20 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>💵 Pay at the cart — cash or UPI</div>
            {venue.upiQr && <img src={venue.upiQr} alt="UPI QR" style={{ width: 150, height: 150, objectFit: 'contain', borderRadius: 10, background: '#fff', padding: 6, margin: '0 auto 10px', display: 'block' }} />}
            {venue.upiId && <><div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>UPI ID:</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{venue.upiId}</div></>}
          </div>
          <button onClick={() => { setStep('menu'); onDone(); }} style={{ marginTop: 24, background: colors.primary, color: colors.ink, border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 100, fontFamily: 'system-ui, sans-serif' }}>
      {/* Customer header — printed-menu style */}
      <div style={{ background: colors.ink, padding: '16px 20px 22px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <button onClick={() => { setCart([]); onBack(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>← All carts</button>
        </div>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: venue.accent, fontWeight: 900, fontSize: 32, letterSpacing: 3, lineHeight: 1, textTransform: 'uppercase' }}>{venue.name}</div>
          {venue.tagline && <div style={{ color: '#fff', fontSize: 16, marginTop: 6, fontWeight: 600 }}>{venue.tagline}</div>}
          {venue.id === 'momowala' && (
            <>
              <div style={{ color: venue.accent, fontSize: 10, letterSpacing: 2.5, marginTop: 8, fontWeight: 700 }}>PURE DELIGHT ON EVERY PLATE</div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {['🌱 100% Pure Veg', '🙏 Jain Friendly', '🛕 रामभक्त स्पेशल'].map(b => (
                  <span key={b} style={{ border: '1px solid rgba(255,214,10,0.5)', color: venue.accent, fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 12 }}>{b}</span>
                ))}
              </div>
            </>
          )}
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 10 }}>{venue.location} · Order in 30 seconds</div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {items.length === 0 && lassi.length === 0 && addons.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: `1px solid ${colors.border}`, color: colors.muted, marginBottom: 16 }}>
            This cart's menu isn't ready yet. Please check back soon.
          </div>
        )}

        {!openState.open && (
          <div style={{ background: '#FFE7E7', color: colors.red, border: `1px solid ${colors.red}`, borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            🔴 {venue.name} is currently closed{openState.reason ? ` · ${openState.reason}` : ''}. You can browse the menu, but ordering is paused.
          </div>
        )}

        {venue.id === 'momowala' && items.length > 0 && openState.open && (
          <div style={{ background: colors.ink, color: colors.primary, padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: 1 }}>
            ⭐ BESTSELLERS — KURKURE · PANEER AFGHANI · PANEER TANDOORI ⭐
          </div>
        )}

        {items.length > 0 && <>
          <SectionHeader title="🥟 Momos" />
          <div style={{ marginBottom: 24 }}>
            {groupByCat(items).map(g => (
              <div key={g.cat} style={{ marginBottom: 14 }}>
                <CategoryBand cat={g.cat} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.map(item => <MenuItemRow key={item.id} item={item} onAdd={addToCart} />)}
                </div>
              </div>
            ))}
          </div>
        </>}

        {lassi.length > 0 && <>
          <SectionHeader title="🥤 Drinks" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {lassi.map(item => (
              <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
            ))}
          </div>
        </>}

        {addons.length > 0 && <>
          <SectionHeader title="➕ Add-ons" subtitle={`Pick any ${MAX_ADDON_ITEMS}`} />
          {addonNote && (
            <div style={{ background: '#FFF1E7', color: colors.accent, border: `1px solid ${colors.accent}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15}/> {addonNote}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {addons.map(item => {
              const picked = cart.some(c => c.id === item.id);
              return (
                <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} picked={picked} onAdd={() => addToCart(item.id, item.name, item.price)} />
              );
            })}
          </div>
        </>}

        {/* Contact footer — built from the cart's own details */}
        {(venue.phone || venue.instagram || venue.id === 'momowala') && (
          <div style={{ background: colors.ink, color: colors.primary, padding: 16, borderRadius: 12, textAlign: 'center', fontSize: 12, fontWeight: 600, lineHeight: 1.9, marginBottom: 100 }}>
            {(venue.phone || venue.instagram) && <>{[venue.phone && `📞 ${venue.phone}`, venue.instagram && `📷 ${venue.instagram}`].filter(Boolean).join(' · ')}<br/></>}
            {venue.id === 'momowala' && <>🛵 Free delivery nearby on orders above ₹200<br/><span style={{ color: colors.pilgrim, fontWeight: 700 }}>|| जय श्री राम ||</span></>}
          </div>
        )}
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
              <button onClick={() => openState.open && setStep('confirm')} disabled={!openState.open} style={{ background: openState.open ? colors.primary : 'rgba(255,255,255,0.25)', color: openState.open ? colors.ink : 'rgba(255,255,255,0.7)', border: 'none', padding: '14px 24px', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: openState.open ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
                {openState.open ? <>Review Order <ArrowRight size={16}/></> : 'Cart closed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
