import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOrderUpdates, readOrderPages } from '../src/lib/orderSync.js';

test('phone B receives phone A orders despite an unrelated failed local order', () => {
  const local = { id: 1, revision: 1, payment: 'cash' };
  const remote = { id: 2, revision: 1, staff: 'Akash' };
  const ops = [{ kind: 'order', payload: { after: local }, error: 'Offline' }];
  assert.deepEqual(mergeOrderUpdates([local], [remote], ops), [local, remote]);
});
test('protect pending edits, accept new revisions after sync, reject stale responses', () => {
  const local = { id: 1, revision: 1, payment: 'cash' };
  const remote = { id: 1, revision: 2, payment: 'upi' };
  const ops = [{ kind: 'order', payload: { after: local } }];
  assert.deepEqual(mergeOrderUpdates([local], [remote], ops), [local]);
  assert.deepEqual(mergeOrderUpdates([local], [remote]), [remote]);
  assert.deepEqual(mergeOrderUpdates([remote], [local]), [remote]);
});
test('poll retrieves orders beyond the server response cap', async () => {
  const rows = Array.from({ length: 1002 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await readOrderPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1) };
  });
  assert.deepEqual(result, rows);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});
test('failed later page never becomes a successful partial sync', async () => {
  await assert.rejects(readOrderPages(async from => from === 0
    ? { data: [{ id: 1 }] } : { error: new Error('Disconnected') }, 1), /Disconnected/);
});
