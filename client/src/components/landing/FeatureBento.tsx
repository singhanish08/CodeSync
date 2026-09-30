import { motion } from 'framer-motion';
import {
  GitBranch,
  Sparkles,
  Binary,
  Users,
  Palette,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../types';

/* — Reveal-on-scroll wrapper, staggered once — */
const Reveal = ({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Grid cell size. */
  span: string;
  visual: React.ReactNode;
}

/* ── Mini live visuals (all CSS/SVG, no images) ── */

const MergeDiagram = () => (
  <div className="relative h-32 select-none">
    <svg viewBox="0 0 320 120" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="merge-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--cursor-1)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <motion.path
        d="M20 30 C 90 30, 110 60, 180 60 S 260 90, 300 60"
        fill="none"
        stroke="url(#merge-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: 'easeInOut' }}
      />
      <motion.path
        d="M20 92 C 90 92, 110 62, 180 60 S 260 34, 300 60"
        fill="none"
        stroke="url(#merge-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, delay: 0.15, ease: 'easeInOut' }}
      />
      <circle cx="20" cy="30" r="5" fill="var(--cursor-1)" />
      <circle cx="20" cy="92" r="5" fill="var(--cursor-2)" />
      <motion.circle
        cx="300"
        cy="60"
        r="6"
        fill="var(--accent)"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 1.1, type: 'spring' }}
      />
    </svg>
    <span className="absolute left-2 top-1 font-mono text-[10px] text-text-secondary">alice</span>
    <span className="absolute bottom-1 left-2 font-mono text-[10px] text-text-secondary">bob</span>
    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-accent">merged ✓</span>
  </div>
);

const StreamingLines = () => (
  <div className="flex h-32 flex-col justify-center gap-2.5">
    {[88, 72, 94, 60].map((width, index) => (
      <div key={index} className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        <div className="h-2 rounded-full bg-bg-primary" style={{ width: `${width}%` }}>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
            initial={{ width: '0%' }}
            whileInView={{ width: '100%' }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, delay: index * 0.25, ease: 'easeInOut' }}
          />
        </div>
      </div>
    ))}
  </div>
);

const AstTree = () => {
  const edges = [
    { x1: 120, y1: 16, x2: 60, y2: 52, color: 'var(--cursor-1)' },
    { x1: 120, y1: 16, x2: 180, y2: 52, color: 'var(--cursor-3)' },
    { x1: 60, y1: 52, x2: 34, y2: 88, color: 'var(--cursor-2)' },
    { x1: 60, y1: 52, x2: 88, y2: 88, color: 'var(--cursor-4)' },
    { x1: 180, y1: 52, x2: 156, y2: 88, color: 'var(--cursor-5)' },
    { x1: 180, y1: 52, x2: 208, y2: 88, color: 'var(--cursor-6)' },
  ];
  const nodes = [
    { x: 120, y: 16, label: 'Program', color: 'var(--accent)', big: true },
    { x: 60, y: 52, label: 'Func', color: 'var(--cursor-1)' },
    { x: 180, y: 52, label: 'Body', color: 'var(--cursor-3)' },
    { x: 34, y: 88, label: 'id', color: 'var(--cursor-2)' },
    { x: 88, y: 88, label: 'params', color: 'var(--cursor-4)' },
    { x: 156, y: 88, label: 'return', color: 'var(--cursor-5)' },
    { x: 208, y: 88, label: 'expr', color: 'var(--cursor-6)' },
  ];
  return (
    <div className="flex h-32 items-center justify-center">
      <svg viewBox="0 0 240 110" className="h-full w-full" aria-hidden>
        {edges.map((edge, index) => (
          <motion.line
            key={`edge-${index}`}
            {...edge}
            stroke={edge.color}
            strokeWidth="1.6"
            opacity="0.65"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: index * 0.1 }}
          />
        ))}
        {nodes.map((node, index) => (
          <motion.g
            key={`node-${index}`}
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.5 + index * 0.08, type: 'spring' }}
          >
            <circle cx={node.x} cy={node.y} r={node.big ? 8 : 5.5} fill={node.color} />
            <text
              x={node.x}
              y={node.y + (node.big ? 18 : 15)}
              textAnchor="middle"
              className="fill-current font-mono text-[7px] text-text-secondary"
            >
              {node.label}
            </text>
          </motion.g>
        ))}
        {/* The node being extracted */}
        <motion.circle
          cx={156}
          cy={88}
          r={10}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.6"
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: [0, 1, 0.4, 1], scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, delay: 1.2, repeat: Infinity, repeatType: 'loop' }}
        />
      </svg>
    </div>
  );
};

