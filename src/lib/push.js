// Web-push client helpers. Subscribes the browser to push and registers the
// subscription (keyed by cart + role) with /api/push-subscribe. The cron job
// then sends the load-stock and reconcile reminders to it.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window &&
  !!VAPID_PUBLIC;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

// 'on' | 'off' | 'denied' | 'unsupported'
// Once the browser has GRANTED notification permission, reminders are considered
// set up on this device — permission is durable (survives reloads, app-logouts,
// SW updates) unlike the live push subscription, which can momentarily read empty
// while the service worker is still registering on load. So we key the toggle off
// the permission, not the subscription, and never re-prompt a device already set
// up. `ensureSubscribed` then silently keeps the actual subscription alive.
export async function reminderStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'on';
  if (Notification.permission === 'denied') return 'denied';
  return 'off';
}

// Silently (re)create the push subscription and re-register it in the DB. Safe to
// call on every load when permission is granted: it never prompts, waits for the
// service worker to be active (avoids the load race), re-subscribes if the browser
// dropped the subscription, and re-saves it so the reminder cron always has a live
// endpoint. This is what makes an already-set-up device stay ON and never ask.
export async function ensureSubscribed(cartId, role) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
    }
    await fetch('/api/push-subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), cartId, role: role || 'owner' }),
    });
  } catch { /* offline / transient — retried on the next load */ }
}

export async function enableReminders(cartId, role) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const res = await fetch('/api/push-subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), cartId, role: role || 'owner' }),
    });
    if (!res.ok) return { ok: false, reason: 'save-failed' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'error' };
  }
}
