// ESC/POS receipt builder + RawBT transport for 58mm USB/Bluetooth/Wi-Fi thermal
// printers on Android. We build the raw ESC/POS byte stream, base64-encode it,
// and open a `rawbt:base64,<data>` link — the RawBT print service (installed on
// the phone, printer set as default) delivers the bytes to the printer. If RawBT
// isn't installed the link opens its Play Store page.

const ESC = 0x1B, GS = 0x1D, COLS = 32; // 58mm ≈ 32 chars/line at Font A

// Thermal printers are ASCII/code-page only — drop non-ASCII (emoji, Devanagari)
// and render the rupee sign as "Rs." so nothing prints as garbage.
const ascii = (s) => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '').trim();

// Raster badge gives real rounded corners on standard ESC/POS thermal printers.
// Retain text-mode fallback when canvas is unavailable.
export function tokenBadgeBytes(token) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 384, 100);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(28, 4); ctx.lineTo(356, 4);
  ctx.quadraticCurveTo(380, 4, 380, 28); ctx.lineTo(380, 72);
  ctx.quadraticCurveTo(380, 96, 356, 96); ctx.lineTo(28, 96);
  ctx.quadraticCurveTo(4, 96, 4, 72); ctx.lineTo(4, 28);
  ctx.quadraticCurveTo(4, 4, 28, 4); ctx.stroke();
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px sans-serif'; ctx.fillText('TOKEN', 192, 23);
  ctx.font = '900 48px sans-serif'; ctx.fillText('#' + ascii(token), 192, 64, 340);
  const pixels = ctx.getImageData(0, 0, 384, 100).data;
  const bytes = [GS, 0x76, 0x30, 0, 48, 0, 100, 0];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 384; x += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) if (pixels[(y * 384 + x + bit) * 4] < 128) value |= 128 >> bit;
    bytes.push(value);
  }
  return bytes;
}

function receiptBytes(order, cart = {}, opts = {}) {
  const b = [];
  const raw = (...x) => x.forEach((v) => b.push(v & 0xFF));
  const put = (s) => { for (const ch of ascii(s)) b.push(ch.charCodeAt(0) & 0xFF); };
  const line = (s = '') => { put(s); b.push(0x0A); };
  const align = (n) => raw(ESC, 0x61, n);        // 0 left · 1 center · 2 right
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const dbl = (on) => raw(GS, 0x21, on ? 0x11 : 0x00); // double width+height
  const reverse = (on) => raw(GS, 0x42, on ? 1 : 0);   // white-on-black highlight
  const rule = () => line('-'.repeat(COLS));
  // Left text + right text padded to the full width (amounts flush-right).
  const row = (l, r) => { l = ascii(l); r = ascii(r); const gap = COLS - l.length - r.length; line(l + (gap > 0 ? ' '.repeat(gap) : ' ') + r); };

  raw(ESC, 0x40); // init

  align(1); bold(true); dbl(true); line(cart.name || 'Cart'); dbl(false);
  if (cart.location) line(cart.location);
  if (cart.phone) line('Ph: ' + cart.phone);
  bold(false);
  rule();

  // Highlighted token — reverse (white-on-black), double size, centred, padded so
  // it reads as a solid block (the closest a text-mode thermal gets to a "badge").
  align(1);
  const badge = tokenBadgeBytes(order.token || '');
  if (badge) { b.push(...badge); line(); }
  else { reverse(true); bold(true); dbl(true); line('TOKEN #' + (order.token || '')); dbl(false); bold(false); reverse(false); }
  align(0);
  if (order.date) line('Date: ' + order.date);
  if (order.time) line('Time: ' + order.time + (order.staff ? '   ' + order.staff : ''));
  rule();

  (order.items || []).forEach((it) => {
    line(it.name + (it.type && it.type !== '' ? ' (' + it.type + ')' : ''));
    row('  ' + it.qty + ' x Rs.' + it.price, 'Rs.' + (it.price * it.qty));
  });
  rule();

  bold(true); row('TOTAL', 'Rs.' + order.total); bold(false);
  align(1); dbl(true); line('Rs.' + order.total); dbl(false);
  align(0);

  const pay = order.payment === 'split'
    ? 'Split: Cash Rs.' + (order.split?.cash || 0) + ' + UPI Rs.' + (order.split?.upi || 0)
    : order.payment === 'pending' ? 'UNPAID (to collect)'
    : ('Paid by ' + String(order.payment || '').toUpperCase());
  line(pay);
  if (cart.upiId) line('UPI: ' + cart.upiId);

  align(1); line(''); line(opts.footer || 'Thank you! Visit again');
  raw(0x0A, 0x0A, 0x0A);
  raw(GS, 0x56, 0x00); // full cut (ignored by printers without a cutter)
  return b;
}

