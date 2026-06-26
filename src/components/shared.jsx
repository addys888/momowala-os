import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { CartlyftLogo, CartlyftMark, PAY_BADGE, TYPE_CHIP, brand, colors, momowalaLogoUrl } from '../core';

function LoginShell({ title, subtitle, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', background: brand.bg, fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: brand.navy, padding: '28px 24px' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
          <CartlyftLogo size={40} variant="light" />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: brand.text }}>{title}</div>
            {subtitle && <div style={{ color: brand.muted, fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}


function LoginFields({ mobile, setMobile, mobileLocked, pw, setPw, pw2, setPw2, showConfirm, error, busy, onSubmit, cta }) {
  const inputStyle = { width: '100%', padding: '13px 14px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 12, background: '#fff' };
  return (
    <div style={{ background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>MOBILE NUMBER</div>
      <input type="tel" inputMode="numeric" value={mobile} disabled={mobileLocked}
        onChange={e => setMobile && setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder="10-digit number"
        style={{ ...inputStyle, background: mobileLocked ? '#F5F4F0' : '#fff', fontWeight: 700, letterSpacing: 1 }} />
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>{showConfirm ? 'NEW PASSWORD' : 'PASSWORD'}</div>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !showConfirm && onSubmit()} placeholder="••••" style={inputStyle} />
      {showConfirm && (<>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: 600 }}>CONFIRM PASSWORD</div>
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit()} placeholder="••••" style={inputStyle} />
      </>)}
      {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><AlertCircle size={15} /> {error}</div>}
      <button onClick={onSubmit} disabled={busy} style={{ width: '100%', padding: 15, background: brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{cta}</button>
    </div>
  );
}

// One login for the whole cart team — owner and staff. The role is detected
// from the number: an owner matches a cart's ownerMobile, a staff matches a
// staff record. Owners with no password yet set one here on first login.

function EditModalShell({ title, onClose, onSave, error, children, saveLabel = 'Save', closeLabel = 'Cancel', danger = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,47,92,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(10,47,92,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, color: brand.navy }}>{title}</div>
        {children}
        {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFE7E7', color: colors.red, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><AlertCircle size={15}/> {error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: '#fff', border: `1px solid ${brand.border}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', color: brand.text }}>{closeLabel}</button>
          <button onClick={onSave} style={{ flex: 2, padding: 14, background: danger ? colors.red : brand.navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}


function CartIcon({ cart, size = 44, radius = 12 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, border: `2px solid ${cart?.accent || brand.teal}`, overflow: 'hidden', flexShrink: 0 }}>
      {(cart?.logo || cart?.id === 'momowala') ? <img src={cart.logo || momowalaLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (cart?.emoji || '🛒')}
    </div>
  );
}

// ═══════════════════════════════════════════════
// OWNER APP
// ═══════════════════════════════════════════════

function TopBar({ title, onExit }) {
  return (
    <div style={{ background: brand.navy, color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CartlyftMark size={30} />
        <div>
          <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, fontWeight: 700, color: brand.amber }}>CARTLYFT QSR OS</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        </div>
      </div>
      <button onClick={() => { if (confirm("Log out and exit? You'll need to sign in again to continue.")) onExit(); }} style={{ background: 'transparent', border: `1px solid rgba(255,255,255,0.5)`, color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <LogOut size={12}/> Exit
      </button>
    </div>
  );
}


function BottomNav({ tab, setTab, tabs }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${colors.border}`, padding: '8px 0' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: '8px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: tab === t.id ? colors.ink : colors.muted, fontWeight: tab === t.id ? 700 : 500, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              {t.icon}
              {t.badge > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -10, background: colors.accent, color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{t.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 10.5, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── OWNER: DASHBOARD ───

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
        <div style={{ fontSize: 10, padding: '2px 8px', background: PAY_BADGE[order.payment].bg, color: PAY_BADGE[order.payment].fg, borderRadius: 10, marginTop: 2, display: 'inline-block', fontWeight: 600 }}>{order.payment.toUpperCase()}</div>
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

function MenuItemRow({ item, onAdd }) {
  const chip = TYPE_CHIP[item.type];
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {chip && <span style={{ fontSize: 11, fontWeight: 800, color: chip.fg, background: chip.bg, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>{chip.label}</span>}
          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name} {item.star && '⭐'}</div>
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


function SimpleItemRow({ id, name, price, extra, onAdd, picked }) {
  return (
    <button onClick={onAdd} style={{ background: picked ? '#E7F5E7' : '#fff', borderRadius: 10, padding: 14, border: `1px solid ${picked ? colors.green : colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', width: '100%' }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        {extra && <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>+ {extra}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: price === 0 ? colors.green : colors.ink }}>{price === 0 ? 'FREE' : `₹${price}`}</div>
        {picked ? <Check size={18} color={colors.green}/> : <Plus size={18} color={colors.ink}/>}
      </div>
    </button>
  );
}

// A clean, stacked item list (qty chip + name) — replaces the cramped
// comma-joined string used in order cards.

function OrderItemLines({ items, muted }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((i, idx) => (
        <div key={i.key || idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: 12, color: colors.ink, background: '#F1EFE9', borderRadius: 6, padding: '2px 6px' }}>{i.qty}×</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: muted ? colors.muted : colors.ink }}>{i.name}</span>
        </div>
      ))}
    </div>
  );
}


export { LoginShell, LoginFields, EditModalShell, CartIcon, TopBar, BottomNav, MetricCard, Alert, StockRow, OrderRow, SectionHeader, MenuItemRow, SimpleItemRow, OrderItemLines };
