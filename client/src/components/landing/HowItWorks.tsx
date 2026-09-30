import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { DoorOpen, UserPlus, Edit, Sparkles, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Step {
  icon: typeof DoorOpen;
  title: string;
  caption: string;
  description: string;
  art: React.ReactNode;
}

/* — Per-step animated SVG illustrations — */

const ArtCreate = () => (
  <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
    <motion.rect
      x="40"
      y="22"
      width="120"
      height="76"
      rx="10"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1 }}
    />
    <motion.circle cx="100" cy="60" r="16" fill="var(--accent)" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.6, type: 'spring' }} />
    <motion.path
      d="M100 52 L100 68 M92 60 L108 60"
      stroke="var(--bg-primary)"
      strokeWidth="3"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.85, duration: 0.4 }}
    />
    <motion.line x1="56" y1="36" x2="84" y2="36" stroke="var(--text-secondary)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ delay: 1, duration: 0.5 }} />
  </svg>
);

const ArtInvite = () => (
  <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
    <motion.circle cx="70" cy="46" r="15" fill="var(--cursor-1)" initial={{ x: -20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
    <motion.circle cx="130" cy="46" r="15" fill="var(--cursor-2)" initial={{ x: 20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} />
    <motion.path
      d="M88 46 L112 46"
      stroke="var(--accent)"
      strokeWidth="2.5"
      strokeDasharray="5 5"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: 0.5 }}
    />
    <motion.path
      d="M106 41 L113 46 L106 51"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 1 }}
    />
    <motion.rect x="52" y="76" width="96" height="22" rx="8" fill="var(--bg-secondary)" stroke="var(--border)" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.8 }} />
    <text x="100" y="91" textAnchor="middle" className="fill-current font-mono text-[9px] text-text-secondary">codesync.app/r/3f9a</text>
  </svg>
);

const ArtEdit = () => (
  <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
    {[28, 46, 64, 82].map((y, index) => (
      <motion.line
        key={y}
        x1="34"
        y1={y}
        x2={index % 2 === 0 ? 150 : 118}
        y2={y}
        stroke="var(--text-secondary)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.4"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: index * 0.15 }}
      />
    ))}
    <motion.rect x="90" y="34" width="44" height="16" rx="4" fill="var(--accent)" opacity="0.25" initial={{ opacity: 0 }} whileInView={{ opacity: 0.25 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.9 }} />
    <motion.line x1="132" y1="34" x2="132" y2="50" stroke="var(--cursor-1)" strokeWidth="3" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: 1.2 }} />
    <motion.line x1="60" y1="72" x2="60" y2="88" stroke="var(--cursor-2)" strokeWidth="3" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: 1.4 }} />
  </svg>
);

const ArtSummon = () => (
  <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
    <motion.rect x="30" y="34" width="78" height="52" rx="8" fill="var(--bg-secondary)" stroke="var(--border)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} />
    {[42, 54, 66, 78].map((y, index) => (
      <motion.line
        key={y}
        x1="40"
        y1={y}
        x2={index === 1 ? 88 : 96}
        y2={y}
        stroke="var(--text-secondary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.4"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
      />
    ))}
    <motion.circle
      cx="142"
      cy="56"
      r="18"
      fill="color-mix(in srgb, var(--accent) 18%, transparent)"
      stroke="var(--accent)"
      strokeWidth="2"
      initial={{ scale: 0 }}
      whileInView={{ scale: [0, 1.15, 1] }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: 0.9, type: 'spring' }}
    />
    <motion.path
      d="M142 47 L142 65 M133 56 L151 56"
      stroke="var(--accent)"
      strokeWidth="2.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 1.3 }}
    />
    <motion.path
      d="M112 56 L122 56"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeDasharray="3 4"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 1.1 }}
    />
  </svg>
);

const ArtAccept = () => (
  <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
    <motion.rect x="30" y="28" width="140" height="64" rx="9" fill="none" stroke="var(--success)" strokeWidth="2" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} />
    <motion.line x1="48" y1="46" x2="76" y2="46" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }} />
    <motion.line x1="48" y1="62" x2="96" y2="62" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.8 }} />
    <motion.line x1="48" y1="78" x2="84" y2="78" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 1 }} />
    <motion.circle cx="150" cy="78" r="14" fill="var(--success)" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.3, type: 'spring' }} />
    <motion.path
      d="M144 78 L149 83 L157 73"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 1.6 }}
    />
  </svg>
);

