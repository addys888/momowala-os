// Averages use recorded counter orders only. Counted/manual cash cannot be
// divided by an unrelated order count; it remains in collection totals.
export function recordedAverageOrder(orders) {
  const rows=orders.filter(o=>['cash','upi','split'].includes(o.payment));
  return rows.length ? Math.round(rows.reduce((sum,o)=>sum+Number(o.total || 0),0)/rows.length) : null;
}
