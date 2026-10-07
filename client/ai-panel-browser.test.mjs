// AI panel browser test.
// Run from the temp puppeteer dir so puppeteer-core resolves:
//
//   $env:CODESYNC_CLIENT='http://localhost:5176';
//   $env:CODESYNC_HOST='http://127.0.0.1:5175';
//   node ai-panel-browser.test.mjs
//
// Confirms the three AI modes still work end to end through the real UI —
// explain streams, refactor proposes a diff, and Accept lands it in everyone's
// editor as a Yjs transaction — and that a second member sees the same stream.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLIENT = process.env.CODESYNC_CLIENT || 'http://localhost:5176';
const API_HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';

const password = 'TestPass123!';
const email = `aitest_${Math.random().toString(36).slice(2, 10)}@codesync.dev`;

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

const readEditor = (page) =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll('.view-lines .view-line')];
    if (lines.length === 0) return null;
    return lines.map((line) => line.textContent.replace(/\u00a0/g, ' ')).join('\n');
  });

const waitFor = async (get, test, { timeout = 30000 } = {}) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await get();
    if (test(last)) return last;
    await sleep(400);
  }
  return last;
};

/** Polls until a getter truthy-matches, then returns it. */
const waitForFn = async (fn, { timeout = 30000 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(400);
  }
  return null;
};

const signup = async () => {
  const res = await fetch(`${API_HOST}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'AI E2E' }),
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
};

const login = async (page) => {
  await page.goto(`${CLIENT}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15000 });
};

const createRoom = async (language = 'javascript') => {
  const loginRes = await fetch(`${API_HOST}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const name = `AI E2E ${language} ${Math.random().toString(36).slice(2, 6)}`;
  const res = await fetch(`${API_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginRes.accessToken}` },
    body: JSON.stringify({ name, isPublic: true, language }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`room create failed: ${res.status} ${JSON.stringify(body)}`);
  return { id: body.room._id, name };
};

const openRoom = async (page, roomId) => {
  await page.goto(`${CLIENT}/room/${roomId}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.view-lines .view-line', { timeout: 25000 });
  await page.waitForSelector('[data-ai-panel]', { timeout: 15000 });
  await sleep(1200);
};

/** Click one of the three mode tabs inside the AI panel. */
const clickMode = async (page, label) => {
  const clicked = await page.evaluate((target) => {
    const panel = document.querySelector('[data-ai-panel]');
    if (!panel) return false;
    const btn = [...panel.querySelectorAll('button')].find(
      (b) => b.textContent.trim().startsWith(target) && !b.disabled
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  return clicked;
};

/** The AI panel's rendered output text. */
const aiOutput = (page) =>
  page.evaluate(() => document.querySelector('[data-ai-panel] .ai-output')?.textContent.trim() ?? '');

/** True while the panel is still streaming a response. */
const aiIsStreaming = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-ai-panel]');
    if (!panel) return false;
    // The pulsing caret only renders mid-stream.
    return panel.querySelector('.ai-output .caret') !== null;
  });

/**
 * The real error box is `bg-danger/10`; the DiffView's removed lines are
 * `bg-danger/12` with `line-through`, so escaping the slash picks the box and
 * not the diff.
 */
const aiHasError = (page) =>
  page.evaluate(() => document.querySelector('[data-ai-panel] .bg-danger\\/10')?.textContent.trim() ?? '');

const tmpProfile = path.join(os.tmpdir(), `codesync-ai-${Date.now()}`);
const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  userDataDir: tmpProfile,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
});

