import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from './lib/store';
import momowalaLogoUrl from './assets/momowala-logo.png';

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
    logo: momowalaLogoUrl,
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
  cancelled: { bg: '#FFE7E7', fg: '#C81E1E' },
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

// Per-category band: a dish-appropriate emoji, colour and Hindi name. Colours
// and icons are picked to feel like the dish — steam, crispy, fried, tandoor
// fire, creamy malai, mixed cocktail. Falls back to a dumpling for unknown cats.

const CAT_STYLE = {
  Steamed:  { icon: '♨️', bg: '#0E7490', hi: 'स्टीम' },   // rising steam
  Kurkure:  { icon: '🍤', bg: '#C2410C', hi: 'कुरकुरे' }, // crunchy / crispy
  Fried:    { icon: '🍳', bg: '#B45309', hi: 'फ्राइड' },  // pan-fried
  Tandoori: { icon: '🔥', bg: '#B91C1C', hi: 'तंदूरी' },  // tandoor fire
  Afghani:  { icon: '🥛', bg: '#4D7C0F', hi: 'अफ़ग़ानी' },// creamy malai
  Cocktail: { icon: '🍸', bg: '#7C3AED', hi: 'कॉकटेल' },  // mixed cocktail
};

const HINDI_FONT = "'Noto Sans Devanagari','Hind','Mangal','Nirmala UI',system-ui,sans-serif";

// Distinct, dish-appropriate header band shown above each menu category, used
// by both the staff order screen and the customer menu.

function CategoryBand({ cat, count }) {
  const cs = CAT_STYLE[cat] || { icon: '🥟', bg: '#0A0A0A', hi: '' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: cs.bg, color: '#fff', borderRadius: 8, padding: '9px 13px', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{cs.icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>{cat}</span>
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
  const mins = istNowMinutes();
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
      // Clamp at 0 to match the cloud apply_inventory RPC and the wastage path —
      // physical cart stock can't go negative (orders aren't hard-blocked on low
      // stock, so an oversell just floors at 0 instead of showing a negative).
      next[menu.stockKey] = { ...next[menu.stockKey], cart: Math.max(0, next[menu.stockKey].cart - pcs) };
    }
  });
  return next;
}

// Inverse of deductInventory — puts pieces back when a settled order is cancelled.

function restoreInventory(inventory, items, menuItems = MENU_ITEMS) {
  const next = { ...inventory };
  items.forEach(item => {
    const menu = menuItems.find(m => m.id === item.id);
    if (menu && next[menu.stockKey]) {
      const pcs = (item.type === 'half' ? menu.pcsHalf : menu.pcsFull) * item.qty;
      next[menu.stockKey] = { ...next[menu.stockKey], cart: next[menu.stockKey].cart + pcs };
    }
  });
  return next;
}

// Pieces deducted per stock category for an order's items — used to build the
// atomic inventory delta (so deductions compose across devices, not clobber).

function orderStockDeltas(items, menuItems = MENU_ITEMS) {
  const d = {};
  (items || []).forEach(item => {
    const m = menuItems.find(x => x.id === item.id);
    if (m && m.stockKey) {
      const pcs = (item.type === 'half' ? m.pcsHalf : m.pcsFull) * item.qty;
      d[m.stockKey] = (d[m.stockKey] || 0) + pcs;
    }
  });
  return d; // { stockKey: pieces }
}

// Persist an inventory change atomically via the RPC; fall back to a whole-blob
// upsert only if the RPC isn't deployed yet (pre-migration).

async function persistInv(cartId, ops, fullInventory) {
  const r = await applyInventory(cartId, ops);
  if (r.status === 'rpc_missing') await pushInventoryBlob(fullInventory);
}

async function persistConsumables(cartId, cons, fullInventory) {
  const r = await setCartConsumables(cartId, cons);
  if (r.status === 'rpc_missing') await pushInventoryBlob(fullInventory);
}

// ─── STORAGE ───
// localStorage (offline-first) + Supabase cloud sync — see src/lib/store.js

// ─── TIME — everything is India Standard Time, regardless of device timezone ───
// The whole business (orders, day boundaries, open/close hours, timestamps) is
// pinned to Asia/Kolkata so a staff/owner phone set to another zone still sees
// the correct Indian business day and clock.

const IST_TZ = 'Asia/Kolkata';
// IST calendar date as YYYY-MM-DD (en-CA gives that exact format).

const localDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// IST wall-clock time like "02:09 pm" — used for the `time` field on records.

const istTime = (d = new Date()) => new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d).toLowerCase();
// Current minutes-since-midnight in IST (for the open/close window check).

const istNowMinutes = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return (+p.find(x => x.type === 'hour').value) * 60 + (+p.find(x => x.type === 'minute').value);
};
// Format a date (or YYYY-MM-DD string) for display in IST.

