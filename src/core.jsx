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
  split: { bg: '#EFE9FB', fg: '#5B3FA6' },
  zomato: { bg: '#FDE8EA', fg: '#E23744' },
  swiggy: { bg: '#FFF0E0', fg: '#C56A00' },
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

// Per-cart opt-in for aggregator (Zomato/Swiggy) order tracking. Stored in the
// menus blob (like stockTypes) so enabling a cart needs no schema change.
// Momowala predates the flag and stays on unless explicitly switched off;
// every other cart is off until opted in at onboarding or later.
const onlineVendorsFor = (state, cartId) => {
  const v = menuFor(state, cartId).onlineVendors;
  return v === undefined ? cartId === 'momowala' : !!v;
};

// Owner-level per-vendor switch UNDER the admin opt-in: with online vendors
// enabled for the cart, each vendor defaults to on and an explicit false in
// menus[cartId].vendors turns just that one off (e.g. Zomato yes, Swiggy no).
const vendorEnabledFor = (state, cartId, vendor) =>
  onlineVendorsFor(state, cartId) && menuFor(state, cartId).vendors?.[vendor] !== false;

// Daily "carry from home" prep checklist — items the owner brings fresh each day
// and ticks off before opening. Configurable per cart (stored in the menus blob);
// momowala ships with this starter list, other carts start empty until set up.
const DEFAULT_PREP_CHECKLIST = [
  { id: 'plates', label: 'Plates 6"/7", tissue, chammach, toothpick, steel bag, thaila' },
  { id: 'ice', label: 'Ice' },
  { id: 'veg', label: 'Coriander, mint, lemon, potato, onion, tomato & veggies' },
  { id: 'cream', label: 'Fresh cream' },
  { id: 'coffeemix', label: 'Frozen hand-blended coffee mix' },
  { id: 'oil', label: 'Oil' },
  { id: 'gas', label: 'Gas & imli coal' },
  { id: 'breadcrumb', label: 'Breadcrumbs' },
  { id: 'springroll', label: 'Spring roll sheets' },
  { id: 'masala', label: 'Masala (chaat masala & peri peri)' },
  { id: 'mayo', label: 'Mayo' },
  { id: 'milk', label: 'Milk (for cold coffee)' },
  { id: 'soda', label: 'Soda & Sprite (for mocktails)' },
  { id: 'containers', label: 'Packing containers (online orders)' },
];
const prepChecklistFor = (state, cartId) => {
  const list = menuFor(state, cartId).prepChecklist;
  if (Array.isArray(list)) return list;
  return cartId === 'momowala' ? DEFAULT_PREP_CHECKLIST : [];
};
// Per-cart thermal-printer config (menus blob). Off until the owner enables it,
// so the print buttons only appear for carts that actually have a printer.
const printerCfgFor = (state, cartId) => {
  const p = menuFor(state, cartId).printer || {};
  return { enabled: !!p.enabled, footer: p.footer || '' };
};

