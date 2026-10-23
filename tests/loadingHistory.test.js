import test from 'node:test';
import assert from 'node:assert/strict';
import {loadingWeek,shiftDay,loadingReference} from '../src/lib/loadingHistory.js';
test('weeks cross month and year without phone timezone dependence',()=>{
 assert.deepEqual(loadingWeek('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.equal(shiftDay('2026-10-23',-7),'2026-10-16');
});
test('reference uses actual IST submission and persistent sequence, including midnight',()=>{
 assert.equal(loadingReference({created_at:'2026-10-22T19:09:03Z',reference_number:12}),'2026-10-23_00:39_0012');
 assert.equal(loadingReference({created_at:'2026-10-22T19:09:03Z',reference_number:10000}),'2026-10-23_00:39_10000');
 assert.equal(loadingReference({created_at:'2026-10-22T19:09:03Z'}),'Reference pending');
});
