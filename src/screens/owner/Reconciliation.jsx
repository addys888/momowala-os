import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, WARE_TYPES, colors, isPaid, persistInv, wareLedger } from '../../core';
import { SectionHeader } from '../../components/shared';

function Reconciliation({ state, updateState, cartId, inv, stockTypes = [], todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const alreadyClosed = state.dayCloseLogs.some(d => d.cartId === cartId && d.date === TODAY);
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remaining, setRemaining] = useState({}); // { [stockKey]: '' }
  const [wareLeft, setWareLeft] = useState({}); // { [wareKey]: '' } counted (optional)
  const [wareDamaged, setWareDamaged] = useState({}); // { [wareKey]: '' } broken/torn today
  const [closed, setClosed] = useState(false);

  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - upiRevenue : null;
  // Ware audit: plates/glasses are an independent check on punching — a
  // shortfall vs expected means servings that were never punched. Optional,
  // shown per ware type with supply/carry activity; a blank count just skips
  // that ware's audit for the day.
  const ware = wareLedger(state, cartId, TODAY);
  const wareRows = WARE_TYPES
    .filter(w => ware[w.key].supplied > 0 || ware[w.key].opening > 0)
    .map(w => {
      const led = ware[w.key];
      const val = wareLeft[w.key] ?? '';
      // Damaged (broken/torn) ware is legitimate loss — subtract it from the
      // expected count so it never shows up as a theft gap.
      const damaged = parseInt(wareDamaged[w.key]) || 0;
      const effExpected = led.expected - damaged;
      return { ...w, ...led, val, damaged, effExpected, diff: val !== '' ? parseInt(val) - effExpected : null };
    });
  // Stock is deducted as orders settle, so expected remaining = current cart count.
  const stockRows = stockTypes.map(st => {
    const expected = inv[st.key]?.cart ?? 0;
    const val = remaining[st.key] ?? '';
    const diff = val !== '' ? parseInt(val) - expected : null;
    return { ...st, expected, val, diff };
  });
  const allStockFilled = stockRows.every(r => r.val !== '');

  const closeDay = () => {
    const dayClose = {
      id: Date.now(),
      cartId,
      date: TODAY,
      totalOrders: todayOrders.filter(isPaid).length,
      systemCash: cashRevenue,
      physicalCash: parseInt(physicalCash) || 0,
      cashDiff: cashDiff || 0,
      systemUpi: upiRevenue,
      phonePeAmount: parseInt(phonePeAmount) || 0,
      upiDiff: upiDiff || 0,
      stock: [
        ...stockRows.map(r => ({ key: r.key, label: r.label, expected: r.expected, actual: parseInt(r.val) || 0, diff: r.diff || 0 })),
        // Ware-audit rows ride in the stock array (key '_ware:<type>') so they
        // need no schema change; Reports filters them out of momo-stock math.
        // Each counted value becomes tomorrow's opening balance for that ware.
        ...wareRows.filter(r => r.val !== '').map(r => ({ key: `_ware:${r.key}`, label: r.label, expected: r.expected, damaged: r.damaged, actual: parseInt(r.val) || 0, diff: r.diff || 0, opening: r.opening, supplied: r.supplied, used: r.used })),
      ],
      piecesSold,
      revenue: cashRevenue + upiRevenue,
      closedAt: new Date().toISOString()
    };
    // Return the counted leftover from the cart back into the freezer (real-world:
    // at 11 PM unsold momos go back in the freezer), then empty the cart.
    const newInv = { ...inv };
    const ops = {};
    stockRows.forEach(r => {
      const actual = parseInt(r.val) || 0;
      if (newInv[r.key]) { newInv[r.key] = { freezer: (newInv[r.key].freezer || 0) + actual, cart: 0 }; ops[r.key] = { df: actual, cset: 0 }; }
    });
    updateState({
      inventory: { ...state.inventory, [cartId]: newInv },
      dayCloseLogs: [...state.dayCloseLogs, dayClose],
    });
    if (Object.keys(ops).length) persistInv(cartId, ops, { ...state.inventory, [cartId]: newInv });
    setClosed(true);
  };

  if (closed || alreadyClosed) {
    return (
      <div>
        <div style={{ background: colors.green, color: '#fff', padding: 32, borderRadius: 16, textAlign: 'center' }}>
          <CheckCircle2 size={48} style={{ marginBottom: 12 }}/>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Day Closed Successfully</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>{alreadyClosed && !closed ? 'Already closed today — logs saved.' : 'All logs saved. Good work today!'}</div>
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

      {/* Stock reconciliation — one block per stock type */}
      {stockRows.map(r => (
        <ReconcileBlock
          key={r.key}
          title={`🥟 ${r.label}`}
          systemValue={`${r.expected} pcs expected`}
          label="Actual pieces remaining on cart"
          value={r.val}
          onChange={(v) => setRemaining(prev => ({ ...prev, [r.key]: v }))}
          diff={r.diff}
          unit="pcs"
        />
      ))}

      {/* Ware audit — optional; count each leftover ware type vs its ledger.
          Damaged (broken/torn) pieces are entered separately so legitimate
          breakage never reads as a theft gap. */}
      {wareRows.map(r => (
        <ReconcileBlock
          key={r.key}
          title={`${r.emoji} ${r.label} — theft check`}
          systemValue={r.damaged > 0 ? `${r.expected} − ${r.damaged} damaged = ${r.effExpected}` : `${r.expected} expected`}
          label={`Left on cart — count them (${r.opening > 0 ? `${r.opening} carried + ` : ''}${r.supplied} given − ${r.used} served)`}
          value={r.val}
          onChange={(v) => setWareLeft(prev => ({ ...prev, [r.key]: v }))}
          extraLabel="Damaged / broken today (optional)"
          extraValue={wareDamaged[r.key] ?? ''}
          onExtraChange={(v) => setWareDamaged(prev => ({ ...prev, [r.key]: v }))}
          diff={r.diff}
          unit=" pcs"
        />
      ))}

      {/* Close day button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFF7E0', border: `1px solid #FFE08A`, borderRadius: 10, padding: '10px 12px', marginTop: 16, fontSize: 12.5, color: '#8A6D00' }}>
        <span>❄️</span><span>On closing, the leftover pieces you counted go <strong>back into the freezer</strong> and the cart is emptied for tomorrow.</span>
      </div>
      <button onClick={closeDay}
        disabled={physicalCash === '' || phonePeAmount === '' || !allStockFilled}
        style={{ width: '100%', background: (physicalCash === '' || phonePeAmount === '' || !allStockFilled) ? colors.border : colors.ink, color: colors.primary, padding: 18, borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16, cursor: (physicalCash === '' || phonePeAmount === '' || !allStockFilled) ? 'not-allowed' : 'pointer', marginTop: 10 }}>
        Close Day & Save Report
      </button>
    </div>
  );
}


function ReconcileBlock({ title, systemValue, label, value, onChange, diff, unit, extraLabel, extraValue, onExtraChange }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 13, color: colors.muted }}>System: <strong style={{ color: colors.ink }}>{systemValue}</strong></div>
      </div>
      {onExtraChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, fontSize: 11, color: colors.muted }}>{extraLabel}</div>
          <input type="number" inputMode="numeric" value={extraValue} onChange={e => onExtraChange(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0"
            style={{ width: 90, padding: '9px 12px', border: `2px solid ${colors.border}`, borderRadius: 10, fontSize: 15, fontWeight: 700, boxSizing: 'border-box', textAlign: 'right' }} />
        </div>
      )}
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

// ─── OWNER: STAFF REGISTRY ───

export { Reconciliation, ReconcileBlock };
