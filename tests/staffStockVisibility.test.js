import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('staff stock warnings use confirmed thresholds without revealing counts',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {StaffStockStatus}=await server.ssrLoadModule('/src/components/StaffStockStatus.jsx');
  const render=cart=>renderToStaticMarkup(createElement(StaffStockStatus,{stockTypes:[{key:'veg',label:'Veg Momo'}],inventory:{veg:{cart}}}));
  for(const n of [50,51,500])assert.equal(render(n).includes('Veg Momo'),false);
  for(const n of [49,21]){const html=render(n);assert.ok(html.includes('Stock running low'));assert.equal(html.includes(String(n)),false);}
  for(const n of [20,0,-1])assert.ok(render(n).includes('Refill urgently'));
  assert.equal(render(undefined).includes('Veg Momo'),false);
 }finally{await server.close();}
});
