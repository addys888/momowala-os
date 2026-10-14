import { NativeNotifications } from './NativeNotifications';
import React, { useEffect, useState } from 'react';
import { pushSupported, enableReminders, reminderStatus, ensureSubscribed } from '../lib/push';
import { colors } from '../core';

// Compact opt-in tile for daily push reminders (1h before opening + at closing).
// Sized to sit in a flex row next to the open/close control. Renders nothing
// where push isn't available (e.g. iOS Safari not installed to the home screen).
// Prominent first-run prompt. A push subscription can ONLY be created by the
// browser on the device itself, after the user taps Allow — it can never be
// provisioned server-side. So the only way to get every cart covered is to ask
// loudly and keep asking: "Later" snoozes for this session only, so the prompt
// returns the next time the app is opened until alerts are actually on.
export function OrderAlertsPrompt({ cartId, role = 'owner' }) {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(() => {
    try { return sessionStorage.getItem('mw:alertsSnoozed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    let alive = true;
    reminderStatus().then(s => {
      if (!alive) return;
      setStatus(s);
      if (s === 'on') ensureSubscribed(cartId, role);
    });
    return () => { alive = false; };
  }, [cartId, role]);

  if (__ANDROID_APP__) return null;
  if (status === 'loading' || status === 'on' || status === 'unsupported' || !pushSupported()) return null;
  if (snoozed) return null;

  const snooze = () => {
    try { sessionStorage.setItem('mw:alertsSnoozed', '1'); } catch { /* ignore */ }
    setSnoozed(true);
  };

  const enable = async () => {
    setBusy(true);
    const r = await enableReminders(cartId, role);
    setBusy(false);
    if (r.ok) setStatus('on');
    else if (r.reason === 'denied') setStatus('denied');
    else alert('Could not turn on alerts — please try again.');
  };

  const blocked = status === 'denied';
  return (
    <div style={{ background: blocked ? '#FFF1F1' : '#FFF8E1', border: `1.5px solid ${blocked ? '#E4A0A0' : '#E0B100'}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{blocked ? '🔕' : '🔔'}</span>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: colors.ink }}>
          {blocked ? 'Order alerts are blocked' : 'Turn on order alerts'}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.45, marginBottom: 10 }}>
        {blocked
          ? 'This phone blocked notifications, so it will stay silent when a customer orders. Allow notifications for this site in your browser settings (tap the lock icon in the address bar → Notifications → Allow), then reopen the app.'
          : 'Your phone will ring and vibrate the moment a customer places an order — even when the app is closed. Without this, you will only hear alerts while this screen is open.'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!blocked && (
          <button onClick={enable} disabled={busy}
            style={{ flex: 1, background: colors.ink, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Turning on…' : 'Turn on alerts'}
          </button>
        )}
        <button onClick={snooze}
          style={{ flex: blocked ? 1 : '0 0 auto', background: 'transparent', color: colors.muted, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Later
        </button>
      </div>
    </div>
  );
}

export function RemindersButton({ cartId, role = 'owner' }) {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    reminderStatus().then(s => {
      if (!alive) return;
      setStatus(s);
      // Already set up on this device → silently refresh the subscription in the
      // DB (no prompt), so it stays ON and never asks again.
      if (s === 'on') ensureSubscribed(cartId, role);
    });
    return () => { alive = false; };
  }, [cartId, role]);

  if (__ANDROID_APP__) return <NativeNotifications cartId={cartId} role={role} />;
  if (status === 'loading' || status === 'unsupported' || !pushSupported()) return null;

  const on = status === 'on';
  const enable = async () => {
    setBusy(true);
    const r = await enableReminders(cartId, role);
    setBusy(false);
    if (r.ok) setStatus('on');
    else if (r.reason === 'denied') setStatus('denied');
    else alert('Could not enable reminders — please try again.');
  };

  return (
    <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${on ? '#CBE7CB' : colors.border}`, borderRadius: 12, padding: '10px 12px' }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: on ? '#0F7B0F' : colors.ink, lineHeight: 1.1 }}>Reminders</div>
        <div style={{ fontSize: 10.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {on ? 'Load & reconcile alerts' : status === 'denied' ? 'Blocked in settings' : 'Load & reconcile alerts'}
        </div>
      </div>
      {on
        ? <span style={{ fontSize: 12, fontWeight: 800, color: '#0F7B0F', flexShrink: 0 }}>On</span>
        : status !== 'denied' && <button onClick={enable} disabled={busy} style={{ background: colors.ink, color: '#fff', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', flexShrink: 0 }}>{busy ? '…' : 'Enable'}</button>}
    </div>
  );
}
