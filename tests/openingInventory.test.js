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

import {validateOpeningLoad} from '../src/lib/openingInventory.js';
const types=[{key:'veg'},{key:'paneer'},{key:'corn'}];
const stock={veg:{freezer:500},paneer:{freezer:300},corn:{freezer:40}};
test('opening review requires explicit counts for all categories',()=>{
 const r=validateOpeningLoad(types,{veg:'100'},stock);
 assert.ok(r.errors.paneer);assert.ok(r.errors.corn);
});
test('opening review preserves category quantities and explicit zero',()=>{
 const r=validateOpeningLoad(types,{veg:'100',paneer:'50',corn:'0'},stock);
 assert.equal(r.error,'');assert.equal(r.total,150);assert.deepEqual(r.values,{veg:100,paneer:50});
});
test('opening review rejects overdraft, fractions, negative and excessive counts',()=>{
 for(const n of ['501','-1','0.5','100001','NaN','Infinity'])assert.ok(validateOpeningLoad(types,{veg:n,paneer:'0',corn:'0'},stock).errors.veg,n);
});
test('empty loads and unavailable stock cannot be confirmed',()=>{
 assert.ok(validateOpeningLoad(types,{veg:'0',paneer:'0',corn:'0'},stock).error);
 assert.ok(validateOpeningLoad(types,{veg:'1',paneer:'0',corn:'0'},{}).errors.veg);
 assert.ok(validateOpeningLoad([],{},stock).error);
});
