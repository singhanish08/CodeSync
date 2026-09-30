import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, FileQuestion, Check, X, AlertCircle, CornerDownLeft } from 'lucide-react';
import type { AiChange, AiMode } from '../../types';
import { Button } from '../ui/Button';
import { DiffView } from './DiffView';
import { Kbd } from '../ui/Kbd';
import { cn, colorForUserId } from '../../lib/utils';

interface AIPanelProps {
  socket: Socket;
  roomId: string;
  language: string;
  getFileContext: () => string;
  getSelection: () => string | undefined;
}

interface PendingSuggestion {
  suggestionId: string;
  explanation: string;
  changes: AiChange[];
  summonedByName?: string;
}

const MODES: Array<{ value: AiMode; label: string; icon: typeof Sparkles }> = [
  { value: 'explain', label: 'Explain', icon: FileQuestion },
  { value: 'review', label: 'Review', icon: Sparkles },
  { value: 'refactor', label: 'Refactor', icon: Wand2 },
];

const MODE_VERBS: Record<AiMode, string> = {
  explain: 'Explanation',
  review: 'Review',
  refactor: 'Refactor plan',
};

export const AIPanel = ({ socket, roomId, language, getFileContext, getSelection }: AIPanelProps) => {
  const [activeMode, setActiveMode] = useState<AiMode>('explain');
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pending, setPending] = useState<PendingSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null);
  const [summonedBy, setSummonedBy] = useState<string | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the streaming output as tokens arrive.
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [streamingText]);

  // ── Socket listeners ────────────────────────────────────────────────
  useEffect(() => {
    const onChunk = (payload: { suggestionId?: string; token?: string }) => {
      if (!payload?.suggestionId) return;
      if (streamIdRef.current !== payload.suggestionId) {
        streamIdRef.current = payload.suggestionId;
        setStreamingText('');
        setError(null);
        setPending(null);
        setDecision(null);
      }
      setIsStreaming(true);
      setStreamingText((prev) => prev + (payload.token ?? ''));
    };

    const onStreamEnd = (payload: { suggestionId?: string; summonedByName?: string }) => {
      if (payload?.suggestionId === streamIdRef.current) {
        setIsStreaming(false);
        if (payload.summonedByName) setSummonedBy(payload.summonedByName);
      }
    };

    const onSuggestionReady = (payload: {
      suggestionId?: string;
      explanation?: string;
      changes?: AiChange[] | null;
      summonedByName?: string;
    }) => {
      if (!payload?.suggestionId || payload.suggestionId !== streamIdRef.current) return;
      setIsStreaming(false);
      if (payload.summonedByName) setSummonedBy(payload.summonedByName);
      if (payload.changes && payload.changes.length > 0) {
        setPending({
          suggestionId: payload.suggestionId,
          explanation: payload.explanation ?? '',
          changes: payload.changes,
          summonedByName: payload.summonedByName,
        });
        setDecision(null);
      } else {
        setPending(null);
      }
    };

    const onCleared = (payload: { suggestionId?: string }) => {
      if (payload?.suggestionId && payload.suggestionId === pending?.suggestionId) {
        setPending(null);
      }
      if (payload?.suggestionId === streamIdRef.current) streamIdRef.current = null;
    };

    const onError = (payload: { message?: string }) => {
      setIsStreaming(false);
      setError(payload?.message ?? 'The AI request failed.');
    };

    socket.on('ai_stream_chunk', onChunk);
    socket.on('ai_stream_end', onStreamEnd);
    socket.on('ai_suggestion_ready', onSuggestionReady);
    socket.on('ai_suggestion_accepted', onCleared);
    socket.on('ai_suggestion_rejected', onCleared);
    socket.on('ai_error', onError);

    return () => {
      socket.off('ai_stream_chunk', onChunk);
      socket.off('ai_stream_end', onStreamEnd);
      socket.off('ai_suggestion_ready', onSuggestionReady);
      socket.off('ai_suggestion_accepted', onCleared);
      socket.off('ai_suggestion_rejected', onCleared);
      socket.off('ai_error', onError);
    };
  }, [socket, pending?.suggestionId]);

  const handleSummon = useCallback(
    (mode: AiMode) => {
      setActiveMode(mode);
      setError(null);
      setPending(null);
      setDecision(null);
      setSummonedBy(null);
      setStreamingText('');
      setIsStreaming(true);
      streamIdRef.current = null; // set by the first arriving chunk

      socket.emit('summon_ai', {
        roomId,
        mode,
        selectedCode: getSelection(),
        fullFileContext: getFileContext(),
        language,
      });
    },
    [socket, roomId, language, getFileContext, getSelection]
  );

  const handleAccept = () => {
    if (!pending) return;
    setDecision('accepted');
    socket.emit('accept_suggestion', { roomId, suggestionId: pending.suggestionId });
  };

  const handleReject = () => {
    if (!pending) return;
    setDecision('rejected');
    socket.emit('reject_suggestion', { roomId, suggestionId: pending.suggestionId });
  };

  const activeIndex = Math.max(MODES.findIndex((mode) => mode.value === activeMode), 0);

  return (
    <div data-ai-panel className="flex h-full flex-col bg-bg-primary">
      {/* — Header: animated mode tabs — */}
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Sparkles size={15} className="text-accent" /> AI Assistant
          <span className="ml-auto">
            <Kbd>⌘↵</Kbd>
          </span>
        </div>
        <div className="relative grid grid-cols-3 gap-0.5 rounded-control border border-border bg-bg-secondary p-0.5">
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 rounded-[10px] bg-accent shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: 'calc((100% - 0.25rem) / 3)', transform: `translateX(calc(${activeIndex} * (100% + 0.125rem)))` }}
          />
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSummon(value)}
              disabled={isStreaming}
              className={cn(
                'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                activeMode === value && !isStreaming
                  ? 'text-accent-foreground'
                  : 'text-text-secondary hover:text-text-primary'
              )}
              aria-pressed={activeMode === value}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-text-secondary">
          Runs on the current selection, or the whole file if nothing is selected. Everyone in the room sees the answer.
        </p>
      </div>

      {/* — Output — */}
      <div ref={outputRef} className="scrollbar-thin flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : streamingText || isStreaming ? (
          <>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {MODE_VERBS[activeMode]}
              </span>
              {isStreaming && (
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden
                />
              )}
              {!isStreaming && summonedBy && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorForUserId(summonedBy) }}
                  />
                  {summonedBy} asked for a {activeMode === 'explain' ? 'n explanation' : activeMode}
                </span>
              )}
            </div>
            <div className="ai-output text-sm text-text-primary">
              {streamingText || '…'}
              {isStreaming && <span className="caret" aria-hidden />}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-text-secondary">
            <motion.div
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-secondary"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden
            >
              <Sparkles size={24} className="text-accent" />
            </motion.div>
            <p className="max-w-[16rem] text-sm">
              Ask the AI to <span className="font-medium text-text-primary">explain</span>,{' '}
              <span className="font-medium text-text-primary">review</span>, or{' '}
              <span className="font-medium text-text-primary">refactor</span> the code.
            </p>
            <p className="max-w-[16rem] text-xs">Responses stream live to everyone in the room.</p>
          </div>
        )}

        {/* — Proposed changes — */}
        <AnimatePresence>
          {pending && decision === null && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Wand2 size={15} className="text-accent" /> Proposed changes
                  {summonedBy && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-normal text-text-secondary">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: colorForUserId(summonedBy) }}
                      />
                      {summonedBy}
                    </span>
                  )}
                </div>
                {pending.explanation && pending.explanation.trim() !== streamingText.trim() && (
                  <p className="text-sm text-text-secondary">{pending.explanation}</p>
                )}
                <DiffView changes={pending.changes} currentText={getFileContext()} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAccept} className="flex-1">
                    <Check size={15} /> Accept
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleReject} className="flex-1">
                    <X size={15} /> Reject
                  </Button>
                </div>
                <p className="text-[11px] text-text-secondary">
                  Accepting applies the change to everyone's editor as a conflict-free Yjs transaction.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {decision && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm',
                decision === 'accepted'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-border bg-bg-secondary text-text-secondary'
              )}
            >
              {decision === 'accepted' ? <Check size={15} /> : <X size={15} />}
              {decision === 'accepted'
                ? 'Applied — the room received the edit as a Yjs transaction.'
                : 'Rejected — nothing was changed.'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* — Footer hint — */}
      <div className="border-t border-border px-3 py-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] text-text-secondary">
          <CornerDownLeft size={11} />
          selection or whole file · {language}
        </p>
      </div>
    </div>
  );
};
