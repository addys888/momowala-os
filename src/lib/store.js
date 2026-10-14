import { operationChanges, reconciliationRow } from './operations.js';
import { mergeOrderUpdates, readOrderPages } from './orderSync.js';
import { supabase, requestHeaders } from './supabase';
import { createOutbox } from './outbox';
import { archiveRejected, reconciliationBackups } from './recovery';

// ─── PASSWORD HASHING ───
// Legacy hash compatibility for existing account helpers. Authentication and
// password verification are performed by the database, never local caches.
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
  split: o.split ?? null,
  settled_at: o.settledAt ?? null, cancel_reason: o.cancelReason ?? null,
  prep_status: o.prepStatus ?? null,
  acknowledged_at: o.acknowledgedAt ?? null,
  customer_name: o.customerName ?? null, customer_phone: o.customerPhone ?? null,
  outlet: o.outlet ?? null, outlet_name: o.outletName ?? null,
});
const rowToOrder = (r) => ({
  revision: r.revision ?? 0,
  insertedAt: r.inserted_at,
  id: r.id, cartId: r.cart_id ?? undefined, token: r.token, date: r.date, time: r.time, items: r.items,
  total: r.total, payment: r.payment, staff: r.staff, source: r.source,
  split: r.split ?? undefined,
  settledAt: r.settled_at ?? undefined, cancelReason: r.cancel_reason ?? undefined,
  prepStatus: r.prep_status ?? undefined,
  acknowledgedAt: r.acknowledged_at ?? undefined,
  customerName: r.customer_name ?? undefined, customerPhone: r.customer_phone ?? undefined,
  outlet: r.outlet ?? undefined, outletName: r.outlet_name ?? undefined,
});

