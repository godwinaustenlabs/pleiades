import { Routes, Route } from 'react-router-dom';
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
      <Route path="/hr" element={<HR />} />
      <Route path="/finance" element={<Finance />} />
      <Route path="/tech" element={<Tech />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/ops" element={<Ops />} />
      <Route path="/acquisition" element={<Acquisition />} />
      <Route path="/dashboard" element={<UserDashboard />} />
      <Route path="/crm" element={<CRM />} />
      <Route path="/portal" element={<ClientPortal />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default App;
