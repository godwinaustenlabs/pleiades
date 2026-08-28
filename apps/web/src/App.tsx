import type React from 'react';
import { Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import HR from './pages/HR';
import Finance from './pages/Finance';
import Tech from './pages/Tech';
import Legal from './pages/Legal';
import Ops from './pages/Ops';
import Acquisition from './pages/Acquisition';
import UserDashboard from './pages/UserDashboard';
import CRM from './pages/CRM';
import ClientPortal from './pages/ClientPortal';
import Admin from './pages/Admin';


/* Every module page has long carried its own accent colour — CRM rose, Ops
   indigo, Legal amber, Tech teal — spelled out as literal Tailwind shades in
   several hundred places. Those now resolve through `--module`, declared here
   so a page and its home-screen tile always agree, and so a component shared
   between two modules (OutreachTracker sits under both Acquisition and CRM)
   picks up the right hue from context rather than from a prop.

   `display: contents` is what makes this free: the wrapper inherits custom
   properties to its subtree without generating a box of its own, so it cannot
   disturb the `min-h-screen` roots underneath it. */
function ModuleTheme({ hue, children }: { hue: string; children: ReactNode }) {
  return (
    <div className="module-theme" style={{ display: 'contents', '--module': hue } as React.CSSProperties}>
      {children}
    </div>
  );
}

function App() {
  useEffect(() => {
    const applyTheme = () => {
      const savedTheme = localStorage.getItem('theme') || 'system';
      let themeToApply = savedTheme;

      if (savedTheme === 'system') {
        themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      if (themeToApply === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    // Listen for changes to localStorage from other components
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme') {
        applyTheme();
      }
    };

    // Listen for OS theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      const savedTheme = localStorage.getItem('theme') || 'system';
      if (savedTheme === 'system') {
        applyTheme();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login onLogin={() => window.location.href = '/'} />} />
      <Route path="/hr" element={<ModuleTheme hue="var(--app-hr)"><HR /></ModuleTheme>} />
      <Route path="/finance" element={<ModuleTheme hue="var(--app-finance)"><Finance /></ModuleTheme>} />
      <Route path="/tech" element={<ModuleTheme hue="var(--app-tech)"><Tech /></ModuleTheme>} />
      <Route path="/legal" element={<ModuleTheme hue="var(--app-legal)"><Legal /></ModuleTheme>} />
      <Route path="/ops" element={<ModuleTheme hue="var(--app-ops)"><Ops /></ModuleTheme>} />
      <Route path="/acquisition" element={<ModuleTheme hue="var(--app-acquisition)"><Acquisition /></ModuleTheme>} />
      <Route path="/dashboard" element={<ModuleTheme hue="var(--app-dashboard)"><UserDashboard /></ModuleTheme>} />
      <Route path="/crm" element={<ModuleTheme hue="var(--app-crm)"><CRM /></ModuleTheme>} />
      <Route path="/portal" element={<ModuleTheme hue="var(--app-portal)"><ClientPortal /></ModuleTheme>} />
      <Route path="/admin" element={<ModuleTheme hue="var(--app-admin)"><Admin /></ModuleTheme>} />
    </Routes>
  );
}

export default App;
