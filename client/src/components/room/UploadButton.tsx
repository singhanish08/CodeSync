import { useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { languageFromFilename, languageLabel } from '../../lib/languages';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

/** Hard cap on an uploaded file. The server re-checks the same number. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** A file the user has picked and validated, waiting on their confirmation. */
export interface UploadFile {
  name: string;
  content: string;
  /** `null` when the extension is not a language we know. */
  language: string | null;
}

/**
 * Magic numbers that survive `FileReader.readAsText` as a stable prefix: they
 * are all ASCII-after-the-first-byte or short enough not to be mangled by
 * UTF-8 decoding. Anything else obvious is caught by the control-character
 * scan below, and every case is caught by the null-byte check.
 */
const BINARY_SIGNATURES: { magic: string; label: string }[] = [
  { magic: '\u0089PNG\r\n\u001a\n', label: 'PNG image' },
  { magic: '%PDF-', label: 'PDF document' },
  { magic: 'PK\u0003\u0004', label: 'zip archive' },
  { magic: '\u001f\u008b', label: 'gzip archive' },
  { magic: '\u007fELF', label: 'ELF binary' },
  { magic: '\u00ff\u00d8\u00ff', label: 'JPEG image' },
];

/** Control characters no plain-text file needs (tab/LF/CR/FF stay legal). */
const CONTROL_CHARS = /[\u0001-\u0008\u000b\u000e-\u001f\u007f]/;

/**
 * Why this content is not text, or `null` if it is. Runs on the DECODED
 * content, i.e. exactly what the editor would be asked to hold â€” a binary file
 * pushed through a text decoder still carries its signature and its NULs.
 */
export const binaryRejection = (content: string): string | null => {
  if (content.includes('\u0000')) return 'It contains null bytes, so it is not a text file.';
  const head = content.slice(0, 64);
  const signature = BINARY_SIGNATURES.find((entry) => head.startsWith(entry.magic));
  if (signature) return `It is a ${signature.label}, which cannot be edited as text.`;
  if (CONTROL_CHARS.test(head)) return 'It contains binary control characters, so it is not a text file.';
  return null;
};

interface UploadButtonProps {
  /** The room's current language â€” kept when the file's extension is unknown. */
  language: string;
  /** Hands the confirmed payload to the page, which sends it to the server. */
  onUpload: (file: UploadFile) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Single-file upload. Validates on this side FIRST â€” size before the file is
 * even read, then content once it is â€” and only then asks the room, because
 * the replace is destructive and lands on every collaborator at once. The
 * server repeats both checks, so this is a courtesy gate, not the security
 * boundary.
 *
 * The confirmation is a Modal rather than a toast-with-button because it is
 * the same shape as SnippetSwapDialog: a destructive choice the user must
 * make deliberately, dismissible with Escape or the backdrop (both cancel).
 */
export const UploadButton = ({ language, onUpload, disabled, className }: UploadButtonProps) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<UploadFile | null>(null);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleFile = (file: File) => {
    // Size first: never read a file we are going to refuse.
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: 'File too large',
        description: `Uploads are capped at 1 MB. ${file.name} is ${(file.size / MAX_UPLOAD_BYTES).toFixed(1)} MB.`,
        variant: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      toast({ title: 'Could not read the file', description: `${file.name} could not be opened.`, variant: 'error' });
    };
    reader.onload = () => {
      const content = String(reader.result ?? '');
      const reason = binaryRejection(content);
      if (reason) {
        toast({ title: 'Not a text file', description: `${file.name}: ${reason}`, variant: 'error' });
        return;
      }
      setPending({ name: file.name, content, language: languageFromFilename(file.name) });
    };
    reader.readAsText(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again re-fires `change`.
    event.target.value = '';
    if (file) handleFile(file);
  };

  const cancel = () => setPending(null);

  const confirm = () => {
    if (!pending) return;
    if (pending.language === null) {
      // We could not classify it, so we did not change anything: say so and
      // point at the control that can.
      toast({
        title: 'Language not recognized',
        description: `Kept this room on ${languageLabel(language)} â€” pick a language from the status bar if that is wrong.`,
        variant: 'info',
      });
    }
    onUpload(pending);
    setPending(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Upload file"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-xs font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed text-text-secondary/50'
            : 'text-text-secondary hover:text-text-primary',
          className
        )}
      >
        <Upload size={14} />
        <span className="hidden sm:inline">Upload</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        aria-label="Choose a file to upload"
        onChange={handleChange}
      />

      <Modal
        open={pending !== null}
        onClose={cancel}
        title="Replace the document with this file?"
        description={
          pending
            ? `â€œ${pending.name}â€ will replace the current content of this room for everyone here. This cannot be undone.`
            : ''
        }
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={cancel} data-testid="cancel-upload">
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} data-testid="confirm-upload">
            Replace
          </Button>
        </div>
      </Modal>
    </>
  );
};
