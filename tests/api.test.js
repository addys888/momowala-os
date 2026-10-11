import test from 'node:test';
import assert from 'node:assert/strict';
import { cronAuthorized } from '../server/auth.js';
import extract from '../api/extract-menu.js';
import subscribe from '../api/push-subscribe.js';
import pending from '../api/cron/pending-alerts.js';
const response = () => ({ code: null, body: null, status(c) { this.code=c;return this; }, json(b) { this.body=b;return this; } });
test('cron fails closed without a configured secret', () => {
  const old=process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized({headers:{},query:{}}),false);
  if (old) process.env.CRON_SECRET=old;
});
test('cron rejects an unauthenticated call before reading data',async () => {
  const res=response(); await pending({headers:{},query:{}},res); assert.equal(res.code,401);
});
test('menu extraction requires an authenticated owner',async () => {
  const res=response(); await extract({method:'POST',headers:{},body:{image:'test'}},res); assert.equal(res.code,403);
});
test('push subscribe never accepts an anonymous device',async () => {
  const res=response(); await subscribe({method:'POST',headers:{},body:{subscription:{endpoint:'https://example.com'},cartId:'test-a'}},res);
  assert.ok([403,500].includes(res.code)); // missing env also fails closed
});
