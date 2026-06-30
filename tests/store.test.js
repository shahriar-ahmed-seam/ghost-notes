/*
 * Ghost Notes — store logic tests (no browser required).
 * Run: node tests/store.test.js
 * Mocks chrome.storage.local with an in-memory object.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- mock chrome ------------------------------------------------------------
function makeChrome(initial) {
  const data = Object.assign({}, initial || {});
  return {
    runtime: { lastError: null },
    crypto: undefined,
    storage: {
      local: {
        get(keys, cb) {
          let out = {};
          if (keys === null || keys === undefined) {
            out = JSON.parse(JSON.stringify(data));
          } else if (Array.isArray(keys)) {
            keys.forEach((k) => { if (k in data) out[k] = data[k]; });
          } else if (typeof keys === 'string') {
            if (keys in data) out[keys] = data[keys];
          } else {
            Object.keys(keys).forEach((k) => { out[k] = (k in data) ? data[k] : keys[k]; });
          }
          cb(JSON.parse(JSON.stringify(out)));
        },
        set(obj, cb) {
          Object.assign(data, JSON.parse(JSON.stringify(obj)));
          if (cb) cb();
        },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete data[k]);
          if (cb) cb();
        }
      }
    },
    __data: data
  };
}

// ---- load store.js into a sandbox -------------------------------------------
function loadStore(chromeMock) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'store.js'), 'utf8');
  const sandbox = { chrome: chromeMock, crypto: { randomUUID: () => rid() }, console, URL };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.GhostStore;
}

let _c = 0;
function rid() { _c++; return 'uuid-' + _c.toString().padStart(4, '0'); }

// ---- tiny test framework ----------------------------------------------------
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ` (got ${JSON.stringify(a)})`); }
async function test(name, fn) {
  try { await fn(); console.log('• ' + name); }
  catch (e) { failed++; console.error('  ✗ THREW in "' + name + '": ' + e.stack); }
}

// ---- tests ------------------------------------------------------------------
(async function run() {
  console.log('\nGhost Notes — store tests\n');

  await test('matchKey ignores hash but keeps query', () => {
    const S = loadStore(makeChrome());
    eq(S.matchKeyFor('https://x.com/a?b=1#frag'), 'https://x.com/a?b=1', 'matchKey strips hash');
    ok(S.matchKeyFor('https://x.com/a') !== S.matchKeyFor('https://x.com/b'), 'different paths differ');
    eq(S.matchKeyFor('not a url'), 'not a url', 'invalid url falls back to raw');
  });

  await test('domainFor extracts hostname', () => {
    const S = loadStore(makeChrome());
    eq(S.domainFor('https://sub.example.com/x'), 'sub.example.com', 'hostname');
    eq(S.domainFor('garbage'), '', 'invalid -> empty');
  });

  await test('normalizeNote fills defaults + clamps color/scope', () => {
    const S = loadStore(makeChrome());
    const n = S.normalizeNote({ url: 'https://x.com/p#h', color: 'neon', scope: 'weird' });
    eq(n.color, 'yellow', 'bad color clamped');
    eq(n.scope, 'url', 'bad scope clamped');
    eq(n.domain, 'x.com', 'domain derived');
    eq(n.matchKey, 'https://x.com/p', 'matchKey derived');
    ok(typeof n.id === 'string' && n.id.length > 0, 'id assigned');
    ok(n.createdAt > 0 && n.updatedAt > 0, 'timestamps set');
  });

  await test('create / update / delete round-trip', async () => {
    const S = loadStore(makeChrome());
    const note = await S.createNote('https://a.com/x', { content: 'hello' });
    let all = await S.getNotes();
    eq(Object.keys(all).length, 1, 'one note stored');
    const upd = await S.updateNote(note.id, { content: 'changed', title: 'T' });
    eq(upd.content, 'changed', 'content updated');
    ok(upd.updatedAt >= note.updatedAt, 'updatedAt advanced');
    const del = await S.deleteNote(note.id);
    ok(del === true, 'delete returns true');
    all = await S.getNotes();
    eq(Object.keys(all).length, 0, 'note removed');
    ok((await S.updateNote('missing', {})) === null, 'update missing -> null');
    ok((await S.deleteNote('missing')) === false, 'delete missing -> false');
  });

  await test('scope matching: url / domain / global', async () => {
    const S = loadStore(makeChrome());
    const urlNote = S.normalizeNote({ url: 'https://a.com/p?q=1#x', scope: 'url' });
    const domNote = S.normalizeNote({ url: 'https://a.com/anything', scope: 'domain' });
    const glob = S.normalizeNote({ url: 'https://z.com/', scope: 'global' });

    ok(S.noteMatchesPage(urlNote, 'https://a.com/p?q=1#other'), 'url matches ignoring hash');
    ok(!S.noteMatchesPage(urlNote, 'https://a.com/p?q=2'), 'url differs by query');
    ok(S.noteMatchesPage(domNote, 'https://a.com/totally/other'), 'domain matches any path');
    ok(!S.noteMatchesPage(domNote, 'https://b.com/x'), 'domain rejects other host');
    ok(S.noteMatchesPage(glob, 'https://anything.dev/y'), 'global matches everywhere');
  });

  await test('getNotesForPage returns only matching', async () => {
    const S = loadStore(makeChrome());
    await S.createNote('https://a.com/1', { scope: 'url' });
    await S.createNote('https://a.com/2', { scope: 'domain' });
    await S.createNote('https://b.com/9', { scope: 'global' });
    const here = await S.getNotesForPage('https://a.com/1');
    eq(here.length, 3, 'url(self) + domain + global all match');
    const elsewhere = await S.getNotesForPage('https://a.com/2');
    eq(elsewhere.length, 2, 'domain + global match on /2 (the url-note was for /1)');
    const other = await S.getNotesForPage('https://c.com/x');
    eq(other.length, 1, 'only global matches on unrelated site');
  });

  await test('legacy migration converts {url:text} and is idempotent', async () => {
    const chromeMock = makeChrome({
      'https://old.com/page': 'legacy note',
      'https://old.com/two': 'second',
      'gn_settings': { theme: 'dark' }
    });
    const S = loadStore(chromeMock);
    const r1 = await S.migrateLegacy();
    ok(r1.migrated === true && r1.count === 2, 'migrated 2 legacy notes');
    const notes = await S.getNotes();
    eq(Object.keys(notes).length, 2, 'two notes after migration');
    ok(!('https://old.com/page' in chromeMock.__data), 'legacy key removed');
    const contents = Object.values(notes).map((n) => n.content).sort();
    eq(contents, ['legacy note', 'second'], 'content preserved');
    const r2 = await S.migrateLegacy();
    ok(r2.migrated === false, 'second run is a no-op');
  });

  await test('export/import v2 round-trips', async () => {
    const S = loadStore(makeChrome());
    await S.createNote('https://a.com/1', { content: 'one' });
    await S.createNote('https://a.com/2', { content: 'two' });
    const dump = S.exportData(await S.getNotes(), await S.getSettings());
    eq(dump.schema, 2, 'schema tagged');

    const S2 = loadStore(makeChrome());
    const res = await S2.importData(dump, 'replace');
    eq(res.total, 2, 'imported 2');
    const notes = await S2.getNotes();
    eq(Object.values(notes).map((n) => n.content).sort(), ['one', 'two'], 'content matches');
  });

  await test('import legacy map works', async () => {
    const S = loadStore(makeChrome());
    const res = await S.importData({ 'https://x.com/a': 'hi', 'bad': 'skip', 'https://x.com/b': 'yo' }, 'merge');
    eq(res.total, 2, 'only valid http(s) keys imported');
  });

  await test('import rejects garbage', async () => {
    const S = loadStore(makeChrome());
    let threw = false;
    try { await S.importData(42, 'merge'); } catch (e) { threw = true; }
    ok(threw, 'non-object import throws');
  });

  await test('settings merge keeps defaults', async () => {
    const S = loadStore(makeChrome());
    const s1 = await S.getSettings();
    eq(s1.defaultColor, 'yellow', 'default color');
    await S.setSettings({ fontSize: 18 });
    const s2 = await S.getSettings();
    eq(s2.fontSize, 18, 'fontSize saved');
    eq(s2.autoShow, true, 'other defaults retained');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
