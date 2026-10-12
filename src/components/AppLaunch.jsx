import { useEffect, useState } from 'react';
import { CartlyftMark } from '../core';

export function AppLaunch() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(timer); }, []);
  return <main className="app-launch" aria-busy="true" aria-label="Starting Cartlyft">
    <div className="app-launch-brand"><CartlyftMark size={56}/><span>Cartlyft</span></div>
    <div className="app-launch-card">
      <div className="app-launch-label">YOUR DAILY OPERATIONS</div>
      <h1>Getting ready</h1>
      <p role="status">{slow ? 'Your connection is taking a little longer. Your saved work stays on this phone.' : 'Syncing your workspace securely.'}</p>
      <div className="app-launch-track" aria-hidden="true"><span/></div>
      {slow && <button onClick={() => window.location.reload()}>Try again</button>}
    </div>
    <p className="app-launch-footer">One workspace. Ready for service.</p>
  </main>;
}
