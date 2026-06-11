import { supabase } from './supabase';

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
// orders / stock_logs / cart_loadings already use lowercase single-word keys
// that match their columns; only day_close_logs needs camelCase ↔ snake_case.

const dayCloseToRow = (d) => ({
  id: d.id,
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

export function mergeStates(localState, cloud) {
  return {
    ...localState,
    orders: unionById(localState.orders, cloud.orders),
    stockLogs: unionById(localState.stockLogs, cloud.stockLogs),
    cartLoadings: unionById(localState.cartLoadings, cloud.cartLoadings),
    dayCloseLogs: unionById(localState.dayCloseLogs, cloud.dayCloseLogs),
    inventory: cloud.inventory ?? localState.inventory,
  };
}

// ─── CLOUD LOAD ───
export async function loadCloudState() {
  if (!supabase) return null;
  try {
    const [orders, stockLogs, cartLoadings, dayCloseLogs, inventory] = await Promise.all([
      supabase.from('orders').select('*').order('id'),
      supabase.from('stock_logs').select('*').order('id'),
      supabase.from('cart_loadings').select('*').order('id'),
      supabase.from('day_close_logs').select('*').order('id'),
      supabase.from('inventory').select('*').eq('id', 1).maybeSingle(),
    ]);
    const failed = [orders, stockLogs, cartLoadings, dayCloseLogs, inventory].find((r) => r.error);
    if (failed) throw failed.error;
    return {
      orders: orders.data.map(stripMeta),
      stockLogs: stockLogs.data.map(stripMeta),
      cartLoadings: cartLoadings.data.map(stripMeta),
      dayCloseLogs: dayCloseLogs.data.map((r) => rowToDayClose(r)),
      inventory: inventory.data?.data ?? null,
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
    const append = (table, rows) =>
      rows.length
        ? supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
        : null;
    const results = await Promise.all(
      [
        append('orders', state.orders),
        append('stock_logs', state.stockLogs),
        append('cart_loadings', state.cartLoadings),
        append('day_close_logs', state.dayCloseLogs.map(dayCloseToRow)),
        supabase
          .from('inventory')
          .upsert({ id: 1, data: state.inventory, updated_at: new Date().toISOString() }),
      ].filter(Boolean)
    );
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  } catch (e) {
    console.warn('Supabase sync failed — data is still saved locally.', e.message);
  }
}
