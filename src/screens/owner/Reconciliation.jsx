import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, colors, isPaid, persistInv, plateLedger } from '../../core';
import { SectionHeader } from '../../components/shared';

function Reconciliation({ state, updateState, cartId, inv, stockTypes = [], todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const alreadyClosed = state.dayCloseLogs.some(d => d.cartId === cartId && d.date === TODAY);
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remaining, setRemaining] = useState({}); // { [stockKey]: '' }
  const [platesLeft, setPlatesLeft] = useState(''); // counted plates (optional)
  const [closed, setClosed] = useState(false);

  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - upiRevenue : null;
  // Plate audit: plates are an independent check on punching — a shortfall vs
  // expected means servings that were never punched. Optional, shown only when
  // plates were supplied/carried; a missing count just skips the day's audit.
  const plates = plateLedger(state, cartId, TODAY);
  const platesActive = plates.supplied > 0 || plates.opening > 0;
  const platesDiff = platesLeft !== '' ? parseInt(platesLeft) - plates.expected : null;
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
        // Plate-audit row rides in the stock array (key '_plates') so it needs
        // no schema change; Reports filters it out of the momo-stock math.
        ...(platesActive && platesLeft !== '' ? [{ key: '_plates', label: 'Plates', expected: plates.expected, actual: parseInt(platesLeft) || 0, diff: platesDiff || 0, opening: plates.opening, supplied: plates.supplied, used: plates.used }] : []),
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

      {/* Plate audit — optional; counts leftover plates against the ledger */}
      {platesActive && (
        <ReconcileBlock
          title="🍽️ Plates (theft check)"
          systemValue={`${plates.expected} expected`}
          label={`Plates left on cart — count them (${plates.opening > 0 ? `${plates.opening} carried + ` : ''}${plates.supplied} given − ${plates.used} served)`}
          value={platesLeft}
          onChange={setPlatesLeft}
          diff={platesDiff}
          unit=" plates"
        />
      )}

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

// ─── OWNER: STAFF REGISTRY ───

export { Reconciliation, ReconcileBlock };
