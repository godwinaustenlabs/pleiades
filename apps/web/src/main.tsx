import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installSessionRefresh } from './lib/session'
import { registerServiceWorker } from './lib/pwa'

import { BrowserRouter } from 'react-router-dom'

// Before the first render, so no page can fire a request that misses a rolled
// session token. See lib/session.ts.
installSessionRefresh()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