const PresenceVisual = () => (
  <div className="relative h-32">
    <div className="absolute left-6 top-6 flex -space-x-3">
      {['u-a', 'u-b', 'u-c', 'u-d'].map((id, index) => (
        <motion.span
          key={id}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-bg-secondary"
          style={{ backgroundColor: `var(--cursor-${index + 1})` }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3, delay: index * 0.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {String.fromCharCode(65 + index)}
        </motion.span>
      ))}
    </div>
    <div className="absolute bottom-5 right-6">
      <motion.span
        className="block h-5 w-0.5 rounded-full"
        style={{ backgroundColor: 'var(--cursor-2)' }}
        animate={{ y: [0, 26, 0], x: [0, 10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className="absolute -top-1 left-1 whitespace-nowrap rounded px-1 py-0.5 font-mono text-[9px] font-semibold text-white"
        style={{ backgroundColor: 'var(--cursor-2)' }}
        animate={{ y: [0, 26, 0], x: [0, 10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        bob
      </motion.span>
    </div>
    <span className="absolute bottom-2 left-6 font-mono text-[10px] text-text-secondary">4 in room</span>
  </div>
);

const ThemeTrio = () => {
  const { setTheme } = useTheme();
  const swatches: Array<{ theme: AppTheme; colors: string[] }> = [
    { theme: 'light', colors: ['#fcfcfd', '#5b5fc7', '#f0715e'] },
    { theme: 'dark', colors: ['#0b0c12', '#8a8ef0', '#2fd4ee'] },
    { theme: 'eyeshield', colors: ['#241d17', '#d4a35f', '#8a9a5b'] },
  ];
  return (
    <div className="flex h-32 flex-col justify-center gap-3">
      {swatches.map((row) => (
        <button
          key={row.theme}
          type="button"
          onClick={() => setTheme(row.theme)}
          className="group flex items-center gap-3 rounded-lg border border-border p-2 transition-colors hover:border-accent/50"
          aria-label={`Switch to ${row.theme} theme`}
        >
          <span className="flex gap-1.5">
            {row.colors.map((color) => (
              <span key={color} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />
            ))}
          </span>
          <span className="font-mono text-[11px] text-text-secondary group-hover:text-text-primary">
            {row.theme}.theme()
          </span>
        </button>
      ))}
    </div>
  );
};

const EyeShieldCallout = () => {
  const { setTheme } = useTheme();
  return (
    <div className="relative h-32 overflow-hidden">
      <div
        className="absolute -inset-10 opacity-60"
        style={{
          background: 'radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 65%)',
        }}
      />
      <div className="relative flex h-full flex-col justify-center gap-2">
        <p className="font-mono text-[11px] text-text-secondary">
          <span className="text-warning">amber</span> · <span style={{ color: 'var(--accent-3)' }}>olive</span> · sepia
        </p>
        <div className="flex gap-1.5">
          {['#d4a35f', '#c9803f', '#8a9a5b', '#e0b066', '#a37a4f'].map((color) => (
            <motion.span
              key={color}
              className="h-8 w-8 rounded-lg ring-1 ring-black/20"
              style={{ backgroundColor: color }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTheme('eyeshield')}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-mono text-[10px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <ShieldCheck size={11} /> preview amber
        </button>
      </div>
    </div>
  );
};

const SecurityList = () => (
  <div className="flex h-32 flex-col justify-center gap-2.5">
    {[
      'access token in memory, never storage',
      'refresh token in httpOnly cookie',
      'bcrypt hashing + JWT tokenVersion',
      'per-room access control on the server',
    ].map((line, index) => (
      <motion.div
        key={line}
        className="flex items-center gap-2 font-mono text-[11px] text-text-secondary"
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.12 }}
      >
        <span className="text-success">✓</span>
        {line}
      </motion.div>
    ))}
  </div>
);

const DeviceMock = () => (
  <div className="flex h-32 items-end justify-center gap-3">
    <div className="flex h-24 w-40 flex-col overflow-hidden rounded-lg border border-border bg-bg-primary shadow-soft">
      <div className="h-5 border-b border-border bg-bg-secondary" />
      <div className="flex flex-1 gap-1.5 p-1.5">
        <div className="w-1/2 rounded bg-bg-secondary" />
        <div className="flex w-1/2 flex-col gap-1">
          <div className="h-1/2 rounded bg-bg-secondary" />
          <div className="h-1/2 rounded bg-accent/20" />
        </div>
      </div>
    </div>
    <div className="flex h-20 w-12 flex-col overflow-hidden rounded-[10px] border border-border bg-bg-primary shadow-soft">
      <div className="h-4 border-b border-border bg-bg-secondary" />
      <div className="flex flex-1 flex-col gap-1 p-1">
        <div className="h-1/3 rounded bg-bg-secondary" />
        <div className="h-1/3 rounded bg-accent/20" />
      </div>
    </div>
  </div>
);

const FEATURES: Feature[] = [
  {
    icon: GitBranch,
    title: 'Conflict-free by design',
    description: 'Yjs CRDTs merge every edit without central coordination — no locks, no lost work, no "overwrite?".',
    span: 'md:col-span-2',
    visual: <MergeDiagram />,
  },
  {
    icon: Sparkles,
    title: 'AI in the room',
    description: 'Explain, review, refactor — streamed live so everyone sees the answer together.',
    span: '',
    visual: <StreamingLines />,
  },
  {
    icon: Binary,
    title: 'Understands your code',
    description: 'tree-sitter parses the file so the AI gets real symbol context, not raw text.',
    span: '',
    visual: <AstTree />,
  },
  {
    icon: Users,
    title: 'Live presence',
    description: 'Colored cursors, name flags and avatars — you always know who is where.',
    span: '',
    visual: <PresenceVisual />,
  },
  {
    icon: Palette,
    title: 'Three ways to see',
    description: 'Studio Paper, Midnight Aurora and Amber Terminal — each a full redesign, not a recolor.',
    span: 'md:col-span-2',
    visual: <ThemeTrio />,
  },
  {
    icon: ShieldCheck,
    title: 'Built for long sessions',
    description: 'Eye Shield removes blue light entirely: warm phosphor syntax, dimmer glows, softer motion.',
    span: 'md:col-span-2',
    visual: <EyeShieldCallout />,
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    description: 'JWT access tokens in memory, httpOnly refresh cookies, hashed passwords, room-level access control.',
    span: '',
    visual: <SecurityList />,
  },
  {
    icon: Smartphone,
    title: 'Works on your phone',
    description: 'A real mobile layout: bottom tab bar, full-width editor, touch-first controls.',
    span: 'md:col-span-2',
    visual: <DeviceMock />,
  },
];

/**
 * Section C — asymmetric bento grid. Each cell has a mini live visual,
 * cursor-follow spotlight and a shimmering gradient hairline border.
 */
export const FeatureBento = () => (
  <section id="features" className="relative mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-28">
    <div className="mb-12">
      <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        // features
      </p>
      <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-text-primary">
        Eight things it does <span className="text-gradient">properly</span>
      </h2>
      <p className="mt-3 max-w-xl text-text-secondary">
        Everything below is real and implemented — hover any card for the spotlight.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {FEATURES.map((feature, index) => (
        <Reveal key={feature.title} className={feature.span} delay={index * 0.05}>
          <Card className="group flex h-full flex-col p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-border bg-bg-primary text-accent">
                <feature.icon size={18} />
              </span>
              <Badge>{String(index + 1).padStart(2, '0')}</Badge>
            </div>
            <h3 className="text-base font-semibold text-text-primary">{feature.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{feature.description}</p>
            <div className="mt-4 border-t border-border pt-4">{feature.visual}</div>
          </Card>
        </Reveal>
      ))}
    </div>
  </section>
);
