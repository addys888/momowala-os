import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, WARE_TYPES, colors, isOnline, isPaid, istDateLabel, menuFor, persistInv, wareLedger } from '../../core';
import { SectionHeader } from '../../components/shared';

// How many days back the reconciliation day-picker shows (today + this many prior).
const RECON_DAYS_BACK = 13;

// A day's money/pieces summary computed straight from orders — used both to label
// the day strip and to drive a back-dated (late/forgotten) close.
function dayStatsFor(state, cartId, date) {
  const menu = menuFor(state, cartId);
  const dayOrders = state.orders.filter(o => o.cartId === cartId && o.date === date);
  const paid = dayOrders.filter(isPaid);
  const cash = dayOrders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.total, 0);
  const upi = dayOrders.filter(o => o.payment === 'upi').reduce((s, o) => s + o.total, 0);
  const online = dayOrders.filter(isOnline).reduce((s, o) => s + o.total, 0);
  const pieces = paid.reduce((s, o) => s + (o.items || []).reduce((ss, it) => {
    const m = menu.items.find(x => x.id === it.id);
    return m ? ss + (it.type === 'half' ? m.pcsHalf : m.pcsFull) * it.qty : ss;
  }, 0), 0);
  return { orders: dayOrders, paidCount: paid.length, cash, upi, online, pieces };
}

// Short chip label: Today / Yesterday / "3 Sep".
function dayChipLabel(date, yesterday) {
  if (date === TODAY) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return istDateLabel(date, { day: 'numeric', month: 'short' });
}

function Reconciliation({ state, updateState, cartId, inv, stockTypes = [], todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // Recent IST calendar dates, newest first (UTC-anchored to avoid TZ drift).
  const [ty, tm, tdd] = TODAY.split('-').map(Number);
  const baseMs = Date.UTC(ty, tm - 1, tdd);
  const recentDays = [...Array(RECON_DAYS_BACK + 1)].map((_, i) => new Date(baseMs - i * 86400000).toISOString().split('T')[0]);
  const yesterday = recentDays[1];

  const closeByDate = Object.fromEntries(state.dayCloseLogs.filter(d => d.cartId === cartId).map(d => [d.date, d]));
  const orderCountByDate = {};
  state.orders.filter(o => o.cartId === cartId).forEach(o => { orderCountByDate[o.date] = (orderCountByDate[o.date] || 0) + 1; });

  // Status for a day: closed | holiday | empty (past, no orders, open) | pending (past, had orders, open) | today.
  const statusFor = (date) => {
    const dc = closeByDate[date];
    if (dc) return dc.holiday ? 'holiday' : 'closed';
    if (date === TODAY) return 'today';
    return (orderCountByDate[date] || 0) > 0 ? 'pending' : 'empty';
  };

  const closeHoliday = (date) => {
    updateState(prev => ({
      dayCloseLogs: [...prev.dayCloseLogs, {
        id: Date.now(), cartId, date,
        totalOrders: 0,
        systemCash: 0, physicalCash: 0, cashDiff: 0,
        systemUpi: 0, phonePeAmount: 0, upiDiff: 0,
        stock: [], piecesSold: 0, revenue: 0,
        holiday: true,
        closedAt: new Date().toISOString(),
      }],
    }));
  };

  // Back-dated (late) close for a day whose reconciliation was missed. Only cash
  // and UPI are counted — stock and plates/glasses can't be re-counted after the
  // fact, so no inventory is touched. Records the day so it stops reading as
  // "forgotten" in reports.
  const closeLate = (date, physicalCash, phonePeAmount) => {
    const s = dayStatsFor(state, cartId, date);
    const pc = parseInt(physicalCash) || 0;
    const pp = parseInt(phonePeAmount) || 0;
    updateState(prev => ({
      dayCloseLogs: [...prev.dayCloseLogs, {
        id: Date.now(), cartId, date,
        totalOrders: s.paidCount,
        systemCash: s.cash, physicalCash: pc, cashDiff: pc - s.cash,
        systemUpi: s.upi, phonePeAmount: pp, upiDiff: pp - s.upi,
        stock: [], piecesSold: s.pieces, revenue: s.cash + s.upi,
        closedAt: new Date().toISOString(),
      }],
    }));
  };

  const status = statusFor(selectedDate);

  return (
    <div>
      <SectionHeader title="Reconciliation" subtitle="Close the day — cash, stock, plates & glasses" />

      <DayStrip days={recentDays} selectedDate={selectedDate} onSelect={setSelectedDate}
        statusFor={statusFor} yesterday={yesterday} />

      {selectedDate === TODAY ? (
        <TodayReconcile state={state} updateState={updateState} cartId={cartId} inv={inv}
          stockTypes={stockTypes} todayOrders={todayOrders} cashRevenue={cashRevenue}
          upiRevenue={upiRevenue} piecesSold={piecesSold} />
      ) : status === 'closed' || status === 'holiday' ? (
        <ClosedSummary log={closeByDate[selectedDate]} date={selectedDate} />
      ) : status === 'empty' ? (
        <HolidayEmpty date={selectedDate} onMarkClosed={() => closeHoliday(selectedDate)} />
      ) : (
        <LateReconcile date={selectedDate} stats={dayStatsFor(state, cartId, selectedDate)}
          onClose={(cash, upi) => closeLate(selectedDate, cash, upi)} />
      )}
    </div>
  );
}


// ─── Day picker strip ───

function DayStrip({ days, selectedDate, onSelect, statusFor, yesterday }) {
  const badge = { closed: '✓ done', holiday: '🏖️ closed', empty: '—', pending: '● pending', today: '—' };
  const badgeColor = { closed: colors.green, holiday: '#8A6D00', empty: colors.muted, pending: colors.accent, today: colors.muted };
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, WebkitOverflowScrolling: 'touch' }}>
      {days.map(date => {
        const st = statusFor(date);
        const active = date === selectedDate;
        return (
          <button key={date} onClick={() => onSelect(date)}
            style={{
              flex: '0 0 auto', minWidth: 92, textAlign: 'center', cursor: 'pointer',
              background: active ? colors.ink : '#fff',
              color: active ? colors.primary : colors.ink,
              border: `1px solid ${active ? colors.ink : colors.border}`,
              borderRadius: 12, padding: '10px 12px',
            }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap' }}>{dayChipLabel(date, yesterday)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: active ? colors.primary : badgeColor[st] }}>{badge[st]}</div>
          </button>
        );
      })}
    </div>
  );
}


