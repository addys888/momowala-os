import React, { useState, useEffect } from 'react';
import { storage, loadCloudState, mergeStates, syncToCloud } from './lib/store';
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

// ─── MENU DATA ───
const MENU_ITEMS = [
  { id: 'vs', name: 'Veg Steam', cat: 'Steamed', half: 30, full: 60, pcsHalf: 5, pcsFull: 10, type: 'veg', stockKey: 'veg' },
  { id: 'ps', name: 'Paneer Steam', cat: 'Steamed', half: 40, full: 80, pcsHalf: 5, pcsFull: 10, type: 'paneer', stockKey: 'paneer' },
  { id: 'vk', name: 'Veg Kurkure', cat: 'Kurkure', half: 40, full: 80, pcsHalf: 4, pcsFull: 8, type: 'veg', stockKey: 'veg', star: true },
  { id: 'pk', name: 'Paneer Kurkure', cat: 'Kurkure', half: 50, full: 99, pcsHalf: 4, pcsFull: 8, type: 'paneer', stockKey: 'paneer' },
  { id: 'va', name: 'Veg Afghani', cat: 'Afghani', half: 60, full: 99, pcsHalf: 5, pcsFull: 9, type: 'veg', stockKey: 'veg' },
  { id: 'pa', name: 'Paneer Afghani', cat: 'Afghani', half: 70, full: 119, pcsHalf: 5, pcsFull: 9, type: 'paneer', stockKey: 'paneer', star: true },
  { id: 'vt', name: 'Veg Tandoori', cat: 'Tandoori', half: 60, full: 120, pcsHalf: 5, pcsFull: 10, type: 'veg', stockKey: 'veg' },
  { id: 'pt', name: 'Paneer Tandoori', cat: 'Tandoori', half: 70, full: 140, pcsHalf: 5, pcsFull: 10, type: 'paneer', stockKey: 'paneer', star: true },
  { id: 'vf', name: 'Veg Fried', cat: 'Fried', half: 40, full: 70, pcsHalf: 5, pcsFull: 10, type: 'veg', stockKey: 'veg' },
  { id: 'pf', name: 'Paneer Fried', cat: 'Fried', half: 50, full: 90, pcsHalf: 5, pcsFull: 10, type: 'paneer', stockKey: 'paneer' },
];

const COMBOS = [
  { id: 'c1', name: 'Chai-Momo', price: 70, contains: [{id: 'vs', type: 'half'}], extra: 'Masala Chai' },
  { id: 'c2', name: 'Student Special', price: 50, contains: [{id: 'vs', type: 'half'}], extra: 'Cold Drink' },
  { id: 'c3', name: 'Family Feast', price: 280, contains: [{id: 'vs', type: 'full'}, {id: 'pk', type: 'full'}], extra: '4 Cold Drinks' },
  { id: 'c4', name: 'Pilgrim Thali', price: 140, contains: [{id: 'vs', type: 'full'}], extra: 'Roll + Chai' },
];

const BEVERAGES = [
  { id: 'b1', name: 'Masala Chai', price: 20 },
  { id: 'b2', name: 'Cold Drink', price: 25 },
  { id: 'b3', name: 'Masala Chaas', price: 30 },
  { id: 'b4', name: 'Lassi', price: 30 },
  { id: 'b5', name: 'Nimbu Pani', price: 20 },
  { id: 'b6', name: 'Water Bottle', price: 15 },
];

const ADDONS = [
  { id: 'a1', name: 'Cheese Slice', price: 20 },
  { id: 'a2', name: 'Schezwan Chutney', price: 10 },
  { id: 'a3', name: 'Cheese Burst', price: 20 },
];

// ─── STORAGE ───
// localStorage (offline-first) + Supabase cloud sync — see src/lib/store.js

const TODAY = new Date().toISOString().split('T')[0];

