/** Original botanical composition. Inline SVG: no image requests, scales to any screen. */
export default function Art() {
  return (
    <svg className="cs-art" viewBox="0 0 600 720" role="img" aria-label="Layered green leaves in front of a warm sun" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4f7a60"/><stop offset="1" stopColor="#325041"/></linearGradient>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bcd0c2"/><stop offset="1" stopColor="#4f7a60"/></linearGradient>
      </defs>
      <rect width="600" height="720" fill="#243830"/>
      <circle cx="400" cy="250" r="150" fill="#c08f62" opacity=".9"/>
      <circle cx="400" cy="250" r="205" fill="none" stroke="#d3a981" strokeOpacity=".35"/>
      <circle cx="400" cy="250" r="262" fill="none" stroke="#d3a981" strokeOpacity=".18"/>
      <g className="cs-sway">
        <path d="M120 720C100 560 140 400 260 250c60 130 70 300 20 470z" fill="url(#g1)"/>
        <path d="M200 720C190 600 215 480 270 360" fill="none" stroke="#bcd0c2" strokeOpacity=".5" strokeWidth="3"/>
      </g>
      <g className="cs-sway cs-d2">
        <path d="M300 720C260 560 330 380 500 300c50 150 10 310-80 420z" fill="url(#g2)" opacity=".95"/>
        <path d="M360 720C380 600 420 480 480 340" fill="none" stroke="#f1f5f2" strokeOpacity=".55" strokeWidth="3"/>
      </g>
      <g className="cs-sway cs-d3">
        <path d="M20 720C0 620 40 520 130 460c40 80 40 170-10 260z" fill="#3f6350"/>
        <path d="M470 720c-10-90 20-170 100-230 40 80 30 160-30 230z" fill="#325041"/>
      </g>
    </svg>
  );
}
