/** The existing WellnessXpress "W" logo mark (same artwork as the site icon). */
export default function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#3f6350" />
      <path d="M14 20l9 26 9-18 9 18 9-26" fill="none" stroke="#f8f5ef" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
