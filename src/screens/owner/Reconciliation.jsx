import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob } from '../../lib/store';
import { TODAY, WARE_TYPES, brand, colors, cashPart, upiPart, isOnline, isPaid, istDateLabel, istNowMinutes, localDate, menuFor, momoOversell, persistInv, wareLedger } from '../../core';
import { SectionHeader } from '../../components/shared';

function Reconciliation({ state, updateState, cartId, inv, stockTypes = [] }) {
  const shiftDate = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  // Business day with a 1 AM grace: between midnight and 1 AM IST the "day to
  // close" is still yesterday, so a late-night close lands on the right date.
  const GRACE_HOUR = 1;
  const businessDate = istNowMinutes() < GRACE_HOUR * 60 ? shiftDate(localDate(), -1) : localDate();

  const [date, setDate] = useState(businessDate);
  const [physicalCash, setPhysicalCash] = useState('');
  const [phonePeAmount, setPhonePeAmount] = useState('');
  const [remaining, setRemaining] = useState({});
  const [wareLeft, setWareLeft] = useState({});
  const [wareDamaged, setWareDamaged] = useState({});
  const [wareRemove, setWareRemove] = useState({});
  // Owner chose "cart ran but nothing was punched" on a past day with no orders.
  const [manual, setManual] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  // Clear the form when switching which day is being reconciled.
  useEffect(() => { setPhysicalCash(''); setPhonePeAmount(''); setRemaining({}); setWareLeft({}); setWareDamaged({}); setWareRemove({}); setManual(false); }, [date]);

  const isCurrentDay = date === businessDate; // momo stock count only valid here
  const menu = menuFor(state, cartId);
  const closeFor = (d) => state.dayCloseLogs.find(x => x.cartId === cartId && x.date === d);
  const thisClose = closeFor(date);
  const alreadyClosed = !!(thisClose && !thisClose.holiday);
  const isHoliday = !!(thisClose && thisClose.holiday);

  // Last 7 days (newest first) so a forgotten day can be picked and reconciled.
  const dayList = [...Array(7)].map((_, i) => {
    const d = shiftDate(businessDate, -i);
    const c = closeFor(d);
    return { date: d, hasOrders: state.orders.some(o => o.cartId === cartId && o.date === d), closed: !!(c && !c.holiday), holiday: !!(c && c.holiday), manual: !!(c && c.unrecorded) };
  });

  const dayOrders = state.orders.filter(o => o.cartId === cartId && o.date === date);
  // A past day with nothing punched: either the cart was shut (holiday) or it
  // ran and nobody billed. `unrecorded` is the second case — the owner types the
  // day's takings by hand, so there is no system figure to compare against and
  // every "difference" is suppressed rather than logged as a cash gap.
  const noOrders = !dayOrders.length;
  const unrecorded = noOrders && !isCurrentDay && manual;
  const cashRevenue = dayOrders.reduce((s, o) => s + cashPart(o), 0);
  const upiRevenue = dayOrders.reduce((s, o) => s + upiPart(o), 0);
  const onlineRevenue = dayOrders.filter(isOnline).reduce((s, o) => s + o.total, 0);
  const piecesSold = dayOrders.filter(isPaid).reduce((sum, o) => sum + (o.items || []).reduce((s, it) => { const m = (menu.items || []).find(x => x.id === it.id); return m ? s + (it.type === 'half' ? m.pcsHalf : m.pcsFull) * it.qty : s; }, 0), 0);
  const cashDiff = (!unrecorded && physicalCash !== '') ? parseInt(physicalCash) - cashRevenue : null;
  const upiDiff = (!unrecorded && phonePeAmount !== '') ? parseInt(phonePeAmount) - upiRevenue : null;

  const ware = wareLedger(state, cartId, date);
  const wareRows = WARE_TYPES
    .filter(w => ware[w.key].supplied > 0 || ware[w.key].used > 0 || ware[w.key].opening > 0)
    .map(w => {
      const led = ware[w.key];
      // On an unrecorded day `used` is 0 (nothing was punched), so the ledger
      // would read every serving as missing. Count anyway — but as a fresh
      // baseline, so the day re-anchors the ledger without faking a theft gap.
      const anchored = led.anchored && !unrecorded;
      const val = wareLeft[w.key] ?? '';
      const damaged = parseInt(wareDamaged[w.key]) || 0;
      const effExpected = led.expected - damaged;
      const diff = (anchored && val !== '') ? parseInt(val) - effExpected : null;
      const remove = wareRemove[w.key] ?? (w.key !== 'glass');
      return { ...w, ...led, anchored, val, damaged, effExpected, diff, remove };
    });
  // Momo-stock physical count + freezer-return only make sense for the current
  // day — a past day's leftover has since moved off the cart. Past days
  // reconcile cash/UPI + the ware (plate/glass) audit only.
  const stockRows = isCurrentDay ? stockTypes.map(st => {
    const expected = inv[st.key]?.cart ?? 0;
    const val = remaining[st.key] ?? '';
    const diff = val !== '' ? parseInt(val) - expected : null;
    return { ...st, expected, val, diff };
  }) : [];
  const allStockFilled = stockRows.every(r => r.val !== '');
  const oversell = isCurrentDay ? momoOversell(state, cartId, date) : {};

  // Countdown to reconcile the CURRENT day on time (by 1 AM the next day).
  const deadline = isCurrentDay ? Date.parse(shiftDate(businessDate, 1) + 'T01:00:00+05:30') : null;
  const msLeft = deadline ? deadline - Date.now() : null;
  const countdown = msLeft != null && msLeft > 0 ? `${Math.floor(msLeft / 3600000)}h ${Math.floor((msLeft % 3600000) / 60000)}m left` : null;

  const markHoliday = () => {
    updateState({ dayCloseLogs: [...state.dayCloseLogs, { id: Date.now(), cartId, date, holiday: true, revenue: 0, closedAt: new Date().toISOString() }] });
  };

  const closeDay = () => {
    const dayClose = {
      id: Date.now(), cartId, date,
      totalOrders: dayOrders.filter(isPaid).length,
      systemCash: cashRevenue, physicalCash: parseInt(physicalCash) || 0, cashDiff: cashDiff || 0,
      systemUpi: upiRevenue, phonePeAmount: parseInt(phonePeAmount) || 0, upiDiff: upiDiff || 0,
      stock: [
        ...stockRows.map(r => ({ key: r.key, label: r.label, expected: r.expected, actual: parseInt(r.val) || 0, diff: r.diff || 0 })),
        ...wareRows.filter(r => r.val !== '').map(r => ({ key: `_ware:${r.key}`, label: r.label, expected: r.anchored ? r.expected : (parseInt(r.val) || 0), damaged: r.damaged, actual: parseInt(r.val) || 0, carry: r.remove ? 0 : (parseInt(r.val) || 0), diff: r.diff || 0, opening: r.opening, supplied: r.supplied, used: r.used, baseline: !r.anchored })),
      ],
      piecesSold,
      revenue: unrecorded ? (parseInt(physicalCash) || 0) + (parseInt(phonePeAmount) || 0) : cashRevenue + upiRevenue,
      backfilled: !isCurrentDay, closedAt: new Date().toISOString(),
      ...(unrecorded && { unrecorded: true }),
    };
    if (isCurrentDay) {
      // Return counted leftover momos to the freezer and empty the cart.
      const newInv = { ...inv }; const ops = {};
      stockRows.forEach(r => { const actual = parseInt(r.val) || 0; if (newInv[r.key]) { newInv[r.key] = { freezer: (newInv[r.key].freezer || 0) + actual, cart: 0 }; ops[r.key] = { df: actual, cset: 0 }; } });
      updateState({ inventory: { ...state.inventory, [cartId]: newInv }, dayCloseLogs: [...state.dayCloseLogs, dayClose] });
      if (Object.keys(ops).length) persistInv(cartId, ops, { ...state.inventory, [cartId]: newInv });
    } else {
      updateState({ dayCloseLogs: [...state.dayCloseLogs, dayClose] });
    }
  };
  const canClose = physicalCash !== '' && phonePeAmount !== '' && (!isCurrentDay || allStockFilled);

  const dayLabel = (d) => d === businessDate ? 'Today' : d === shiftDate(businessDate, -1) ? 'Yesterday' : istDateLabel(d, { day: 'numeric', month: 'short' });

  return (
    <div>
      <SectionHeader title="Reconciliation" subtitle="Close the day — cash, stock, plates & glasses" />

      {/* Day picker — reconcile today, or backfill a forgotten day (last 7). */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
        {dayList.map(d => {
          const sel = d.date === date;
          const dot = d.closed ? colors.green : d.holiday ? colors.muted : d.hasOrders ? colors.red : colors.border;
          const badge = d.closed ? (d.manual ? '✎' : '✓') : d.holiday ? '🏖️' : d.hasOrders ? '•' : '';
          return (
            <button key={d.date} onClick={() => setDate(d.date)} style={{ flexShrink: 0, background: sel ? colors.ink : '#fff', color: sel ? colors.primary : colors.ink, border: `1px solid ${sel ? colors.ink : colors.border}`, borderRadius: 10, padding: '7px 12px', cursor: 'pointer', textAlign: 'center', minWidth: 62 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{dayLabel(d.date)}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: sel ? colors.primary : (d.hasOrders && !d.closed && !d.holiday ? colors.red : colors.muted) }}>{badge} {d.closed ? (d.manual ? 'by hand' : 'done') : d.holiday ? 'closed' : d.hasOrders ? 'pending' : '—'}</div>
            </button>
          );
        })}
      </div>

      {isCurrentDay && countdown && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF3E0', border: '1px solid #F5CFA4', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 12.5, color: '#B5460B', fontWeight: 700 }}>
          <Clock size={15} /> Reconcile {dayLabel(date)} by 1:00 AM · {countdown}
        </div>
      )}

      {isHoliday ? (
        <div style={{ background: '#F1EFE8', borderRadius: 16, padding: 28, textAlign: 'center', color: colors.muted }}>
          <div style={{ fontSize: 30 }}>🏖️</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.ink, marginTop: 6 }}>{dayLabel(date)} — cart was closed</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Marked as a no-business day. Nothing to reconcile.</div>
        </div>
      ) : alreadyClosed ? (
        <div style={{ background: colors.green, color: '#fff', padding: 28, borderRadius: 16, textAlign: 'center' }}>
          <CheckCircle2 size={44} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 20, fontWeight: 800 }}>{dayLabel(date)} closed</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            {thisClose.unrecorded
              ? `Sales entered by hand — ₹${((thisClose.physicalCash || 0) + (thisClose.phonePeAmount || 0)).toLocaleString('en-IN')} recorded for the day.`
              : 'Reconciliation saved. Pick another day above if needed.'}
          </div>
        </div>
      ) : (noOrders && !isCurrentDay && !manual) ? (
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No orders on {dayLabel(date)}</div>
          <div style={{ fontSize: 12.5, color: colors.muted, margin: '6px 0 18px' }}>Which was it? Either way the day stops being flagged as forgotten.</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={() => setManual(true)} style={{ background: colors.ink, color: colors.primary, border: 'none', borderRadius: 12, padding: '13px 18px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              💰 Cart ran — enter the day's sales
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, marginTop: 3 }}>Nothing was billed in the app; type the money by hand</div>
            </button>
            <button onClick={markHoliday} style={{ background: '#fff', color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '13px 18px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              🏖️ Cart was closed (holiday)
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.muted, marginTop: 3 }}>No business that day</div>
            </button>
          </div>
        </div>
      ) : (<>

      {!isCurrentDay && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#EAF0FF', border: '1px solid #BFD0F0', borderRadius: 10, padding: '9px 12px', marginBottom: 14, fontSize: 12, color: brand.navy }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          {unrecorded ? (
            <span>Recording {dayLabel(date)}'s sales by hand — nothing was punched, so there's no system figure to check against. What you enter becomes the day's revenue. <button onClick={() => setManual(false)} style={{ background: 'none', border: 'none', padding: 0, color: brand.navy, font: 'inherit', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>Not what happened?</button></span>
          ) : (
            <span>Backfilling {dayLabel(date)}. Cash/UPI + plate/glass audit apply; momo-stock count is skipped (that day's leftover has since moved).</span>
          )}
        </div>
      )}

      {/* System totals — or, on an unrecorded day, what the owner is typing in. */}
      <div style={{ background: colors.ink, color: colors.primary, padding: 20, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, marginBottom: 8 }}>{unrecorded ? 'ENTERED BY HAND' : 'SYSTEM RECORDED'} · {dayLabel(date).toUpperCase()}</div>
        {unrecorded ? (
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Revenue (Cash + UPI)</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>₹{(parseInt(physicalCash) || 0) + (parseInt(phonePeAmount) || 0)}</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>No orders were punched, so order count and pieces sold stay blank for this day.</div>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Total Orders</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{dayOrders.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Revenue (Cash + UPI)</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>₹{cashRevenue + upiRevenue}</div>
          </div>
        </div>
        )}
        {onlineRevenue > 0 && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>+ 🛵 ₹{onlineRevenue} Zomato/Swiggy tracked separately — weekly payout, NOT expected in cash box or PhonePe below.</div>
        )}
      </div>

      {/* Cash reconciliation */}
      <ReconcileBlock
        title="💰 Cash Box"
        systemValue={unrecorded ? 'not punched' : `₹${cashRevenue}`}
        label={unrecorded ? 'Cash collected that day' : 'Physical cash in box'}
        value={physicalCash}
        onChange={setPhysicalCash}
        diff={cashDiff}
        unit="₹"
      />

      {/* UPI reconciliation */}
      <ReconcileBlock
        title="📱 UPI / PhonePe"
        systemValue={unrecorded ? 'not punched' : `₹${upiRevenue}`}
        label={unrecorded ? 'UPI received that day (PhonePe)' : 'Total in PhonePe Business app'}
        value={phonePeAmount}
        onChange={setPhonePeAmount}
        diff={upiDiff}
        unit="₹"
      />

      {/* Stock reconciliation — one block per stock type */}
      {stockRows.map(r => (
        <div key={r.key}>
          <ReconcileBlock
            title={`🥟 ${r.label}`}
            systemValue={`${r.expected} pcs expected`}
            label="Actual pieces remaining on cart"
            value={r.val}
            onChange={(v) => setRemaining(prev => ({ ...prev, [r.key]: v }))}
            diff={r.diff}
            unit="pcs"
          />
          {oversell[r.key] > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FDE8EA', border: '1px solid #F5B5BC', borderRadius: 10, padding: '9px 12px', margin: '-6px 0 12px' }}>
              <AlertTriangle size={15} color="#C81E1E" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: '#C81E1E', fontWeight: 600 }}>
                Over-punched by {oversell[r.key]} pcs — more {r.label.toLowerCase()} was billed/wasted than loaded on the cart since the last day-close. Check for mis-punches or an under-recorded loading.
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Ware audit — optional; count each leftover ware type vs its ledger.
          Damaged (broken/torn) pieces are entered separately so legitimate
          breakage never reads as a theft gap. */}
      {wareRows.map(r => (
        <div key={r.key}>
          <ReconcileBlock
            title={`${r.emoji} ${r.label} — ${unrecorded ? 'recount' : 'theft check'}`}
            systemValue={!r.anchored ? (unrecorded ? 'Recount — no check possible' : 'First count — sets baseline') : (r.damaged > 0 ? `${r.expected} − ${r.damaged} damaged = ${r.effExpected}` : `${r.expected} expected`)}
            label={!r.anchored ? (unrecorded ? 'Count what is on the cart — re-anchors the ledger (nothing was punched, so servings can\'t be checked)' : 'Count what is physically on the cart to start tracking') : `Left on cart — count them (${r.opening > 0 ? `${r.opening} carried + ` : ''}${r.supplied} given − ${r.used} served)`}
            value={r.val}
            onChange={(v) => setWareLeft(prev => ({ ...prev, [r.key]: v }))}
            extraLabel="Damaged / broken today (optional)"
            extraValue={wareDamaged[r.key] ?? ''}
            onExtraChange={(v) => setWareDamaged(prev => ({ ...prev, [r.key]: v }))}
            diff={r.diff}
            unit=" pcs"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-6px 2px 14px', fontSize: 12.5, color: colors.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={r.remove} onChange={e => setWareRemove(prev => ({ ...prev, [r.key]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: colors.ink, cursor: 'pointer' }} />
            Take remaining off the cart at close (won't carry to tomorrow)
          </label>
        </div>
      ))}

      {/* Close day button */}
      {isCurrentDay && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFF7E0', border: `1px solid #FFE08A`, borderRadius: 10, padding: '10px 12px', marginTop: 16, fontSize: 12.5, color: '#8A6D00' }}>
          <span>❄️</span><span>On closing, the leftover pieces you counted go <strong>back into the freezer</strong> and the cart is emptied for tomorrow.</span>
        </div>
      )}
      <button onClick={closeDay} disabled={!canClose}
        style={{ width: '100%', background: canClose ? colors.ink : colors.border, color: colors.primary, padding: 18, borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16, cursor: canClose ? 'pointer' : 'not-allowed', marginTop: 10 }}>
        {isCurrentDay ? 'Close Day & Save Report' : unrecorded ? `Save ${dayLabel(date)}'s sales` : `Save ${dayLabel(date)} reconciliation`}
      </button>
      </>)}
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
