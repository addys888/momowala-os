import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../lib/store';
import { CartlyftLogo, CategoryBand, MAX_ADDON_ITEMS, TODAY, TYPE_CHIP, brand, cartOpenState, colors, groupByCat, istTime, localNextToken, menuFor, momowalaLogoUrl } from '../core';
import { Alert, CartIcon, MenuItemRow, SectionHeader, SimpleItemRow } from '../components/shared';

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
  const [custName, setCustName] = useState(() => storage.get('custName', '') || '');
  const [custPhone, setCustPhone] = useState(() => storage.get('custPhone', '') || '');
  const [custErr, setCustErr] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | veg | paneer | corn …
  const [lastTotal, setLastTotal] = useState(0);
  const [placedId, setPlacedId] = useState(null);   // id of the just-placed order
  const [liveOrder, setLiveOrder] = useState(null);  // polled status of that order

  const menu = menuFor(state, venue.id);
  const items = menu.items || [], lassi = menu.lassi || [], addons = menu.addons || [];
  const isAddon = (id) => addons.some(a => a.id === id);
  const openState = cartOpenState(venue);

  // Momo type filter (Veg / Paneer / Corn) for quick browsing.
  const momoTypes = [...new Set(items.map(i => i.type).filter(Boolean))];
  const filteredItems = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter);

  // "Order again" — rebuild the last order from the current menu (fresh prices,
  // skips items no longer on the menu).
  const lastOrder = storage.get('lastOrder', null);
  const reorder = () => {
    const last = storage.get('lastOrder', null);
    if (!last) return;
    const rebuilt = [];
    last.forEach(it => {
      const m = items.find(x => x.id === it.id);
      if (m) { const price = it.type === 'half' ? m.half : m.full; if (price) rebuilt.push({ key: `${it.id}-${it.type || 'std'}`, id: it.id, name: m.name, price, type: it.type, qty: it.qty }); return; }
      const l = lassi.find(x => x.id === it.id); if (l) { rebuilt.push({ key: `${it.id}-std`, id: it.id, name: l.name, price: l.price, type: null, qty: it.qty }); return; }
      const a = addons.find(x => x.id === it.id); if (a) rebuilt.push({ key: `${it.id}-std`, id: it.id, name: a.name, price: a.price, type: null, qty: 1 });
    });
    if (rebuilt.length) setCart(rebuilt);
  };

  // While the customer is on the token screen, poll their order so the live
  // status (Placed → Preparing → Ready / Collected) updates as staff advance it.
  useEffect(() => {
    if (step !== 'success' || !placedId) return;
    let alive = true;
    const tick = async () => {
      const fresh = await loadCartOrders(venue.id, TODAY);
      if (alive && fresh) { const o = fresh.find(x => x.id === placedId); if (o) setLiveOrder(o); }
    };
    const t = setInterval(tick, 8000);
    tick();
    return () => { alive = false; clearInterval(t); };
  }, [step, placedId, venue.id]);

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
    setCustErr('');
    const name = custName.trim();
    const phone = custPhone.trim();
    // Light protection: name + valid phone required, no login wall.
    if (name.length < 2) { setCustErr('Please enter your name.'); return; }
    if (!/^\d{10}$/.test(phone)) { setCustErr('Enter a valid 10-digit mobile number.'); return; }
    // Anti-spam: short cooldown between orders from this device.
    const last = +(storage.get('lastOrderAt', 0) || 0);
    if (Date.now() - last < 20000) { setCustErr('Please wait a few seconds before placing another order.'); return; }
    // Anti-spam: block a 2nd unpaid order from the same number at this cart.
    if (state.orders.some(o => o.cartId === venue.id && o.date === TODAY && o.payment === 'pending' && o.customerPhone === phone)) {
      setCustErr('You already have an unpaid order here. Please pay for it at the cart first.'); return;
    }
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
      time: istTime(),
      items: cart,
      total,
      payment: 'pending',     // not paid until staff confirms at the cart
      staff: null,
      source: 'qr-order',
      customerName: name,
      customerPhone: phone,
      outlet: venue.id,
      outletName: venue.name,
    };
    // Stock is NOT deducted here — only when staff marks the order paid,
    // so fake/abandoned QR orders never touch inventory or revenue.
    updateState({ orders: [...state.orders, order] });
    storage.set('custName', name); storage.set('custPhone', phone); storage.set('lastOrderAt', Date.now());
    storage.set('lastOrder', cart.map(c => ({ id: c.id, type: c.type, qty: c.qty }))); // for "Order again"
    setLastTotal(total);
    setPlacedId(order.id);
    setLiveOrder(order);
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

          {/* Customer contact — light protection, no login needed */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>YOUR DETAILS</div>
            <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Your name"
              style={{ width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 10 }} />
            <input value={custPhone} onChange={e => setCustPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="10-digit mobile number"
              style={{ width: '100%', padding: '12px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, boxSizing: 'border-box', fontWeight: 700, letterSpacing: 1 }} />
            {custErr && <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 10 }}><AlertCircle size={15} /> {custErr}</div>}
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
    const lo = liveOrder || {};
    const cancelled = lo.payment === 'cancelled';
    const collected = lo.payment === 'cash' || lo.payment === 'upi';
    const stepIdx = cancelled ? -1 : collected ? 3 : (lo.prepStatus === 'ready' ? 2 : lo.prepStatus === 'preparing' ? 1 : 0);
    const trackSteps = ['Order placed', 'Preparing', 'Ready — collect'];
    return (
      <div style={{ minHeight: '100vh', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', background: colors.ink, color: colors.primary, padding: 40, borderRadius: 20, maxWidth: 360 }}>
          <CheckCircle2 size={60} style={{ margin: '0 auto 16px' }} color={colors.primary}/>
          <div style={{ fontSize: 16, opacity: 0.7, letterSpacing: 1 }}>YOUR ORDER TOKEN</div>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, margin: '8px 0' }}>#{orderToken}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>Show this number at the cart<br/>Ready in ~{venue.defaultPrepMins || 8} minutes</div>

          {/* Live status tracker — updates as staff advance the order */}
          {cancelled ? (
            <div style={{ background: 'rgba(200,30,30,0.18)', color: '#FF8A8A', borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, marginBottom: 16 }}>This order was cancelled. Please ask the staff.</div>
          ) : collected ? (
            <div style={{ background: 'rgba(124,227,139,0.18)', color: '#7CE38B', borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, marginBottom: 16 }}>✅ Collected & paid — enjoy! 🥟</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
              {trackSteps.map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ width: 28, height: 28, margin: '0 auto 4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: i <= stepIdx ? colors.primary : 'rgba(255,255,255,0.12)', color: i <= stepIdx ? colors.ink : 'rgba(255,255,255,0.5)' }}>{i < stepIdx ? '✓' : i + 1}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, opacity: i <= stepIdx ? 1 : 0.5, lineHeight: 1.1 }}>{s}</div>
                  </div>
                  {i < trackSteps.length - 1 && <div style={{ flex: 0.5, height: 2, background: i < stepIdx ? colors.primary : 'rgba(255,255,255,0.12)', marginBottom: 16 }} />}
                </React.Fragment>
              ))}
            </div>
          )}
          {!cancelled && !collected && stepIdx === 2 && <div style={{ fontSize: 13, fontWeight: 800, color: '#7CE38B', marginBottom: 14 }}>🛎️ Your order is ready — collect it!</div>}

          {!collected && !cancelled && <>
          {lastTotal > 0 && <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Pay ₹{lastTotal}</div>}
          <div style={{ borderTop: '1px solid rgba(255,214,10,0.3)', paddingTop: 20 }}>
            {venue.upiId && lastTotal > 0 && (
              <a href={`upi://pay?pa=${encodeURIComponent(venue.upiId)}&pn=${encodeURIComponent(venue.name)}&am=${lastTotal}&cu=INR&tn=${encodeURIComponent('Order #' + orderToken)}`}
                style={{ display: 'block', background: colors.primary, color: colors.ink, padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', marginBottom: 14 }}>
                📱 Pay ₹{lastTotal} via UPI
              </a>
            )}
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>or pay cash / scan at the cart</div>
            {venue.upiQr && <img src={venue.upiQr} alt="UPI QR" style={{ width: 140, height: 140, objectFit: 'contain', borderRadius: 10, background: '#fff', padding: 6, margin: '0 auto 10px', display: 'block' }} />}
            {venue.upiId && <><div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>UPI ID:</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{venue.upiId}</div></>}
          </div>
          </>}
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
          {(venue.logo || venue.id === 'momowala') && (
            <img src={venue.logo || momowalaLogoUrl} alt={venue.name} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 14px', border: `2px solid ${venue.accent}`, background: '#000', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }} />
          )}
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

        {/* Order again — one tap to reload the customer's last order */}
        {lastOrder && lastOrder.length > 0 && openState.open && cart.length === 0 && (
          <button onClick={reorder} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 20 }}>🔁</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Order again</div>
              <div style={{ fontSize: 11.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastOrder.length} item{lastOrder.length > 1 ? 's' : ''} from last time</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: brand.navy }}>Add →</span>
          </button>
        )}

        {items.length > 0 && <>
          <SectionHeader title="🥟 Momos" />
          {momoTypes.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {['all', ...momoTypes].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${typeFilter === t ? colors.ink : colors.border}`, background: typeFilter === t ? colors.ink : '#fff', color: typeFilter === t ? colors.primary : colors.ink }}>
                  {t === 'all' ? 'All' : (TYPE_CHIP[t]?.label || t)}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 24 }}>
            {groupByCat(filteredItems).map(g => (
              <div key={g.cat} style={{ marginBottom: 14 }}>
                <CategoryBand cat={g.cat} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.map(item => <MenuItemRow key={item.id} item={item} onAdd={addToCart} />)}
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: colors.muted, fontSize: 13 }}>No {TYPE_CHIP[typeFilter]?.label || ''} momos.</div>}
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

export { CartListing, CartMenu };
