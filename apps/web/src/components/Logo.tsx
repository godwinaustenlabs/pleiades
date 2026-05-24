import React from 'react';

export default function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <>
      {/* Dark Logo - Shown in Light Mode (Default) */}
      <img
        src="/plieades_logo_light.png"
        alt="Logo"
        className={`${className} object-contain block dark:hidden`}
      />
      {/* Light Logo - Shown in Dark Mode */}
      <img
        src="/plieades_logo_dark.png"
        alt="Logo"
        className={`${className} object-contain dark:block`}
      />
    </>
  );
}
