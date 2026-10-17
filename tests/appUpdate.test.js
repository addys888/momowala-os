import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/app-update.js';
const invoke=async () => {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
  await handler({method:'GET'},res); return res;
};
test('required update never targets an APK that has not been published', async () => {
  const original=global.fetch;
  try {
    global.fetch=async()=>({ok:true,json:async()=>[{minimum_version_code:999999}]});
    assert.equal((await invoke()).code,503);
    global.fetch=async()=>({ok:true,json:async()=>[{minimum_version_code:0}]});
    const result=await invoke(); assert.equal(result.code,200); assert.equal(result.body.minimumVersionCode,0); assert.equal(result.headers['Cache-Control'],'no-store');
    global.fetch=async()=>({ok:false}); assert.equal((await invoke()).code,503);
  } finally {global.fetch=original;}
});
