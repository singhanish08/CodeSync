import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { loader } from '@monaco-editor/react';
import { subscribeTheme } from './themeBus';

/**
 * Monaco bundles its own workers. Configure them for Vite and hand the local
 * Monaco instance to @monaco-editor/react (so it never pulls from a CDN), then
 * register the three CodeSync themes.
 *
 * This module is only imported from the editor route, so Monaco stays out of
 * the landing-page bundle. Theme changes arrive over the lightweight theme bus
 * — the ThemeContext never imports Monaco itself.
 */

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

export const MONACO_THEME_FOR = {
  light: 'codesync-light',
  dark: 'codesync-dark',
  eyeshield: 'codesync-eyeshield',
} as const;

let themesRegistered = false;

export const registerCodeSyncThemes = (): void => {
  if (themesRegistered) return;
  themesRegistered = true;

  // — LIGHT · "Studio Paper": ink on paper, indigo accents —
  monaco.editor.defineTheme('codesync-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '9a9aa3', fontStyle: 'italic' },
      { token: 'string', foreground: '2c7a3f' },
      { token: 'number', foreground: 'a35b00' },
      { token: 'keyword', foreground: '5b5fc7' },
      { token: 'type', foreground: '7c5cff' },
      { token: 'function', foreground: '3b4fd4' },
      { token: 'variable', foreground: '14141b' },
    ],
    colors: {
      'editor.background': '#fcfcfd',
      'editor.foreground': '#14141b',
      'editorLineNumber.foreground': 'b6b6c0',
      'editorLineNumber.activeForeground': '65656f',
      'editor.selectionBackground': 'e2e2f6',
      'editor.lineHighlightBackground': 'f4f4f7',
      'editorCursor.foreground': '#5b5fc7',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e4e4ea',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#e4e4ea',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#e4e4ea',
      'editorGutter.background': '#fcfcfd',
      'editorIndentGuide.background': '#ececf1',
      'editorIndentGuide.activeBackground': '#d8d8e0',
    },
  });

  // — DARK · "Midnight Aurora": neon on deep blue-black —
  monaco.editor.defineTheme('codesync-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'string', foreground: '9ece6a' },
      { token: 'number', foreground: 'ff9e64' },
      { token: 'keyword', foreground: '8a8ef0' },
      { token: 'type', foreground: '7dcfff' },
      { token: 'function', foreground: '7aa2f7' },
      { token: 'variable', foreground: '#e9e9f1' },
    ],
    colors: {
      'editor.background': '#0b0c12',
      'editor.foreground': '#e9e9f1',
      'editorLineNumber.foreground': '#3d3f52',
      'editorLineNumber.activeForeground': '#9898a8',
      'editor.selectionBackground': '#2a2c40',
      'editor.lineHighlightBackground': '#141521',
      'editorCursor.foreground': '#8a8ef0',
      'editorWidget.background': '#141521',
      'editorWidget.border': '#232430',
      'editorSuggestWidget.background': '#141521',
      'editorSuggestWidget.border': '#232430',
      'editorHoverWidget.background': '#141521',
      'editorHoverWidget.border': '#232430',
      'editorGutter.background': '#0b0c12',
      'editorIndentGuide.background': '#1e202c',
      'editorIndentGuide.activeBackground': '#2c2e3d',
    },
  });

  // — EYE SHIELD · "Amber Terminal": warm phosphor, zero blue light —
  monaco.editor.defineTheme('codesync-eyeshield', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8a7a63', fontStyle: 'italic' },
      { token: 'string', foreground: 'c9a96a' },
      { token: 'number', foreground: 'e0a55c' },
      { token: 'keyword', foreground: 'd4a35f' },
      { token: 'type', foreground: 'dfc28a' },
      { token: 'function', foreground: 'e8c48a' },
      { token: 'variable', foreground: '#e8dcc4' },
    ],
    colors: {
      'editor.background': '#1c1610',
      'editor.foreground': '#e8dcc4',
      'editorLineNumber.foreground': '#5f5142',
      'editorLineNumber.activeForeground': '#a08c72',
      'editor.selectionBackground': '#4a3d2e',
      'editor.lineHighlightBackground': '#2e251d',
      'editorCursor.foreground': '#d4a35f',
      'editorWidget.background': '#2e251d',
      'editorWidget.border': '#453a2c',
      'editorSuggestWidget.background': '#2e251d',
      'editorSuggestWidget.border': '#453a2c',
      'editorHoverWidget.background': '#2e251d',
      'editorHoverWidget.border': '#453a2c',
      'editorGutter.background': '#1c1610',
      'editorIndentGuide.background': '#332a20',
      'editorIndentGuide.activeBackground': '#453a2c',
    },
  });
};

/** Applies the Monaco theme matching the app theme. Safe to call repeatedly. */
export const applyMonacoTheme = (appTheme: 'light' | 'dark' | 'eyeshield'): void => {
  registerCodeSyncThemes();
  monaco.editor.setTheme(MONACO_THEME_FOR[appTheme]);
};

// Follow app theme changes without the ThemeContext importing Monaco.
subscribeTheme(applyMonacoTheme);

export { monaco };