// Note: password_hash is deliberately NOT written here — the browser (anon
// role) has no privilege on that column; it's set only via the auth RPCs.
const staffToRow = (s) => ({
  id: s.id, cart_id: s.cartId ?? null, name: s.name, mobile: s.mobile,
  active: s.active,
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
const expenseToRow = (e) => ({ id: e.id, cart_id: e.cartId ?? null, date: e.date, category: e.category, amount: e.amount, note: e.note ?? null, fund: e.fund ?? null });
const rowToExpense = (r) => ({ id: r.id, cartId: r.cart_id ?? undefined, date: r.date, category: r.category, amount: r.amount, note: r.note ?? undefined, fund: r.fund ?? undefined });
// Owner's per-week Zomato/Swiggy payout validation flags. id = weekStart as
// YYYYMMDD int so it sorts cleanly; `received` toggles as payouts are matched.
const payoutMarkToRow = (m) => ({ id: m.id, cart_id: m.cartId ?? null, week_start: m.weekStart, received: !!m.received, updated_at: m.updatedAt });
const rowToPayoutMark = (r) => ({ id: r.id, cartId: r.cart_id ?? undefined, weekStart: r.week_start, received: !!r.received, updatedAt: r.updated_at });

const cartToRow = (c) => ({
  id: c.id, name: c.name, tagline: c.tagline, cuisine: c.cuisine, location: c.location,
  timing: c.timing, emoji: c.emoji, accent: c.accent, logo: c.logo ?? null,
  phone: c.phone ?? null, instagram: c.instagram ?? null,
  upi_id: c.upiId ?? null, upi_qr: c.upiQr ?? null,
  open_time: c.openTime ?? null, close_time: c.closeTime ?? null, closed_manually: !!c.closedManually,
  default_prep_mins: c.defaultPrepMins ?? null,
  owner_name: c.ownerName ?? null,
  // owner_password_hash is NOT written here — set only via the auth RPCs.
  owner_mobile: c.ownerMobile,
  // created_at is intentionally omitted: anon has no UPDATE grant on it (it's
  // set once at onboard), and including it here made the whole carts upsert fail
  // the ON CONFLICT update — which silently blocked close/open + profile syncs.
  active: c.active,
});
const rowToCart = (r) => ({
  id: r.id, name: r.name, tagline: r.tagline, cuisine: r.cuisine, location: r.location,
  timing: r.timing, emoji: r.emoji, accent: r.accent, logo: r.logo ?? undefined,
  phone: r.phone ?? undefined, instagram: r.instagram ?? undefined,
  upiId: r.upi_id ?? undefined, upiQr: r.upi_qr ?? undefined,
  openTime: r.open_time ?? undefined, closeTime: r.close_time ?? undefined, closedManually: !!r.closed_manually,
  defaultPrepMins: r.default_prep_mins ?? undefined,
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
  stock: d.stock ?? null,
  holiday: d.holiday ?? null,
  unrecorded: d.unrecorded ?? null,
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
  stock: r.stock ?? undefined,
  holiday: r.holiday ?? undefined,
  unrecorded: r.unrecorded ?? undefined,
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

// Like unionById but keeps the copy with the newest updatedAt on id conflict —
// so un-marking a payout week propagates instead of being resurrected by an
// older cloud row (unionById would just let cloud win regardless of recency).
const mergeByNewest = (a = [], b = []) => {
  const seen = new Map();
  [...a, ...b].forEach((x) => {
    const prev = seen.get(x.id);
    if (!prev || Date.parse(x.updatedAt || 0) >= Date.parse(prev.updatedAt || 0)) seen.set(x.id, x);
  });
  return [...seen.values()].sort((x, y) => x.id - y.id);
};

// Server revisions order committed updates; pending local edits protect only
// their own order IDs, never unrelated orders arriving from another phone.
export const mergeOrders = mergeOrderUpdates;

export function mergeStates(localState, cloud) {
  // Cloud reads are already scoped by the server. Never union previous users'
  // private caches into a newly authenticated account.
  const next = { ...localState, ...cloud };
  for (const op of pendingOperations()) {
    const { after } = op.payload;
    if (op.kind === 'order' && after) next.orders = unionById(next.orders, [rowToOrder(after)]);
    if (op.kind === 'row') {
      const entry = Object.entries(slices).find(([, cfg]) => cfg.table === op.payload.table);
      if (entry) {
        const [key, cfg] = entry;
        const id = after?.id ?? op.payload.before?.id;
        const existing = next[key].find(x => x.id === id);
        next[key] = next[key].filter(x => x.id !== id);
        if (after) next[key].push(cfg.from({ ...(existing ? cfg.to(existing) : {}), ...after }));
      }
    }
    if (op.kind === 'menu') next.menus = { ...next.menus, [op.payload.cartId]: op.payload.value };
    if (op.kind === 'inventory' || op.kind === 'consumables' || op.kind === 'order') {
      // Keep the optimistic local stock until every corresponding command lands.
      const cid = op.payload.cartId || after?.cart_id;
      if (cid && localState.inventory[cid]) next.inventory = { ...next.inventory, [cid]: localState.inventory[cid] };
    }
  }
  return next;
}

// Menu edits are captured by updateState; these legacy call sites only flush.
export async function pushMenus() { await outbox.flush(); return { error: null }; }
// Tokens are assigned in the same transaction that inserts the order.
export async function nextOrderToken() { return null; }
const CART_COLS = 'id,name,tagline,cuisine,location,timing,emoji,accent,logo,phone,instagram,upi_id,upi_qr,open_time,close_time,closed_manually,default_prep_mins,owner_name,owner_mobile,active,created_at';
const STAFF_COLS = 'id,cart_id,name,mobile,active,updated_at';

// ─── AUTH (SECURITY DEFINER RPCs — hashes never reach the browser) ───
// Shared caller: returns the function's JSON, or { status: 'rpc_missing' } when
// the RPC is unavailable (PostgREST 404/PGRST202); login fails closed.
async function callRpc(fn, args) {
  if (!supabase) return { status: 'rpc_missing' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const missing = error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || '');
    return { status: missing ? 'rpc_missing' : 'error', message: error.message };
  }
  return data;
}
export const authLogin = (mobile, password, context = 'team') => callRpc('app_login', { p_mobile: mobile, p_password: password, p_context: context });
export const authSetPassword = (role, mobile, cartId, password) => callRpc('app_set_password', { p_role: role, p_mobile: mobile, p_cart_id: cartId ?? null, p_password: password });
export const authChangeOwnerPassword = (token, password) => callRpc('app_change_owner_password', { p_token: token, p_password: password });
export const authSetStaffPassword = (token, staffId, password) => callRpc('app_set_staff_password', { p_token: token, p_staff_id: staffId, p_password: password });
export const authRegisterStaff = (token, id, name, mobile, password) => callRpc('app_register_staff', { p_token: token, p_id: id, p_name: name, p_mobile: mobile, p_password: password });
export const authAdminResetOwner = (token, cartId, password) => callRpc('app_admin_reset_owner', { p_token: token, p_cart_id: cartId, p_password: password });
export const authAdminSetRecovery = (token, code) => callRpc('app_admin_set_recovery', { p_token: token, p_code: code });
export const authAdminRecover = (mobile, code, newPassword) => callRpc('app_admin_recover', { p_mobile: mobile, p_code: code, p_new_password: newPassword });

// ─── ATOMIC INVENTORY (delta-based, race-safe) ───
// Apply per-stock-key deltas (or absolute fset/cset) to the cart's inventory.
// Returns { status, cartInv } or { status:'rpc_missing' } when not migrated yet.
export async function applyInventory(cartId, ops) {
  outbox.enqueue('inventory', { cartId, ops });
  await outbox.flush();
  return { status: 'queued' };
}
export async function setCartConsumables(cartId, cons) {
  outbox.enqueue('consumables', { cartId, value: cons });
  await outbox.flush();
  return { status: 'queued' };
}
export async function pushInventoryBlob() { throw new Error('Whole inventory writes are disabled'); }

// Lightweight poll of one cart's orders for a day — used by the staff app to
// pick up new customer QR orders in near-real-time (and fire the order alert).
export async function loadCartOrders(cartId, date) {
  if (!supabase) return null;
  const startedSession = requestHeaders()['x-app-session'];
  try {
    const data = await readOrderPages((from, to) => supabase.from('orders').select('*')
      .eq('cart_id', cartId).eq('date', date).order('id').range(from, to));
    if (startedSession !== requestHeaders()['x-app-session']) return null;
    return data.map(rowToOrder);
  } catch (error) {
    console.warn('order poll failed', error.message);
    return null;
  }
}

// ─── CLOUD LOAD ───
let changeEpoch = 0;
export async function loadCloudState() {
  const startedEpoch = changeEpoch;
  if (!supabase) return null;
  const startedSession = requestHeaders()['x-app-session'];
  try {
    // Account reads use explicit safe columns; credentials are never fetched.
    const resilient = async (table, cols, order) => {
      return supabase.from(table).select(cols).order(order);
    };
    // PostgREST caps a single response at 1000 rows. Page through so growing
    // tables (orders especially) return in FULL — otherwise once a table passes
    // 1000 rows the newest orders silently drop and the owner goes revenue-blind.
    const fetchAll = async (table, order = 'id') => {
      const pageSize = 1000;
      let all = [], from = 0;
      for (;;) {
        const r = await supabase.from(table).select('*').order(order).range(from, from + pageSize - 1);
        if (r.error) return { data: all, error: r.error };
        all = all.concat(r.data || []);
        if (!r.data || r.data.length < pageSize) break;
        from += pageSize;
      }
      return { data: all, error: null };
    };
    const [orders, stockLogs, cartLoadings, dayCloseLogs, inventory, staff, carts, platform, menus, wastage, expenses, payoutMarks] = await Promise.all([
      fetchAll('orders'),
      fetchAll('stock_logs'),
      fetchAll('cart_loadings'),
      fetchAll('day_close_logs'),
      supabase.rpc('app_inventory'),
      resilient('staff', STAFF_COLS, 'id'),
      resilient('carts', CART_COLS, 'created_at'),
      supabase.rpc('app_catalog'),
      supabase.from('menus').select('*').eq('id', 1).maybeSingle(),
      fetchAll('wastage_logs'),
      fetchAll('expenses'),
      fetchAll('payout_marks'),
    ]);
    // Every scoped read must succeed before replacing cached state.
    const failed = [orders, stockLogs, cartLoadings, dayCloseLogs, inventory, staff, carts, platform, menus, wastage, expenses, payoutMarks].find((r) => r.error);
    if (failed) throw failed.error;
    if (requestHeaders()['x-app-session'] !== startedSession || startedEpoch !== changeEpoch) return null;
    storage.set('serverMenus', menus.data?.data || {});
    return {
      orders: orders.data.map((r) => rowToOrder(r)),
      stockLogs: stockLogs.data.map(rowToLog),
      cartLoadings: cartLoadings.data.map(rowToLog),
      dayCloseLogs: dayCloseLogs.data.map((r) => rowToDayClose(r)),
      wastageLogs: (wastage.data || []).map(rowToWastage),
      expenses: (expenses.data || []).map(rowToExpense),
      payoutMarks: (payoutMarks.data || []).map(rowToPayoutMark),
      inventory: inventory.data ?? {},
      staff: staff.data.map((r) => rowToStaff(r)),
      carts: unionById((platform.data?.carts || []).map(rowToCart), carts.data.map(rowToCart)),
      platform: { adminMobile: '9452661608', adminPasswordHash: null },
      menus: menus.data?.data ?? null,
    };
  } catch (e) {
    console.warn('Supabase load failed — running on local data only.', e.message);
    return null;
  }
}

// Insert a brand-new cart (admin onboard). Plain INSERT works with the
// column-level grants; the recurring sync only PATCHes existing carts.
export async function insertCart() { await outbox.flush(); return { error: null }; }

// Customer success is shown only after the database acknowledges this operation.
export async function insertOrderNow(order, operationId = crypto.randomUUID()) {
  if (!supabase) return { error: { message: 'Connect to the internet to place your order.' } };
  const r = await supabase.rpc('app_mutate', { p_id: operationId, p_kind: 'order', p_payload: { before: null, after: orderToRow(order) } });
  if (r.error) return r;
  if (r.data?.status !== 'ok') return { error: { message: r.data?.message || 'Could not place order' } };
  return { data: rowToOrder(r.data.order), error: null };
}
export async function ackOrder(id) {
  // Only this field changes; unrelated order fields cannot be overwritten.
  const order = storage.get('orders', []).find(o => o.id === id);
  if (order) {
    outbox.enqueue('order', { before: orderToRow(order), after: { ...orderToRow(order), acknowledged_at: new Date().toISOString() } });
    await outbox.flush();
  }
}

// Fire the "new order!" push to the cart's staff/owner devices right away, so a
// phone that's locked or has the app in the background rings within a second or
// two instead of waiting for the next cron tick. Best-effort: never block or
// fail the customer's order placement.
export async function notifyNewOrder(order) {
  try {
    await fetch('/api/notify-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...requestHeaders() },
      body: JSON.stringify({
        cartId: order.cartId, orderId: order.id, token: order.token,
        total: order.total, itemCount: (order.items || []).reduce((s, i) => s + (i.qty || 0), 0),
      }),
    });
  } catch { /* offline — the repeat cron will still catch it */ }
}

// Hard-delete a stock log row (e.g. undoing an accidental plate handover).
// Must hit the cloud too: the sync is append-only union, so a local-only
// delete would be resurrected from the cloud on the next load.
export async function deleteStockLog(id) {
  const before = storage.get('stockLogs', []).find(x => x.id === id);
  if (before) outbox.enqueue('row', { table: 'stock_logs', before: logToRow(before), after: null });
  await outbox.flush(); return { error: null };
}
export async function setCartClosed() { await outbox.flush(); return { error: null }; }
export async function saveCartProfile() { await outbox.flush(); return { error: null }; }

const slices = {
  orders: { table: 'orders', to: orderToRow, from: rowToOrder },
  stockLogs: { table: 'stock_logs', to: logToRow, from: rowToLog },
  cartLoadings: { table: 'cart_loadings', to: logToRow, from: rowToLog },
  dayCloseLogs: { table: 'day_close_logs', to: dayCloseToRow, from: rowToDayClose },
  wastageLogs: { table: 'wastage_logs', to: wastageToRow, from: rowToWastage },
  expenses: { table: 'expenses', to: expenseToRow, from: rowToExpense },
  payoutMarks: { table: 'payout_marks', to: payoutMarkToRow, from: rowToPayoutMark },
  staff: { table: 'staff', to: staffToRow, from: rowToStaff },
  carts: { table: 'carts', to: cartToRow, from: rowToCart },
};
function currentActor() {
  const s = storage.get('session', null);
  return s?.token ? `${s.role}:${s.cartId || ''}:${s.name || ''}` : 'customer';
}
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
export const outbox = createOutbox({
  read: () => Object.keys(localStorage).filter(k => k.startsWith('mw:op:')).map(k => JSON.parse(localStorage.getItem(k))).filter(Boolean).sort((a,b) => a.createdAt-b.createdAt || a.sequence-b.sequence),
  put: op => localStorage.setItem('mw:op:' + op.id, JSON.stringify(op)),
  remove: id => localStorage.removeItem('mw:op:' + id),
  actor: currentActor,
  send: op => {
    if (!supabase) throw new Error('Offline');
    const token = requestHeaders()['x-app-session'] || '';
    const request = op.kind === 'batch'
      ? supabase.rpc('app_mutate_batch', { p_id: op.id, p_commands: op.payload.commands })
      : supabase.rpc('app_mutate', { p_id: op.id, p_kind: op.kind, p_payload: op.payload });
    return request.setHeader('x-app-session', token);
  },
  onResult: (result, op) => {
    if (op.kind === 'batch') {
      operationChanges([op]).forEach((change, i) => {
        if (change.kind === 'menu') storage.set('serverMenus', { ...storage.get('serverMenus', {}), [change.payload.cartId]: change.payload.value });
        emit('mw:committed', { ...result.results[i], op: change });
      });
      return;
    }
    if (op.kind === 'menu') storage.set('serverMenus', { ...storage.get('serverMenus', {}), [op.payload.cartId]: op.payload.value });
    emit('mw:committed', { ...result, op });
  },
  onStatus: ops => { changeEpoch++; emit('mw:sync', ops); },
});
export function trackChanges(before, after, extraCommands = []) {
  const commands = [];
  if (!storage.get('session', null)?.token) return;
  for (const [key, cfg] of Object.entries(slices)) {
    if (before[key] === after[key]) continue;
    const old = new Map(before[key].map(x => [x.id, x]));
    const fresh = new Map(after[key].map(x => [x.id, x]));
    for (const id of new Set([...old.keys(), ...fresh.keys()])) {
      const b = old.get(id), a = fresh.get(id);
      if (a === b) continue;
      // Staff registration is already an authenticated RPC; no duplicate insert.
      if (key === 'staff' && !b && a) continue;
      if (key === 'orders' && (!a || (!b && a.revision > 0))) continue;
      let br = b ? cfg.to(b) : null, ar = a ? cfg.to(a) : null;
      if (JSON.stringify(br) === JSON.stringify(ar)) continue;
      if (key === 'carts' && b && a) {
        const changed = Object.keys(ar).filter(k => k !== 'id' && JSON.stringify(ar[k]) !== JSON.stringify(br[k]));
        ar = Object.fromEntries(['id', ...changed].map(k => [k, ar[k]]));
        br = Object.fromEntries(['id', ...changed].map(k => [k, br[k]]));
      }
      commands.push({ kind: key === 'orders' ? 'order' : 'row', payload: { table: cfg.table, before: br, after: ar } });
    }
  }
  if (before.menus !== after.menus) {
    for (const [cartId, menu] of Object.entries(after.menus)) {
      if (JSON.stringify(before.menus[cartId]) !== JSON.stringify(menu)) {
        const queued = pendingOperations().filter(o => o.kind === 'menu' && o.payload.cartId === cartId).at(-1);
        commands.push({ kind: 'menu', payload: { cartId, before: queued?.payload.value ?? storage.get('serverMenus', {})[cartId] ?? null, value: menu } });
      }
    }
  }
  commands.push(...extraCommands);
  if (commands.length) {
    // A single storage write precedes every optimistic state change.
    const requiresBatch = commands.length > 1 || commands.some(c => ['inventory','consumables'].includes(c.kind) || c.payload.table === 'day_close_logs');
    if (requiresBatch) outbox.enqueue('batch', { commands });
    else outbox.enqueue(commands[0].kind, commands[0].payload);
  }
  void outbox.flush();
}
export function syncToCloud() { void outbox.flush(); }
export const validateSession = () => supabase?.rpc('app_identity');
export async function revokeSession() {
  if (!supabase) return;
  const token = requestHeaders()['x-app-session'] || '';
  try { return await supabase.rpc('app_logout').setHeader('x-app-session', token); }
  catch { /* Local logout still completes offline; server expiry remains enforced. */ }
}
export function pendingOperations() { return operationChanges(outbox.list().filter(o => o.actor === currentActor())); }
export function discardFailedOperations() {
  archiveRejected({ operations: outbox.list(), actor: currentActor(), backup: storage.get('failedOperationsBackup', []),
    persistBackup: value => localStorage.setItem('mw:failedOperationsBackup', JSON.stringify(value)),
    remove: id => localStorage.removeItem('mw:op:' + id) });
}
export function savedReconciliations(cartId) {
  return reconciliationBackups(storage.get('failedOperationsBackup', []), currentActor(), cartId);
}
export async function restoreReconciliation(id, cartId) {
  const op = savedReconciliations(cartId).find(item => item.id === id);
  if (!op) throw new Error('This backup is not available for the signed-in owner.');
  const row = reconciliationRow(op);
  const {data,error} = await supabase.from('day_close_logs').select('id').eq('cart_id',cartId).eq('date',row.date);
  if (error) throw new Error('Could not check the saved report. Connect to the internet and retry.');
  if (data.some(item => item.id !== row.id)) throw new Error('A report for this date already exists on the server. Review it before restoring; nothing was overwritten.');
  await outbox.restore(op);
  // Retain the original recovery copy even after success for traceability.
}

export async function loadInventory() {
  if (!supabase) return null;
  const startedSession = requestHeaders()['x-app-session'];
  const { data, error } = await supabase.rpc('app_inventory');
  return error || requestHeaders()['x-app-session'] !== startedSession ? null : data;
}
export function committedOrder(row) { return rowToOrder(row); }
