/**
 * The languages a room can be seeded and highlighted in. The editor's dropdown,
 * the REST layer, and the socket layer all read this one list so they can never
 * drift apart.
 */
export const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust', 'c',
  'ruby', 'php', 'json', 'html', 'css', 'markdown', 'bash',
] as const;

export const DEFAULT_LANGUAGE = 'javascript';

/**
 * Coerces arbitrary input to a supported language id, falling back to the
 * default for anything unknown or malformed. Used both to validate what a
 * client asks to switch to and to normalise a stored room document.
 */
export const normalizeLanguage = (value: unknown): string => {
  const lang = String(value ?? '').toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? lang : DEFAULT_LANGUAGE;
};
