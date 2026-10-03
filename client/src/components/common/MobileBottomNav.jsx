import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, ShieldCheck, Wallet, User, Plus } from 'lucide-react';

const MobileBottomNav = ({ onUploadClick }) => {
  const navItems = [
    { label: 'Home',     path: '/dashboard',     icon: LayoutDashboard },
    { label: 'Docs',     path: '/documents',     icon: FileText },
    { label: 'Verify',   path: '/verifications',  icon: ShieldCheck },
    { label: 'Wallet',   path: '/wallet',        icon: Wallet },
    { label: 'Profile',  path: '/profile',       icon: User },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[#E8E2DA] px-1.5 sm:px-4 py-1 sm:py-2 shadow-card-lg">
      <div className="flex items-center justify-around max-w-md mx-auto relative gap-0.5 sm:gap-1">
        {navItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex flex-col items-center justify-center py-1 sm:py-1.5 px-1.5 sm:px-3 rounded-xl transition-all flex-1 min-w-0 max-w-[72px] min-h-[44px]
                ${isActive
                  ? 'text-[#2D6A4F] font-bold bg-[#F0FAF5]'
                  : 'text-[#7B746E] hover:text-[#2E2A26]'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  <span className="text-[10px] tracking-tight">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export default MobileBottomNav;