// ─── Empty day → mark cart closed (holiday) ───

function HolidayEmpty({ date, onMarkClosed }) {
  const label = istDateLabel(date, { day: 'numeric', month: 'short' });
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No orders on {label}</div>
      <div style={{ fontSize: 13.5, color: colors.muted, lineHeight: 1.5, maxWidth: 340, margin: '0 auto 20px' }}>
        If the cart was shut that day, mark it closed so it's not flagged as forgotten.
      </div>
      <button onClick={onMarkClosed}
        style={{ background: colors.ink, color: colors.primary, border: 'none', padding: '14px 22px', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
        🏖️ Mark cart closed (holiday)
      </button>
    </div>
  );
}


// ─── Closed day → read-only summary ───

function ClosedSummary({ log, date }) {
  const label = istDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
  if (log?.holiday) {
    return (
      <div>
        <div style={{ background: '#FFF7E0', border: '1px solid #FFE08A', color: '#8A6D00', padding: 28, borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🏖️</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Cart was closed</div>
          <div style={{ fontSize: 13.5, marginTop: 4, opacity: 0.85 }}>{label} · marked as a holiday — no sales.</div>
        </div>
      </div>
    );
  }
  const money = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
  const wareRows = (log?.stock || []).filter(r => String(r.key).startsWith('_ware:'));
  const stockRows = (log?.stock || []).filter(r => !String(r.key).startsWith('_ware:'));
  return (
    <div>
      <div style={{ background: colors.green, color: '#fff', padding: 20, borderRadius: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
          <CheckCircle2 size={18} /> Day closed
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{label} · {log?.totalOrders || 0} orders · counted {money(log?.revenue)}</div>
      </div>

      <SummaryRow label="💰 Cash box" system={money(log?.systemCash)} counted={money(log?.physicalCash)} diff={log?.cashDiff} unit="₹" />
      <SummaryRow label="📱 UPI / PhonePe" system={money(log?.systemUpi)} counted={money(log?.phonePeAmount)} diff={log?.upiDiff} unit="₹" />

      {stockRows.map(r => (
        <SummaryRow key={r.key} label={`🥟 ${r.label}`} system={`${r.expected} pcs`} counted={`${r.actual} pcs`} diff={r.diff} unit="pcs" />
      ))}
      {wareRows.map(r => (
        <SummaryRow key={r.key} label={`🍽️ ${r.label}`} system={`${r.expected}${r.damaged ? ` − ${r.damaged} dmg` : ''}`} counted={`${r.actual}`} diff={r.diff} unit=" pcs" />
      ))}

      <div style={{ fontSize: 11.5, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
        Closed {log?.closedAt ? new Date(log.closedAt).toLocaleString('en-IN') : ''} · logs are read-only
      </div>
    </div>
  );
}

function SummaryRow({ label, system, counted, diff, unit }) {
  const hasDiff = typeof diff === 'number';
  const color = !hasDiff || diff === 0 ? colors.green : Math.abs(diff) < 50 ? '#D4A017' : colors.red;
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasDiff && diff !== 0 ? 8 : 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 13, color: colors.muted }}>
          System <strong style={{ color: colors.ink }}>{system}</strong> · Counted <strong style={{ color: colors.ink }}>{counted}</strong>
        </div>
      </div>
      {hasDiff && diff !== 0 && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> Difference: {diff > 0 ? '+' : ''}{diff}{unit}
        </div>
      )}
    </div>
  );
}


// ─── Past day whose reconciliation was missed → cash/UPI-only late close ───

function LateReconcile({ date, stats, onClose }) {
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const label = istDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
  const cashDiff = physicalCash !== '' ? parseInt(physicalCash) - stats.cash : null;
  const upiDiff = phonePeAmount !== '' ? parseInt(phonePeAmount) - stats.upi : null;

  return (
    <div>
      <div style={{ background: '#FFF7E0', border: '1px solid #FFE08A', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12.5, color: '#8A6D00', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span>⏳</span>
        <span><strong>{label}</strong> was never closed. Confirm the cash & UPI collected — plates and stock can't be re-counted for a past day, so only the money is reconciled.</span>
      </div>

      <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, marginBottom: 8 }}>SYSTEM RECORDED THAT DAY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><div style={{ fontSize: 11, opacity: 0.7 }}>Paid Orders</div><div style={{ fontSize: 24, fontWeight: 800 }}>{stats.paidCount}</div></div>
          <div><div style={{ fontSize: 11, opacity: 0.7 }}>Cash + UPI</div><div style={{ fontSize: 24, fontWeight: 800 }}>₹{stats.cash + stats.upi}</div></div>
        </div>
        {stats.online > 0 && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>plus 🛵 ₹{stats.online} Zomato/Swiggy — weekly payout, not in the cash box.</div>
        )}
      </div>

      <ReconcileBlock title="💰 Cash Box" systemValue={`₹${stats.cash}`} label="Physical cash collected that day"
        value={physicalCash} onChange={setPhysicalCash} diff={cashDiff} unit="₹" />
      <ReconcileBlock title="📱 UPI / PhonePe" systemValue={`₹${stats.upi}`} label="Total in PhonePe that day"
        value={phonePeAmount} onChange={setPhonePeAmount} diff={upiDiff} unit="₹" />

      <button onClick={() => onClose(physicalCash, phonePeAmount)}
        disabled={physicalCash === '' || phonePeAmount === ''}
        style={{ width: '100%', background: (physicalCash === '' || phonePeAmount === '') ? colors.border : colors.ink, color: colors.primary, padding: 18, borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16, cursor: (physicalCash === '' || phonePeAmount === '') ? 'not-allowed' : 'pointer', marginTop: 6 }}>
        Save Late Close
      </button>
    </div>
  );
}


// ─── Today → live full reconciliation (cash, UPI, stock, plates/glasses) ───

function TodayReconcile({ state, updateState, cartId, inv, stockTypes = [], todayOrders, cashRevenue, upiRevenue, piecesSold }) {
  const alreadyClosed = state.dayCloseLogs.some(d => d.cartId === cartId && d.date === TODAY);
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remaining, setRemaining] = useState({}); // { [stockKey]: '' }
  const [wareLeft, setWareLeft] = useState({}); // { [wareKey]: '' } counted (optional)
  const [wareDamaged, setWareDamaged] = useState({}); // { [wareKey]: '' } broken/torn today
  const [closed, setClosed] = useState(false);

  // Aggregator sales — informational only: the platform pays weekly, so this
  // money is never expected in the cash box or PhonePe.
  const onlineRevenue = todayOrders.filter(isOnline).reduce((s, o) => s + o.total, 0);
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
            <div style={{ fontSize: 24, fontWeight: 800 }}>₹{cashRevenue + upiRevenue + onlineRevenue}</div>
          </div>
        </div>
        {onlineRevenue > 0 && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>includes 🛵 ₹{onlineRevenue} Zomato/Swiggy — weekly payout, NOT expected in cash box or PhonePe below.</div>
        )}
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
