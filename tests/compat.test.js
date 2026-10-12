import test from 'node:test';
import assert from 'node:assert/strict';
import { secureRandomUUID } from '../src/lib/compat.js';
test('old WebView UUID fallback preserves cryptographic entropy and RFC version bits', () => {
  const id = secureRandomUUID({getRandomValues: bytes => { bytes.fill(255); return bytes; }});
  assert.equal(id,'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.match(secureRandomUUID(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(secureRandomUUID(),secureRandomUUID());
});
test('UUID fallback fails closed without secure randomness', () => {
  assert.throws(()=>secureRandomUUID({}),/Secure random/);
});
test('structured clone preserves command payload isolation', () => {
  const original={items:[{qty:1}],receipt:undefined}; const copy=structuredClone(original);
  original.items[0].qty=2; assert.equal(copy.items[0].qty,1); assert('receipt' in copy);
});

import { localDate, istNowMinutes, istTime } from '../src/lib/time.js';
test('Android-compatible IST calculation handles midnight and year boundaries', () => {
  const before = new Date('2026-12-31T18:29:00Z');
  const after = new Date('2026-12-31T18:30:00Z');
  assert.equal(localDate(before), '2026-12-31');
  assert.equal(istNowMinutes(before), 1439);
  assert.equal(istTime(before), '11:59 pm');
  assert.equal(localDate(after), '2027-01-01');
  assert.equal(istNowMinutes(after), 0);
  assert.equal(istTime(after), '12:00 am');
});
