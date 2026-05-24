import { useState } from 'react';
import { Menu, X, type LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MobileTabMenuProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  accentColor?: string;
}

export default function MobileTabMenu({ tabs, activeTab, onTabChange, accentColor = 'primary' }: MobileTabMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

  const handleTabClick = (id: string) => {
    onTabChange(id);
    setIsOpen(false);
  };

  return (
    <div className="md:hidden mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold transition-all hover:bg-white/10"
      >
        <div className="flex items-center gap-3">
          <activeTabData.icon className={`w-5 h-5 text-${accentColor}`} />
          <span>{activeTabData.label}</span>
        </div>
        {isOpen ? <X className="w-5 h-5 text-textSecondary" /> : <Menu className="w-5 h-5 text-textSecondary" />}
      </button>

      {isOpen && (
        <div className="mt-2 bg-slate-900 border border-white/10 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 relative">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`w-full flex items-center gap-3 px-6 py-4 text-sm font-bold transition-all hover:bg-white/5 ${
                activeTab === tab.id ? `text-${accentColor} bg-${accentColor}/5` : 'text-textSecondary'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? `text-${accentColor}` : 'text-textSecondary'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
