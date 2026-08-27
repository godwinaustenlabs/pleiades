import React from 'react';

export default function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <>
      {/* Dark Logo - Shown in Light Mode */}
      <img
        src="/pleiades_logo_dark.png"
        alt="Logo"
        className={`${className} object-contain block dark:hidden`}
      />
      {/* Light Logo - Shown in Dark Mode  {Default}*/}
      <img
        src="/pleiades_logo_light.png"
        alt="Logo"
        className={`${className} object-contain hidden dark:block`}
      />
    </>
  );
}
