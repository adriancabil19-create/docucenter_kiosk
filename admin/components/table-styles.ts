/**
 * Shared HeroUI <Table> classNames for the glassmorphism admin theme.
 * Makes the table wrapper invisible (the surrounding page panel is the glass
 * surface) and frosts the header row.
 */
export const glassTableClassNames = {
  wrapper: 'bg-transparent shadow-none border-none p-0',
  th: 'bg-white/50 backdrop-blur-md text-slate-500 font-semibold',
  td: 'text-slate-700',
  tr: 'transition-colors hover:bg-white/40',
} as const;
