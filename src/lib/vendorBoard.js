// Printable "we're also on Zomato/Swiggy" hanging board.
//
// The QR deliberately encodes OUR OWN redirect (/z/<cartId>), never the raw
// Zomato OneLink: aggregator links get regenerated, and a dead QR on a printed
// board means reprinting every board at every cart. Point it here and the owner
// just updates the link in the app — every hanging board keeps working.

import QRCode from 'qrcode';

const VENDOR = {
  zomato: { name: 'Zomato', colour: '#E23744', path: 'z' },
  swiggy: { name: 'Swiggy', colour: '#FC8019', path: 's' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function printVendorBoard(cart, vendor = 'zomato') {
  const v = VENDOR[vendor] || VENDOR.zomato;
  const origin = window.location.origin;
  const target = `${origin}/${v.path}/${encodeURIComponent(cart.id)}`;

  // High error-correction so the board still scans with a bit of grime or a
  // logo-sized scuff on it — these hang at a street cart, not in an office.
  const qr = await QRCode.toDataURL(target, { errorCorrectionLevel: 'H', margin: 1, width: 900 });

  const readable = target.replace(/^https?:\/\//, '');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(cart.name)} — on ${v.name}</title>
<style>
  @page { size: A5 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .board {
    width: 100%; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    border: 5px solid ${v.colour}; border-radius: 16px; padding: 22px 18px;
  }
  .cart { font-size: 27px; font-weight: 900; letter-spacing: -0.4px; }
  .tag { font-size: 13px; color: #555; margin-top: 3px; }
  .live { margin: 16px 0 4px; font-size: 16px; font-weight: 800; color: #111; }
  .vendor {
    display: inline-block; background: ${v.colour}; color: #fff; font-size: 31px;
    font-weight: 900; padding: 7px 26px; border-radius: 12px; letter-spacing: 0.5px;
  }
  .qr { width: 63%; max-width: 300px; margin: 18px 0 10px; }
  .qr img { width: 100%; display: block; }
  .scan { font-size: 17px; font-weight: 800; color: #111; }
  .sub { font-size: 12.5px; color: #555; margin-top: 4px; }
  .url { font-size: 10.5px; color: #888; margin-top: 12px; word-break: break-all; }
  .foot { font-size: 9.5px; color: #aaa; margin-top: 8px; }
  @media print { .noprint { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .noprint { position: fixed; top: 10px; right: 10px; }
  .noprint button { font: inherit; font-weight: 700; padding: 9px 16px; border-radius: 8px;
    border: none; background: #111; color: #fff; cursor: pointer; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="board">
  <div class="cart">${esc(cart.name)}</div>
  ${cart.tagline ? `<div class="tag">${esc(cart.tagline)}</div>` : ''}
  <div class="live">We're now live on</div>
  <div class="vendor">${v.name}</div>
  <div class="qr"><img src="${qr}" alt="Scan to order on ${v.name}"></div>
  <div class="scan">📱 Scan to order delivery</div>
  <div class="sub">Opens ${v.name} straight at our menu</div>
  <div class="url">${esc(readable)}</div>
  <div class="foot">Powered by Cartlyft</div>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups for this site to open the printable board.'); return false; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
