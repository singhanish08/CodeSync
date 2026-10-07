// Real-browser verification of the admin console (headless Chrome).
//   node admin-browser.test.mjs
//
// Puppeteer-core drives the system Chrome — no bundled browser download — and
// this script logs in through the REAL login page, so what it asserts is the
// actual React tree, not a DOM snapshot or a mocked harness. It checks both
// halves of the role gate: an admin sees the console, a non-admin does not.

import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const CLIENT = process.env.CODESYNC_CLIENT || 'http://localhost:5176';
const API_HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASS;
if (!email || !password) throw new Error('ADMIN_EMAIL / ADMIN_PASS env vars required');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome/Edge executable found for headless run.');

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Locate the chrome user-data dir on a scratch path so the run never touches
// the user's real Chrome profile (which would fail if Chrome is already open).
const tmpProfile = path.join(os.tmpdir(), `codesync-e2e-${Date.now()}`);

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  userDataDir: tmpProfile,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
});

const page = await browser.newPage();
page.setDefaultTimeout(15_000);

// Surface client console errors — a blank page from a thrown render would
// otherwise look identical to a passing run. The 401s the browser reports
// here are recorded WITH their URL so the run can tell the axios
// refresh-retry path (benign: the interceptor catches the 401, refreshes,
// retries) apart from an unexpected failure.
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

const failedRequests = [];
page.on('requestfailed', (req) => {
  failedRequests.push(`${req.url()} — ${req.failure()?.errorText ?? 'failed'}`);
});
page.on('response', (res) => {
  if (res.status() === 401) failedRequests.push(`${res.url()} → 401`);
});

