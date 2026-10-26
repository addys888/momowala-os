import React from 'react';

// Use confirmed inventory only: draft baskets must not reveal a balance by probing it.
export function StaffStockStatus({stockTypes=[],inventory={},showHealthy=false}) {
 const warnings=stockTypes.filter(t=>Number.isFinite(inventory[t.key]?.cart)&&inventory[t.key].cart<50);
 return <section aria-label="Stock availability" aria-live="polite" style={{marginBottom:16}}>
  {warnings.map(t=><div key={t.key} style={{background:'#FFF4DC',color:'#824B11',border:'1px solid #EBD5AB',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
   <strong>{t.label} · {inventory[t.key].cart<=20?'Refill urgently':'Stock running low'}</strong>
   <div style={{fontSize:13,marginTop:4}}>Arrange a refill with your cart manager. Count remaining pieces physically at closing.</div>
  </div>)}
  {showHealthy&&!warnings.length&&<p className="muted">No low-stock alerts. Count remaining pieces physically at closing.</p>}
 </section>;
}
