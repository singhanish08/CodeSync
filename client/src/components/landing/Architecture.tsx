import { useState } from 'react';
import { motion } from 'framer-motion';

interface NodeDef {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  description: string;
  /** Edges originating from this node, by target id. */
  links: string[];
}

const NODES: NodeDef[] = [
  { id: 'browser', label: 'Browser', sublabel: 'React · Monaco · Yjs', x: 16, y: 130, w: 150, h: 64, links: ['socket', 'monaco'], description: 'The client: Monaco editor bound to a local Y.Doc, awareness cursors, and the AI panel.' },
  { id: 'monaco', label: 'Monaco', sublabel: 'editor + y-monaco', x: 16, y: 32, w: 150, h: 56, links: ['browser'], description: 'y-monaco binds the editor model to the shared Y.Text so edits and cursors stay in sync.' },
  { id: 'socket', label: 'Socket.io', sublabel: 'binary base64', x: 236, y: 110, w: 130, h: 60, links: ['server', 'browser'], description: 'A single persistent connection carries Yjs updates and awareness, encoded as base64.' },
  { id: 'server', label: 'Node + Express', sublabel: 'TypeScript', x: 412, y: 110, w: 150, h: 60, links: ['mongo', 'groq', 'tree', 'socket'], description: 'Holds in-memory room state, verifies the JWT on the handshake, and fans updates out to the room.' },
  { id: 'mongo', label: 'MongoDB', sublabel: 'Atlas · snapshots', x: 606, y: 40, w: 140, h: 56, links: ['server'], description: 'Rooms, users and edit history; Yjs documents persist as snapshots on cleanup.' },
  { id: 'groq', label: 'Groq', sublabel: 'gpt-oss-120b', x: 606, y: 122, w: 140, h: 56, links: ['server'], description: 'Streams explain / review / refactor responses, and returns JSON refactor plans.' },
  { id: 'tree', label: 'tree-sitter', sublabel: 'AST context', x: 606, y: 204, w: 140, h: 56, links: ['server'], description: 'Parses the file so the AI receives enclosing symbols and selection context, not raw text.' },
];

const EDGES: Array<{ from: string; to: string; label?: string }> = [
  { from: 'browser', to: 'socket', label: 'updates' },
  { from: 'socket', to: 'browser', label: 'fan-out' },
  { from: 'socket', to: 'server' },
  { from: 'server', to: 'mongo', label: 'persist' },
  { from: 'server', to: 'groq', label: 'stream' },
  { from: 'server', to: 'tree', label: 'parse' },
  { from: 'monaco', to: 'browser' },
];

const nodeById = (id: string) => NODES.find((node) => node.id === id)!;

const edgePath = (from: NodeDef, to: NodeDef) => {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const midX = (x1 + x2) / 2;
  return `M${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
};

/**
 * Section E — animated architecture diagram for engineers and recruiters.
 * Data packets travel the edges; hovering a node highlights its connections
 * and shows a one-line explanation. Everything is SVG — no external assets.
 */
export const Architecture = () => {
  const [hovered, setHovered] = useState<string | null>(null);

  const activeLinks = hovered
    ? new Set([
        hovered,
        ...EDGES.filter((edge) => edge.from === hovered || edge.to === hovered).flatMap((edge) => [edge.from, edge.to]),
      ])
    : null;

  return (
    <section id="stack" className="relative mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-28">
      <div className="mb-12">
        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          // architecture
        </p>
        <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-text-primary">
          The whole thing, <span className="text-gradient">one diagram</span>
        </h2>
        <p className="mt-3 max-w-xl text-text-secondary">
          Hover a node to trace its connections. Nothing here is aspirational — it is the deployed system.
        </p>
      </div>

      <div className="rounded-panel border border-border bg-bg-secondary/60 p-4 glass gradient-border">
        <div className="relative">
          <svg viewBox="0 0 780 280" className="w-full" role="img" aria-label="System architecture diagram">
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
              </marker>
            </defs>

            {/* Edges */}
            {EDGES.map((edge, index) => {
              const from = nodeById(edge.from);
              const to = nodeById(edge.to);
              const dimmed = activeLinks && !activeLinks.has(edge.from) && !activeLinks.has(edge.to);
              return (
                <g key={`edge-${index}`} opacity={dimmed ? 0.18 : 1}>
                  <path
                    d={edgePath(from, to)}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1.6"
                    markerEnd="url(#arrow)"
                  />
                  {edge.label && (
                    <text
                      x={(from.x + from.w + to.x) / 2}
                      y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle"
                      className="fill-current font-mono text-[9px] text-text-secondary"
                    >
                      {edge.label}
                    </text>
                  )}
                  {/* Travelling packet */}
                  <motion.circle
                    r="3"
                    fill="var(--accent)"
                    initial={false}
                    animate={{ offsetDistance: ['0%', '100%'] }}
                    transition={{
                      duration: 2.2,
                      delay: index * 0.35,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    style={{ offsetPath: `path("${edgePath(from, to)}")` }}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {NODES.map((node) => {
              const dimmed = activeLinks && !activeLinks.has(node.id);
              const highlighted = hovered === node.id;
              return (
                <g
                  key={node.id}
                  opacity={dimmed ? 0.25 : 1}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(node.id)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.label}: ${node.description}`}
                  className="cursor-pointer outline-none"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.w}
                    height={node.h}
                    rx="10"
                    fill="var(--bg-primary)"
                    stroke={highlighted ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={highlighted ? '2' : '1.4'}
                    className="transition-all duration-200"
                  />
                  <text
                    x={node.x + node.w / 2}
                    y={node.y + node.h / 2 - 3}
                    textAnchor="middle"
                    className="fill-current text-[12px] font-semibold text-text-primary"
                    style={{ fontFamily: 'var(--font-sans, Inter), sans-serif' }}
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x + node.w / 2}
                    y={node.y + node.h / 2 + 14}
                    textAnchor="middle"
                    className="fill-current font-mono text-[9px] text-text-secondary"
                  >
                    {node.sublabel}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Explanation line under the diagram */}
          <motion.p
            key={hovered ?? 'none'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex min-h-[1.5rem] items-center gap-2 font-mono text-[11px] text-text-secondary"
          >
            {hovered ? (
              <>
                <span className="text-accent">▸</span>
                {nodeById(hovered).description}
              </>
            ) : (
              <span className="opacity-60">▸ hover or focus a node to inspect it</span>
            )}
          </motion.p>
        </div>
      </div>
    </section>
  );
};
