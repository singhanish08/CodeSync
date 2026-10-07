import { Download } from 'lucide-react';
import { languageExtension } from '../../lib/languages';
import { cn } from '../../lib/utils';

interface ExportButtonProps {
  /** Read at click time — the Yjs document is live, so the export is never stale. */
  getContent: () => string;
  language: string;
  /** Used for the file name; falls back to `codesync-export`. */
  roomName?: string;
  disabled?: boolean;
  className?: string;
}

/** Characters a file name cannot carry on Windows/macOS. */
const INVALID_FILENAME = /[\\/:*?"<>|]/g;

/** `<room name>.<ext>`, sanitised, falling back to `codesync-export.<ext>`. */
export const exportFilename = (roomName: string | undefined, language: string): string => {
  const base = (roomName ?? '').trim().replace(INVALID_FILENAME, '').replace(/\s+/g, '-');
  const name = base || 'codesync-export';
  const extension = `.${languageExtension(language)}`;
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
};

/**
 * Download the current document as a plain-text file. Content comes straight
 * from the client's own Yjs document, so this is a Blob + anchor click — no
 * API round-trip and no server-side route.
 */
export const ExportButton = ({ getContent, language, roomName, disabled, className }: ExportButtonProps) => {
  const handleExport = () => {
    const blob = new Blob([getContent()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(roomName, language);
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoke on a later tick: doing it synchronously can cancel the download
    // outright, and never doing it leaks the blob URL for the page's lifetime.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      aria-label="Export file"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-xs font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-text-secondary/50'
          : 'text-text-secondary hover:text-text-primary',
        className
      )}
    >
      <Download size={14} />
      <span className="hidden sm:inline">Export</span>
    </button>
  );
};