const consoleErrors = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log('\n== setup ==');
  await signup();
  await login(page);
  check('logged in', page.url().includes('/dashboard'), page.url());

  const room = await createRoom('javascript');
  console.log(`  created ${room.name} (${room.id})`);
  await openRoom(page, room.id);
  check('AI panel rendered', Boolean(await page.$('[data-ai-panel]')), '');

  // A second member watches the same room — everything the panel does is
  // supposed to be visible to everyone in it.
  const page2 = await browser.newPage();
  page2.setDefaultTimeout(30000);
  page2.on('pageerror', (err) => consoleErrors.push(`pageerror(tab2): ${err.message}`));
  await login(page2);
  await openRoom(page2, room.id);
  const joined2 = await readEditor(page2);
  check('second tab joined the room', typeof joined2 === 'string' && joined2.length > 0, '');

  // ─────────────────────────────────────────────────────────────────────
  // 1. Explain streams a real answer.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 1. explain mode streams an answer ==');
  if (!(await clickMode(page, 'Explain'))) throw new Error('Explain button not found');

  // Wait for the stream to finish, THEN read — reading as soon as the first
  // tokens land captures a partial answer and makes the two tabs look out of
  // sync when they are not.
  await waitFor(() => aiOutput(page), (t) => t.length > 40 && !t.startsWith('…'), { timeout: 60000 });
  await waitFor(() => aiIsStreaming(page), (s) => !s, { timeout: 20000 });
  const explainText = await aiOutput(page);
  check('explain streamed a real answer', explainText.length > 200, `len=${explainText.length}`);
  check('explain finished streaming', !(await aiIsStreaming(page)), '');
  check('no AI error shown', (await aiHasError(page)).length === 0, await aiHasError(page));

  // The second member sees the same text — the stream is room-wide. Wait for
  // their stream to land before comparing, or a token still in flight makes the
  // two panels differ by a word.
  await waitFor(() => aiIsStreaming(page2), (s) => !s, { timeout: 20000 });
  const shared = await waitFor(() => aiOutput(page2), (t) => t.length > 40, { timeout: 20000 });
  const t1 = String(explainText ?? '');
  const t2 = String(shared ?? '');
  const oneIsPrefix = t1.length === t2.length ? false : t1.startsWith(t2) || t2.startsWith(t1);
  check(
    'second tab saw the same explanation',
    t1.length > 40 && t1 === t2,
    `len1=${t1.length} len2=${t2.length} oneIsPrefix=${oneIsPrefix} tail1=${JSON.stringify(t1.slice(-50))} tail2=${JSON.stringify(t2.slice(-50))}`
  );

  // ─────────────────────────────────────────────────────────────────────
  // 2. Review also works and does not error out.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 2. review mode ==');
  if (!(await clickMode(page, 'Review'))) throw new Error('Review button not found');
  await waitFor(() => aiOutput(page), (t) => t.length > 40, { timeout: 60000 });
  await waitFor(() => aiIsStreaming(page), (s) => !s, { timeout: 20000 });
  const reviewText = await aiOutput(page);
  check('review streamed a real answer', reviewText.length > 200, `len=${reviewText.length}`);
  check('review differs from the explanation', reviewText !== explainText, '');
  await waitFor(() => aiIsStreaming(page), (s) => !s, { timeout: 20000 });
  check('review finished streaming', !(await aiIsStreaming(page)), '');
  check('no AI error shown', (await aiHasError(page)).length === 0, await aiHasError(page));

  // ─────────────────────────────────────────────────────────────────────
  // 3. Refactor proposes a diff, and Accept applies it to everyone.
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n== 3. refactor mode → accept applies it to everyone ==');
  // The model is told to return an empty changes array when the code is already
  // fine, so give it something worth refactoring first. Focus the editor's
  // hidden input in-page — puppeteer's element-handle click hangs under Monaco.
  const focused = await page.evaluate(() => {
    const ta = document.querySelector('textarea.inputarea') || document.querySelector('.monaco-editor textarea');
    if (!ta) return false;
    ta.focus();
    return true;
  });
  if (!focused) throw new Error('Monaco textarea not found; cannot type refactorable code');
  await page.keyboard.type('function addTogether(first, second) {\n  var total = first + second;\n  return total;\n}');

  // Let the keystrokes reach the shared doc before summoning, and confirm both
  // members have them — the refactor reads the room's shared text.
  await waitFor(
    () => readEditor(page),
    (t) => typeof t === 'string' && t.includes('addTogether'),
    { timeout: 15000 }
  );
  await waitFor(
    () => readEditor(page2),
    (t) => typeof t === 'string' && t.includes('addTogether'),
    { timeout: 15000 }
  );
  check('both tabs have the refactorable code', true, '');

  // Snapshot AFTER the typing synced, so a later change can only be the accept.
  const before = await readEditor(page);
  const before2 = await readEditor(page2);

  if (!(await clickMode(page, 'Refactor'))) throw new Error('Refactor button not found');

  // Wait for the "Proposed changes" block with Accept/Reject buttons.
  const proposed = await waitForFn(
    () =>
      page.evaluate(() => {
        const panel = document.querySelector('[data-ai-panel]');
        if (!panel) return false;
        // The heading carries an icon and an optional name span, so match by
        // prefix rather than exact equality.
        const heading = [...panel.querySelectorAll('*')].some(
          (el) => el.textContent.trim().startsWith('Proposed changes')
        );
        if (!heading) return false;
        const btns = [...panel.querySelectorAll('button')];
        return btns.some((b) => b.textContent.trim() === 'Accept') &&
               btns.some((b) => b.textContent.trim() === 'Reject');
      }),
    { timeout: 60000 }
  );
  check('refactor proposed changes with Accept/Reject', proposed === true, `ai_error: ${await aiHasError(page)}`);

  const accepted = await page.evaluate(() => {
    const panel = document.querySelector('[data-ai-panel]');
    if (!panel) return false;
    const btn = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Accept');
    if (!btn) return false;
    btn.click();
    return true;
  });
  check('Accept clicked', accepted === true, '');

  // The "Applied — the room received the edit" confirmation.
  const applied = await waitForFn(
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-ai-panel] *')]
          .some((el) => el.textContent?.includes('the room received the edit'))
      ),
    { timeout: 20000 }
  );
  check('panel confirmed the edit was applied', applied === true, '');

  // …and the document actually changed, here and on the second tab.
  const after = await waitFor(
    () => readEditor(page),
    (t) => typeof t === 'string' && t !== before,
    { timeout: 20000 }
  );
  check('the editor text changed after accepting', after !== before && (after ?? '').length > 0, '');

  const after2 = await waitFor(
    () => readEditor(page2),
    (t) => typeof t === 'string' && t !== before2 && t.includes('addTogether'),
    { timeout: 20000 }
  );
  check(
    'second tab received the applied change too',
    typeof after2 === 'string' && after2 !== before2 && after2 === after,
    `after=${JSON.stringify(after).slice(0, 60)} after2=${JSON.stringify(after2).slice(0, 60)}`
  );

  check('no page errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmpProfile, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '✅ ALL AI PANEL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
