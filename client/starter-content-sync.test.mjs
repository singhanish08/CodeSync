// Drift guard: the welcome snippets and their classifier exist in two places —
// the client uses them to decide whether a language switch needs to ask the
// user, and the server re-decides authoritatively before touching the document.
// If the two copies ever disagree, the server will refuse (or worse, perform)
// a swap the other side believes is correct, and the bug comes straight back.
//
// Run: node starter-content-sync.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const CLIENT_FILE = path.join(root, 'client', 'src', 'lib', 'starterContent.ts');
const SERVER_FILE = path.join(root, 'server', 'src', 'utils', 'starterContent.ts');

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '\u2713' : '\u2717'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

for (const file of [CLIENT_FILE, SERVER_FILE]) {
  check(`exists: ${path.relative(root, file)}`, fs.existsSync(file));
}

const client = fs.readFileSync(CLIENT_FILE, 'utf8');
const server = fs.readFileSync(SERVER_FILE, 'utf8');

check('client and server copies are byte-identical', client === server,
  client === server ? '' : 'run: copy client/src/lib/starterContent.ts -> server/src/utils/starterContent.ts');

check('exports starterContent', /export const starterContent\s*=/.test(client));
check('exports classifyStarter', /export const classifyStarter\s*=/.test(client));
check('exports StarterClass', /export type StarterClass\s*=/.test(client));

// Both halves of the classifier have to survive a copy: a missing banner
// constant or a truncated bound would silently classify everything as content.
for (const token of ['SAMPLE_BANNER', 'SAMPLE_BANNER_ALT', 'MAX_SAMPLE_CHARS', 'MAX_SAMPLE_LINES', 'MAX_BANNER_SCAN_LINES', 'SAMPLE_LANGUAGES']) {
  check(`defines ${token}`, client.includes(`const ${token}`));
}

// Every language the room picker offers must have a snippet branch, otherwise
// a fresh room in that language falls back to JavaScript.
const languages = fs.readFileSync(path.join(root, 'client', 'src', 'lib', 'languages.ts'), 'utf8');
const list = languages.match(/export const LANGUAGES = \[([\s\S]*?)\] as const;/);
const offered = list ? [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
check('read the LANGUAGES list', offered.length > 0, 'could not parse LANGUAGES');
for (const lang of offered) {
  check(`starter snippet exists for ${lang}`, client.includes(`case '${lang}':`));
}

console.log(`\n${failures === 0 ? '\u2705 STARTER CONTENT IN SYNC' : `\u274c ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
