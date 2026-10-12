export const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;
const shifted = date => new Date(date.getTime() + IST_OFFSET_MS);
const two = value => String(value).padStart(2, '0');
// Modern Indian business dates use UTC+05:30 without daylight saving. Avoid
// Intl.formatToParts and locale-dependent date ordering on Android 7 WebView.
export function localDate(date = new Date()) {
  return shifted(date).toISOString().slice(0, 10);
}
export function istNowMinutes(date = new Date()) {
  const d = shifted(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export function istTime(date = new Date()) {
  const minutes = istNowMinutes(date), hour = Math.floor(minutes / 60);
  return `${two(hour % 12 || 12)}:${two(minutes % 60)} ${hour < 12 ? 'am' : 'pm'}`;
}
export const istDateLabel = (date, options) => new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, ...options }).format(typeof date === 'string' ? new Date(date + 'T12:00:00Z') : date);
