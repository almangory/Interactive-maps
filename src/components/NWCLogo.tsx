import React from 'react';

interface NWCLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const NWCLogo: React.FC<NWCLogoProps> = ({ className = '', size = 'md' }) => {
  const dimensions = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  };

  return (
    <div 
      id="water-symbol-logo" 
      className={`${dimensions[size]} relative flex items-center justify-center bg-transparent transition-transform duration-300 hover:scale-105 select-none ${className}`}
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full filter drop-shadow-[0_4px_6px_rgba(0,100,255,0.15)]"
      >
        {/* Soft Background Glow Sphere */}
        <circle cx="60" cy="60" r="50" fill="url(#waterGlow)" opacity="0.3" />

        {/* Outer Circular Wave Ripples */}
        <circle cx="60" cy="65" r="48" stroke="url(#rippleGrad)" strokeWidth="1.5" strokeDasharray="4 4" className="animate-spin-slow opacity-60" style={{ transformOrigin: '60px 65px' }} />
        <circle cx="60" cy="65" r="42" stroke="url(#rippleGrad)" strokeWidth="1" opacity="0.4" />

        {/* Elegant Abstract Base Wave */}
        <path
          d="M 20,78 C 40,70 50,86 70,78 C 90,70 100,78 100,78 A 40,40 0 0,1 20,78 Z"
          fill="url(#waveGrad)"
          opacity="0.8"
        />

        {/* Main 3D Water Droplet */}
        <path
          d="M 60,18 C 38,48 26,66 26,82 C 26,101 41,114 60,114 C 79,114 94,101 94,82 C 94,66 82,48 60,18 Z"
          fill="url(#dropletGrad)"
        />

        {/* Glass Highlight Overlay (Inner reflection) */}
        <path
          d="M 60,22 C 41,49 31,65 31,80 C 31,88 35,95 41,100 C 35,90 35,76 46,55 C 53,41 60,28 60,22 Z"
          fill="#FFFFFF"
          opacity="0.35"
        />

        {/* Modern Diagonal High-Gloss Glare Reflection */}
        <ellipse 
          cx="72" 
          cy="60" 
          rx="6" 
          ry="15" 
          fill="url(#glareGrad)" 
          opacity="0.6" 
          transform="rotate(-25 72 60)" 
        />

        {/* Tiny Droplet Splash Accent */}
        <circle cx="85" cy="40" r="3" fill="#38BDF8" opacity="0.8" />
        <circle cx="35" cy="48" r="2" fill="#0EA5E9" opacity="0.6" />

        {/* Gradients Definition */}
        <defs>
          {/* Background Ambient Glow */}
          <radialGradient id="waterGlow" cx="60" cy="60" r="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0369A1" stopOpacity="0" />
          </radialGradient>

          {/* Glowing Droplet Fluid Gradient */}
          <linearGradient id="dropletGrad" x1="60" y1="18" x2="60" y2="114" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="45%" stopColor="#0EA5E9" />
            <stop offset="85%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>

          {/* Under-waves Flow Gradient */}
          <linearGradient id="waveGrad" x1="20" y1="70" x2="100" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>

          {/* Ripples Ring Gradient */}
          <linearGradient id="rippleGrad" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>

          {/* 3D Glass Gloss Reflection Glare */}
          <linearGradient id="glareGrad" x1="72" y1="45" x2="72" y2="75" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
