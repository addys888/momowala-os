import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../src/lib/outbox.js';

function setup(send) {
  let saved = [], who = 'owner:cart-a';
  const options = { read: () => saved, write: x => { saved = x; }, actor: () => who, send };
  return { queue: createOutbox(options), restart: () => createOutbox(options), setActor: x => { who = x; } };
}
test('lost response and reload retain the same operation ID', async () => {
  const calls = []; let online = false;
  const ctx = setup(async op => { calls.push(op); if (!online) throw Error('network'); return { data: { status: 'ok' } }; });
  const payload = { cartId: 'a', ops: { veg: { dc: -5 } } };
  ctx.queue.enqueue('inventory', payload); payload.ops.veg.dc = -100;
  await ctx.queue.flush(); assert.equal(ctx.queue.list().length, 1);
  online = true; await ctx.restart().flush();
  assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[1].payload.ops.veg.dc, -5);
  assert.equal(ctx.queue.list().length, 0);
});
test('concurrent flush calls do not duplicate a request', async () => {
  let calls = 0; const ctx = setup(async () => { calls++; await new Promise(r => setTimeout(r, 10)); return { data: { status: 'ok' } }; });
  ctx.queue.enqueue('order', {});
  await Promise.all([ctx.queue.flush(),ctx.queue.flush(),ctx.queue.flush()]); assert.equal(calls,1);
});
test('another account cannot submit stored operations', async () => {
  let calls = 0; const ctx = setup(async () => { calls++; return { data: { status: 'ok' } }; });
  ctx.queue.enqueue('row', {}); ctx.setActor('owner:cart-b'); await ctx.queue.flush();
  assert.equal(calls,0); assert.equal(ctx.queue.list().length,1);
});
test('conflict preserves operation and stops dependent writes', async () => {
  let calls = 0; const ctx = setup(async () => { calls++; return { data: { status: 'conflict', message: 'Changed elsewhere' } }; });
  ctx.queue.enqueue('order', {}); ctx.queue.enqueue('order', {});
  await ctx.queue.flush(); await ctx.queue.flush();
  assert.equal(calls,1); assert.equal(ctx.queue.list().length,2); assert.equal(ctx.queue.list()[0].error,'Changed elsewhere');
});
test('storage failure prevents accepting a command', () => {
  const queue = createOutbox({ read: () => [], write: () => { throw Error('quota'); }, actor: () => 'a', send: () => {} });
  assert.throws(() => queue.enqueue('order', {}), /quota/);
});
