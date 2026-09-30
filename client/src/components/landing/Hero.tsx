import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Sparkles, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { GradientText } from '../ui/GradientText';
import { Badge } from '../ui/Badge';
import { HeroEditorDemo } from './HeroEditorDemo';
import { isTouchDevice } from '../../lib/utils';

const ORBITING = [
  { id: 'u-alice', name: 'Alice', angle: 18, radius: 46 },
  { id: 'u-bob', name: 'Bob', angle: 158, radius: 52 },
  { id: 'u-casey', name: 'Casey', angle: 286, radius: 44 },
];

export const Hero = () => {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const touch = useRef(isTouchDevice()).current;

  const handlePointer = useCallback(
    (event: PointerEvent) => {
      if (reduce || touch) return;
      const element = containerRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: py * -7, y: px * 9 });
    },
    [reduce, touch]
  );

  useEffect(() => {
    if (touch) return;
    const element = containerRef.current;
    if (!element) return;
    element.addEventListener('pointermove', handlePointer);
    element.addEventListener('pointerleave', () => setTilt({ x: 0, y: 0 }));
    return () => {
      element.removeEventListener('pointermove', handlePointer);
    };
  }, [handlePointer, touch]);

  return (
    <section className="relative mx-auto w-full max-w-[1200px] px-6 pt-28 pb-16 sm:pt-36 sm:pb-24 lg:pt-44">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        {/* — Copy — */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="relative z-10 flex flex-col items-start"
        >
          <Badge variant="accent" className="mb-6">
            <Sparkles size={12} />
            CRDT sync · streaming AI · three themes
          </Badge>

          <h1 className="font-display text-[clamp(2.5rem,7vw,4.75rem)] font-bold leading-[0.95] tracking-tight text-text-primary">
            Code together.
            <br />
            Think with <GradientText>AI</GradientText>.
            <br />
            Ship in sync.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
            A real-time collaborative editor where every cursor, keystroke and AI answer is shared.
            Conflict-free CRDT sync, an assistant that lives in the room with you — and a theme for
            every hour of the night.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/signup">
              <Button size="lg" glow className="w-full sm:w-auto">
                Start a room
                <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                <Play size={15} />
                See how it works
              </Button>
            </a>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>⌘K</Kbd> command palette
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>⌘↵</Kbd> summon AI
            </span>
            <span className="inline-flex items-center gap-1.5">
              No download <span aria-hidden>·</span> runs in the browser
            </span>
          </div>
        </motion.div>

        {/* — Live demo — */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
          style={{ perspective: '1200px' }}
        >
          <div
            className="relative transition-transform duration-200 ease-out will-change-transform"
            style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
          >
            {/* Glow under the editor */}
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2rem] opacity-60 blur-3xl"
              style={{
                background:
                  'radial-gradient(60% 50% at 50% 40%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 75%)',
              }}
            />
            <HeroEditorDemo />

            {/* Orbiting collaborator chips */}
            {!touch &&
              ORBITING.map((person) => (
                <div
                  key={person.id}
                  className="pointer-events-none absolute left-1/2 top-1/2 hidden lg:block"
                  style={{ transform: `translate(-50%,-50%)` }}
                >
                  <div
                    className="absolute animate-float"
                    style={{
                      transform: `rotate(${person.angle}deg) translateX(${person.radius}%) rotate(-${person.angle}deg)`,
                      animationDelay: `${person.angle * 0.02}s`,
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-secondary/90 px-2.5 py-1 text-xs font-medium text-text-primary shadow-lifted backdrop-blur">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: `var(--cursor-${(ORBITING.indexOf(person) % 8) + 1})` }}
                      />
                      {person.name}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