const toBase64 = (bytes) => {
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
};

// Internal KITCHEN / COUNTER ticket: big token + item list with quantities, NO
// prices. This is what auto-prints on order placement — the counter uses it to
// prep; the priced customer bill is only printed on request (reprint in My Orders).
function kitchenTicketBytes(order, cart = {}) {
  const b = [];
  const raw = (...x) => x.forEach((v) => b.push(v & 0xFF));
  const put = (s) => { for (const ch of ascii(s)) b.push(ch.charCodeAt(0) & 0xFF); };
  const line = (s = '') => { put(s); b.push(0x0A); };
  const align = (n) => raw(ESC, 0x61, n);
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const dbl = (on) => raw(GS, 0x21, on ? 0x11 : 0x00);
  const reverse = (on) => raw(GS, 0x42, on ? 1 : 0);
  const rule = () => line('-'.repeat(COLS));

  raw(ESC, 0x40); // init
  align(1); bold(true); line('*** KITCHEN COPY ***');
  if (cart.name) line(cart.name);
  bold(false); rule();

  align(1);
  const badge = tokenBadgeBytes(order.token || '');
  if (badge) { b.push(...badge); line(); }
  else { reverse(true); bold(true); dbl(true); line('TOKEN #' + (order.token || '')); dbl(false); bold(false); reverse(false); }
  align(0);
  line((order.time || '') + (order.staff ? '   ' + order.staff : ''));
  rule();

  // Items with quantity, emphasised; type in brackets; no money.
  bold(true);
  (order.items || []).forEach((it) => {
    line(it.qty + ' x ' + it.name + (it.type && it.type !== '' ? ' (' + it.type + ')' : ''));
  });
  bold(false);
  rule();

  const totalQty = (order.items || []).reduce((s, it) => s + (it.qty || 0), 0);
  const pay = order.payment === 'split' ? 'SPLIT (cash + UPI)'
    : order.payment === 'pending' || order.payment === 'unpaid' ? '** UNPAID — COLLECT **'
    : ('Paid: ' + String(order.payment || '').toUpperCase());
  line('Items: ' + totalQty + '    ' + pay);
  raw(0x0A, 0x0A, 0x0A);
  raw(GS, 0x56, 0x00); // cut (ignored if no cutter)
  return b;
}

// Build + send a receipt to RawBT. Returns false if not in a browser.
export function printReceipt(order, cart = {}, opts = {}) {
  if (typeof window === 'undefined') return false;
  const b64 = toBase64(receiptBytes(order, cart, opts));
  window.location.href = 'rawbt:base64,' + b64;
  return true;
}

// Send the internal kitchen ticket to RawBT.
export function printKitchenTicket(order, cart = {}) {
  if (typeof window === 'undefined') return false;
  const b64 = toBase64(kitchenTicketBytes(order, cart));
  window.location.href = 'rawbt:base64,' + b64;
  return true;
}

// A tiny sample so the owner can confirm the printer is wired up.
export function printTest(cart = {}) {
  const demo = {
    token: 'TEST', date: new Date().toLocaleDateString('en-IN'), time: new Date().toLocaleTimeString('en-IN'),
    items: [{ name: 'Veg Steam', type: 'full', qty: 1, price: 70 }],
    total: 70, payment: 'cash',
  };
  return printReceipt(demo, cart, { footer: 'Printer test — all good!' });
}
