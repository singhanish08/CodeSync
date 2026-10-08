/**
 * The languages a room can be seeded and highlighted in. Kept in one place so
 * the room creator, the status-bar selector, and the starter snippets can never
 * drift apart. Mirrors the server's accepted list.
 */
export const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'cpp',
  'java',
  'go',
  'rust',
  'c',
  'ruby',
  'php',
  'json',
  'html',
  'css',
  'markdown',
  'bash',
] as const;

export const DEFAULT_LANGUAGE = 'javascript';

export const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  cpp: 'C++',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  ruby: 'Ruby',
  php: 'PHP',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  bash: 'Bash',
};

export const languageLabel = (language: string): string =>
  LANGUAGE_LABELS[language] ?? language;

/**
 * Extension for the plain-text file a document is downloaded as. One entry per
 * member of LANGUAGES; anything unexpected falls back to `.txt`.
 */
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  rust: 'rs',
  c: 'c',
  ruby: 'rb',
  php: 'php',
  json: 'json',
  html: 'html',
  css: 'css',
  markdown: 'md',
  bash: 'sh',
};

export const languageExtension = (language: string): string =>
  LANGUAGE_EXTENSIONS[language] ?? 'txt';

/**
 * Reverse of LANGUAGE_EXTENSIONS: `.js` → `javascript`. Built from the export
 * map at module load so upload detection and export naming can never drift —
 * any language that can be downloaded must be recognisable on the way back in.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = Object.fromEntries(
  Object.entries(LANGUAGE_EXTENSIONS).map(([language, extension]) => [extension, language])
);

/**
 * Language id for a file name, or `null` when the extension is not one we
 * know. `null` is deliberate: an unrecognised extension is NOT evidence that
 * the file is JavaScript, so the caller keeps the room's current language and
 * leaves the choice to the status bar instead of silently re-highlighting an
 * upload it cannot classify. Directory components, dotfiles (`.gitignore`),
 * and trailing dots all resolve to `null` too.
 */
export const languageFromFilename = (filename: string): string | null => {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return EXTENSION_TO_LANGUAGE[base.slice(dot + 1).toLowerCase()] ?? null;
};
