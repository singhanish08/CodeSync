// Language persistence (Issue 3, REST half).
// Run from the client dir:  node language-persistence.test.mjs
//
// The room's language has to exist on the server BEFORE the editor joins and
// seeds its welcome snippet, so it is stored on the room document: set at
// creation, returned by GET, and updateable from the in-room selector.

const HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';
const API = `${HOST}/api`;

const api = async (path, { method = 'POST', body, token } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
};

const uid = Math.random().toString(36).slice(2, 8);
const r = await api('/auth/signup', {
  body: { email: `lang_${uid}@codesync.dev`, password: 'TestPass123!', displayName: 'LangTester' },
});
if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.data)}`);
const token = r.data.accessToken;
console.log('  ✓ signup works (auth path intact)');

const create = async (body) => (await api('/rooms', { body, token })).data.room;
const getLang = async (id) => (await api(`/rooms/${id}`, { method: 'GET', token })).data.room?.language;
const patchLang = async (id, language) =>
  api(`/rooms/${id}`, { method: 'PATCH', body: { language }, token });

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

console.log('\n== language persists on the room document ==');
const py = await create({ name: 'Python room', isPublic: true, language: 'python' });
check('created room reports language=python', await getLang(py._id) === 'python', `got ${await getLang(py._id)}`);

const defaultRoom = await create({ name: 'Default room', isPublic: true });
check('a room with no language defaults to javascript', await getLang(defaultRoom._id) === 'javascript', `got ${await getLang(defaultRoom._id)}`);

console.log('\n== the in-room selector updates the stored language ==');
const patched = await patchLang(py._id, 'rust');
check('PATCH returns the updated language', patched.data.room?.language === 'rust', `got ${patched.data.room?.language}`);
check('GET reflects the new language', await getLang(py._id) === 'rust', `got ${await getLang(py._id)}`);
check('PATCH only touches language (name unchanged)', patched.data.room?.name === 'Python room', `got ${patched.data.room?.name}`);

console.log('\n== unknown values are rejected, not stored ==');
const bogus = await patchLang(py._id, 'cobol');
check('a bogus language normalises to javascript', bogus.data.room?.language === 'javascript', `got ${bogus.data.room?.language}`);
const bogusCreate = await create({ name: 'Bogus create', isPublic: true, language: 'INTERCAL' });
check('a bogus create language normalises to javascript', await getLang(bogusCreate._id) === 'javascript', `got ${await getLang(bogusCreate._id)}`);

console.log('\n== membership gate still holds ==');
const other = await api('/auth/signup', {
  body: { email: `lang2_${uid}@codesync.dev`, password: 'TestPass123!', displayName: 'Outsider' },
});
const forbidden = await api(`/rooms/${py._id}`, { method: 'GET', token: other.data.accessToken });
check('a non-member still gets 403 on GET', forbidden.status === 403, `got ${forbidden.status}`);
const deniedPatch = await patchLang(py._id, 'go');
// patchLang uses the member token; verify a non-member cannot patch
const outsiderPatch = await api(`/rooms/${py._id}`, { method: 'PATCH', body: { language: 'go' }, token: other.data.accessToken });
check('a non-member cannot change the language', outsiderPatch.status === 403, `got ${outsiderPatch.status}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECKS FAILED\n`);
process.exit(failures > 0 ? 1 : 0);