// ─── INITIAL STATE ───
const getInitialState = () => ({
  inventory: storage.get('inventory', {
    veg: { freezer: 500, cart: 100 },     // pieces
    paneer: { freezer: 200, cart: 50 },
    consumables: {
      oil: { unit: 'L', stock: 5, perOrder: 0.02 },
      cream: { unit: 'ml', stock: 1000, perOrder: 15 },
      cheese: { unit: 'slices', stock: 50, perOrder: 1 },
      schezwan: { unit: 'ml', stock: 500, perOrder: 10 },
    },
    beverages: { chai: 100, cold: 30, lassi: 0, chaas: 20, water: 30 }
  }),
  orders: storage.get('orders', []),
  stockLogs: storage.get('stockLogs', []),
  cartLoadings: storage.get('cartLoadings', []),
  dayCloseLogs: storage.get('dayCloseLogs', []),
  currentShift: storage.get('currentShift', null),
  staffOnDuty: storage.get('staffOnDuty', null),
});

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function MomoWalaOS() {
  const [role, setRole] = useState(null);
  const [state, setState] = useState(getInitialState());
  const [online, setOnline] = useState(true);

  // Hydrate from Supabase once on load (no-op when env keys are missing)
  useEffect(() => {
    loadCloudState().then(cloud => {
      if (cloud) setState(prev => mergeStates(prev, cloud));
    });
  }, []);

  useEffect(() => {
    storage.set('inventory', state.inventory);
    storage.set('orders', state.orders);
    storage.set('stockLogs', state.stockLogs);
    storage.set('cartLoadings', state.cartLoadings);
    storage.set('dayCloseLogs', state.dayCloseLogs);
    storage.set('currentShift', state.currentShift);
    storage.set('staffOnDuty', state.staffOnDuty);
    syncToCloud(state);
  }, [state]);

  const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));

  if (!role) return <RoleSelector onSelect={setRole} online={online} setOnline={setOnline} />;

  const props = { state, updateState, setRole, online };
  if (role === 'owner') return <OwnerApp {...props} />;
  if (role === 'staff') return <StaffApp {...props} />;
  if (role === 'customer') return <CustomerApp {...props} />;
}

// ═══════════════════════════════════════════════
// ROLE SELECTOR — Splash Screen
// ═══════════════════════════════════════════════
function RoleSelector({ onSelect, online, setOnline }) {
  return (
    <div style={{ minHeight: '100vh', background: colors.paper, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px' }}>
        {/* Brand Mark */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: colors.ink, padding: '12px 20px', borderRadius: 100, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🥟</div>
            <div style={{ color: colors.primary, fontWeight: 900, fontSize: 18, letterSpacing: 2 }}>MOMO WALA</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: colors.ink, lineHeight: 1.2 }}>Cart Operating System</div>
          <div style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>Saketpuri Yojna, Ayodhya · Daily 4 PM — 11 PM</div>
        </div>

        {/* Status indicator */}
        <button
          onClick={() => setOnline(!online)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: online ? '#E7F5E7' : '#FFF1E7', border: `1px solid ${online ? colors.green : colors.accent}`, borderRadius: 20, marginBottom: 24, fontSize: 12, color: online ? colors.green : colors.accent, fontWeight: 600, margin: '0 auto 24px', cursor: 'pointer' }}>
          {online ? <Wifi size={14}/> : <WifiOff size={14}/>}
          {online ? 'Online · Auto-sync ready' : 'Offline · Saving locally'}
        </button>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RoleCard
            icon={<BarChart3 size={28} />}
            title="Owner"
            subtitle="Full control · Reports · Reconciliation"
            description="Dashboard, inventory, staff, audit logs"
            color={colors.ink}
            textColor={colors.primary}
            onClick={() => onSelect('owner')}
          />
          <RoleCard
            icon={<ChefHat size={28} />}
            title="Staff (Chef / Helper)"
            subtitle="Order entry · Stock updates"
            description="Take orders, mark payments, manage shift"
            color={colors.primary}
            textColor={colors.ink}
            onClick={() => onSelect('staff')}
          />
          <RoleCard
            icon={<Smartphone size={28} />}
            title="Customer"
            subtitle="Self-order via QR menu"
            description="Browse menu, place order, get token"
            color="#fff"
            textColor={colors.ink}
            border={`2px solid ${colors.ink}`}
            onClick={() => onSelect('customer')}
          />
        </div>

        <div style={{ marginTop: 48, padding: 16, background: '#fff', border: `1px dashed ${colors.border}`, borderRadius: 12, fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
          <strong style={{ color: colors.ink }}>How to install as APK on Android:</strong><br/>
          Open this page in Chrome → tap ⋮ menu → "Add to Home screen" → behaves like a native app, works offline.
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

// ═══════════════════════════════════════════════
// OWNER APP
// ═══════════════════════════════════════════════
function OwnerApp({ state, updateState, setRole }) {
  const [tab, setTab] = useState('dashboard');

  const todayOrders = state.orders.filter(o => o.date === TODAY);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
  const cashRevenue = todayOrders.filter(o => o.payment === 'cash').reduce((sum, o) => sum + o.total, 0);
  const upiRevenue = todayOrders.filter(o => o.payment === 'upi').reduce((sum, o) => sum + o.total, 0);
  const piecesSold = todayOrders.reduce((sum, o) => {
    return sum + o.items.reduce((s, item) => {
      const m = MENU_ITEMS.find(x => x.id === item.id);
      if (!m) return s;
      return s + (item.type === 'half' ? m.pcsHalf : m.pcsFull) * item.qty;
    }, 0);
  }, 0);

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title="Owner Console" onExit={() => setRole(null)} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'dashboard' && <Dashboard state={state} todayRevenue={todayRevenue} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} todayOrders={todayOrders} />}
        {tab === 'inventory' && <InventoryView state={state} updateState={updateState} />}
        {tab === 'reconcile' && <Reconciliation state={state} updateState={updateState} todayOrders={todayOrders} cashRevenue={cashRevenue} upiRevenue={upiRevenue} piecesSold={piecesSold} />}
        {tab === 'reports' && <Reports state={state} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'dashboard', icon: <Home size={20}/>, label: 'Home' },
        { id: 'inventory', icon: <Boxes size={20}/>, label: 'Stock' },
        { id: 'reconcile', icon: <CheckCircle2 size={20}/>, label: 'Reconcile' },
        { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Reports' },
      ]} />
    </div>
  );
}

