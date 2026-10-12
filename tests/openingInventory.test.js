import test from 'node:test';
import assert from 'node:assert/strict';
import { openingBusinessDate } from '../src/lib/openingInventory.js';
test('opening date includes pre-midnight reminder window only for early opening',()=>{
 const now=new Date('2026-12-31T18:15:00Z');
 assert.equal(openingBusinessDate('00:15',now),'2027-01-01');
 assert.equal(openingBusinessDate('00:30',now),'2026-12-31');
 assert.equal(openingBusinessDate('16:00',now),'2026-12-31');
 assert.equal(openingBusinessDate('00:15',new Date('2026-12-31T18:14:59Z')),'2026-12-31');
});
