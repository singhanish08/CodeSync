/**
 * tree-sitter based context extraction.
 *
 * Instead of blindly shipping the raw file to the LLM, we parse it with
 * tree-sitter and build a compact structured context: top-level symbols with
 * their signatures and line ranges, plus (when the user selected something) the
 * full source of the enclosing function/class.
 *
 * IMPORTANT: tree-sitter ships native modules that can fail to load on some
 * platforms / Node versions. Every require() is wrapped in a single try/catch.
 * If the grammars are unavailable, the service degrades to sending the raw file
 * content, and the rest of the AI pipeline keeps working.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLanguage = any;

let parser: TSNode = null;
const languages: Record<string, TSLanguage> = {};
let loadError: string | null = null;

try {
  // tree-sitter >=0.21 exposes the Parser class as the module's default export
  // (module.exports = Parser), so `require` the module itself rather than a
  // named `Parser` binding.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Parser = require('tree-sitter');
  parser = new Parser();

  // Grammar packages export a language descriptor ({ name, language, nodeTypeInfo }).
  // Parser#setLanguage accepts that descriptor directly, so we keep the modules
  // whole rather than digging out their inner `language` pointer.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const javascript = require('tree-sitter-javascript');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const typescript = require('tree-sitter-typescript');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const python = require('tree-sitter-python');

  languages.javascript = javascript;
  languages.javascriptreact = javascript; // JSX parses fine with the JS grammar
  languages.typescript = typescript.typescript ?? typescript;
  languages.typescriptreact = typescript.tsx ?? typescript.typescript ?? typescript;
  languages.python = python;

  // Extended set. Each require is guarded individually so that a missing or
  // ABI-incompatible grammar only disables that one language (the service then
  // falls back to sending raw text for it) instead of taking down everything.
  const extraGrammars: Array<[string, string]> = [
    ['cpp', 'tree-sitter-cpp'],
    ['java', 'tree-sitter-java'],
    ['go', 'tree-sitter-go'],
    ['rust', 'tree-sitter-rust'],
    ['c', 'tree-sitter-c'],
    ['ruby', 'tree-sitter-ruby'],
    ['json', 'tree-sitter-json'],
    ['html', 'tree-sitter-html'],
    ['css', 'tree-sitter-css'],
    ['bash', 'tree-sitter-bash'],
    // `tree-sitter-php` needs a native build on some platforms; when it is
    // unavailable PHP simply gets raw-text context.
    // ['php', 'tree-sitter-php'],
    // No stable 0.21-era markdown grammar exists; Markdown gets raw-text context.
    // ['markdown', 'tree-sitter-markdown'],
  ];
  for (const [key, module] of extraGrammars) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      languages[key] = require(module);
    } catch (err) {
      console.warn(`[treeSitterService] grammar "${key}" unavailable — using raw text context for it.`);
    }
  }
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err);
  parser = null;
  console.warn(
    '[treeSitterService] tree-sitter grammars could not be loaded — falling back to raw file context. ' +
      'AI features still work, but with less focused context.\n' +
      `Cause: ${loadError}`
  );
}

// Node types we treat as "top-level symbols", keyed by grammar. Names are
// per-language and deliberately NOT shared: generic-sounding names (Ruby's
// `class`/`method`, for instance) collide with keyword nodes in other
// grammars and would produce bogus "(anonymous)" entries.
const SYMBOL_TYPES: Record<string, Set<string>> = {
  javascript: new Set([
    'function_declaration',
    'class_declaration',
    'method_definition',
    'decorated_definition',
    'export_statement',
    'variable_declaration',
    'assignment',
  ]),
  javascriptreact: new Set([
    'function_declaration',
    'class_declaration',
    'method_definition',
    'decorated_definition',
    'export_statement',
    'variable_declaration',
    'assignment',
  ]),
  typescript: new Set([
    'function_declaration',
    'class_declaration',
    'method_definition',
    'decorated_definition',
    'export_statement',
    'variable_declaration',
    'assignment',
  ]),
  typescriptreact: new Set([
    'function_declaration',
    'class_declaration',
    'method_definition',
    'decorated_definition',
    'export_statement',
    'variable_declaration',
    'assignment',
  ]),
  python: new Set(['function_definition', 'class_definition', 'decorated_definition', 'assignment']),
  c: new Set(['function_definition', 'struct_specifier', 'type_definition']),
  cpp: new Set(['function_definition', 'class_specifier', 'struct_specifier', 'type_definition']),
  java: new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'method_declaration',
    'constructor_declaration',
  ]),
  go: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
  rust: new Set(['function_item', 'struct_item', 'enum_item', 'impl_item', 'trait_item']),
  ruby: new Set(['method', 'class', 'module']),
  css: new Set(['rule_set', 'media_statement']),
  bash: new Set(['function_definition']),
};

const symbolTypesFor = (language: string): Set<string> => SYMBOL_TYPES[language] ?? SYMBOL_TYPES.javascript;

/**
 * Maps a user-facing language id (or common alias) onto a loaded tree-sitter
 * grammar key. Returns `null` when the language has no usable grammar — the
 * caller then falls back to sending raw text context for it.
 */