function TopBar({ title, onExit }) {
  return (
    <div style={{ background: colors.ink, color: colors.primary, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🥟</div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1 }}>MOMO WALA OS</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        </div>
      </div>
      <button onClick={onExit} style={{ background: 'transparent', border: `1px solid ${colors.primary}`, color: colors.primary, padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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
            style={{ background: 'transparent', border: 'none', padding: '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: tab === t.id ? colors.ink : colors.muted, fontWeight: tab === t.id ? 700 : 500 }}>
            {t.icon}
            <span style={{ fontSize: 11 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── OWNER: DASHBOARD ───
function Dashboard({ state, todayRevenue, cashRevenue, upiRevenue, piecesSold, todayOrders }) {
  const expectedRevenue = piecesSold * 12; // avg ₹12/piece
  const variance = todayRevenue - expectedRevenue;
  const vegLow = state.inventory.veg.freezer < 100;
  const paneerLow = state.inventory.paneer.freezer < 50;

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

      {/* Stock alerts */}
      {(vegLow || paneerLow) && (
        <Alert type="danger" title="Low stock alert" message={`${vegLow ? 'Veg' : ''}${vegLow && paneerLow ? ' & ' : ''}${paneerLow ? 'Paneer' : ''} momo running low. Order before tomorrow.`} />
      )}

      <SectionHeader title="Live Inventory" />
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <StockRow label="Veg Momo · Freezer" value={state.inventory.veg.freezer} unit="pcs" low={vegLow} />
        <StockRow label="Veg Momo · On Cart" value={state.inventory.veg.cart} unit="pcs" />
        <StockRow label="Paneer Momo · Freezer" value={state.inventory.paneer.freezer} unit="pcs" low={paneerLow} />
        <StockRow label="Paneer Momo · On Cart" value={state.inventory.paneer.cart} unit="pcs" />
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
        <div style={{ fontSize: 10, padding: '2px 8px', background: order.payment === 'cash' ? '#E7F5E7' : '#E7EEFF', color: order.payment === 'cash' ? colors.green : '#0050B3', borderRadius: 10, marginTop: 2, display: 'inline-block', fontWeight: 600 }}>{order.payment.toUpperCase()}</div>
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
function InventoryView({ state, updateState }) {
  const [showAddStock, setShowAddStock] = useState(false);

  const addStock = (type, qty) => {
    const newInv = { ...state.inventory };
    newInv[type] = { ...newInv[type], freezer: newInv[type].freezer + qty };
    const log = {
      id: Date.now(),
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'STOCK_IN',
      item: type,
      qty,
      note: `Added ${qty} pieces of ${type}`
    };
    updateState({ inventory: newInv, stockLogs: [...state.stockLogs, log] });
    setShowAddStock(false);
  };

  const loadToCart = (type, qty) => {
    const newInv = { ...state.inventory };
    if (newInv[type].freezer < qty) {
      alert('Not enough stock in freezer!');
      return;
    }
    newInv[type] = { freezer: newInv[type].freezer - qty, cart: newInv[type].cart + qty };
    const log = {
      id: Date.now(),
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type: 'CART_LOAD',
      item: type,
      qty,
      note: `Moved ${qty} ${type} pieces to cart`
    };
    updateState({ inventory: newInv, cartLoadings: [...state.cartLoadings, log] });
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
        <FreezerItem type="veg" stock={state.inventory.veg.freezer} cart={state.inventory.veg.cart} onLoad={loadToCart} />
        <FreezerItem type="paneer" stock={state.inventory.paneer.freezer} cart={state.inventory.paneer.cart} onLoad={loadToCart} />
      </div>

      {/* Consumables */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>CONSUMABLES (AUTO-TRACKED)</div>
        {Object.entries(state.inventory.consumables).map(([key, item]) => (
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
        {[...state.stockLogs, ...state.cartLoadings].sort((a, b) => b.id - a.id).slice(0, 8).map(log => (
          <div key={log.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>{log.type.replace('_', ' ')}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{log.note}</div>
            </div>
            <div style={{ fontSize: 11, color: colors.muted }}>{log.time}</div>
          </div>
        ))}
        {state.stockLogs.length === 0 && state.cartLoadings.length === 0 && (
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
        <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{type} Momo</div>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: colors.border, borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>New Stock Delivery</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>ITEM TYPE</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setType('veg')} style={{ flex: 1, padding: 12, border: `2px solid ${type === 'veg' ? colors.ink : colors.border}`, background: type === 'veg' ? colors.ink : '#fff', color: type === 'veg' ? colors.primary : colors.ink, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Veg Momo</button>
            <button onClick={() => setType('paneer')} style={{ flex: 1, padding: 12, border: `2px solid ${type === 'paneer' ? colors.ink : colors.border}`, background: type === 'paneer' ? colors.ink : '#fff', color: type === 'paneer' ? colors.primary : colors.ink, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Paneer Momo</button>
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
function Reconciliation({ state, updateState, todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remainingVeg, setRemainingVeg] = useState('');
  const [remainingPaneer, setRemainingPaneer] = useState('');
  const [closed, setClosed] = useState(false);

  const expectedVeg = state.inventory.veg.cart - todayOrders.reduce((s, o) => s + o.items.reduce((sm, i) => {
    const m = MENU_ITEMS.find(x => x.id === i.id);
    return m && m.stockKey === 'veg' ? sm + (i.type === 'half' ? m.pcsHalf : m.pcsFull) * i.qty : sm;
  }, 0), 0);

  const expectedPaneer = state.inventory.paneer.cart - todayOrders.reduce((s, o) => s + o.items.reduce((sm, i) => {
    const m = MENU_ITEMS.find(x => x.id === i.id);
    return m && m.stockKey === 'paneer' ? sm + (i.type === 'half' ? m.pcsHalf : m.pcsFull) * i.qty : sm;
  }, 0), 0);

  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - upiRevenue : null;
  const vegDiff = remainingVeg !== '' ? parseInt(remainingVeg) - expectedVeg : null;
  const paneerDiff = remainingPaneer !== '' ? parseInt(remainingPaneer) - expectedPaneer : null;

  const closeDay = () => {
    const dayClose = {
      id: Date.now(),
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

      {/* Close day button */}
      <button onClick={closeDay}
        disabled={physicalCash === '' || phonePeAmount === '' || remainingVeg === '' || remainingPaneer === ''}
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

// ─── OWNER: REPORTS ───
function Reports({ state }) {
  const last7 = state.dayCloseLogs.slice(-7);
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
function StaffApp({ state, updateState, setRole }) {
  const [tab, setTab] = useState('order');
  const [cart, setCart] = useState([]);
  const [staffName, setStaffName] = useState(state.staffOnDuty || '');

  if (!staffName) {
    return <StaffLogin onLogin={(name) => { setStaffName(name); updateState({ staffOnDuty: name }); }} setRole={setRole} />;
  }

  const todayOrders = state.orders.filter(o => o.date === TODAY);
  const myOrders = todayOrders.filter(o => o.staff === staffName);

  const placeOrder = (payment) => {
    if (cart.length === 0) return;
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    const order = {
      id: Date.now(),
      token: String(todayOrders.length + 1).padStart(3, '0'),
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      total,
      payment,
      staff: staffName,
      source: 'staff-entry'
    };

    // Auto-deduct inventory
    const newInv = { ...state.inventory };
    cart.forEach(item => {
      const menu = MENU_ITEMS.find(m => m.id === item.id);
      if (menu) {
        const pcs = (item.type === 'half' ? menu.pcsHalf : menu.pcsFull) * item.qty;
        newInv[menu.stockKey] = { ...newInv[menu.stockKey], cart: newInv[menu.stockKey].cart - pcs };
      }
    });

    updateState({ orders: [...state.orders, order], inventory: newInv });
    setCart([]);
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 80, fontFamily: 'system-ui, sans-serif' }}>
      <TopBar title={`Staff: ${staffName}`} onExit={() => { updateState({ staffOnDuty: null }); setRole(null); }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {tab === 'order' && <NewOrderScreen cart={cart} setCart={setCart} onPlaceOrder={placeOrder} />}
        {tab === 'myorders' && <MyOrdersScreen orders={myOrders} />}
        {tab === 'shift' && <ShiftStatus state={state} myOrders={myOrders} staffName={staffName} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} tabs={[
        { id: 'order', icon: <Plus size={20}/>, label: 'New Order' },
        { id: 'myorders', icon: <FileText size={20}/>, label: 'My Orders' },
        { id: 'shift', icon: <Clock size={20}/>, label: 'Shift' },
      ]} />
    </div>
  );
}

function StaffLogin({ onLogin, setRole }) {
  const [name, setName] = useState('');
  return (
    <div style={{ minHeight: '100vh', background: colors.paper, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <ChefHat size={48} color={colors.ink} style={{ margin: '0 auto 16px' }}/>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Start Your Shift</div>
        <div style={{ color: colors.muted, fontSize: 14, marginBottom: 24 }}>Select who's on duty</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <button onClick={() => onLogin('Chef')} style={{ padding: 18, background: colors.ink, color: colors.primary, border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>👨‍🍳 Chef (Main)</button>
          <button onClick={() => onLogin('Helper')} style={{ padding: 18, background: colors.primary, color: colors.ink, border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>🤝 Helper</button>
        </div>

        <button onClick={() => setRole(null)} style={{ background: 'transparent', border: 'none', color: colors.muted, fontSize: 13, cursor: 'pointer' }}>← Back to home</button>
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
          { id: 'combos', label: '💛 Combos' },
          { id: 'beverages', label: '☕ Drinks' },
          { id: 'addons', label: '➕ Extras' },
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
        {category === 'combos' && COMBOS.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} extra={item.extra} onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
        {category === 'beverages' && BEVERAGES.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
        ))}
        {category === 'addons' && ADDONS.map(item => (
          <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
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

function SimpleItemRow({ id, name, price, extra, onAdd }) {
  return (
    <button onClick={onAdd} style={{ background: '#fff', borderRadius: 10, padding: 14, border: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', width: '100%' }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        {extra && <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>+ {extra}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>₹{price}</div>
        <Plus size={18} color={colors.ink}/>
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
            <div style={{ fontSize: 10, padding: '2px 8px', background: o.payment === 'cash' ? '#E7F5E7' : '#E7EEFF', color: o.payment === 'cash' ? colors.green : '#0050B3', borderRadius: 10, marginTop: 6, display: 'inline-block', fontWeight: 600 }}>{o.payment.toUpperCase()}</div>
          </div>
        ))}
        {orders.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>No orders yet · Tap "New Order" to start</div>}
      </div>
    </div>
  );
}

function ShiftStatus({ state, myOrders, staffName }) {
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
        <StockRow label="Veg Momo (pcs)" value={state.inventory.veg.cart} unit="pcs"/>
        <StockRow label="Paneer Momo (pcs)" value={state.inventory.paneer.cart} unit="pcs"/>
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
function CustomerApp({ state, updateState, setRole }) {
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState('menu'); // menu | summary | success
  const [orderToken, setOrderToken] = useState('');

  const addToCart = (id, name, price, type = null) => {
    const itemKey = `${id}-${type || 'std'}`;
    const existing = cart.find(c => c.key === itemKey);
    if (existing) {
      setCart(cart.map(c => c.key === itemKey ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { key: itemKey, id, name, price, type, qty: 1 }]);
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

  const placeOrder = () => {
    const todayOrders = state.orders.filter(o => o.date === TODAY);
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    const token = String(todayOrders.length + 1).padStart(3, '0');
    const order = {
      id: Date.now(),
      token,
      date: TODAY,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart,
      total,
      payment: 'upi',
      staff: 'Customer Self-Order',
      source: 'qr-order'
    };

    const newInv = { ...state.inventory };
    cart.forEach(item => {
      const menu = MENU_ITEMS.find(m => m.id === item.id);
      if (menu) {
        const pcs = (item.type === 'half' ? menu.pcsHalf : menu.pcsFull) * item.qty;
        newInv[menu.stockKey] = { ...newInv[menu.stockKey], cart: newInv[menu.stockKey].cart - pcs };
      }
    });

    updateState({ orders: [...state.orders, order], inventory: newInv });
    setOrderToken(token);
    setStep('success');
    setCart([]);
  };

  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', background: colors.ink, color: colors.primary, padding: 40, borderRadius: 20, maxWidth: 360 }}>
          <CheckCircle2 size={60} style={{ margin: '0 auto 16px' }} color={colors.primary}/>
          <div style={{ fontSize: 16, opacity: 0.7, letterSpacing: 1 }}>YOUR ORDER TOKEN</div>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, margin: '8px 0' }}>#{orderToken}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24 }}>Show this number at the cart<br/>Ready in 5-8 minutes</div>
          <div style={{ borderTop: '1px solid rgba(255,214,10,0.3)', paddingTop: 20 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Pay via UPI to:</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>momowala@upi</div>
          </div>
          <button onClick={() => { setStep('menu'); setRole(null); }} style={{ marginTop: 24, background: colors.primary, color: colors.ink, border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, paddingBottom: 100, fontFamily: 'system-ui, sans-serif' }}>
      {/* Customer header */}
      <div style={{ background: colors.primary, padding: '24px 20px', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🥟</div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, fontWeight: 700 }}>WELCOME TO</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: colors.ink, lineHeight: 1 }}>MOMO WALA</div>
              <div style={{ fontSize: 11, color: colors.ink, opacity: 0.7 }}>Saketpuri, Ayodhya · Order in 30 seconds</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
        {/* Bestsellers banner */}
        <div style={{ background: colors.ink, color: colors.primary, padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 12, fontWeight: 700, textAlign: 'center', letterSpacing: 1 }}>
          ⭐ TRY OUR BESTSELLERS — PANEER AFGHANI · KURKURE · TANDOORI ⭐
        </div>

        <SectionHeader title="🥟 Momos" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {MENU_ITEMS.map(item => (
            <MenuItemRow key={item.id} item={item} onAdd={addToCart} />
          ))}
        </div>

        <SectionHeader title="💛 Combos · Save More" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {COMBOS.map(item => (
            <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} extra={item.extra} onAdd={() => addToCart(item.id, item.name, item.price)} />
          ))}
        </div>

        <SectionHeader title="☕ Beverages" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 100 }}>
          {BEVERAGES.map(item => (
            <SimpleItemRow key={item.id} id={item.id} name={item.name} price={item.price} onAdd={() => addToCart(item.id, item.name, item.price)} />
          ))}
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
              <button onClick={placeOrder} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '14px 24px', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                Place Order <ArrowRight size={16}/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
