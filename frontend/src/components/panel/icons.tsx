export const Check = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Person = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.5" fill="currentColor" />
    <path d="M3 13c.6-2.6 2.6-4 5-4s4.4 1.4 5 4z" fill="currentColor" />
  </svg>
);

export const Chevron = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
