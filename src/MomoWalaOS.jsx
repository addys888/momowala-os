import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from './lib/store';
import { AdminApp } from './screens/Admin';
import { TODAY, getInitialState, normalize } from './core';
import { CartListing, CartMenu } from './screens/Customer';
import { AdminLogin, TeamLogin } from './screens/Login';
import { OwnerApp } from './screens/owner/OwnerApp';
import { StaffApp } from './screens/Staff';
import { StoreContext, useStore } from './store';

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

  // While a staff member is logged in, poll their cart's orders so new customer
  // QR orders appear without a manual refresh (and the StaffApp can alert).
  useEffect(() => {
    if (session?.role !== 'staff' || !session.cartId) return;
    let alive = true;
    const tick = async () => {
      const fresh = await loadCartOrders(session.cartId, TODAY);
      if (!alive || !fresh) return;
      setState(prev => {
        const prevById = new Map(prev.orders.map(o => [o.id, o]));
        const changed = fresh.some(o => { const p = prevById.get(o.id); return !p || p.payment !== o.payment; });
        return changed ? { ...prev, orders: mergeOrders(prev.orders, fresh) } : prev;
      });
    };
    const t = setInterval(tick, 12000);
    tick();
    return () => { alive = false; clearInterval(t); };
  }, [session]);

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

  // Accepts a plain object of fields to merge, OR a function (prev) => fields
  // when the merge must be computed from the freshest state (avoids stale-closure
  // clobbers under rapid/concurrent updates).
  const updateState = (updates) => setState(prev => ({ ...prev, ...(typeof updates === 'function' ? updates(prev) : updates) }));
  // sess may carry a server-issued token + expiresAt (from app_login). Fall back
  // to a local 8h window for the legacy path that doesn't return one.
  const login = (sess) => setSession({ ...sess, expiresAt: sess.expiresAt || Date.now() + SESSION_MS });
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