const normalizeLanguage = (language?: string): string | null => {
  const lang = String(language ?? 'javascript').toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescriptreact',
    py: 'python',
    // ── extended language aliases ──
    'c++': 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    java: 'java',
    go: 'go',
    golang: 'go',
    rs: 'rust',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    html: 'html',
    htm: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    php: 'php',
    text: 'javascript',
    plaintext: 'javascript',
  };
  const normalized = lang in map ? map[lang] : lang;
  return languages[normalized] ? normalized : null;
};

const nodeName = (node: TSNode): string => {
  const nameNode = node.childForFieldName ? node.childForFieldName('name') : null;
  if (nameNode) return String(nameNode.text ?? '');
  return '';
};

/** A short one-line signature: the first non-empty line of the node's text. */
const signatureOf = (node: TSNode): string => {
  const text: string = node.text ?? '';
  return text.split('\n')[0].trim().slice(0, 120);
};

const collectSymbols = (
  rootNode: TSNode,
  symbolTypes: Set<string>
): Array<{ name: string; type: string; startLine: number; endLine: number; signature: string }> => {
  const symbols: Array<{ name: string; type: string; startLine: number; endLine: number; signature: string }> = [];

  const walk = (node: TSNode, depth: number) => {
    if (depth > 2) return;
    if (symbolTypes.has(node.type)) {
      // For decorated Python defs, descend to the inner definition.
      const inner = node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
      const target = inner ?? node;
      symbols.push({
        name: nodeName(target) || '(anonymous)',
        type: target.type,
        startLine: (target.startPosition?.row ?? 0) + 1,
        endLine: (target.endPosition?.row ?? 0) + 1,
        signature: signatureOf(target),
      });
    }
    for (let i = 0; i < (node.childCount ?? 0); i++) walk(node.child(i), depth + 1);
  };

  walk(rootNode, 0);
  return symbols;
};

/**
 * Finds the smallest function/class node containing the given selection offsets.
 */
const findEnclosingSymbol = (
  rootNode: TSNode,
  selectionStart: number,
  selectionEnd: number,
  symbolTypes: Set<string>
): TSNode | null => {
  let best: TSNode | null = null;

  const walk = (node: TSNode) => {
    const start = node.startIndex ?? 0;
    const end = node.endIndex ?? 0;
    const isSymbol = symbolTypes.has(node.type);

    if (isSymbol && start <= selectionStart && selectionEnd <= end) {
      if (!best || (best.startIndex ?? 0) < start) best = node;
    }
    for (let i = 0; i < (node.childCount ?? 0); i++) walk(node.child(i));
  };

  walk(rootNode);
  return best;
};

/**
 * Builds the compact context string sent to the LLM.
 */
export const buildCodeContext = (
  fullFileContext: string,
  selectedCode: string | undefined,
  language?: string
): string => {
  const normalized = normalizeLanguage(language);
  const requested = String(language ?? 'javascript').toLowerCase();
  const file = fullFileContext ?? '';

  // `normalized` is null when the requested language has no loaded grammar.
  const parserKey = normalized ?? 'javascript';
  const hasGrammar = Boolean(normalized);

  // Report the language the user actually selected. When no grammar is
  // available we fall back to raw text but still name the language honestly.
  const languageLabel = hasGrammar
    ? parserKey === 'javascriptreact'
      ? 'javascript (jsx)'
      : parserKey
    : requested;

  const header = `LANGUAGE: ${languageLabel}\nLINES: ${file.split('\n').length}`;

  // ── Graceful fallback: no parser available ──
  if (!parser || !hasGrammar) {
    const parts = [
      header,
      selectedCode ? `SELECTION:\n${selectedCode}` : '',
      'FULL FILE (raw — tree-sitter unavailable):',
      file,
    ];
    return parts.filter(Boolean).join('\n\n');
  }

  let tree: TSNode = null;
  try {
    parser.setLanguage(languages[parserKey]);
    tree = parser.parse(file);
  } catch (err) {
    console.warn(`[treeSitterService] Failed to parse ${parserKey}:`, err);
    const parts = [
      header,
      selectedCode ? `SELECTION:\n${selectedCode}` : '',
      'FULL FILE (raw — parse failed):',
      file,
    ];
    return parts.filter(Boolean).join('\n\n');
  }

  const root = tree.rootNode;
  const symbolTypes = symbolTypesFor(parserKey);
  const symbols = collectSymbols(root, symbolTypes).slice(0, 25);

  const parts: string[] = [header];

  if (symbols.length) {
    parts.push(
      'TOP-LEVEL SYMBOLS:\n' +
        symbols
          .map((s) => `- ${s.type} ${s.name} [lines ${s.startLine}-${s.endLine}] :: ${s.signature}`)
          .join('\n')
    );
  }

  // Selection → enclosing symbol source, else the whole file body.
  if (selectedCode && selectedCode.trim()) {
    const idx = file.indexOf(selectedCode);
    if (idx >= 0) {
      const enclosing = findEnclosingSymbol(root, idx, idx + selectedCode.length, symbolTypes);
      if (enclosing) {
        parts.push(
          `SELECTED SYMBOL: ${enclosing.type} ${nodeName(enclosing) || '(anonymous)'} ` +
            `[lines ${(enclosing.startPosition?.row ?? 0) + 1}-${(enclosing.endPosition?.row ?? 0) + 1}]\n${enclosing.text}`
        );
      }
    }
    parts.push(`SELECTION:\n${selectedCode}`);
  }

  parts.push(`FULL FILE:\n${file}`);
  return parts.join('\n\n');
};
