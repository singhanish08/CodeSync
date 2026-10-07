import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface SnippetSwapDialogProps {
  open: boolean;
  /** Human-readable label for the language being switched to, e.g. "Python". */
  language: string;
  /** Leaving without choosing: the language does not change at all. */
  onCancel: () => void;
  /** Switch language AND rewrite the welcome sample in the new language. */
  onReplace: () => void;
  /** Switch language only — the document is left byte-for-byte alone. */
  onKeep: () => void;
}

/**
 * Shown when a language switch is ambiguous: the document still opens with the
 * CodeSync welcome banner and is small enough to be the sample, but somebody
 * has edited it (their own tweak, or an accepted AI refactor). The two outcomes
 * are genuinely different and we cannot tell which the user means from the
 * bytes, so we ask rather than guess — guessing wrong would either discard
 * their edits or leave the room stuck with a snippet in the wrong language.
 *
 * Dismissing the dialog (Escape, backdrop, the X) cancels the switch entirely.
 */
export const SnippetSwapDialog = ({ open, language, onCancel, onReplace, onKeep }: SnippetSwapDialogProps) => (
  <Modal
    open={open}
    onClose={onCancel}
    title="Replace the welcome sample?"
    description={`This room's document is still the CodeSync welcome sample, with some edits on top. Switch to ${language} and rewrite the sample, or keep the text exactly as it is?`}
    className="max-w-md"
  >
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onKeep} data-testid="keep-snippet">
        Keep my content
      </Button>
      <Button variant="primary" onClick={onReplace} data-testid="replace-snippet">
        Replace sample
      </Button>
    </div>
  </Modal>
);
