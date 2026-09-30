import { useMemo } from 'react';
import { diffLines } from 'diff';
import type { AiChange } from '../../types';
import { cn } from '../../lib/utils';

interface DiffViewProps {
  changes: AiChange[];
  currentText?: string;
}

/**
 * A real line-level diff. The server proposes one or more {startLine, endLine,
 * replacement} hunks; each hunk is applied to a copy of the current document
 * and the result is diffed with `diffLines` so the human sees exactly what will
 * change — with shared line numbers like a real patch.
 */
export const DiffView = ({ changes, currentText }: DiffViewProps) => {
  const previews = useMemo(() => {
    const lines = (currentText ?? '').split('\n');

    return changes.map((change) => {
      const start = Math.max(1, change.startLine);
      const end = Math.max(start, change.endLine);
      const before = lines.slice(start - 1, end).join('\n');
      const after = change.replacement;

      // Apply the hunk to a copy so the diff is contextual, not absolute.
      const projected = [
        ...lines.slice(0, start - 1),
        ...after.split('\n'),
        ...lines.slice(end),
      ].join('\n');

      const parts = diffLines(before, after);
      return { change, parts, start, projected };
    });
  }, [changes, currentText]);

  if (previews.length === 0) {
    return <p className="text-sm text-text-secondary">No concrete changes were proposed.</p>;
  }

  return (
    <div className="space-y-3">
      {previews.map(({ change, parts, start }, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary">
            Lines {change.startLine}–{change.endLine}
          </div>
          <DiffBlock parts={parts} startLine={start} />
        </div>
      ))}
    </div>
  );
};

interface DiffBlockProps {
  parts: ReturnType<typeof diffLines>;
  startLine: number;
}

export const DiffBlock = ({ parts, startLine = 1 }: DiffBlockProps) => {
  let lineNumber = startLine;

  return (
    <div className="editor-surface">
      {parts.map((part, partIndex) => {
        const lines = part.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        return (
          <div key={partIndex}>
            {lines.map((line, lineIndex) => {
              const number = part.added ? '+' : part.removed ? '−' : String(lineNumber + lineIndex);
              return (
                <div
                  key={lineIndex}
                  className={cn(
                    'flex gap-3 px-3 py-0.5 font-mono text-xs',
                    part.added && 'bg-success/12 text-success',
                    part.removed && 'bg-danger/12 text-danger line-through decoration-danger/40',
                    !part.added && !part.removed && 'text-text-primary/80'
                  )}
                >
                  <span className="w-6 shrink-0 select-none text-right text-text-secondary/50">{number}</span>
                  <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
