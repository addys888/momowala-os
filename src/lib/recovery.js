// Recovery never invents a new operation ID or mixes owners/carts.
export function reconciliationBackups(backups, actor, cartId) {
  if (!Array.isArray(backups) || !actor?.startsWith('owner:')) return [];
  const seen = new Set();
  return backups.filter(op => {
    const row = op?.payload?.after;
    if (!op || op.actor !== actor || op.kind !== 'row' || op.payload?.table !== 'day_close_logs' ||
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
