import React, { useEffect, useState } from 'react';
import { pushSupported, enableReminders, reminderStatus } from '../lib/push';
import { colors } from '../core';

// Compact opt-in tile for daily push reminders (1h before opening + at closing).
// Sized to sit in a flex row next to the open/close control. Renders nothing
// where push isn't available (e.g. iOS Safari not installed to the home screen).
export function RemindersButton({ cartId, role = 'owner' }) {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => { let alive = true; reminderStatus().then(s => alive && setStatus(s)); return () => { alive = false; }; }, []);

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
