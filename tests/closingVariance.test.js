import test from 'node:test';
import assert from 'node:assert/strict';
import {closingVariance} from '../src/lib/closingVariance.js';
const types=[{key:'veg',label:'Veg Momo'},{key:'paneer',label:'Paneer Momo'}];
test('shortage and excess are category specific',()=>{
 const r=closingVariance(types,{veg:75,paneer:45},{veg:85,paneer:40});
 assert.equal(r[0].difference,-10);assert.equal(r[1].difference,5);
});
test('matching and zero remaining counts do not warn',()=>assert.deepEqual(closingVariance(types,{veg:0,paneer:40},{veg:0,paneer:40}),[]));
