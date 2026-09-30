import { Marquee } from '../ui/Marquee';

/* Hand-drawn SVG glyphs — no external logo assets, no hotlinks. */
const glyphs: Record<string, React.ReactNode> = {
  react: <AtomGlyph />,
  node: <HexagonGlyph letter="N" />,
  express: <Glyph text="ex" />,
  mongo: <LeafGlyph />,
  typescript: <SquareGlyph letters="TS" />,
  monaco: <SquareGlyph letters="M" />,
  yjs: <BranchGlyph />,
  socket: <BoltGlyph />,
  groq: <SparkGlyph />,
  tree: <TreeGlyph />,
  tailwind: <WaveGlyph />,
  vite: <TriangleGlyph />,
};

interface Tech {
  name: string;
  note: string;
}

const ROW_ONE: Tech[] = [
  { name: 'React', note: 'UI' },
  { name: 'TypeScript', note: 'end-to-end' },
  { name: 'Vite', note: 'build' },
  { name: 'Tailwind', note: 'tokens' },
  { name: 'Monaco', note: 'editor' },
  { name: 'Yjs', note: 'CRDT' },
  { name: 'Socket.io', note: 'transport' },
];

const ROW_TWO: Tech[] = [
  { name: 'Node', note: 'runtime' },
  { name: 'Express', note: 'API' },
  { name: 'MongoDB', note: 'persistence' },
  { name: 'Groq', note: 'gpt-oss-120b' },
  { name: 'tree-sitter', note: 'AST' },
  { name: 'JWT', note: 'auth' },
  { name: 'Framer Motion', note: 'motion' },
];

const Chip = ({ name, note }: Tech) => (
  <span className="mx-2 inline-flex items-center gap-2.5 rounded-full border border-border bg-bg-secondary px-4 py-2.5">
    <span className="text-accent">{glyphs[name.toLowerCase().replace(/[\s-]/g, '')] ?? <Glyph text={name[0]} />}</span>
    <span className="font-mono text-sm font-medium text-text-primary">{name}</span>
    <span className="font-mono text-[10px] text-text-secondary">{note}</span>
  </span>
);

const keyFor = (name: string) => name.toLowerCase().replace(/[\s-]/g, '');

/**
 * Section F — two-row infinite marquee of the real stack, opposite directions,
 * pausing on hover. Every glyph is drawn inline; nothing is hotlinked.
 */
export const TechStack = () => {
  return (
    <section className="relative py-16 sm:py-20">
      <div className="mx-auto mb-10 w-full max-w-[1200px] px-6">
        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          // the stack
        </p>
        <h2 className="font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold text-text-primary">
          Boring technology, <span className="text-gradient">used well</span>
        </h2>
      </div>

      {/* Edge fades so the marquee never looks clipped harshly */}
      <div
        className="relative"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <Marquee>
          {ROW_ONE.map((tech) => (
            <Chip key={keyFor(tech.name)} {...tech} />
          ))}
        </Marquee>
        <div className="mt-3" />
        <Marquee reverse>
          {ROW_TWO.map((tech) => (
            <Chip key={keyFor(tech.name)} {...tech} />
          ))}
        </Marquee>
      </div>
    </section>
  );
};

/* ── Glyphs (24px, currentColor) ── */

function AtomGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.4" transform="rotate(120 12 12)" />
    </svg>
  );
}
function HexagonGlyph({ letter }: { letter: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" stroke="currentColor" strokeWidth="1.4" />
      <text x="12" y="15.5" textAnchor="middle" className="fill-current" fontSize="9" fontWeight="700">
        {letter}
      </text>
    </svg>
  );
}
function SquareGlyph({ letters }: { letters: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <text x="12" y="15.5" textAnchor="middle" className="fill-current" fontSize="8.5" fontWeight="700">
        {letters}
      </text>
    </svg>
  );
}
function Glyph({ text }: { text: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
      <text x="12" y="15.5" textAnchor="middle" className="fill-current" fontSize="9" fontWeight="700">
        {text}
      </text>
    </svg>
  );
}
function LeafGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 C 18 7, 19 14, 12 22 C 5 14, 6 7, 12 2 Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 4 L12 21" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function BranchGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 6 L14 6 C 16 6, 16 9, 16 9 M8.5 18 L14 18 C 16 18, 16 11, 16 11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function BoltGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function SparkGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function TreeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21 L12 13 M12 13 L7 8 M12 13 L17 8 M7 8 L4 4 M7 8 L10 4 M17 8 L14 4 M17 8 L20 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function WaveGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 14 C 5 8, 8 20, 12 12 C 16 4, 19 16, 22 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function TriangleGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3 L21 20 L3 20 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 9 L16.5 18 L7.5 18 Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
