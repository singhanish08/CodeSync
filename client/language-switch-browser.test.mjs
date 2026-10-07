// Issue 3, browser pass: switching a room's language must rewrite the seeded
// starter snippet when (and only when) the document is still the sample, ask
// first when it has been edited, leave real content alone, and reach every
// other member — the snippet AND the highlighting. Run from the temp
// puppeteer dir so puppeteer-core resolves:
//
//   $env:CODESYNC_CLIENT='http://localhost:5176';
//   $env:CODESYNC_HOST='http://127.0.0.1:5175';
//   node language-switch-browser.test.mjs

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLIENT = process.env.CODESYNC_CLIENT || 'http://localhost:5176';
const API_HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';

// The test provisions its own throwaway account so it does not depend on a
// hand-created one surviving between runs (the cleanup script prunes
// @codesync.dev users).
const password = 'TestPass123!';
const email = `langtest_${Math.random().toString(36).slice(2, 10)}@codesync.dev`;

const signup = async () => {
  const res = await fetch(`${API_HOST}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Lang E2E' }),
  });
  if (res.status !== 201) {
    const body = await res.text();
    throw new Error(`signup failed: ${res.status} ${body}`);
  }
};

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_CANDIDATES.find((c) => fs.existsSync(c));
if (!executablePath) throw new Error('No Chrome/Edge executable found.');

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read Monaco's rendered content from the DOM. */
const readEditor = (page) =>
  page.evaluate(() => {
    // Monaco renders each line in a .view-line inside .view-lines.
    const lines = [...document.querySelectorAll('.view-lines .view-line')];
    if (lines.length === 0) return null;
    // Monaco renders trailing whitespace as &nbsp;; normalise so an exact
    // string compare against the seeded snippet is byte-honest.
    return lines
      .map((line) => line.textContent.replace(/\u00a0/g, ' '))
      .join('\n');
  });

const waitForEditorText = async (page, expected, { timeout = 20000 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await readEditor(page);
    if (text !== null && expected(text)) return text;
    await sleep(300);
  }
  return null;
};

/** Polls a page-side getter until it satisfies `test`, returning the last value. */
const waitFor = async (get, test, { timeout = 10000 } = {}) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await get();
    if (test(last)) return last;
    await sleep(300);
  }
  return last;
};

const login = async (page) => {
  await page.goto(`${CLIENT}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15000 });
};

/** Create a room with an explicit language via the REST API. */
const createRoom = async (language) => {
  const loginRes = await fetch(`${API_HOST}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const name = `Lang E2E ${language} ${Math.random().toString(36).slice(2, 6)}`;
  const res = await fetch(`${API_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginRes.accessToken}` },
    body: JSON.stringify({ name, isPublic: true, language }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`room create failed: ${res.status} ${JSON.stringify(body)}`);
  return { id: body.room._id, name };
};

/** Open the room editor and wait for Monaco to render. */
const openRoom = async (page, roomId) => {
  await page.goto(`${CLIENT}/room/${roomId}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.view-lines .view-line', { timeout: 25000 });
  // The seed arrives as a Yjs update; give the binding a beat to apply it.
  await sleep(1200);
};

/**
 * Switch language through the real status-bar dropdown, the way a user does.
 * The trigger shows the CURRENT language; the target is picked from the open
 * list. Uses in-page HTMLElement.click() rather than puppeteer element
 * handles — Monaco's rendering makes handle-based clicks hang.
 */
const switchLanguage = async (page, label) => {
  // The status bar's picker is the only LanguageSelect on the room page.
  const opened = await page.evaluate(() => {
    const trigger = document.querySelector('button[aria-haspopup="listbox"]');
    if (!trigger) return false;
    trigger.click();
    return true;
  });
  if (!opened) throw new Error('no language trigger on the page');
  await page.waitForSelector('[role="listbox"]', { timeout: 5000 });
  await sleep(250);
  const clicked = await page.evaluate((target) => {
    const option = [...document.querySelectorAll('[role="listbox"] [role="option"] button')].find(
      (b) => b.textContent.trim().startsWith(target)
    );
    if (!option) return false;
    option.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`no listbox option "${label}"`);
};

/** Is the room's confirm dialog on screen right now? */
const dialogOpen = (page) =>
  page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));