// ─── SERVING-WARE AUDIT (theft validation) ───
// Every serving leaves on a specific disposable: Half momo → 6" small plate,
// Full momo → 7" large plate, mocktail/lassi → 350ml lid glass. Ware is a
// physical audit trail: if servings happen without being punched, the ware
// count falls but punched portions don't — the gap exposes unpunched sales.
// Tracking half/full separately also catches full-punched-as-half mispunches
// (the two plate gaps cross in opposite directions).
const WARE_PER_PACKET_DEFAULT = 24;
const WARE_TYPES = [
  { key: 'plate_s', label: 'Small plate 6" (half momo)', short: '6"', emoji: '🍽️' },
  { key: 'plate_l', label: 'Large plate 7" (full momo)', short: '7"', emoji: '🍽️' },
  { key: 'glass', label: 'Glass 350ml (mocktail)', short: '🥤', emoji: '🥤' },
];
// Per-ware packet size (configurable per cart; lives in the menus blob).
const warePacksFor = (state, cartId) => {
  const saved = menuFor(state, cartId).warePacks || {};
  return Object.fromEntries(WARE_TYPES.map(w => [w.key, saved[w.key] || WARE_PER_PACKET_DEFAULT]));
};
// Ware used by one order. Default: half momo → 6" plate, full → 7" plate, any
// drink → glass. Each item may override with a `ware` flag on its menu def:
//   'none'  → uses no counted ware (paper-tray snacks, bottled water)
//   'glass' → uses a glass even though it lives in the momo list
//   'plate' → uses a plate by half/full size even if it's in the drink list
// The flag is read from the CURRENT menu (not the order snapshot), so fixing an
// item's serving type retroactively corrects the whole audit — including history.
// Add-ons use nothing.
const wareForOrder = (o, menu) => {
  const out = { plate_s: 0, plate_l: 0, glass: 0 };
  const addPlate = (it) => { if (it.type === 'half') out.plate_s += it.qty; else out.plate_l += it.qty; };
  (o.items || []).forEach(it => {
    const mi = (menu.items || []).find(m => m.id === it.id);
    if (mi) {
      if (mi.ware === 'none') return;
      if (mi.ware === 'glass') { out.glass += it.qty; return; }
      addPlate(it);
      return;
    }
    const li = (menu.lassi || []).find(l => l.id === it.id);
    if (li) {
      if (li.ware === 'none') return;
      if (li.ware === 'plate') { addPlate(it); return; }
      out.glass += it.qty;
    }
  });
  return out;
};
// Ware is used when the food is served — same moments stock deducts:
// paid orders, and unpaid counter orders (served at punch). Cancelled: none.
// Zomato/Swiggy orders leave in delivery packaging, not on the cart's plates
// or glasses — excluded from the ware audit (stock still deducts normally).
const usesPlates = (o) => (isPaid(o) && !isOnline(o)) || (o.payment === 'pending' && o.source === 'staff-entry');
// Daily per-ware ledger with a RUNNING carry-over. Opening for `date` = the last
// physically-counted balance (from a prior day-close), carried forward across any
// un-counted days in between by adding what was supplied and subtracting what was
// used on those days. This survives skipped day-closes: previously opening reset
// to 0 (and to 0 for un-audited ware types even when a different type was counted),
// so any gap in the closing ritual produced nonsensical expected counts. Each ware
// type carries from the last close that actually counted THAT key.
function wareLedger(state, cartId, date) {
  const menu = menuFor(state, cartId);
  // Per-ware supplied and used, bucketed by date, for everything up to `date`.
  // PLATE_SUPPLY = real handovers; WARE_RESET = a manual recount/hard-reset
  // correction (qty = target − then-current, so the balance lands on the target).
  const supByDate = {}; // date -> { [wareKey]: qty }
  (state.stockLogs || [])
    .filter(l => l.cartId === cartId && (l.type === 'PLATE_SUPPLY' || l.type === 'WARE_RESET') && l.date <= date)
    .forEach(l => { (supByDate[l.date] ||= {})[l.item] = (supByDate[l.date][l.item] || 0) + (l.qty || 0); });
  const usedByDate = {}; // date -> { plate_s, plate_l, glass }
  (state.orders || [])
    .filter(o => o.cartId === cartId && o.date <= date && usesPlates(o))
    .forEach(o => { const w = wareForOrder(o, menu); const acc = (usedByDate[o.date] ||= { plate_s: 0, plate_l: 0, glass: 0 }); WARE_TYPES.forEach(t => { acc[t.key] += w[t.key]; }); });
  const closesAsc = (state.dayCloseLogs || [])
    .filter(d => d.cartId === cartId && Array.isArray(d.stock))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // The remaining that CARRIES to the next day for a close row. If the owner took
  // the leftover off the cart at close (`carry` stored, e.g. 0 for plates), use
  // it; otherwise fall back to the counted `actual` (glass, older records).
  const carriedOf = (closeRow) => closeRow ? (closeRow.carry ?? closeRow.actual ?? 0) : 0;
  const out = {};
  WARE_TYPES.forEach(t => {
    // Most recent close BEFORE `date` that counted this specific ware key.
    const counted = [...closesAsc].reverse().find(d => d.date < date && d.stock.some(r => r.key === `_ware:${t.key}` && r.actual != null));
    const baseDate = counted ? counted.date : null;
    let opening = carriedOf(counted?.stock.find(r => r.key === `_ware:${t.key}`));
    // Carry the baseline forward across any un-counted days in between. Only when
    // a baseline exists — WITHOUT one there is no trustworthy starting point, so
    // opening stays 0 and `expected` reflects just today's supplied − used.
    // (Carrying from inception wrongly assumed handovers were logged from day one,
    // inflating the Home "should remain" after a fresh handover.)
    if (baseDate !== null) {
      Object.keys(supByDate).forEach(d => { if (d > baseDate && d < date) opening += (supByDate[d][t.key] || 0); });
      Object.keys(usedByDate).forEach(d => { if (d > baseDate && d < date) opening -= (usedByDate[d][t.key] || 0); });
    }
    const supplied = supByDate[date]?.[t.key] || 0;
    const used = usedByDate[date]?.[t.key] || 0;
    // If `date` itself is already reconciled, the cart now physically holds what
    // was carried (0 for plates taken off, counted amount for glass kept) — so the
    // live "should remain" collapses to that, not the pre-close arithmetic.
    const todayCloseRow = closesAsc.find(d => d.date === date)?.stock?.find(r => r.key === `_ware:${t.key}`);
    const closed = !!todayCloseRow;
    const expected = closed ? carriedOf(todayCloseRow) : (opening + supplied - used);
    // `anchored` = a prior close physically counted this ware, so `expected` is
    // trustworthy. Until then (no baseline yet) the running total is carried from
    // incomplete early records and must NOT be read as a theft signal — the first
    // count establishes the baseline instead.
    out[t.key] = { opening, supplied, used, expected, closed, anchored: baseDate !== null };
  });
  return out;
}
// The ware audit rows a day-close tucks into its stock array ('_ware:<key>').
const dayCloseWare = (d) => Array.isArray(d?.stock) ? d.stock.filter(r => String(r.key).startsWith('_ware:')) : [];

