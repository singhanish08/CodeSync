import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MonacoBinding } from 'y-monaco';
import { useTheme } from '../../contexts/ThemeContext';
import { applyMonacoTheme, monaco } from '../../lib/monacoSetup';

interface RemotePeer {
  clientId: number;
  name: string;
  color: string;
}

interface CursorLabel extends RemotePeer {
  /** Pixel position of the head caret, relative to the overlay container. */
  top: number;
  left: number;
  height: number;
}

interface CodeEditorProps {
  yText: Y.Text | null;
  awareness: awarenessProtocol.Awareness | null;
  language: string;
  /** Called once the editor is mounted; the parent uses it for AI selections. */
  onReady?: (editorInstance: editor.IStandaloneCodeEditor) => void;
}

/**
 * Maps the language ids used by the status-bar selector onto the ids Monaco
 * actually registers. Most are identical; the two exceptions are C (Monaco
 * highlight C sources with the C++ grammar) and Bash (Monaco calls it "shell").
 */
const MONACO_LANGUAGE_ID: Record<string, string> = {
  c: 'cpp',
  bash: 'shell',
};

const monacoLanguageId = (language: string): string =>
  MONACO_LANGUAGE_ID[language] ?? language;

/** Structural equality checks so scroll/content events don't spam re-renders
 *  when nothing actually moved. */
const samePeers = (a: RemotePeer[], b: RemotePeer[]): boolean =>
  a.length === b.length &&
  a.every((peer, index) =>
    b[index] &&
    peer.clientId === b[index].clientId &&
    peer.color === b[index].color &&
    peer.name === b[index].name
  );

const sameLabels = (a: CursorLabel[], b: CursorLabel[]): boolean =>
  a.length === b.length &&
  a.every((label, index) => {
    const other = b[index];
    return (
      other &&
      label.clientId === other.clientId &&
      label.color === other.color &&
      label.name === other.name &&
      label.top === other.top &&
      label.left === other.left &&
      label.height === other.height
    );
  });

