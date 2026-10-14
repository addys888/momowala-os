export const operationChanges = operations => operations.flatMap(op => op.kind === 'batch'
  ? op.payload.commands.map(command => ({ ...op, ...command })) : [op]);
export const reconciliationRow = op => operationChanges([op]).find(change => change.kind === 'row' && change.payload?.table === 'day_close_logs')?.payload.after;
