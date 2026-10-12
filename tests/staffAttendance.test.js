import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyAttendance } from '../src/lib/staffAttendance.js';
test('month totals distinguish taken, planned, half days and other months',()=>{
 const r=monthlyAttendance({daysOff:{'2026-10-01':{type:'weekly_off',duration:1},'2026-10-12':{type:'leave',duration:0.5},'2026-10-20':{type:'holiday',duration:1},'2026-09-20':{type:'absence',duration:1}}},'2026-10','2026-10-12');
 assert.equal(r.taken,1.5);assert.equal(r.planned,1);assert.equal(r.byType.leave,0.5);assert.equal(r.entries.length,3);
});
test('unrecorded days are not invented as present or absent',()=>{
 const r=monthlyAttendance({},'2026-10','2026-10-12');assert.equal(r.taken,0);assert.deepEqual(r.entries,[]);
});
