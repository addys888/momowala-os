// Durable operations, not snapshots. A lost response is retried with the SAME
// UUID so the database never applies a stock delta or settlement twice.
export function createOutbox({ read, write, send, actor, put, remove, onResult = () => {}, onStatus = () => {} }) {
  let running = null, sequence = 0;
  const receipts=new Map();
  const remember=(id,result)=>{receipts.set(id,result);if(receipts.size>100)receipts.delete(receipts.keys().next().value);};
  const save = put || (op => { const entries = list(); write(entries.some(x => x.id === op.id) ? entries.map(x => x.id === op.id ? op : x) : [...entries, op]); });
  const erase = remove || (id => write(list().filter(x => x.id !== id)));
  const list = () => read() || [];
  const status = () => onStatus(list());
  function enqueue(kind, payload) {
    const operation = { id: crypto.randomUUID(), actor: actor(), createdAt: Date.now(), sequence: sequence++, kind, payload: structuredClone(payload) };
    // Must throw on quota/storage failure; an unsaved operation is not accepted.
    save(operation);
    status();
    return operation;
  }
  const resources=op=>{
    const p=op.payload||{};
    if(op.kind==='batch')return (p.commands||[]).flatMap(resources);
    if(op.kind==='order')return [p.after?.id||p.before?.id].map(id=>id?`order:${id}`:'*');
    if(op.kind==='row')return [p.after?.id||p.before?.id].map(id=>id?`${p.table}:${id}`:'*');
    if(['inventory','consumables','menu'].includes(op.kind))return [p.cartId?`${op.kind}:${p.cartId}`:'*'];
    return ['*'];
  };
  async function drain() {
    const blocked=new Set();
    for (const op of list()) {
      if (op.actor !== actor()) continue;
      const keys=resources(op);
      if(op.error){keys.forEach(k=>blocked.add(k));continue;}
      if(blocked.has('*') || keys.some(k=>blocked.has(k)))continue;
      let result;
      try { result = await send(op); }
      catch { break; } // offline/response lost: leave operation intact
      if (result.error) {
        if (!result.error.code || /fetch|network/i.test(result.error.message || '')) break;
        save({ ...op, error: result.error.message });
        keys.forEach(k=>blocked.add(k));status(); continue;
      }
      if (result.data?.status !== 'ok') {
        save({ ...op, error: result.data?.message || 'Could not save change' });
        keys.forEach(k=>blocked.add(k));status(); continue;
      }
      remember(op.id,result.data);
      erase(op.id);
      // The receipt can be removed, but never render a previous user's result
      // into the account that signed in while this request was in flight.
      if (op.actor === actor()) onResult(result.data, op);
      status();
    }
  }
  function flush() {
    if (!running) running = drain().finally(() => { running = null; });
    return running;
  }
  async function commit(id) {
    // Explicit new transaction: old failed commands must not hide its result.
    // Wait for any replay to finish; database revision checks protect stale edits.
    if (running) await running;
    const op=list().find(x=>x.id===id);
    if(!op)return receipts.get(id)||null; // The replay already committed this exact ID.
    if(op.actor!==actor())throw Error('Account changed. Sign in again.');
    let result;
    try { result=await send(op); }
    catch { throw Error('Server confirmation unavailable. The request is retained for safe retry; do not re-enter this transaction.'); }
    if(result.error || result.data?.status!=='ok') {
      const message=result.error?.message || result.data?.message || 'Server confirmation unavailable';
      if(result.error?.code || result.data?.status)save({...op,error:message});
      status();throw Error(message);
    }
    remember(id,result.data);
    erase(id);
    if(op.actor===actor())onResult(result.data,op);
    status();return result.data;
  }
  async function retryFailed() {
    // Preserve operation IDs and payloads. Never resend another account's queue.
    if (running) await running;
    for (const op of list()) {
      if (op.actor !== actor() || !op.error) continue;
      const pending = { ...op };
      delete pending.error;
      save(pending);
    }
    status();
    return flush();
  }
  async function restore(operation) {
    if (operation.actor !== actor()) throw new Error('Sign in with the original account to restore this change.');
    if (running) await running;
    if (operation.actor !== actor()) throw new Error('Account changed. Please retry.');
    const existing = list().find(op => op.id === operation.id);
    if (existing && (existing.actor !== operation.actor || JSON.stringify(existing.payload) !== JSON.stringify(operation.payload))) throw new Error('A different pending change has this ID.');
    const pending = structuredClone(operation);
    delete pending.error;
    save(pending); status();
    await flush();
    const remaining = list().find(op => op.id === operation.id);
    if (remaining) throw new Error(remaining.error || 'Still waiting to sync. Keep the app online and retry. Your backup is retained.');
  }
  return { enqueue, flush, list, retryFailed, restore, commit };
}
