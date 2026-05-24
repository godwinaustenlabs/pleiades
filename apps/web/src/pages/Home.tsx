import { useState, useEffect, useMemo } from 'react';
import { Shield, Users, Briefcase, Activity, Code, Target, Settings, LogOut, LayoutDashboard, Lock, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { Link } from 'react-router-dom';
import ProfileModal from '../components/ProfileModal';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const ALL_APPS = [
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Manage employees, payroll, and access levels.',
    icon: Users,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/hr',
  },
  {
    id: 'finance',
    name: 'Finance & Accounts',
    description: 'Handle transactions, invoices, and budgets.',
    icon: Briefcase,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/finance',
  },
  {
    id: 'legal',
    name: 'Legal & Compliance',
    description: 'Track contracts, IP, and legal obligations.',
    icon: Shield,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/legal',
  },
  {
    id: 'ops',
    name: 'Operations',
    description: 'Oversee labs, committees, and monthly reports.',
    icon: Activity,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/ops',
  },
  {
    id: 'tech',
    name: 'Technology',
    description: 'Manage sprints, epics, issues, and deployments.',
    icon: Code,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/tech',
  },
  {
    id: 'acquisition',
    name: 'Acquisition',
    description: 'Track campaigns, leads, and marketing funnels.',
    icon: Target,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/acquisition',
  },
  {
    id: 'crm',
    name: 'Committee CRM',
    description: 'Manage committee workflows and client support.',
    icon: Shield,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/crm',
  },
  {
    id: 'dashboard',
    name: 'User Dashboard',
    description: 'Your personal workspace: tasks, notes, and metrics.',
    icon: LayoutDashboard,
    color: 'hover:border-primary/50 hover:bg-primary/5',
    iconColor: 'text-primary bg-primary/20',
    url: '/dashboard',
    alwaysVisible: true,
  },
];

