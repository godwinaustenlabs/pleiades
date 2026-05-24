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

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'; // default to dark mode per premium aesthetic
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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
    </Routes>
  );
}

export default App;