export const CodeEditor = ({ yText, awareness, language, onReady }: CodeEditorProps) => {
  const { theme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  // Drives the binding effect below: Monaco loads its bundle asynchronously,
  // so `editorRef.current` is null when `yText` first arrives and the effect
  // would otherwise bail out and never run again — keystrokes would edit a
  // local model that never reaches the shared document.
  const [editorMounted, setEditorMounted] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [labels, setLabels] = useState<CursorLabel[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keep Monaco's theme engine in lockstep with the app theme.
  useEffect(() => {
    applyMonacoTheme(theme);
  }, [theme]);

  // Keep the model language in sync when the user switches languages.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelLanguage(model, monacoLanguageId(language));
  }, [language]);

  // Bind Monaco to the shared Y.Text + awareness (remote cursors/selections).
  useEffect(() => {
    if (!editorMounted || !yText) return;

    bindingRef.current?.destroy();
    bindingRef.current = new MonacoBinding(
      yText,
      editorRef.current!.getModel()!,
      new Set([editorRef.current!]),
      awareness ?? undefined
    );

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [yText, awareness, editorMounted]);

  // Track remote collaborators: y-monaco draws each remote selection/caret as
  // a decoration tagged `yRemoteSelection-<clientId>` / `yRemoteSelectionHead-
  // <clientId>`, but ships no CSS and no name tag. We paint both ourselves — a
  // per-client style block for the decorations, and an overlay of name flags
  // positioned at each remote user's caret.
  useEffect(() => {
    if (!editorMounted || !yText || !awareness) return;

    const ed = editorRef.current;
    const model = ed?.getModel();
    const overlay = overlayRef.current;
    if (!ed || !model || !overlay) return;
    const doc = yText.doc!;

    const compute = () => {
      const edDom = ed.getDomNode();
      if (!edDom) return;
      const edRect = edDom.getBoundingClientRect();
      const ovRect = overlay.getBoundingClientRect();

      const peers: RemotePeer[] = [];
      const next: CursorLabel[] = [];
      awareness.getStates().forEach((state, clientID) => {
        if (clientID === doc.clientID) return;
        const user = state.user as { name?: string; color?: string } | undefined;
        if (!user) return;

        const color = String(user.color ?? 'var(--accent)');
        peers.push({ clientId: clientID, name: String(user.name ?? 'Anonymous'), color });

        const selection = state.selection as
          | { head?: Y.RelativePosition; anchor?: Y.RelativePosition }
          | undefined;
        const headPos = selection?.head
          ? Y.createAbsolutePositionFromRelativePosition(selection.head, doc)
          : null;
        if (!headPos || headPos.type !== yText) return;

        // getScrolledVisiblePosition is null when the caret is outside the
        // rendered viewport (scrolled off or inside a folded range).
        const visible = ed.getScrolledVisiblePosition(
          model.getPositionAt(headPos.index)
        );
        if (!visible) return;

        next.push({
          clientId: clientID,
          name: String(user.name ?? 'Anonymous'),
          color,
          top: edRect.top - ovRect.top + visible.top,
          left: Math.min(
            edRect.left - ovRect.left + visible.left,
            Math.max(ovRect.width - 72, 0)
          ),
          height: visible.height,
        });
      });

      setRemotePeers((prev) => (samePeers(prev, peers) ? prev : peers));
      setLabels((prev) => (sameLabels(prev, next) ? prev : next));
    };

    compute();
    // Monaco disposables are IDisposable; y-protocols' Observable returns void
    // and unsubscribes through `off`.
    const disposables = [
      ed.onDidScrollChange(compute),
      ed.onDidChangeModelContent(compute),
      ed.onDidLayoutChange(compute),
    ];
    awareness.on('change', compute);
    return () => {
      disposables.forEach((disposable) => disposable.dispose());
      awareness.off('change', compute);
    };
  }, [editorMounted, yText, awareness]);

  // Per-client CSS: the selection highlight and the 2px caret bar, each in that
  // collaborator's own colour. Client ids are dynamic, so this is generated
  // from live awareness rather than hardcoded.
  const cursorStyles = useMemo(
    () =>
      remotePeers
        .map(
          (peer) =>
            `.yRemoteSelection-${peer.clientId} { background-color: color-mix(in srgb, ${peer.color} 22%, transparent); }\n` +
            `.yRemoteSelectionHead-${peer.clientId} { position: relative; display: inline-block; width: 0; vertical-align: middle; }\n` +
            `.yRemoteSelectionHead-${peer.clientId}::after { content: ''; position: absolute; top: 0; bottom: 0; left: -1px; width: 2px; border-radius: 1px; background-color: ${peer.color}; }`
        )
        .join('\n'),
    [remotePeers]
  );

  const handleMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance;
    applyMonacoTheme(theme);
    onReady?.(editorInstance);
    setEditorMounted(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg-primary">
      <style aria-hidden>{cursorStyles}</style>
      <Editor
        height="100%"
        language={monacoLanguageId(language)}
        theme="codesync-dark"
        onMount={handleMount}
        options={{
          automaticLayout: true,
          fontSize: 14,
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          tabSize: 2,
          padding: { top: 12 },
          fixedOverflowWidgets: true,
        }}
      />
      {/* Remote collaborator name flags, one per live awareness state. The
          coloured caret itself is painted by the generated style block above;
          this overlay adds the name tag y-monaco has no concept of. */}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {labels.map((label) => (
          <span
            key={label.clientId}
            className="pointer-events-none absolute z-10"
            style={{ top: label.top, left: label.left, height: label.height }}
          >
            <span
              className="absolute inset-y-0 left-0 w-0.5 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            <span
              className="absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow-soft"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
            <span className="sr-only">{label.name} is editing here</span>
          </span>
        ))}
      </div>
    </div>
  );
};