function Home() {
  const [showProfile, setShowProfile] = useState(false);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const user = useMemo(() => JSON.parse(localStorage.getItem('ga_user') || '{}'), []);

  const fetchPermissions = async () => {
    if (!user.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/permissions/user/${user.id}`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setUserPermissions(d.data || []);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const visibleApps = useMemo(() => {
    if (user.isSuperadmin) return ALL_APPS;

    return ALL_APPS.filter(app => {
      if (app.alwaysVisible) return true;
      // Check if user has canView for ANY feature in this app
      return userPermissions.some(p => p.appName === app.id && p.canView);
    });
  }, [userPermissions, user.isSuperadmin]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-textSecondary">Initializing Platform</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8 md:p-8 font-sans relative text-textPrimary animate-in fade-in duration-700">
      {/* Background Decorations */}
      <div className="absolute top-0 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-primary/10 blur-[80px] md:blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[250px] md:w-[500px] h-[250px] md:h-[500px] bg-accent/10 blur-[70px] md:blur-[100px] rounded-full pointer-events-none" />

      {/* Top Bar */}
      <div className="z-10 w-full max-w-7xl flex justify-between items-center mb-12 md:mb-20">
        <div className="flex items-center gap-2 md:gap-3">
          <Logo className="w-8 h-8 md:w-10 md:h-10" />
          <span className="text-xl md:text-2xl font-black tracking-tighter">Plieades<span className="text-primary">System</span></span>
        </div>

        {user.id ? (
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2 md:gap-3 pl-1.5 md:pl-2 pr-3 md:pr-4 py-1 md:py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
            >
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-[10px] md:text-xs shadow-lg shadow-primary/20 overflow-hidden">
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt="User" className="w-full h-full object-cover" />
                ) : (
                  user.name?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || '?'
                )}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[10px] md:text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Member'}</div>
                <div className="text-[9px] md:text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Staff'}</div>
              </div>
              <Settings className="w-3 h-3 md:w-3.5 md:h-3.5 text-textSecondary group-hover:rotate-90 transition-transform duration-500" />
            </button>
            <div className="h-6 md:h-8 w-px bg-white/10 mx-0.5 md:mx-1" />
            <button onClick={handleLogout} className="p-2 md:p-2.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all">
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="px-4 md:px-6 py-2 rounded-full bg-primary text-white font-black uppercase tracking-widest text-[9px] md:text-[10px] hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
          >
            Authenticate
          </Link>
        )}
      </div>

      {/* Hero Section */}
      <div className="z-10 text-center mb-12 md:mb-16 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-textSecondary mb-6 md:mb-8">
          <Shield className="w-3 h-3 text-primary" /> Secure Enterprise Gateway
        </div>
        <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-6 md:mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 leading-[1.1]">
          Orchestrate Your <br className="hidden md:block" /> Institutional Flow.
        </h1>
        <p className="text-base md:text-xl text-textSecondary max-w-2xl mx-auto leading-relaxed font-medium px-4">
          Plieades System provides a high-security, granular ecosystem for autonomous and human-driven operations across Godwin Austen Labs.
        </p>
      </div>

      {/* App Grid */}
      <div className="z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl w-full">
        {visibleApps.map((app) => (
          <Link
            key={app.id}
            to={app.url}
            className={`glass-panel p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 transition-all duration-500 hover:scale-[1.02] md:hover:scale-[1.03] hover:-translate-y-1 md:hover:-translate-y-2 hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] group flex flex-col ${app.color}`}
          >
            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center mb-6 md:mb-8 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 ${app.iconColor} border border-white/10 shadow-lg`}>
              <app.icon className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black mb-3 md:mb-4 text-white tracking-tight">{app.name}</h2>
            <p className="text-xs md:text-sm text-textSecondary leading-relaxed flex-1 font-medium">{app.description}</p>

            <div className="mt-8 md:mt-10 flex items-center justify-between">
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-white/20 group-hover:text-primary transition-colors">Access Portal</span>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-500">
                <span className="text-lg md:text-xl leading-none group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </Link>
        ))}

        {!user.id ? (
          <div className="col-span-1 md:col-span-2 lg:col-span-2 p-8 md:p-12 glass-panel rounded-[2rem] md:rounded-[3rem] border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-4 md:space-y-6">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/5 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 md:w-10 md:h-10 text-primary opacity-50" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-bold">Authentication Required</h3>
              <p className="text-xs md:text-sm text-textSecondary max-w-xs mx-auto mt-2 leading-relaxed">
                Please sign in to access departmental portals and operational tools.
              </p>
              <Link to="/login" className="mt-4 md:mt-6 inline-block px-6 md:px-8 py-2 md:py-3 rounded-full bg-primary text-white font-black uppercase tracking-widest text-[9px] md:text-[10px] hover:bg-primary/80 transition-all shadow-lg shadow-primary/20">
                Sign In Now
              </Link>
            </div>
          </div>
        ) : visibleApps.length === 1 && visibleApps[0].id === 'dashboard' && (
          <div className="col-span-1 md:col-span-2 lg:col-span-2 p-8 md:p-12 glass-panel rounded-[2rem] md:rounded-[3rem] border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-4 md:space-y-6">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/5 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 md:w-10 md:h-10 text-textSecondary opacity-20" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-bold">Limited App Provisioning</h3>
              <p className="text-xs md:text-sm text-textSecondary max-w-xs mx-auto mt-2 leading-relaxed">
                You currently only have access to your personal dashboard.
                Departmental apps must be provisioned by an administrator.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="z-10 mt-32 py-16 border-t border-white/5 w-full max-w-6xl flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-textSecondary">
        <div>&copy; {new Date().getFullYear()} Godwin Austen Labs // Operational Infrastructure</div>
        <div className="flex gap-10">
          <a href="#" className="hover:text-primary transition-colors">Security Audit</a>
          <a href="#" className="hover:text-primary transition-colors">System Status</a>
          <a href="#" className="hover:text-primary transition-colors">Contact HQ</a>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}

export default Home;
