import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MonacoBinding } from 'y-monaco';
import { useTheme } from '../../contexts/ThemeContext';
import { applyMonacoTheme, monaco } from '../../lib/monacoSetup';

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

export const CodeEditor = ({ yText, awareness, language, onReady }: CodeEditorProps) => {
  const { theme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  // Drives the binding effect below: Monaco loads its bundle asynchronously,
  // so `editorRef.current` is null when `yText` first arrives and the effect
  // would otherwise bail out and never run again — keystrokes would edit a
  // local model that never reaches the shared document.
  const [editorMounted, setEditorMounted] = useState(false);

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

  const handleMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance;
    applyMonacoTheme(theme);
    onReady?.(editorInstance);
    setEditorMounted(true);
  };

  return (
    <div className="h-full w-full overflow-hidden bg-bg-primary">
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
    </div>
  );
};
