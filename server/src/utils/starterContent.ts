/**
 * The welcome snippet seeded into an empty room. Each language gets its own
 * genuinely idiomatic version — correct comment syntax and the constructs that
 * language actually uses — rather than a line-for-line translation of the JS
 * one. Keep each one short; it is a greeting, not a tutorial.
 */
export const starterContent = (language: string): string => {
  switch (language) {
    case 'javascript':
    case 'javascriptreact':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n' +
        '// Select code and hit "Explain" or "Review" in the AI panel.\n\n' +
        'function greet(name) {\n' +
        '  return `Hello, ${name}!`;\n' +
        '}\n\n' +
        'console.log(greet("world"));\n'
      );
    case 'typescript':
    case 'typescriptreact':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n' +
        '// Select code and hit "Explain" or "Review" in the AI panel.\n\n' +
        'function greet(name: string): string {\n' +
        '  return `Hello, ${name}!`;\n' +
        '}\n\n' +
        'console.log(greet("world"));\n'
      );
    case 'python':
      return (
        '# Welcome to CodeSync 👋\n' +
        '# Everyone in this room edits the same document in real time.\n' +
        '# Select code and hit "Explain" or "Review" in the AI panel.\n\n' +
        'def greet(name: str) -> str:\n' +
        '    return f"Hello, {name}!"\n\n\n' +
        'if __name__ == "__main__":\n' +
        '    print(greet("world"))\n'
      );
    case 'cpp':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        '#include <iostream>\n' +
        '#include <string>\n\n' +
        'std::string greet(const std::string& name) {\n' +
        '    return "Hello, " + name + "!";\n' +
        '}\n\n' +
        'int main() {\n' +
        '    std::cout << greet("world") << std::endl;\n' +
        '    return 0;\n' +
        '}\n'
      );
    case 'java':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'public class Main {\n' +
        '    static String greet(String name) {\n' +
        '        return "Hello, " + name + "!";\n' +
        '    }\n\n' +
        '    public static void main(String[] args) {\n' +
        '        System.out.println(greet("world"));\n' +
        '    }\n' +
        '}\n'
      );
    case 'go':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'package main\n\n' +
        'import "fmt"\n\n' +
        'func greet(name string) string {\n' +
        '\treturn fmt.Sprintf("Hello, %s!", name)\n' +
        '}\n\n' +
        'func main() {\n' +
        '\tfmt.Println(greet("world"))\n' +
        '}\n'
      );
    case 'rust':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'fn greet(name: &str) -> String {\n' +
        '    format!("Hello, {name}!")\n' +
        '}\n\n' +
        'fn main() {\n' +
        '    println!("{}", greet("world"));\n' +
        '}\n'
      );
    case 'c':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        '#include <stdio.h>\n\n' +
        'int main(void) {\n' +
        '    printf("Hello, world!\\n");\n' +
        '    return 0;\n' +
        '}\n'
      );
    case 'ruby':
      return (
        '# Welcome to CodeSync 👋\n' +
        '# Everyone in this room edits the same document in real time.\n' +
        '# Select code and hit "Explain" or "Review" in the AI panel.\n\n' +
        'def greet(name)\n' +
        '  "Hello, #{name}!"\n' +
        'end\n\n' +
        'puts greet("world")\n'
      );
    case 'php':
      return (
        '<?php\n' +
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'function greet(string $name): string {\n' +
        '    return "Hello, $name!";\n' +
        '}\n\n' +
        'echo greet("world");\n'
      );
    case 'kotlin':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'fun greet(name: String): String = "Hello, $name!"\n\n' +
        'fun main() {\n' +
        '    println(greet("world"))\n' +
        '}\n'
      );
    case 'csharp':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'using System;\n\n' +
        'class Program\n' +
        '{\n' +
        '    static string Greet(string name) => $"Hello, {name}!";\n\n' +
        '    static void Main() => Console.WriteLine(Greet("world"));\n' +
        '}\n'
      );
    case 'scala':
      return (
        '// Welcome to CodeSync 👋\n' +
        '// Everyone in this room edits the same document in real time.\n\n' +
        'object Main extends App {\n' +
        '  def greet(name: String): String = s"Hello, $name!"\n\n' +
        '  println(greet("world"))\n' +
        '}\n'
      );
    case 'bash':
      return (
        '# Welcome to CodeSync 👋\n' +
        '# Everyone in this room edits the same document in real time.\n' +
        '# Select code and hit "Explain" or "Review" in the AI panel.\n\n' +
        'greet() {\n' +
        '  echo "Hello, $1!"\n' +
        '}\n\n' +
        'greet "world"\n'
      );
    case 'sql':
      return (
        '-- Welcome to CodeSync 👋\n' +
        '-- Everyone in this room edits the same document in real time.\n\n' +
        "SELECT 'Hello, world!' AS greeting;\n"
      );
    case 'html':
      return (
        '<!-- Welcome to CodeSync 👋 -->\n' +
        '<!-- Everyone in this room edits the same document in real time. -->\n\n' +
        '<!DOCTYPE html>\n' +
        '<html lang="en">\n' +
        '  <body>\n' +
        '    <h1>Hello, world!</h1>\n' +
        '  </body>\n' +
        '</html>\n'
      );
    case 'css':
      return (
        '/* Welcome to CodeSync 👋 */\n' +
        '/* Everyone in this room edits the same document in real time. */\n\n' +
        '.greeting::before {\n' +
        '  content: "Hello, world!";\n' +
        '}\n'
      );
    case 'markdown':
      return (
        '# Welcome to CodeSync 👋\n\n' +
        'Everyone in this room edits the same document in real time.\n\n' +
        '> Select code and hit **Explain** or **Review** in the AI panel.\n'
      );
    case 'json':
      return (
        '{\n' +
        '  "welcome": "CodeSync 👋",\n' +
        '  "note": "Everyone in this room edits the same document in real time."\n' +
        '}\n'
      );
    default:
      return starterContent('javascript');
  }
};

