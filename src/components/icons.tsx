type P = { className?: string };
const base = (className = "h-5 w-5") => ({ className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });
export const IconCart = ({ className }: P) => (<svg {...base(className)}><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.2" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>);
export const IconSearch = ({ className }: P) => (<svg {...base(className)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
export const IconMenu = ({ className }: P) => (<svg {...base(className)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconClose = ({ className }: P) => (<svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconPlus = ({ className }: P) => (<svg {...base(className)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconMinus = ({ className }: P) => (<svg {...base(className)}><path d="M5 12h14" /></svg>);
export const IconTrash = ({ className }: P) => (<svg {...base(className)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>);
export const IconCheck = ({ className }: P) => (<svg {...base(className)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const IconCopy = ({ className }: P) => (<svg {...base(className)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>);
export const IconBank = ({ className }: P) => (<svg {...base(className)}><path d="M3 10h18L12 4 3 10ZM5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" /></svg>);
export const IconTruck = ({ className }: P) => (<svg {...base(className)}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></svg>);
export const IconShield = ({ className }: P) => (<svg {...base(className)}><path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconUser = ({ className }: P) => (<svg {...base(className)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
export const IconChevron = ({ className }: P) => (<svg {...base(className)}><path d="m9 6 6 6-6 6" /></svg>);
export const IconInfo = ({ className }: P) => (<svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const IconLeaf = ({ className }: P) => (<svg {...base(className)}><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14H5Z" /><path d="M5 19 13 11" /></svg>);
export const IconWhatsApp = ({ className = "h-5 w-5" }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88Zm8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41Z" /></svg>
);
