import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {tokenBadgeBytes} from '../src/lib/escpos.js';

test('kitchen queue includes paid orders until ready and excludes cancelled/unconfirmed orders',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true},appType:'custom',define:{__ANDROID_APP__:'false'}});
 try{
  const {kitchenOrders}=await server.ssrLoadModule('/src/components/KitchenQueue.jsx');
  const orders=[{id:2,payment:'cash',revision:1},{id:1,payment:'upi',revision:2,prepStatus:'preparing'},{id:3,payment:'pending',revision:1,prepStatus:'ready'},{id:4,payment:'cancelled',revision:1},{id:5,payment:'cash'}];
  assert.deepEqual(kitchenOrders(orders).map(o=>o.id),[1,2]);
  assert.deepEqual(kitchenOrders(orders,true).map(o=>o.id),[3]);
  const {OrderItemLines}=await server.ssrLoadModule('/src/components/shared.jsx');
  const items=Array.from({length:6},(_,i)=>({name:`Item ${i}`,type:'half',qty:i+1}));
  const html=renderToStaticMarkup(createElement(OrderItemLines,{items,collapsible:true}));
  assert.match(html,/<details>/); assert.match(html,/View all 6 items/);
  for(const item of items)assert.ok(html.includes(item.name));
  assert.ok(html.includes('(half)'));assert.ok(!html.includes('ellipsis'));
 }finally{await server.close();}
});

test('rounded token badge emits a complete 384-dot raster and has a non-browser fallback',()=>{
 assert.equal(tokenBadgeBytes('012'),null);
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>new Proxy({getImageData:()=>({data:new Uint8ClampedArray(384*100*4).fill(255)})},{get:(t,k)=>t[k]||(()=>{})})})};
 try{const bytes=tokenBadgeBytes('012');assert.deepEqual(bytes.slice(0,8),[29,118,48,0,48,0,100,0]);assert.equal(bytes.length,4808);}
 finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
