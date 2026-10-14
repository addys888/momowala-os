// A failed/offline edit must not freeze every other order on the receiving phone.
export function mergeOrderUpdates(local = [], remote = [], operations = []) {
  const protectedIds = new Set(operations.filter(op => op.kind === 'order')
    .map(op => op.payload.after?.id ?? op.payload.before?.id));
  const seen = new Map(local.map(order => [order.id, order]));
  for (const order of remote) {
    if (protectedIds.has(order.id)) continue;
    const previous = seen.get(order.id);
    if (!previous || (order.revision ?? 0) >= (previous.revision ?? 0)) seen.set(order.id, order);
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}

export async function readOrderPages(read, pageSize = 1000) {
  const orders = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Missing order response');
    orders.push(...data);
    if (data.length < pageSize) return orders;
  }
}