/**
 * How much of the welcome sample is still in a document. This is what decides
 * what a language switch may do with it:
 *
 *  - `empty`       — nothing to convert.
 *  - `exact`       — byte-for-byte the sample for some language: the untouched
 *                    snippet a fresh room opens with. Swap it, no ceremony.
 *  - `sample-like` — still opens with the CodeSync banner and is small enough
 *                    to be the sample, but somebody has touched it (a tweak, or
 *                    an accepted AI refactor). Too close to call on our own, so
 *                    the UI asks instead of guessing.
 *  - `content`     — real work. A switch only retargets highlighting.
 *
 * MIRROR: keep this file byte-identical to `server/src/utils/starterContent.ts`
 * — `client/starter-content-sync.test.mjs` fails if they drift.
 */
export type StarterClass = 'empty' | 'exact' | 'sample-like' | 'content';

/**
 * Every language id `starterContent` has a branch for. The React variants share
 * the JavaScript/TypeScript branches, so listing them keeps the exact match
 * exhaustive without duplicating text.
 */
const SAMPLE_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
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
];

// The banner every sample opens with, in whatever comment syntax it uses.
const SAMPLE_BANNER = 'Welcome to CodeSync';
// JSON has no comment syntax, so its banner is a value rather than a comment.
const SAMPLE_BANNER_ALT = 'CodeSync 👋';

// Bounds on the "still looks like the sample" test. Real code outgrows these
// almost immediately; the sample never does. Being too generous here only ever
// costs a confirmation click — never data — so they err on the wide side.
const MAX_SAMPLE_CHARS = 700;
const MAX_SAMPLE_LINES = 40;
// The banner sits on line 1 in every sample except PHP, whose `<?php` opens.
const MAX_BANNER_SCAN_LINES = 3;

const COMMENT_PREFIXES = ['//', '#', '--', '<!--', '/*', '*'];

const isBannerLine = (line: string): boolean => {
  if (line.includes(SAMPLE_BANNER)) {
    return COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix));
  }
  return line.includes(SAMPLE_BANNER_ALT);
};

export const classifyStarter = (text: string): StarterClass => {
  if (!text.trim()) return 'empty';
  if (SAMPLE_LANGUAGES.some((language) => text === starterContent(language))) return 'exact';

  const lines = text.split('\n');
  if (text.length > MAX_SAMPLE_CHARS) return 'content';
  if (lines.length > MAX_SAMPLE_LINES) return 'content';

  const head = lines.filter((line) => line.trim()).slice(0, MAX_BANNER_SCAN_LINES);
  return head.some(isBannerLine) ? 'sample-like' : 'content';
};
