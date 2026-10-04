/**
 * Issue 3: every language in the dropdown must seed its own genuinely
 * idiomatic starter snippet — correct comment syntax and that language's real
 * constructs. The old code shared snippets across language families, which
 * handed e.g. Ruby an invalid Python f-string and Rust a C++ `#include`.
 */
import { starterContent } from './src/lib/starterContent';
import { LANGUAGES } from './src/lib/languages';

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
};

const includes = (lang: string, needle: string) => starterContent(lang).includes(needle);
const excludes = (lang: string, needle: string) => !starterContent(lang).includes(needle);

console.log('\n— Every dropdown language produces a snippet —');
for (const lang of LANGUAGES) {
  const snippet = starterContent(lang);
  check(snippet.trim().length > 0, `${lang}: non-empty`);
  check(snippet.includes('CodeSync'), `${lang}: welcomes by name`);
}

console.log('\n— Line-comment syntax matches the language —');
const SLASH_LANGS = ['javascript', 'typescript', 'cpp', 'java', 'go', 'rust', 'c', 'php', 'kotlin', 'csharp', 'scala'];
const HASH_LANGS = ['python', 'ruby', 'bash'];
for (const lang of SLASH_LANGS) check(includes(lang, '//'), `${lang}: uses // comments`);
for (const lang of HASH_LANGS) check(includes(lang, '# '), `${lang}: uses # comments`);
check(includes('sql', '-- '), 'sql: uses -- comments');
check(includes('html', '<!--'), 'html: uses <!-- comments');
check(includes('css', '/*'), 'css: uses /* comments');
check(starterContent('markdown').startsWith('# '), 'markdown: opens with a # heading');

console.log('\n— Constructs are idiomatic to each language —');
check(includes('python', 'def greet(name: str) -> str:'), 'python: def with type hints');
check(includes('python', 'f"Hello, {name}!"'), 'python: f-string');
check(includes('python', 'if __name__ == "__main__":'), 'python: __main__ guard');
check(includes('javascript', 'function greet(name) {') && includes('javascript', 'console.log'), 'javascript: function + console.log');
check(includes('typescript', 'function greet(name: string): string {'), 'typescript: annotated function');
check(includes('ruby', 'def greet(name)') && includes('ruby', '#{name}'), 'ruby: def + #{...} interpolation');
check(excludes('ruby', 'f"Hello'), 'ruby: NOT handed a Python f-string');
check(includes('cpp', '#include <iostream>') && includes('cpp', 'std::cout'), 'cpp: iostream + std::cout');
check(includes('c', '#include <stdio.h>') && includes('c', 'printf'), 'c: stdio.h + printf');
check(excludes('c', '<iostream>') && excludes('c', 'std::'), 'c: NOT given C++ constructs');
check(includes('java', 'public class Main') && includes('java', 'System.out.println'), 'java: class Main + System.out');
check(includes('go', 'package main') && includes('go', 'func main() {'), 'go: package main + func main');
check(includes('rust', 'fn main() {') && includes('rust', 'println!'), 'rust: fn main + println!');
check(excludes('rust', '#include'), 'rust: NOT handed a C++ #include');
check(includes('php', '<?php') && includes('php', 'function greet(string $name): string'), 'php: <?php + typed function');
check(includes('kotlin', 'fun main() {') && includes('kotlin', 'fun greet(name: String): String'), 'kotlin: fun main + fun greet');
check(excludes('kotlin', 'public class Main'), 'kotlin: NOT handed a Java class');
check(includes('csharp', 'Console.WriteLine') && includes('csharp', 'using System;'), 'csharp: using System + Console.WriteLine');
check(excludes('csharp', 'System.out'), 'csharp: NOT handed Java System.out');
check(includes('scala', 'object Main extends App') && includes('scala', 'def greet(name: String): String'), 'scala: object Main + def greet');
check(excludes('scala', 'System.out'), 'scala: NOT handed Java System.out');
check(includes('bash', 'greet() {') && includes('bash', 'echo "Hello, $1!"'), 'bash: function + $1 positional');
check(includes('sql', "SELECT 'Hello, world!' AS greeting;"), 'sql: SELECT statement');
check(includes('html', '<!DOCTYPE html>'), 'html: doctype');
check(includes('css', 'content: "Hello, world!";'), 'css: content property');
check(!!(JSON.parse(starterContent('json')) as Record<string, string>).welcome, 'json: parses as valid JSON');

console.log('\n— No two languages share a snippet —');
const seen = new Map<string, string>();
for (const lang of LANGUAGES) {
  const snippet = starterContent(lang);
  const duplicate = [...seen.entries()].find(([, value]) => value === snippet);
  check(!duplicate, `${lang}: unique snippet`);
  if (!duplicate) seen.set(lang, snippet);
}

console.log('\n— Unknown language falls back to JavaScript, not an empty doc —');
check(starterContent('cobol') === starterContent('javascript'), 'unknown language → JS snippet');

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECKS FAILED\n`);
if (failures > 0) process.exit(1);
