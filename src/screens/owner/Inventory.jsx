import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, adminBtn, brand, colors, editInput, editLabel, istTime, menuFor, persistConsumables, persistInv, slugify } from '../../core';
import { EditModalShell, SectionHeader } from '../../components/shared';

function InventoryView({ state, updateState, cartId, inv, stockTypes = [] }) {
  const [showAddStock, setShowAddStock] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [adjusting, setAdjusting] = useState(null); // { key, label } | null
  const [moving, setMoving] = useState(null); // { type, label, dir:'load'|'return', qty } | null
  const [editCons, setEditCons] = useState(null); // { key?, name, unit, stock } | null
  const setCartInv = (newInv, extra) => updateState({ inventory: { ...state.inventory, [cartId]: newInv }, ...extra });
  const cartStockLogs = state.stockLogs.filter(l => l.cartId === cartId);
  const cartLoadLogs = state.cartLoadings.filter(l => l.cartId === cartId);
  const labelFor = (key) => stockTypes.find(st => st.key === key)?.label || key;

  const setStockTypes = (next) => {
    const menu = menuFor(state, cartId);
    const newInv = { ...inv };
    const newOps = {};
    next.forEach(st => { if (!newInv[st.key]) { newInv[st.key] = { freezer: 0, cart: 0 }; newOps[st.key] = { df: 0, dc: 0 }; } });
    updateState({
      menus: { ...state.menus, [cartId]: { ...menu, stockTypes: next } },
      inventory: { ...state.inventory, [cartId]: newInv },
    });
    if (Object.keys(newOps).length) persistInv(cartId, newOps, { ...state.inventory, [cartId]: newInv });
  };

  const addStock = (type, qty) => {
    const newInv = { ...inv };
    newInv[type] = { ...newInv[type], freezer: newInv[type].freezer + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: istTime(),
      type: 'STOCK_IN', item: type, qty, note: `Added ${qty} pieces of ${labelFor(type)}`
    };
    setCartInv(newInv, { stockLogs: [...state.stockLogs, log] });
    persistInv(cartId, { [type]: { df: qty } }, { ...state.inventory, [cartId]: newInv });
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
      time: istTime(),
      type: 'STOCK_ADJUST', item: type, qty: applied,
      note: `${verb} ${Math.abs(applied)} ${labelFor(type)} in freezer — ${reason}`
    };
    setCartInv(newInv, { stockLogs: [...state.stockLogs, log] });
    persistInv(cartId, { [type]: { df: applied } }, { ...state.inventory, [cartId]: newInv });
    setAdjusting(null);
  };

  const loadToCart = (type, qty) => {
    const newInv = { ...inv };
    if (newInv[type].freezer < qty) { alert('Not enough stock in freezer!'); return; }
    newInv[type] = { freezer: newInv[type].freezer - qty, cart: newInv[type].cart + qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: istTime(),
      type: 'CART_LOAD', item: type, qty, note: `Moved ${qty} ${labelFor(type)} pieces to cart`
    };
    setCartInv(newInv, { cartLoadings: [...state.cartLoadings, log] });
    persistInv(cartId, { [type]: { df: -qty, dc: qty } }, { ...state.inventory, [cartId]: newInv });
  };

  // Move pieces back from the cart into the freezer (e.g. loaded too many).
  const returnToFreezer = (type, qty) => {
    const newInv = { ...inv };
    if ((newInv[type]?.cart ?? 0) < qty) { alert('Not that many pieces on the cart.'); return; }
    newInv[type] = { freezer: newInv[type].freezer + qty, cart: newInv[type].cart - qty };
    const log = {
      id: Date.now(), cartId, date: TODAY,
      time: istTime(),
      type: 'CART_UNLOAD', item: type, qty, note: `Returned ${qty} ${labelFor(type)} pieces to freezer`
    };
    setCartInv(newInv, { cartLoadings: [...state.cartLoadings, log] });
    persistInv(cartId, { [type]: { df: qty, dc: -qty } }, { ...state.inventory, [cartId]: newInv });
  };

  // Confirmed from the move modal (load to cart / return to freezer).
  const confirmMove = () => {
    if (!moving || moving.qty <= 0) { setMoving(null); return; }
    if (moving.dir === 'load') loadToCart(moving.type, moving.qty);
    else returnToFreezer(moving.type, moving.qty);
    setMoving(null);
  };

  // Owner-managed consumables / supplies (oil, cream, French fries packets, …).
  const saveConsumable = ({ key, name, unit, stock }) => {
    const cons = { ...(inv.consumables || {}) };
    const k = key || slugify(name) || ('c' + Date.now());
    const prev = cons[k] || { perOrder: 0 };
    cons[k] = { ...prev, name: name.trim(), unit: (unit || '').trim() || 'pcs', stock: parseFloat(stock) || 0 };
    setCartInv({ ...inv, consumables: cons });
    persistConsumables(cartId, cons, { ...state.inventory, [cartId]: { ...inv, consumables: cons } });
    setEditCons(null);
  };
  const removeConsumable = (key) => {
    if (!confirm('Remove this consumable/supply item?')) return;
    const cons = { ...(inv.consumables || {}) };
    delete cons[key];
    setCartInv({ ...inv, consumables: cons });
    persistConsumables(cartId, cons, { ...state.inventory, [cartId]: { ...inv, consumables: cons } });
  };

  return (
    <div>
      <SectionHeader title="Inventory Control" subtitle="Stock In · Cart Loading · Consumables" />

      {/* Stock In Action */}
      <button onClick={() => stockTypes.length > 0 && setShowAddStock(true)}
        disabled={stockTypes.length === 0}
        style={{ width: '100%', background: stockTypes.length === 0 ? colors.muted : colors.ink, color: colors.primary, padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: stockTypes.length === 0 ? 'not-allowed' : 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Plus size={18}/> Record New Supplier Delivery{stockTypes.length === 0 ? ' — add stock types first' : ''}
      </button>

      {showAddStock && <StockInModal stockTypes={stockTypes} onAdd={addStock} onClose={() => setShowAddStock(false)} />}
      {showTypes && <StockTypesModal stockTypes={stockTypes} onSave={setStockTypes} onClose={() => setShowTypes(false)} />}
      {adjusting && <AdjustStockModal label={adjusting.label} current={inv[adjusting.key]?.freezer ?? 0} onApply={(delta, reason) => adjustStock(adjusting.key, delta, reason)} onClose={() => setAdjusting(null)} />}
      {moving && <MoveStockConfirm move={moving} bucket={inv[moving.type] || { freezer: 0, cart: 0 }} onConfirm={confirmMove} onClose={() => setMoving(null)} />}

      {/* Freezer Status */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>FREEZER (KITCHEN)</div>
          <button onClick={() => setShowTypes(true)} style={{ ...adminBtn, color: brand.navy }}>Edit stock types</button>
        </div>
        {stockTypes.map(st => {
          const b = inv[st.key] || { freezer: 0, cart: 0 };
          return <FreezerItem key={st.key} typeKey={st.key} label={st.label} stock={b.freezer} cart={b.cart} onMove={(dir, qty) => setMoving({ type: st.key, label: st.label, dir, qty })} onAdjust={() => setAdjusting({ key: st.key, label: st.label })} />;
        })}
        {stockTypes.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No stock types yet. Tap "Edit stock types" to add the items this cart freezes.</div>}
      </div>

      {/* Consumables & supplies — owner-managed */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700 }}>CONSUMABLES & SUPPLIES</div>
          <button onClick={() => setEditCons({ name: '', unit: '', stock: '' })} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14}/> Add</button>
        </div>
        {Object.entries(inv.consumables || {}).map(([key, item]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, textTransform: item.name ? 'none' : 'capitalize' }}>{item.name || key}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>{(item.stock ?? 0).toFixed(item.unit === 'L' ? 2 : 0)} <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>{item.unit}</span></div>
              <button onClick={() => setEditCons({ key, name: item.name || key, unit: item.unit || '', stock: item.stock ?? 0 })} title="Edit" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Edit3 size={13}/></button>
              <button onClick={() => removeConsumable(key)} title="Remove" style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color={colors.red}/></button>
            </div>
          </div>
        ))}
        {Object.keys(inv.consumables || {}).length === 0 && <div style={{ padding: 12, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No consumables yet. Tap Add (oil, cheese, French fries, …).</div>}
      </div>
      {editCons && <ConsumableModal initial={editCons} onSave={saveConsumable} onClose={() => setEditCons(null)} />}

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


function FreezerItem({ typeKey, label, stock, cart, onMove, onAdjust }) {
  const [qty, setQty] = useState(50);
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: colors.muted }}>Freezer: </span><strong>{stock}</strong> · <span style={{ color: colors.muted }}>Cart: </span><strong>{cart}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} style={{ width: 70, padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13 }} />
        <button onClick={() => onMove('load', qty)} style={{ background: colors.primary, color: colors.ink, border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}>
          Freezer → Cart
        </button>
        <button onClick={() => onMove('return', qty)} style={{ background: '#fff', color: brand.navy, border: `1px solid ${colors.border}`, padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}>
          Cart → Freezer
        </button>
      </div>
      <button onClick={onAdjust} style={{ background: 'transparent', color: colors.muted, border: 'none', padding: '2px 0', fontWeight: 600, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
        Adjust freezer (wastage / recount)
      </button>
    </div>
  );
}

// Confirmation before moving stock between freezer and cart, with a before→after
// preview so the owner can sanity-check (and reverse an accidental over-load).

function MoveStockConfirm({ move, bucket, onConfirm, onClose }) {
  const load = move.dir === 'load';
  const qty = move.qty;
  const src = load ? bucket.freezer : bucket.cart;
  const ok = qty > 0 && src >= qty;
  const freezerAfter = load ? bucket.freezer - qty : bucket.freezer + qty;
  const cartAfter = load ? bucket.cart + qty : bucket.cart - qty;
  const cell = { background: colors.paper, borderRadius: 10, padding: '12px 14px', textAlign: 'center' };
  const cap = { fontSize: 11, color: colors.muted, fontWeight: 600, marginBottom: 4 };
  return (
    <EditModalShell
      title={load ? `Load ${move.label} to cart` : `Return ${move.label} to freezer`}
      onClose={onClose}
      onSave={() => { if (ok) onConfirm(); }}
      saveLabel={load ? 'Load to cart' : 'Return to freezer'}
      error={!ok ? (qty <= 0 ? 'Enter a quantity.' : `Only ${src} pcs in ${load ? 'freezer' : 'cart'}.`) : ''}
    >
      <div style={{ fontSize: 14, marginBottom: 14 }}>Move <strong>{qty} pcs</strong> {load ? 'from Freezer → Cart' : 'from Cart → Freezer'}?</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={cell}><div style={cap}>FREEZER</div><div style={{ fontWeight: 800 }}>{bucket.freezer} → {Math.max(0, freezerAfter)}</div></div>
        <div style={cell}><div style={cap}>ON CART</div><div style={{ fontWeight: 800 }}>{bucket.cart} → {Math.max(0, cartAfter)}</div></div>
      </div>
    </EditModalShell>
  );
}

// Add or edit a consumable / supply (oil, cheese, French fries packets, …).

function ConsumableModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial.name || '');
  const [unit, setUnit] = useState(initial.unit || '');
  const [stock, setStock] = useState(initial.stock === '' || initial.stock == null ? '' : String(initial.stock));
  const [error, setError] = useState('');
  const submit = () => {
    if (!name.trim()) { setError('Enter a name.'); return; }
    onSave({ key: initial.key, name, unit, stock });
  };
  return (
    <EditModalShell title={initial.key ? `Edit ${initial.name}` : 'Add consumable / supply'} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>NAME</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. French fries" style={editInput} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={editLabel}>UNIT</div>
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. packet / kg / L" style={editInput} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={editLabel}>IN STOCK</div>
          <input type="number" inputMode="decimal" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" style={editInput} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: colors.muted }}>Tip: French fries come as a 2.5 kg packet — set unit "packet" and stock the number of packets in the freezer.</div>
    </EditModalShell>
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

export { InventoryView, FreezerItem, MoveStockConfirm, ConsumableModal, ADJUST_REASONS, AdjustStockModal, StockTypesModal, StockInModal };
