import { operationChanges, reconciliationRow } from './operations.js';
// Recovery never invents a new operation ID or mixes owners/carts.
export function reconciliationBackups(backups, actor, cartId) {
  if (!Array.isArray(backups) || !actor?.startsWith('owner:')) return [];
  const seen = new Set();
  return backups.filter(op => {
    const row = op && reconciliationRow(op);
    if (!op || op.actor !== actor ||
        row?.cart_id !== cartId || !Number.isSafeInteger(row?.id) || !/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(op.id || '') || seen.has(op.id)) return false;
    seen.add(op.id); return true;
  });
}
export function archiveRejected({ operations, actor, backup, persistBackup, remove }) {
  const rejected = operations.filter(op => op.actor === actor && op.error);
  // A throwing write MUST stop removal; storage-full must not lose the only copy.
  persistBackup([...backup, ...rejected]);
  for (const op of rejected) remove(op.id);
}

// Keep the original atomic operation intact, including its inventory commands.
export function orderBackups(backups, actor, cartId) {
  const seen = new Set();
  return (Array.isArray(backups) ? backups : []).filter(op => {
    if (!op || op.actor !== actor || seen.has(op.id) || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(op.id || '')) return false;
    const orders = operationChanges([op]).filter(c => c.kind === 'order');
    if (!orders.length || orders.some(c => c.payload?.after?.cart_id !== cartId)) return false;
    seen.add(op.id); return true;
  });
}