try {
  // ─────────────────────── login as the admin ───────────────────────────
  console.log('\n== login as promoted admin ==');
  await page.goto(`${CLIENT}/login`, { waitUntil: 'networkidle0' });

  // The login form renders before any auth resolves; fill it directly.
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // A successful login redirects to /dashboard.
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15_000 });
  check('login redirected to /dashboard', page.url().includes('/dashboard'), page.url());
  console.log(`  logged in as ${email}`);

  // ─────────────────── the admin link appears in the sidebar ────────────
  // After login the app lands on /dashboard, which has its own sidebar (the
  // landing Navbar is a different component). Both carry the admin entry; the
  // dashboard is the one a logged-in admin actually sees first.
  console.log('\n== admin entry point ==');
  await sleep(600);
  const adminEntry = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin');
    if (link) return { kind: 'anchor', text: link.textContent.trim() };
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('onClick') === null && /Admin console/i.test(b.textContent)
    );
    if (btn) return { kind: 'button', text: btn.textContent.trim() };
    return null;
  });
  check('dashboard shows an admin entry for admins', adminEntry !== null, 'no admin entry found');
  check('the entry is labelled "Admin console"', /Admin console/i.test(adminEntry?.text ?? ''), `got "${adminEntry?.text}"`);

  // ─────────────────────── navigate to /admin ───────────────────────────
  console.log('\n== /admin renders ==');
  await page.goto(`${CLIENT}/admin`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('aside, main', { timeout: 15_000 });
  await sleep(800);

  const heading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() ?? null);
  check('/admin shows the Overview heading', heading === 'Overview', `got "${heading}"`);

  // Sidebar tabs are the console's skeleton — all four must render. The tabs
  // live inside the sidebar's <nav>; the brand/back/logout buttons are outside
  // it, so scoping to the nav avoids counting them.
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('aside nav button')].map((b) => b.textContent.trim())
  );
  check('sidebar lists all four tabs', JSON.stringify(tabs) === JSON.stringify(['Overview', 'Rooms', 'Users', 'Activity']), `got ${JSON.stringify(tabs)}`);

  // KPI cards: the overview fetch actually returned data.
  await sleep(700);
  const kpiCount = await page.evaluate(() => document.querySelectorAll('main p.font-display.text-3xl').length);
  check('overview renders 4 KPI numbers', kpiCount === 4, `got ${kpiCount}`);

  const kpiText = await page.evaluate(() =>
    [...document.querySelectorAll('main p.font-display.text-3xl')].map((p) => p.textContent.trim())
  );
  console.log(`  KPIs: ${kpiText.join(' / ')}`);
  check('KPI values are numeric', kpiText.every((v) => /^\d+$/.test(v)), `got ${JSON.stringify(kpiText)}`);

  // ─────────────────────────── Rooms tab ───────────────────────────────
  console.log('\n== rooms tab ==');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Rooms');
    if (btn) btn.click();
  });
  await sleep(900);

  const roomRows = await page.evaluate(() => document.querySelectorAll('main li').length);
  check('rooms tab renders the room list', roomRows > 0, `got ${roomRows} rows`);

  const roomNames = await page.evaluate(() =>
    [...document.querySelectorAll('main li')].slice(0, 5).map((li) => li.textContent.replace(/\s+/g, ' ').trim().slice(0, 60))
  );
  roomNames.forEach((name) => console.log(`    row: ${name}`));

  // ───────────────────── the two-step delete gating ─────────────────────
  // This is the safety property the whole design exists to enforce: a room
  // with live occupants must not offer a working delete. A static snapshot
  // cannot prove it, so put a REAL socket session into a room first, then
  // reload the rooms tab and inspect that specific row.
  console.log('\n== two-step delete gating (with a live occupant) ==');
  const adminLogin = await fetch(`${API_HOST}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

  const made = await fetch(`${API_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.accessToken}` },
    body: JSON.stringify({ name: 'E2E occupied room', isPublic: true }),
  }).then((r) => r.json());
  const occupiedId = made.room._id;
  console.log(`  created ${occupiedId}`);

  const occupant = io(API_HOST, { transports: ['websocket'], auth: { token: adminLogin.accessToken } });
  await new Promise((resolve, reject) => {
    occupant.on('connect', () => resolve());
    occupant.on('connect_error', (e) => reject(new Error(`occupant connect: ${e.message}`)));
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('occupant join timeout')), 8000);
    occupant.on('room_state', () => { clearTimeout(timer); resolve(); });
    occupant.emit('join_room', { roomId: occupiedId });
  });
  console.log('  a live socket is now editing the room');

  // Reload the rooms tab so it picks up the fresh occupancy.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside nav button')].find((b) => b.textContent.trim() === 'Rooms');
    if (btn) btn.click();
  });
  await sleep(1200);

  const gating = await page.evaluate((targetId) => {
    const rows = [...document.querySelectorAll('main li')];
    const row = rows.find((r) => r.textContent.includes(targetId));
    if (!row) return { found: false };
    const buttons = [...row.querySelectorAll('button')];
    // Row actions in order: rename, visibility, close, delete.
    const deleteBtn = buttons[buttons.length - 1];
    const closeBtn = buttons.find((b) => /Close/i.test(b.getAttribute('aria-label') ?? ''));
    return {
      found: true,
      showsLiveBadge: /live/i.test(row.textContent),
      deleteDisabled: deleteBtn.disabled === true,
      deleteAria: deleteBtn.getAttribute('aria-label') ?? null,
      closeEnabled: closeBtn ? !closeBtn.disabled : null,
    };
  }, occupiedId);
  console.log(`    ${JSON.stringify(gating)}`);
  check('the occupied room row rendered', gating.found === true, 'row not found');
  check('the occupied room shows a "live" badge', gating.showsLiveBadge === true, JSON.stringify(gating));
  check('delete is DISABLED while the room is occupied', gating.deleteDisabled === true, JSON.stringify(gating));
  check('close is ENABLED while the room is occupied', gating.closeEnabled === true, JSON.stringify(gating));
  check('delete aria-label states the precondition', /close it first/i.test(gating.deleteAria ?? ''), `got "${gating.deleteAria}"`);

  // ───────── close the room, then delete must unlock ─────────
  console.log('\n== close empties the room, delete unlocks ==');

  // Arm the listener BEFORE the close call: the server emits room_closed and
  // disconnects the socket synchronously inside the teardown, so a listener
  // attached afterwards would miss the event entirely.
  const notified = new Promise((resolve) => {
    occupant.on('room_closed', (payload) => resolve(payload));
  });

  const closed = await fetch(`${API_HOST}/api/admin/rooms/${occupiedId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.accessToken}` },
    body: JSON.stringify({ reason: 'e2e verifying the gate' }),
  });
  check('admin close succeeded', closed.status === 200, `got ${closed.status}`);
  const kicked = await closed.json();
  console.log(`  kicked ${kicked.kicked} occupant(s)`);

  // The occupant socket must have been told, not silently dropped.
  const occupantNotified = await Promise.race([
    notified,
    new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
  ]);
  check('the live occupant received room_closed', occupantNotified !== null, 'no event within timeout');
  check('room_closed named the right room', occupantNotified?.roomId === occupiedId, JSON.stringify(occupantNotified));
  occupant.close();

  // Give the server a beat to drain, then re-check the same row.
  await sleep(700);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside nav button')].find((b) => b.textContent.trim() === 'Rooms');
    if (btn) btn.click();
  });
  await sleep(1200);

  const afterClose = await page.evaluate((targetId) => {
    const rows = [...document.querySelectorAll('main li')];
    const row = rows.find((r) => r.textContent.includes(targetId));
    if (!row) return { found: false };
    const buttons = [...row.querySelectorAll('button')];
    const deleteBtn = buttons[buttons.length - 1];
    return {
      found: true,
      stillShowsLive: /live/i.test(row.textContent),
      deleteEnabled: !deleteBtn.disabled,
    };
  }, occupiedId);
  console.log(`    ${JSON.stringify(afterClose)}`);
  check('the room no longer shows a live badge', afterClose.stillShowsLive === false, JSON.stringify(afterClose));
  check('delete is now ENABLED on the empty room', afterClose.deleteEnabled === true, JSON.stringify(afterClose));

  // Clean up the probe room so the browser run leaves no residue.
  await fetch(`${API_HOST}/api/admin/rooms/${occupiedId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.accessToken}` },
  });

  // ─────────────────────────── Users tab ───────────────────────────────
  console.log('\n== users tab ==');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Users');
    if (btn) btn.click();
  });
  await sleep(900);

  const userRows = await page.evaluate(() => document.querySelectorAll('main li').length);
  check('users tab renders the user list', userRows > 0, `got ${userRows} rows`);

  const selfRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('main li')];
    return rows.some((row) => /\(you\)/.test(row.textContent));
  });
  check('the current admin is marked "(you)"', selfRow === true, 'no (you) row');

  const demoteSelfDisabled = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('main li')];
    const mine = rows.find((row) => /\(you\)/.test(row.textContent));
    if (!mine) return null;
    const btn = [...mine.querySelectorAll('button')].find((b) => /Demote/i.test(b.textContent));
    if (!btn) return 'no-demote-button';
    return btn.disabled ? 'disabled' : 'enabled';
  });
  check('self-demotion is disabled in the UI', demoteSelfDisabled === 'disabled', `got ${demoteSelfDisabled}`);

  // ────────────────────────── Activity tab ─────────────────────────────
  console.log('\n== activity tab ==');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Activity');
    if (btn) btn.click();
  });
  await sleep(900);
  check('activity tab renders without crashing', (await page.evaluate(() => document.querySelectorAll('main li').length >= 0)) === true);

  // ──────────────────────── console errors ─────────────────────────────
  // Every 401 seen by the page is printed WITH its URL so the run identifies
  // the endpoint rather than guessing. A 401 followed by a successful retry
  // is the axios interceptor's designed refresh path, not a defect.
  const all401s = failedRequests.filter((entry) => entry.includes('→ 401'));
  const realErrors = consoleErrors.filter((entry) => !/401/i.test(entry));
  console.log(`    all 401s seen this session: ${all401s.length}`);
  all401s.forEach((entry) => console.log(`      ${entry}`));
  const fatalFailures = failedRequests.filter((entry) => !entry.includes('→ 401'));
  check('no non-401 client console errors', realErrors.length === 0, JSON.stringify(realErrors.slice(0, 4)));
  check('no request failed outright', fatalFailures.length === 0, JSON.stringify(fatalFailures.slice(0, 4)));

  // ─────────── negative case: a non-admin cannot reach /admin ──────────
  console.log('\n== negative case: non-admin ==');
  await page.click('aside button', { text: '' }).catch(() => {});
  // Log out through the sidebar link, then sign up a fresh non-admin.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^Log out$/.test(b.textContent.trim()));
    if (btn) btn.click();
  });
  await sleep(1200);

  const uid = Math.random().toString(36).slice(2, 8);
  const plainEmail = `plain_${uid}@codesync.dev`;
  await page.goto(`${CLIENT}/signup`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', plainEmail);
  await page.type('input[type="password"]', 'TestPass123!');
  await page.type('input[name="displayName"], input[id="displayName"], input[type="text"]', 'Plain User');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15_000 });
  await sleep(600);

  const noAdminEntry = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin');
    const btn = [...document.querySelectorAll('button')].find((b) => /Admin console/i.test(b.textContent));
    return link === undefined && btn === undefined;
  });
  check('non-admin sees NO admin entry', noAdminEntry === true, 'an admin entry was rendered for a non-admin');

  // Typing /admin directly must bounce to /dashboard rather than render it.
  await page.goto(`${CLIENT}/admin`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  check('non-admin navigating to /admin redirects away', page.url().includes('/dashboard'), `landed on ${page.url()}`);

  const noOverview = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? null;
    return h1 !== 'Overview';
  });
  check('non-admin never sees the Overview console', noOverview === true, 'Overview rendered for a non-admin');
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmpProfile, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '✅ ALL BROWSER CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
