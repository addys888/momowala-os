import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedAverageOrder} from '../src/lib/reportMetrics.js';
test('average excludes unpaid, cancelled and separately settled platform orders',()=>{
 assert.equal(recordedAverageOrder([{payment:'cash',total:100},{payment:'upi',total:200},{payment:'split',total:300},{payment:'pending',total:999},{payment:'cancelled',total:999},{payment:'zomato',total:999}]),200);
 assert.equal(recordedAverageOrder([]),null);
});