/**
 * Resolves the confirm dialog: 'replace' rewrites the sample, 'keep' leaves the
 * document alone, 'cancel' (the X) abandons the switch entirely. Returns true
 * once a button has been clicked, false if the dialog never showed up.
 */
const resolveSnippetDialog = async (page, choice, { timeout = 10000 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const clicked = await page.evaluate((which) => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!dialog) return false;
      const button =
        which === 'cancel'
          ? dialog.querySelector('button[aria-label="Close dialog"]')
          : dialog.querySelector(`button[data-testid="${which}-snippet"]`);
      if (!button) return false;
      button.click();
      return true;
    }, choice);
    if (clicked) return true;
    await sleep(250);
  }
  return false;
};

/**
 * Waits a beat to see whether the confirm dialog turns up. Returns true when it
 * never does — the expected answer for an untouched snippet or real content,
 * where the switch must not interrupt the user.
 */
const noDialogAppeared = async (page, { timeout = 2500 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await dialogOpen(page)) return false;
    await sleep(200);
  }
  return true;
};

const statusBarLabel = (page) =>
  page.evaluate(() => document.querySelector('button[aria-haspopup="listbox"]')?.textContent.trim() ?? null);

// JS vs TS snippets share their comment lines and the console.log call, so
// the discriminators have to be the function signature, which differs.
const hasJsSnippet = (text) =>
  text.includes('// Welcome to CodeSync') && text.includes('function greet(name) {');
const hasTsSnippet = (text) => text.includes('function greet(name: string): string');
const hasPySnippet = (text) =>
  text.includes('# Welcome to CodeSync') && text.includes('def greet(name: str)');

const tmpProfile = path.join(os.tmpdir(), `codesync-lang-${Date.now()}`);
const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  userDataDir: tmpProfile,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
});