// Over-punch detector for momo stock. The live cart counter floors at 0, so
// punching (or wasting) more pieces than were loaded is silently swallowed —
// hiding a real "sold more than we had" signal. This recomputes the UN-clamped
// net cart since the last day-close (which resets the cart to 0): loads − unloads
// − pieces actually deducted by orders − wastage. A negative result means more
// left the cart than was ever put on it. Returns { stockKey: overPcs } for
// negatives only (empty = clean). Purely a read-only signal; it never changes
// the counter, so it can't regress normal stock behaviour.
function momoOversell(state, cartId, date) {
  const lastClose = (state.dayCloseLogs || [])
    .filter(d => d.cartId === cartId && d.date <= date)
    .map(d => d.date).sort().pop() || null;
  const inWindow = (d) => (lastClose === null || d > lastClose) && d <= date;
  const menu = menuFor(state, cartId);
  const net = {};
  (state.cartLoadings || []).filter(l => l.cartId === cartId && inWindow(l.date)).forEach(l => {
    if (l.type === 'CART_LOAD') net[l.item] = (net[l.item] || 0) + (l.qty || 0);
    else if (l.type === 'CART_UNLOAD') net[l.item] = (net[l.item] || 0) - (l.qty || 0);
    else if (l.type === 'CART_ADJUST') net[l.item] = (net[l.item] || 0) + (l.qty || 0); // signed recount correction
  });
  // Only orders that actually deducted stock and weren't cancelled (cancel
  // restores), mirroring exactly what the live counter reflects.
  (state.orders || []).filter(o => o.cartId === cartId && inWindow(o.date) && o.stockDeducted && o.payment !== 'cancelled')
    .forEach(o => Object.entries(orderStockDeltas(o.items, menu.items)).forEach(([k, pcs]) => { net[k] = (net[k] || 0) - pcs; }));
  (state.wastageLogs || []).filter(w => w.cartId === cartId && inWindow(w.date) && w.stockKey)
    .forEach(w => { net[w.stockKey] = (net[w.stockKey] || 0) - (w.qty || 0); });
  const out = {};
  Object.entries(net).forEach(([k, v]) => { if (v < 0) out[k] = -v; });
  return out;
}

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

// An order counts as real revenue once paid. Counter payments (cash/UPI) land
// in the cash box / PhonePe; aggregator orders (Zomato/Swiggy) are guaranteed
// sales paid out weekly by the platform — revenue and stock, but never part of
// the cash/UPI reconciliation. 'pending' and 'cancelled' never touch revenue.

const isPaid = (o) => o.payment === 'cash' || o.payment === 'upi' || o.payment === 'split' || o.payment === 'zomato' || o.payment === 'swiggy';
// Split orders record how much of the bill went to each method ({cash, upi}).
// These attribute an order's rupees to the correct counted bucket so a part-cash
// part-UPI payment never misfires the cash/PhonePe reconciliation.
const cashPart = (o) => o.payment === 'cash' ? o.total : (o.payment === 'split' ? (o.split?.cash || 0) : 0);
const upiPart = (o) => o.payment === 'upi' ? o.total : (o.payment === 'split' ? (o.split?.upi || 0) : 0);
// Aggregator (delivery-platform) order — money arrives as a weekly payout.
const isOnline = (o) => o.payment === 'zomato' || o.payment === 'swiggy';

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

const DATA_EPOCH = '2026-07-07-testdata-cleanup';


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
    payoutMarks: tag(storage.get('payoutMarks', [])),
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

export { colors, brand, CartlyftMark, CartlyftLogo, MENU_ITEMS, LASSI, ADDONS, PLATFORM_ADMIN_MOBILE, SEED_CARTS, PAY_BADGE, MOMO_STOCK_TYPES, SEED_MENUS, EMPTY_MENU, menuFor, stockTypesFor, onlineVendorsFor, vendorEnabledFor, DEFAULT_PREP_CHECKLIST, prepChecklistFor, printerCfgFor, groupByCat, CAT_STYLE, HINDI_FONT, CategoryBand, cartOpenState, deductInventory, restoreInventory, orderStockDeltas, persistInv, persistConsumables, IST_TZ, localDate, istTime, istNowMinutes, istDateLabel, TODAY, unlockAudio, playOrderAlert, isPaid, isOnline, cashPart, upiPart, CANCEL_REASONS, CANCEL_WINDOW_MS, withinCancelWindow, staffCancellable, localNextToken, DEFAULT_INVENTORY, freshInventory, DATA_EPOCH, getInitialState, normalize, slugify, adminBtn, fileToBase64, editLabel, editInput, TYPE_CHIP, MAX_ADDON_ITEMS, momowalaLogoUrl, WARE_PER_PACKET_DEFAULT, WARE_TYPES, warePacksFor, wareForOrder, usesPlates, wareLedger, dayCloseWare, momoOversell };
