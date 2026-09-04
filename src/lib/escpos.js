// ESC/POS receipt builder + RawBT transport for 58mm USB/Bluetooth/Wi-Fi thermal
// printers on Android. We build the raw ESC/POS byte stream, base64-encode it,
// and open a `rawbt:base64,<data>` link — the RawBT print service (installed on
// the phone, printer set as default) delivers the bytes to the printer. If RawBT
// isn't installed the link opens its Play Store page.

const ESC = 0x1B, GS = 0x1D, COLS = 32; // 58mm ≈ 32 chars/line at Font A

// Thermal printers are ASCII/code-page only — drop non-ASCII (emoji, Devanagari)
// and render the rupee sign as "Rs." so nothing prints as garbage.
const ascii = (s) => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '').trim();

function receiptBytes(order, cart = {}, opts = {}) {
  const b = [];
  const raw = (...x) => x.forEach((v) => b.push(v & 0xFF));
  const put = (s) => { for (const ch of ascii(s)) b.push(ch.charCodeAt(0) & 0xFF); };
  const line = (s = '') => { put(s); b.push(0x0A); };
  const align = (n) => raw(ESC, 0x61, n);        // 0 left · 1 center · 2 right
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const dbl = (on) => raw(GS, 0x21, on ? 0x11 : 0x00); // double width+height
  const rule = () => line('-'.repeat(COLS));
  // Left text + right text padded to the full width (amounts flush-right).
  const row = (l, r) => { l = ascii(l); r = ascii(r); const gap = COLS - l.length - r.length; line(l + (gap > 0 ? ' '.repeat(gap) : ' ') + r); };

  raw(ESC, 0x40); // init

  align(1); bold(true); dbl(true); line(cart.name || 'Cart'); dbl(false);
  if (cart.location) line(cart.location);
  if (cart.phone) line('Ph: ' + cart.phone);
  bold(false);
  rule();

  align(0);
  line('Token #' + (order.token || '') + '   ' + (order.date || ''));
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

// Build + send a receipt to RawBT. Returns false if not in a browser.
export function printReceipt(order, cart = {}, opts = {}) {
  if (typeof window === 'undefined') return false;
  const b64 = toBase64(receiptBytes(order, cart, opts));
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