const istDateLabel = (d, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, ...opts }).format(typeof d === 'string' ? new Date(d + 'T12:00:00Z') : d);

const TODAY = localDate();

// ─── ORDER ALERT — beep + spoken cue when a new customer order reaches staff ───

let _audioCtx = null;

function unlockAudio() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch { /* audio not available */ }
}

function playOrderAlert() {
  try {
    unlockAudio();
    const ctx = _audioCtx;
    if (ctx) {
      const beep = (freq, start, dur) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
      };
      beep(880, 0, 0.2); beep(1175, 0.22, 0.28); // two-tone chime
    }
  } catch { /* ignore */ }
  try {
    const u = new SpeechSynthesisUtterance('New order received');
    u.rate = 1; u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

// An order counts as real revenue only once paid (cash/UPI). 'pending' QR
// orders and staff-'cancelled' orders never touch revenue or pieces sold.

const isPaid = (o) => o.payment === 'cash' || o.payment === 'upi';

// Reasons a staff member can give when cancelling an order.

const CANCEL_REASONS = ['Customer left / no-show', 'Duplicate order', 'Wrong items ordered', 'Customer changed mind', 'Item out of stock', 'Test / mistake', 'Other'];

// Staff may cancel a settled COUNTER order (source 'staff-entry') only within
// this window of it being punched; after that it's locked in the records.

const CANCEL_WINDOW_MS = 5 * 60 * 1000;

const withinCancelWindow = (o) => Date.now() - o.id <= CANCEL_WINDOW_MS;
// A staff-side settled order the staff is still allowed to cancel.

const staffCancellable = (o) => o.source === 'staff-entry' && o.payment !== 'cancelled' && withinCancelWindow(o);

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
    oil: { name: 'Oil', unit: 'L', stock: 5, perOrder: 0.02 },
    cream: { name: 'Cream', unit: 'ml', stock: 1000, perOrder: 15 },
    cheese: { name: 'Cheese', unit: 'slices', stock: 50, perOrder: 1 },
    schezwan: { name: 'Schezwan', unit: 'ml', stock: 500, perOrder: 10 },
  },
};


const freshInventory = () => JSON.parse(JSON.stringify(DEFAULT_INVENTORY));

// Bump this to force every device to drop its local transactional data (orders,
// logs, inventory) on next open and adopt the clean cloud — used for the Momo
// Wala production launch so stale test rows aren't re-pushed. Accounts, carts
// and menus are preserved.

const DATA_EPOCH = '2026-06-18-momowala-launch';


const getInitialState = () => {
  // One-time launch reset.
  if (storage.get('dataEpoch', null) !== DATA_EPOCH) {
    ['orders', 'stockLogs', 'cartLoadings', 'dayCloseLogs', 'wastageLogs', 'expenses'].forEach(k => storage.set(k, []));
    storage.set('inventoryByCart', null);
    storage.set('staffOnDuty', null);
    storage.set('dataEpoch', DATA_EPOCH);
  }

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

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');


const adminBtn = { background: '#fff', border: `1px solid ${colors.border}`, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: brand.text };


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

const editLabel = { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 };

const editInput = { width: '100%', padding: '11px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 12 };

const TYPE_CHIP = {
  veg: { bg: '#E7F5E7', fg: '#0F7B0F', label: 'Veg' },
  paneer: { bg: '#FFF1E7', fg: '#B5460B', label: 'Paneer' },
  corn: { bg: '#FFF7E0', fg: '#8A6D00', label: 'Corn Cheese' },
};

const MAX_ADDON_ITEMS = 2;

// ─── QSR CARTS (tenants on the Cartlyft platform) ───
// ─── CUSTOMER: CART MARKETPLACE LISTING ───
// Reads the live, admin-managed carts from app state.

export { colors, brand, CartlyftMark, CartlyftLogo, MENU_ITEMS, LASSI, ADDONS, PLATFORM_ADMIN_MOBILE, SEED_CARTS, PAY_BADGE, MOMO_STOCK_TYPES, SEED_MENUS, EMPTY_MENU, menuFor, stockTypesFor, groupByCat, CAT_STYLE, HINDI_FONT, CategoryBand, cartOpenState, deductInventory, restoreInventory, orderStockDeltas, persistInv, persistConsumables, IST_TZ, localDate, istTime, istNowMinutes, istDateLabel, TODAY, unlockAudio, playOrderAlert, isPaid, CANCEL_REASONS, CANCEL_WINDOW_MS, withinCancelWindow, staffCancellable, localNextToken, DEFAULT_INVENTORY, freshInventory, DATA_EPOCH, getInitialState, normalize, slugify, adminBtn, fileToBase64, editLabel, editInput, TYPE_CHIP, MAX_ADDON_ITEMS, momowalaLogoUrl };
