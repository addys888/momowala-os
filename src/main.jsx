import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MomoWalaOS from './MomoWalaOS.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MomoWalaOS />
  </StrictMode>,
)

// Register the push service worker (enables reminder notifications). Harmless
// where unsupported; the app runs identically without it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
