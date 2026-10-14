// Durable operations, not snapshots. A lost response is retried with the SAME
// UUID so the database never applies a stock delta or settlement twice.
export function createOutbox({ read, write, send, actor, put, remove, onResult = () => {}, onStatus = () => {} }) {
  let running = null, sequence = 0;
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
  async function drain() {
    for (const op of list()) {
      if (op.actor !== actor()) continue;
      if (op.error) break;
      let result;
      try { result = await send(op); }
      catch { break; } // offline/response lost: leave operation intact
      if (result.error) {
        if (!result.error.code || /fetch|network/i.test(result.error.message || '')) break;
        save({ ...op, error: result.error.message });
        status(); break;
      }
      if (result.data?.status !== 'ok') {
        save({ ...op, error: result.data?.message || 'Could not save change' });
        status(); break;
      }
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
  return { enqueue, flush, list, retryFailed, restore };
}
