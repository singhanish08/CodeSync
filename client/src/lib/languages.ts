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