const consoleErrors = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log('\n== login ==');
  await signup();
  await login(page);
  check('logged in', page.url().includes('/dashboard'), page.url());

  // ─────────────────────────────────────────────────────────────────────
  // 1. A room created as PYTHON must seed the Python snippet immediately —
  //    not the JS one. This is the "brand new room, correct default" case.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 1. new room created as Python seeds the Python snippet ==');
  const pyRoom = await createRoom('python');
  console.log(`  created ${pyRoom.name} (${pyRoom.id})`);
  await openRoom(page, pyRoom.id);

  const pySeed = await waitForEditorText(page, hasPySnippet);
  check('editor shows the PYTHON snippet on open', hasPySnippet(pySeed ?? ''), JSON.stringify(pySeed).slice(0, 120));
  check('editor does NOT show the JS snippet', !hasJsSnippet(pySeed ?? ''), '');
  check('Python snippet is idiomatic (def + type hint)', (pySeed ?? '').includes('def greet(name: str) -> str:'), '');

  // The status bar must agree the room is Python, not still javascript.
  const pyBadge = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button[aria-haspopup="listbox"]')];
    return buttons.map((b) => b.textContent.trim());
  });
  check('status bar reports Python', pyBadge.some((b) => b.startsWith('Python')), JSON.stringify(pyBadge));

  // ─────────────────────────────────────────────────────────────────────
  // 2. Switching an UNTOUCHED starter to another language replaces it, and
  //    the replacement syncs to a second tab in the same room.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 2. switch untouched snippet → content replaces + syncs ==');
  const jsRoom = await createRoom('javascript');
  await openRoom(page, jsRoom.id);

  const jsSeed = await waitForEditorText(page, hasJsSnippet);
  check('fresh JS room shows the JS snippet', hasJsSnippet(jsSeed ?? ''), JSON.stringify(jsSeed).slice(0, 120));

  // A second tab joins the same room to witness the broadcast.
  const page2 = await browser.newPage();
  page2.setDefaultTimeout(20000);
  await login(page2);
  await openRoom(page2, jsRoom.id);
  const jsSeed2 = await waitForEditorText(page2, hasJsSnippet);
  check('second tab sees the same JS snippet', hasJsSnippet(jsSeed2 ?? ''), '');

  // Switch JS → Python through the real dropdown. This is the exact case in
  // the bug report: highlighting changed but the JS snippet stayed put.
  await switchLanguage(page, 'Python');
  check('untouched snippet swaps with NO confirmation dialog', await noDialogAppeared(page), 'dialog appeared');
  await sleep(1500);

  const pyText = await waitForEditorText(page, hasPySnippet, { timeout: 12000 });
  check('tab 1 content was replaced with the PYTHON snippet', hasPySnippet(pyText ?? ''), JSON.stringify(pyText).slice(0, 120));
  check('tab 1 no longer shows the JS snippet', !hasJsSnippet(pyText ?? ''), JSON.stringify(pyText).slice(0, 120));

  // The replacement must have broadcast as an ordinary Yjs edit.
  const pyText2 = await waitForEditorText(page2, hasPySnippet, { timeout: 12000 });
  check('tab 2 received the PYTHON snippet over sync', hasPySnippet(pyText2 ?? ''), JSON.stringify(pyText2).slice(0, 120));

  // The language itself must have propagated too — this is the regression that
  // made the switch look broken: the snippet arrived on the other browser but
  // Monaco kept highlighting it as JavaScript. The status bar's selector is the
  // user-visible reflection of the state that drives the model language.
  const label2 = await waitFor(
    () => page2.evaluate(() => document.querySelector('button[aria-haspopup="listbox"]')?.textContent.trim() ?? ''),
    (v) => v.startsWith('Python'),
    { timeout: 10000 }
  );
  console.log(`    tab 2 status bar language: ${label2}`);
  check('tab 2 language mode FOLLOWED the switch', String(label2).startsWith('Python'), `got ${label2}`);

  // The room's persisted language must follow the dropdown.
  const refreshRes = await fetch(`${API_HOST}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const refreshJson = await refreshRes.json();
  const persisted = await fetch(`${API_HOST}/api/rooms/${jsRoom.id}`, {
    headers: { Authorization: `Bearer ${refreshJson.accessToken}` },
  }).then((r) => r.json());
  check('room language persisted as python', persisted.room?.language === 'python', `got ${persisted.room?.language}`);

  await page2.close();

  // ─────────────────────────────────────────────────────────────────────
  // 3. The document still has the welcome banner but has been edited on top.
  //    Too close to call, so the room must ASK — and "Keep my content" must
  //    leave the document byte-for-byte alone.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 3. edited sample prompts; Keep my content preserves it ==');
  await openRoom(page, jsRoom.id);
  await waitForEditorText(page, hasPySnippet);

  // Type an unmistakable line into the real editor via Monaco's textarea.
  const textarea = await page.$('textarea.inputarea, .monaco-editor textarea');
  if (textarea) {
    await textarea.click();
    // Monaco listens for "End" with the Ctrl modifier as go-to-end-of-line;
    // puppeteer spells that key as "End", and pressing it raw moves the
    // caret to the last line's end.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# MY REAL WORK — do not overwrite');
  } else {
    throw new Error('Monaco textarea not found; cannot type real content');
  }
  await sleep(600);
  const withWork = await readEditor(page);
  check('the typed line is in the document', (withWork ?? '').includes('# MY REAL WORK'), JSON.stringify(withWork).slice(0, 90));

  // Now switch again. This is the ambiguous case: a banner with edits on top.
  // Guessing wrong either discards the typed line or leaves the sample in the
  // wrong language, so the room has to ask.
  await switchLanguage(page, 'TypeScript');
  check('ambiguous document PROMPTS before touching it', await resolveSnippetDialog(page, 'keep'), 'confirm dialog never appeared');
  await sleep(1500);

  const afterTypedSwitch = await waitForEditorText(
    page,
    (t) => t.includes('# MY REAL WORK'),
    { timeout: 10000 }
  );
  check('typed content SURVIVED after choosing Keep', (afterTypedSwitch ?? '').includes('# MY REAL WORK'), JSON.stringify(afterTypedSwitch).slice(0, 90));
  check('TypeScript snippet was NOT swapped in', !hasTsSnippet(afterTypedSwitch ?? ''), JSON.stringify(afterTypedSwitch).slice(0, 90));
  check('the original Python body is still there', (afterTypedSwitch ?? '').includes('def greet(name: str)'), '');

  // The highlight (mode) followed the switch. window.monaco is not exposed
  // (Monaco is ESM-loaded here), so read the status bar's language label —
  // the same state that drives Monaco's model language.
  const barLabel = await statusBarLabel(page);
  console.log(`    status bar language: ${barLabel}`);
  check('the selector now reports TypeScript', barLabel?.startsWith('TypeScript') === true, `got ${barLabel}`);

  // ─────────────────────────────────────────────────────────────────────
  // 4. The SAME ambiguous document, but this time the user picks Replace —
  //    the sample must be rewritten for everyone, edits and all.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 4. same document, Replace sample rewrites it ==');
  await switchLanguage(page, 'Python');
  check('prompts again for the same document', await resolveSnippetDialog(page, 'replace'), 'confirm dialog never appeared');
  await sleep(1500);

  const replaced = await waitForEditorText(
    page,
    (t) => hasPySnippet(t) && !t.includes('# MY REAL WORK'),
    { timeout: 12000 }
  );
  check('sample was rewritten in Python', hasPySnippet(replaced ?? ''), JSON.stringify(replaced).slice(0, 90));
  check('the typed line went away with the rewrite', !(replaced ?? '').includes('# MY REAL WORK'), JSON.stringify(replaced).slice(0, 90));
  check('the full sample came back, last line included', (replaced ?? '').includes('print(greet("world"))'), JSON.stringify(replaced).slice(0, 90));

  // ─────────────────────────────────────────────────────────────────────
  // 5. Real code: no prompt, no rewrite — only the highlighting changes.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 5. real code is left alone, highlight only ==');
  const codeRoom = await createRoom('javascript');
  await openRoom(page, codeRoom.id);
  await waitForEditorText(page, hasJsSnippet);

  const REAL_CODE = [
    'export function parseInventory(rows) {',
    '  return rows.map((row) => ({',
    '    sku: row.sku.trim(),',
    '    quantity: Number(row.quantity) || 0,',
    '    updatedAt: new Date(row.updatedAt),',
    '  }));',
    '}',
    '',
    'export function totalQuantity(items) {',
    '  return items.reduce((sum, item) => sum + item.quantity, 0);',
    '}',
    '',
    '// Inventory totals for the nightly rollup.',
  ].join('\n');

  const realArea = await page.$('textarea.inputarea, .monaco-editor textarea');
  if (!realArea) throw new Error('Monaco textarea not found; cannot type real code');
  await realArea.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.type(REAL_CODE);
  await sleep(900);

  const beforeRealSwitch = await readEditor(page);
  check('real code is in the document', (beforeRealSwitch ?? '').includes('parseInventory'), JSON.stringify(beforeRealSwitch).slice(0, 90));
  check('the welcome banner is gone', !(beforeRealSwitch ?? '').includes('Welcome to CodeSync'), '');

  await switchLanguage(page, 'Python');
  check('real code does NOT prompt', await noDialogAppeared(page), 'unexpected confirm dialog');
  await sleep(1500);

  const afterRealSwitch = await waitForEditorText(page, (t) => t.includes('parseInventory'), { timeout: 10000 });
  check('real code survived the switch untouched', (afterRealSwitch ?? '').includes('parseInventory'), JSON.stringify(afterRealSwitch).slice(0, 90));
  check('no welcome snippet was forced in', !hasPySnippet(afterRealSwitch ?? ''), JSON.stringify(afterRealSwitch).slice(0, 90));
  check('the rollup comment is still there', (afterRealSwitch ?? '').includes('nightly rollup'), '');
  const realBar = await statusBarLabel(page);
  check('the highlighting still followed the switch', realBar?.startsWith('Python') === true, `got ${realBar}`);

  // ─────────────────────────────────────────────────────────────────────
  // 6. Reload: the language and the content must still agree afterwards —
  //    no reverting to the JavaScript default on the way back in.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 6. reload keeps language and content in agreement ==');
  await openRoom(page, jsRoom.id);
  const reloaded = await waitForEditorText(page, hasPySnippet, { timeout: 20000 });
  check('reloaded document is still the Python sample', hasPySnippet(reloaded ?? ''), JSON.stringify(reloaded).slice(0, 90));
  check('reloaded document is NOT the JS default', !hasJsSnippet(reloaded ?? ''), JSON.stringify(reloaded).slice(0, 90));
  const reloadedBar = await statusBarLabel(page);
  check('status bar still reports Python after reload', reloadedBar?.startsWith('Python') === true, `got ${reloadedBar}`);

  check('no page errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmpProfile, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '✅ ALL LANGUAGE CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
