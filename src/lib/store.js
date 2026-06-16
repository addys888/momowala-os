import { supabase } from './supabase';

// ─── PASSWORD HASHING ───
// SHA-256 via the Web Crypto API. Not bcrypt-grade, but it means plaintext
// passwords never touch localStorage or the database. Good enough for a
// single-cart app with a handful of staff accounts.
export async function hashPassword(plain) {
  const bytes = new TextEncoder().encode(`momowala:${plain}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── LOCAL PERSISTENCE (always on, works offline) ───
const PREFIX = 'mw:';

export const storage = {
  get(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage full or blocked — app keeps running on in-memory state
    }
  },
};

// ─── SUPABASE ROW MAPPING ───
// stock_logs / cart_loadings use lowercase single-word keys that match their
// columns; orders, staff and day_close_logs need camelCase ↔ snake_case.

const orderToRow = (o) => ({
  id: o.id, cart_id: o.cartId ?? null, token: o.token, date: o.date, time: o.time, items: o.items,
  total: o.total, payment: o.payment, staff: o.staff, source: o.source,
  settled_at: o.settledAt ?? null,
  outlet: o.outlet ?? null, outlet_name: o.outletName ?? null,
});
const rowToOrder = (r) => ({
  id: r.id, cartId: r.cart_id ?? undefined, token: r.token, date: r.date, time: r.time, items: r.items,
  total: r.total, payment: r.payment, staff: r.staff, source: r.source,
  settledAt: r.settled_at ?? undefined,
  outlet: r.outlet ?? undefined, outletName: r.outlet_name ?? undefined,
});

const staffToRow = (s) => ({
  id: s.id, cart_id: s.cartId ?? null, name: s.name, mobile: s.mobile,
  password_hash: s.passwordHash ?? null, active: s.active, updated_at: new Date().toISOString(),
});
const rowToStaff = (r) => ({
  id: r.id, cartId: r.cart_id ?? undefined, name: r.name, mobile: r.mobile,
  passwordHash: r.password_hash ?? null, active: r.active,
});

// stock_logs / cart_loadings — rename cartId ↔ cart_id, otherwise 1:1
const logToRow = (l) => { const { cartId, ...rest } = l; return { ...rest, cart_id: cartId ?? null }; };
const rowToLog = ({ inserted_at, cart_id, ...rest }) => ({ ...rest, cartId: cart_id ?? undefined });

const wastageToRow = (w) => ({ id: w.id, cart_id: w.cartId ?? null, date: w.date, time: w.time, stock_key: w.stockKey, label: w.label, qty: w.qty, reason: w.reason, staff: w.staff });
const rowToWastage = (r) => ({ id: r.id, cartId: r.cart_id ?? undefined, date: r.date, time: r.time, stockKey: r.stock_key, label: r.label, qty: r.qty, reason: r.reason, staff: r.staff });
const expenseToRow = (e) => ({ id: e.id, cart_id: e.cartId ?? null, date: e.date, category: e.category, amount: e.amount, note: e.note ?? null });
const rowToExpense = (r) => ({ id: r.id, cartId: r.cart_id ?? undefined, date: r.date, category: r.category, amount: r.amount, note: r.note ?? undefined });

const cartToRow = (c) => ({
  id: c.id, name: c.name, tagline: c.tagline, cuisine: c.cuisine, location: c.location,
  timing: c.timing, emoji: c.emoji, accent: c.accent, logo: c.logo ?? null,
  phone: c.phone ?? null, instagram: c.instagram ?? null,
  upi_id: c.upiId ?? null, upi_qr: c.upiQr ?? null,
  open_time: c.openTime ?? null, close_time: c.closeTime ?? null, closed_manually: !!c.closedManually,
  owner_name: c.ownerName ?? null,
  owner_mobile: c.ownerMobile, owner_password_hash: c.ownerPasswordHash ?? null,
  active: c.active, created_at: c.createdAt,
});
const rowToCart = (r) => ({
  id: r.id, name: r.name, tagline: r.tagline, cuisine: r.cuisine, location: r.location,
  timing: r.timing, emoji: r.emoji, accent: r.accent, logo: r.logo ?? undefined,
  phone: r.phone ?? undefined, instagram: r.instagram ?? undefined,
  upiId: r.upi_id ?? undefined, upiQr: r.upi_qr ?? undefined,
  openTime: r.open_time ?? undefined, closeTime: r.close_time ?? undefined, closedManually: !!r.closed_manually,
  ownerName: r.owner_name ?? undefined,
  ownerMobile: r.owner_mobile, ownerPasswordHash: r.owner_password_hash ?? null,
  active: r.active, createdAt: r.created_at,
});

const dayCloseToRow = (d) => ({
  id: d.id,
  cart_id: d.cartId ?? null,
  date: d.date,
  total_orders: d.totalOrders,
  system_cash: d.systemCash,
  physical_cash: d.physicalCash,
  cash_diff: d.cashDiff,
  system_upi: d.systemUpi,
  phonepe_amount: d.phonePeAmount,
  upi_diff: d.upiDiff,
  expected_veg: d.expectedVeg,
  actual_veg: d.actualVeg,
  veg_diff: d.vegDiff,
  expected_paneer: d.expectedPaneer,
  actual_paneer: d.actualPaneer,
  paneer_diff: d.paneerDiff,
  expected_corn: d.expectedCorn,
  actual_corn: d.actualCorn,
  corn_diff: d.cornDiff,
  pieces_sold: d.piecesSold,
  revenue: d.revenue,
  closed_at: d.closedAt,
});

const rowToDayClose = (r) => ({
  id: r.id,
  cartId: r.cart_id ?? undefined,
  date: r.date,
  totalOrders: r.total_orders,
  systemCash: r.system_cash,
  physicalCash: r.physical_cash,
  cashDiff: r.cash_diff,
  systemUpi: r.system_upi,
  phonePeAmount: r.phonepe_amount,
  upiDiff: r.upi_diff,
  expectedVeg: r.expected_veg,
  actualVeg: r.actual_veg,
  vegDiff: r.veg_diff,
  expectedPaneer: r.expected_paneer,
  actualPaneer: r.actual_paneer,
  paneerDiff: r.paneer_diff,
  expectedCorn: r.expected_corn,
  actualCorn: r.actual_corn,
  cornDiff: r.corn_diff,
  piecesSold: r.pieces_sold,
  revenue: r.revenue,
  closedAt: r.closed_at,
});

const stripMeta = ({ inserted_at, ...row }) => row;

// ─── MERGE (cloud + local, append-only events keyed by id) ───
const unionById = (a = [], b = []) => {
  const seen = new Map();
  [...a, ...b].forEach((x) => seen.set(x.id, x));
  return [...seen.values()].sort((x, y) => x.id - y.id);
};

// Orders are mutable (pending → paid). When the same id exists on both sides,
// prefer the settled copy so a payment recorded anywhere wins over 'pending'.
const mergeOrders = (a = [], b = []) => {
  const seen = new Map();
  [...a, ...b].forEach((o) => {
    const prev = seen.get(o.id);
    if (!prev) { seen.set(o.id, o); return; }
    const better = prev.payment !== 'pending' ? prev : o;
    seen.set(o.id, better);
  });
  return [...seen.values()].sort((x, y) => x.id - y.id);
};

export function mergeStates(localState, cloud) {
  return {
    ...localState,
    orders: mergeOrders(localState.orders, cloud.orders),
    stockLogs: unionById(localState.stockLogs, cloud.stockLogs),
    cartLoadings: unionById(localState.cartLoadings, cloud.cartLoadings),
    dayCloseLogs: unionById(localState.dayCloseLogs, cloud.dayCloseLogs),
    wastageLogs: unionById(localState.wastageLogs, cloud.wastageLogs),
    expenses: unionById(localState.expenses, cloud.expenses),
    // mutable, owner/admin-managed; cloud copy wins on id conflict
    staff: cloud.staff?.length ? unionById(localState.staff, cloud.staff) : localState.staff,
    carts: cloud.carts?.length ? unionById(localState.carts, cloud.carts) : localState.carts,
    platform: cloud.platform ?? localState.platform,
    // inventory is one keyed blob ({ [cartId]: inv }); cloud wins if present
    inventory: cloud.inventory ?? localState.inventory,
    menus: cloud.menus ?? localState.menus,
  };
}

// ─── ATOMIC ORDER TOKEN ───
// Allocate the next per-cart, per-day token server-side so two phones ordering
// at the same time can never land on the same number. Returns null when
// offline or the RPC isn't deployed yet — the caller then falls back to a
// local count (rare, only matters with no network).
export async function nextOrderToken(cartId, date) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('next_order_token', { p_cart_id: cartId, p_date: date });
    if (error) throw error;
    return typeof data === 'number' ? data : null;
  } catch (e) {
    console.warn('Order token RPC failed — falling back to local count.', e.message);
    return null;
  }
}

// ─── CLOUD LOAD ───
export async function loadCloudState() {
  if (!supabase) return null;
  try {
    const [orders, stockLogs, cartLoadings, dayCloseLogs, inventory, staff, carts, platform, menus, wastage, expenses] = await Promise.all([
      supabase.from('orders').select('*').order('id'),
      supabase.from('stock_logs').select('*').order('id'),
      supabase.from('cart_loadings').select('*').order('id'),
      supabase.from('day_close_logs').select('*').order('id'),
      supabase.from('inventory').select('*').eq('id', 1).maybeSingle(),
      supabase.from('staff').select('*').order('id'),
      supabase.from('carts').select('*').order('created_at'),
      supabase.from('platform').select('*').eq('id', 1).maybeSingle(),
      supabase.from('menus').select('*').eq('id', 1).maybeSingle(),
      supabase.from('wastage_logs').select('*').order('id'),
      supabase.from('expenses').select('*').order('id'),
    ]);
    const failed = [orders, stockLogs, cartLoadings, dayCloseLogs, inventory, staff, carts, platform].find((r) => r.error);
    if (failed) throw failed.error;
    return {
      orders: orders.data.map((r) => rowToOrder(r)),
      stockLogs: stockLogs.data.map(rowToLog),
      cartLoadings: cartLoadings.data.map(rowToLog),
      dayCloseLogs: dayCloseLogs.data.map((r) => rowToDayClose(r)),
      wastageLogs: (wastage.data || []).map(rowToWastage),
      expenses: (expenses.data || []).map(rowToExpense),
      inventory: inventory.data?.data ?? null,
      staff: staff.data.map((r) => rowToStaff(r)),
      carts: carts.data.map((r) => rowToCart(r)),
      platform: platform.data ? { adminMobile: platform.data.admin_mobile, adminPasswordHash: platform.data.admin_password_hash ?? null } : null,
      menus: menus.data?.data ?? null,
    };
  } catch (e) {
    console.warn('Supabase load failed — running on local data only.', e.message);
    return null;
  }
}

// ─── CLOUD SYNC (debounced; events are insert-once, inventory is upserted) ───
let pushTimer = null;

export function syncToCloud(state) {
  if (!supabase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushState(state), 1500);
}

async function pushState(state) {
  try {
    // append-only logs: insert new rows, skip ones already there
    const append = (table, rows) =>
      rows.length
        ? supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
        : null;
    // mutable rows: insert-or-update so edits (settlements, password resets) sync
    const merge = (table, rows) =>
      rows.length ? supabase.from(table).upsert(rows, { onConflict: 'id' }) : null;
    const results = await Promise.all(
      [
        merge('orders', state.orders.map(orderToRow)),
        append('stock_logs', state.stockLogs.map(logToRow)),
        append('cart_loadings', state.cartLoadings.map(logToRow)),
        append('day_close_logs', state.dayCloseLogs.map(dayCloseToRow)),
        append('wastage_logs', (state.wastageLogs || []).map(wastageToRow)),
        merge('expenses', (state.expenses || []).map(expenseToRow)),
        merge('staff', state.staff.map(staffToRow)),
        merge('carts', state.carts.map(cartToRow)),
        supabase.from('platform').upsert({ id: 1, admin_mobile: state.platform.adminMobile, admin_password_hash: state.platform.adminPasswordHash, updated_at: new Date().toISOString() }),
        supabase
          .from('inventory')
          .upsert({ id: 1, data: state.inventory, updated_at: new Date().toISOString() }),
        supabase
          .from('menus')
          .upsert({ id: 1, data: state.menus, updated_at: new Date().toISOString() }),
      ].filter(Boolean)
    );
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  } catch (e) {
    console.warn('Supabase sync failed — data is still saved locally.', e.message);
  }
}
