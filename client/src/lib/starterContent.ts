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
