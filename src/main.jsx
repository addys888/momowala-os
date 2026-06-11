import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MomoWalaOS from './MomoWalaOS.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MomoWalaOS />
  </StrictMode>,
)
