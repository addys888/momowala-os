import { nativeCommand } from './lib/nativeApp';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';

import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { loadInventory, committedOrder, trackChanges, pendingOperations, savedOrders, restoreSavedOrders, outbox, validateSession, revokeSession, storage, loadCloudState, mergeStates, loadCartOrders, mergeOrders } from './lib/store';
import { TODAY, localDate, getInitialState, normalize } from './core';
import { AdminLogin, TeamLogin } from './screens/Login';
import { StoreContext, useStore } from './store';
import { loadSignedInScreen } from './lib/screenModules';
import { AppLaunch } from './components/AppLaunch';

const AdminApp = lazy(() => loadSignedInScreen('admin'));
const CartListing = lazy(() => import('./screens/Customer').then(m => ({ default: m.CartListing })));
const CartMenu = lazy(() => import('./screens/Customer').then(m => ({ default: m.CartMenu })));
const OwnerApp = lazy(() => loadSignedInScreen('owner'));
const StaffApp = lazy(() => loadSignedInScreen('staff'));

const liveSession = (s) => (s?.token && s.expiresAt > Date.now()) ? s : null;


export default function App() {
  const [state, reactSetState] = useState(() => normalize(getInitialState()));
  const stateRef = useRef(state);
  const setState = (value) => {
    const next = typeof value === 'function' ? value(stateRef.current) : value;
    stateRef.current = next;
    reactSetState(next);
  };
  const [hydrated, setHydrated] = useState(false);
  const justAuthenticated = useRef(null);
  const [syncOps, setSyncOps] = useState(() => pendingOperations());
  const [showPending, setShowPending] = useState(false);
  useEffect(() => {
    if (!syncOps.length) { setShowPending(false); return; }
    const timer = setTimeout(() => setShowPending(true), 5000);
    return () => clearTimeout(timer);
  }, [syncOps.length]);
  // session: null | { role, cartId?, name?, expiresAt } — persisted with the server expiry
  const [session, setSession] = useState(() => liveSession(storage.get('session', null)));

  useEffect(() => {
    let active = true;
    setHydrated(false);
    (async () => {
      if (session?.role) void loadSignedInScreen(session.role).catch(() => {});
      if (session?.token && justAuthenticated.current !== session.token) {
        const checked = await validateSession();
        if (!active) return;
        if (checked && !checked.error) {
          if (!checked.data?.role) { storage.set('session', null); setSession(null); return; }
          const verified = { ...session, ...checked.data };
          storage.set('session', verified); setSession(verified);
        }
      }
      const cloud = await loadCloudState();
      if (!active) return;
      if (cloud) { setState(prev => normalize(mergeStates(prev, cloud))); setLastSync(Date.now()); }
      setHydrated(true);
      void outbox.flush();
    })();
    return () => { active = false; };
  }, [session?.token]);

  useEffect(() => {
    const status = () => setSyncOps(pendingOperations());
    const committed = (e) => {
      const r = e.detail;
      if (r.order && !pendingOperations().some(o => o.kind === 'order' && o.payload.after?.id === r.order.id)) {
        setState(prev => ({ ...prev, orders: mergeOrders(prev.orders, [committedOrder(r.order)]) }));
      }
      status();
    };
    const refresh = async () => {
      await outbox.flush();
      // Cart sessions already refresh through the visibility/online poll below.
      if (storage.get('session', null)?.cartId) return;
      const cloud = await loadCloudState();
      if (cloud) setState(prev => normalize(mergeStates(prev, cloud)));
    };
    const retry = () => { void refresh(); };
    const timer = setInterval(() => { void outbox.flush(); }, 12000);
    window.addEventListener('online', retry);
    window.addEventListener('mw:sync', status);
    window.addEventListener('mw:committed', committed);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('mw:sync', status);
      window.removeEventListener('mw:committed', committed);
    };
  }, []);

  // Roll over the business day. TODAY is fixed at page load, so a device left
  // open across midnight keeps showing the previous day as "today" (staff sees
  // yesterday's orders, owner doesn't). Reload when the IST date changes — at
  // midnight the cart is closed, so this is safe; also re-check on focus so a
  // phone woken the next day refreshes before use.
  useEffect(() => {
    const check = () => { if (localDate() !== TODAY) window.location.reload(); };
    const t = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);

  // Self-update on new deploys. A device left open for days keeps running the
  // exact build it first loaded — old code with old sync behaviour. That is the
  // ROOT of the repeated menu-clobber incidents: a client-side fix can't reach a
  // client that never reloads. Each build stamps its id into the bundle AND into
  // /version.json; when they differ a newer build shipped, so reload — but only
  // when the operator returns to the tab (visible/focus), never mid-order, and
  // never on the background timer. Data is already in localStorage, so a reload
  // at a visible moment is safe.
  useEffect(() => {
    if (__ANDROID_APP__) return; // Bundled APK screens update through a signed APK release.
    const checkVersion = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const { v } = await r.json();
        if (v && typeof __BUILD_ID__ !== 'undefined' && v !== __BUILD_ID__) window.location.reload();
      } catch { /* offline or not deployed yet — ignore */ }
    };
    document.addEventListener('visibilitychange', checkVersion);
    window.addEventListener('focus', checkVersion);
    checkVersion();
    return () => { document.removeEventListener('visibilitychange', checkVersion); window.removeEventListener('focus', checkVersion); };
  }, []);

  // While staff OR owner is logged in, poll the cart's today orders so new
  // orders appear without a manual refresh — keeps the staff screen (and alert)
  // AND the owner dashboard/reports live, so two devices don't drift apart.
  // lastSync feeds the "live · updated Xs ago" label; pollRef lets the owner's
  // 🔄 button pull on demand without any extra background traffic.
  const [lastSync, setLastSync] = useState(null);
  const pollRef = useRef(null);
  useEffect(() => {
    if (!hydrated || !session?.cartId || (session.role !== 'staff' && session.role !== 'owner')) { pollRef.current = null; return; }
    let alive = true, inFlight = false, fullSyncAt = Date.now();
    const tick = async (force = false) => {
      // Never stack requests: on slow 4G a poll can outlast the 12s interval, and
      // firing another on top of it piles up in-flight calls and hangs the app.
      // Also skip background polling when the tab isn't visible (the manual 🔄
      // button passes force=true so the owner can always pull on demand).
      if (inFlight || (!force && document.hidden)) return;
      inFlight = true;
      try {
        const [fresh, inventory] = await Promise.all([loadCartOrders(session.cartId, TODAY), loadInventory()]);
        if (!alive || !fresh) return;
        setLastSync(Date.now());
        setState(prev => {
          const ops = pendingOperations();
          return { ...prev,
            orders: mergeOrders(prev.orders, fresh, ops),
            inventory: inventory && !ops.some(o => ['order', 'inventory', 'consumables'].includes(o.kind)) ? { ...prev.inventory, ...inventory } : prev.inventory,
          };
        });
        // Menu, hours, reports and yesterday's unpaid orders must also follow
        // edits made on another phone, without fetching history every 12 seconds.
        if (force || Date.now() - fullSyncAt >= 60000) {
          const identity = await validateSession();
          if (!alive) return;
          if (identity && !identity.error && !identity.data?.role) {
            storage.set('session', null); setSession(null); return;
          }
          const cloud = await loadCloudState();
          if (alive && cloud) {
            setState(prev => normalize(mergeStates(prev, cloud)));
            fullSyncAt = Date.now();
          }
        }
      } catch (error) {
        console.warn('Cart sync failed', error.message);
      } finally { inFlight = false; }
    };
    pollRef.current = () => tick(true);
    const t = setInterval(tick, 12000);
    const resume = () => { if (!document.hidden) void tick(true); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    // Hydration just loaded orders and stock; the first scheduled tick keeps
    // them current without immediately downloading the same data again.
    return () => {
      alive = false; clearInterval(t); pollRef.current = null;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
    };
  }, [session?.token, hydrated]);
  const refreshNow = async () => { if (pollRef.current) await pollRef.current(); };
  const refreshSavedData = async () => {
    const token = storage.get('session', null)?.token;
    const cloud = await loadCloudState();
    if (cloud && token === storage.get('session', null)?.token) setState(prev => normalize(mergeStates(prev, cloud)));
  };

  // Persist to localStorage, but ONLY the slices whose reference actually changed.
  // State is updated immutably, so an unchanged slice keeps its reference and is
  // skipped — this avoids re-serialising the entire orders/logs dataset (which
  // grows daily) on every single state update, the main cause of the UI getting
  // sluggish as data accumulates.
  const persistedRef = useRef({});
  useEffect(() => {
    const slices = {
      platform: state.platform, carts: state.carts, inventoryByCart: state.inventory,
      menus: state.menus, staffV2: state.staff, orders: state.orders, stockLogs: state.stockLogs,
      cartLoadings: state.cartLoadings, dayCloseLogs: state.dayCloseLogs, wastageLogs: state.wastageLogs,
      expenses: state.expenses, payoutMarks: state.payoutMarks,
    };
    for (const k in slices) {
      if (persistedRef.current[k] !== slices[k]) { storage.set(k, slices[k]); persistedRef.current[k] = slices[k]; }
    }
    // Cloud writes are captured only by explicit local edits, never hydration.
  }, [state]);

  useEffect(() => { storage.set('session', session); }, [session]);

  // Acceptance/payment on this phone or a synced phone stops the matching
  // native loop; opening a screen alone never acknowledges anything.
  useEffect(() => {
    if (!__ANDROID_APP__ || !session?.cartId) return;
    const keys = new Set(nativeCommand('orderAlertKeys')?.keys || []);
    for (const order of state.orders) {
      const key = `order-${order.id}`;
      if (order.cartId === session.cartId && keys.has(key) && (order.acknowledgedAt || order.payment !== 'pending')) nativeCommand('acknowledgePartner', { key });
    }
  }, [state.orders, session?.cartId]);

  // Respect the expiry issued by the database.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { setSession(null); return; }
    const t = setTimeout(() => setSession(null), ms);
    return () => clearTimeout(t);
  }, [session]);

  // Accepts a plain object of fields to merge, OR a function (prev) => fields
  // when the merge must be computed from the freshest state (avoids stale-closure
  // clobbers under rapid/concurrent updates).
  const updateState = (updates, commands = []) => {
    const prev = stateRef.current;
    const next = { ...prev, ...(typeof updates === 'function' ? updates(prev) : updates) };
    try { trackChanges(prev, next, commands); }
    catch { alert('This device could not save the change. Free storage space and retry.'); return false; }
    setState(next);
    return true;
  };
  const login = (sess) => { justAuthenticated.current = sess.token; setLastSync(null); setHydrated(false); storage.set('session', sess); setSession(sess); };
  const logout = () => {
    if (pendingOperations().length && !confirm('Some changes are waiting to sync. They remain saved on this device. Log out?')) return;
    void revokeSession();
    storage.set('session', null);
    setLastSync(null);
    setHydrated(false); setSession(null);
  };

  return (
    <StoreContext.Provider value={{ state, updateState, session, login, logout, lastSync, refreshNow, refreshSavedData, hydrated }}>
      {syncOps.length > 0 && (showPending || syncOps.some(o => o.error)) && <div role="status" style={{ padding: 12, background: '#fff3cd', color: '#663c00' }}>
        {syncOps.some(o => o.error) ? `A change needs attention: ${syncOps.find(o => o.error).error}` : `${syncOps.length} change(s) saved on this device, waiting to sync.`}
        {syncOps.some(o => o.error) && <button style={{ marginLeft: 8, padding: '8px 12px', borderRadius: 8 }} onClick={async () => {
          try { await outbox.retryFailed(); } catch { alert('Could not retry. Your changes remain saved on this device.'); }
        }}>Retry sync</button>}
      </div>}
      {session?.cartId && savedOrders(session.cartId).length > 0 && <details style={{padding:12}}><summary>Recover orders saved on this phone</summary><p>Retry previously set-aside orders using their original IDs. Existing successful submissions will not be duplicated.</p><button onClick={async () => {
        try { await restoreSavedOrders(session.cartId); await refreshSavedData(); alert('Saved orders synced. Recovery copies are retained.'); }
        catch (error) { alert(error.message); }
      }}>Recover saved orders</button></details>}
      <BrowserRouter>
        <DataReady><Suspense fallback={<AppLaunch />}><Routes>
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
        </Routes></Suspense></DataReady>
      </BrowserRouter>
    </StoreContext.Provider>
  );
}

// Login is independent of business-data/network hydration. Public shopping and
// authenticated operations still wait for their scoped data before rendering.
function DataReady({ children }) {
  const { hydrated } = useStore();
  const { pathname } = useLocation();
  return hydrated || pathname === '/login' || pathname === '/admin/login' ? children : <AppLaunch />;
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