const STEPS: Step[] = [
  { icon: DoorOpen, title: 'Create a room', caption: 'one click', description: 'Name it, pick public or private, and you get a Room ID. The room document lives in MongoDB as a Yjs snapshot.', art: <ArtCreate /> },
  { icon: UserPlus, title: 'Invite collaborators', caption: 'share the ID', description: 'Anyone with the Room ID joins a public room; private rooms also need the password. Presence propagates over Socket.io.', art: <ArtInvite /> },
  { icon: Edit, title: 'Edit together', caption: 'no conflicts', description: 'Every keystroke is a Yjs update broadcast as binary base64. Cursors, selections and presence sync through awareness.', art: <ArtEdit /> },
  { icon: Sparkles, title: 'Summon the AI', caption: '⌘↵', description: 'tree-sitter extracts real symbol context, Groq streams the response token by token, and the whole room watches it arrive.', art: <ArtSummon /> },
  { icon: Check, title: 'Accept the diff', caption: 'everyone applies it', description: 'Refactors come back as a line-level diff. Accepting applies it server-side as a Y.Doc transaction — conflict-free for everyone.', art: <ArtAccept /> },
];

/**
 * Section D — sticky-scroll storytelling. The left column pins the step list
 * while the right swaps illustrations as you scroll. A progress rail glows.
 * On mobile it collapses to a simple vertical timeline.
 */
export const HowItWorks = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 20%', 'end 70%'],
  });
  const railScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const [activeStep, setActiveStep] = useState(0);
  const updateActiveStep = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll('[data-step]'));
    const focusLine = window.innerHeight * 0.35;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const distance = Math.abs(item.getBoundingClientRect().top - focusLine);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setActiveStep(best);
  }, []);

  // Re-evaluate on scroll (scrollYProgress changes on every frame of scroll).
  useMotionValueEvent(scrollYProgress, 'change', updateActiveStep);
  useEffect(() => {
    updateActiveStep();
  }, [updateActiveStep]);

  return (
    <section id="how-it-works" className="relative mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-28">
      <div className="mb-12">
        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          // how it works
        </p>
        <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-text-primary">
          Five steps, <span className="text-gradient">no surprises</span>
        </h2>
      </div>

      <div ref={containerRef} className="relative grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        {/* Sticky step list */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <div className="relative pl-8">
            {/* Progress rail */}
            <div className="absolute left-0 top-2 bottom-2 w-px bg-border" aria-hidden>
              <motion.div
                className="absolute inset-x-0 top-0 origin-top bg-gradient-to-b from-accent to-accent-2"
                style={{ scaleY: railScaleY, width: '100%', height: '100%' }}
              />
            </div>
            <ol className="space-y-6">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const active = index === activeStep;
                return (
                  <li key={step.title} data-step={index} className="relative">
                    <span
                      className={cn(
                        'absolute -left-8 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300',
                        active
                          ? 'border-accent bg-accent text-accent-foreground shadow-glow'
                          : 'border-border bg-bg-secondary text-text-secondary'
                      )}
                    >
                      <Icon size={13} />
                    </span>
                    <div
                      className={cn(
                        'transition-opacity duration-300',
                        active ? 'opacity-100' : 'opacity-45'
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
                        <span className="font-mono text-[10px] text-accent">{step.caption}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-text-secondary">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Swapping illustration */}
        <div className="relative h-[280px] sm:h-[340px]">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.title}
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-panel border border-border bg-bg-secondary p-6 gradient-border',
                index === activeStep ? 'pointer-events-auto' : 'pointer-events-none'
              )}
              animate={{
                opacity: index === activeStep ? 1 : 0,
                y: index === activeStep ? 0 : 12,
                scale: index === activeStep ? 1 : 0.97,
              }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="h-full w-full">{step.art}</div>
              <span className="absolute bottom-4 right-5 font-mono text-[10px] text-text-secondary">
                {String(index + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

