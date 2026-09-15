/**
 * DocuCenter brand mark: a printer glyph with a curling CMYK paper ribbon
 * and a soft rainbow glow. Shared between the sidebar and the login screen.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dc-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#29B6E8" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>
        <radialGradient id="dc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#EC4899" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#29B6E8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
        </radialGradient>
        <filter id="dc-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      {/* printer tray */}
      <rect x="21" y="8" width="18" height="14" rx="3" stroke="#12263F" strokeWidth="2.2" fill="white" />
      {/* printer body */}
      <rect x="9" y="19" width="46" height="22" rx="5" stroke="#12263F" strokeWidth="2.2" fill="white" />
      {/* control panel */}
      <rect x="15" y="25" width="12" height="6" rx="1.5" stroke="#12263F" strokeWidth="1.5" fill="white" />
      <circle cx="34" cy="28" r="2" fill="#12263F" />
      <circle cx="40" cy="28" r="2" fill="#12263F" />
      {/* vents */}
      <line x1="46" y1="24" x2="46" y2="36" stroke="#12263F" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="49" y1="24" x2="49" y2="36" stroke="#12263F" strokeWidth="1.5" strokeLinecap="round" />

      {/* glow behind the emerging paper */}
      <ellipse cx="30" cy="52" rx="15" ry="11" fill="url(#dc-glow)" filter="url(#dc-blur)" />

      {/* curling paper ribbon */}
      <g transform="translate(28,37) rotate(14)">
        <rect x="-7" y="0" width="14" height="23" rx="4" fill="url(#dc-paper)" />
      </g>
    </svg>
  );
}
