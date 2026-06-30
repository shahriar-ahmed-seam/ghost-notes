/*
 * Ghost Notes — shared storage layer (lib/store.js)
 * Loaded in: content script, popup, options, service worker.
 * Defines a single global: GhostStore
 *
 * Data model (chrome.storage.local):
 *   gn_notes:    { [id]: Note }
 *   gn_settings: Settings
 *   gn_migrated: boolean   (legacy {url:text} -> notes migration flag)
 *
 * Note:
 *   id        string  (unique)
 *   scope     'url' | 'domain' | 'global'
 *   url       string  full href captured at creation
 *   matchKey  string  origin+pathname+search (no hash) for 'url' scope
 *   domain    string  hostname
 *   title     string
 *   content   string
 *   color     string  key of COLORS
 *   x,y       number  position (px, viewport-fixed)
 *   w,h       number  size (px)
 *   collapsed boolean
 *   createdAt number  epoch ms
 *   updatedAt number  epoch ms
 */
(function (root) {
  'use strict';

  const NOTES_KEY = 'gn_notes';
  const SETTINGS_KEY = 'gn_settings';
  const MIGRATED_KEY = 'gn_migrated';

  const COLORS = {
    yellow: { name: 'Yellow', bg: '#fff9c4', header: '#fbc02d', text: '#4a3c06', accent: '#d4c668' },
    pink:   { name: 'Pink',   bg: '#fce4ec', header: '#f06292', text: '#5b1133', accent: '#e6a0bb' },
    green:  { name: 'Green',  bg: '#e8f5e9', header: '#66bb6a', text: '#13401a', accent: '#a5d6a7' },
    blue:   { name: 'Blue',   bg: '#e3f2fd', header: '#42a5f5', text: '#0d3357', accent: '#90caf9' },
    purple: { name: 'Purple', bg: '#f3e5f5', header: '#ab47bc', text: '#3e1247', accent: '#ce93d8' },
    orange: { name: 'Orange', bg: '#fff3e0', header: '#ffa726', text: '#5a3208', accent: '#ffcc80' },
    slate:  { name: 'Slate',  bg: '#eceff1', header: '#78909c', text: '#263238', accent: '#b0bec5' }
  };

  const DEFAULT_SETTINGS = {
    theme: 'system',        // 'system' | 'light' | 'dark'  (popup/options UI)
    defaultColor: 'yellow', // key of COLORS
    defaultScope: 'url',    // 'url' | 'domain' | 'global'
    fontSize: 14,           // note textarea font size (px)
    autoShow: true,         // auto-render saved notes on page load
    confirmDelete: true,    // confirm before deleting a note
    spellcheck: true        // textarea spellcheck
  };

  // ---- low level ----------------------------------------------------------

  function lastError() {
    return (root.chrome && chrome.runtime && chrome.runtime.lastError) || null;
  }

  function getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([NOTES_KEY, SETTINGS_KEY, MIGRATED_KEY], (res) => {
        resolve(res || {});
      });
    });
  }

  function getNotes() {
    return new Promise((resolve) => {
      chrome.storage.local.get([NOTES_KEY], (res) => {
        resolve((res && res[NOTES_KEY]) || {});
      });
    });
  }

  function setNotes(notes) {
    return new Promise((resolve, reject) => {
      const payload = {};
      payload[NOTES_KEY] = notes;
      chrome.storage.local.set(payload, () => {
        const err = lastError();
        if (err) reject(err); else resolve(notes);
      });
    });
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (res) => {
        const stored = (res && res[SETTINGS_KEY]) || {};
        resolve(Object.assign({}, DEFAULT_SETTINGS, stored));
      });
    });
  }

  function setSettings(partial) {
    return new Promise((resolve, reject) => {
      getSettings().then((current) => {
        const merged = Object.assign({}, current, partial || {});
        const payload = {};
        payload[SETTINGS_KEY] = merged;
        chrome.storage.local.set(payload, () => {
          const err = lastError();
          if (err) reject(err); else resolve(merged);
        });
      });
    });
  }

  // ---- helpers ------------------------------------------------------------

  function uid() {
    if (root.crypto && crypto.randomUUID) return 'n_' + crypto.randomUUID();
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function safeUrl(href) {
    try { return new URL(href); } catch (e) { return null; }
  }

  // Stable key for 'url' scope: ignores the hash (so SPA anchors / #routes
  // don't fragment notes) but keeps the query string.
  function matchKeyFor(href) {
    const u = safeUrl(href);
    if (!u) return href || '';
    return u.origin + u.pathname + u.search;
  }

  function domainFor(href) {
    const u = safeUrl(href);
    return u ? u.hostname : '';
  }

  function clampColor(color) {
    return COLORS[color] ? color : 'yellow';
  }

  function normalizeNote(raw) {
    const now = Date.now();
    const n = raw || {};
    return {
      id: typeof n.id === 'string' && n.id ? n.id : uid(),
      scope: ['url', 'domain', 'global'].indexOf(n.scope) >= 0 ? n.scope : 'url',
      url: typeof n.url === 'string' ? n.url : '',
      matchKey: typeof n.matchKey === 'string' ? n.matchKey : matchKeyFor(n.url || ''),
      domain: typeof n.domain === 'string' ? n.domain : domainFor(n.url || ''),
      title: typeof n.title === 'string' ? n.title : '',
      content: typeof n.content === 'string' ? n.content : '',
      color: clampColor(n.color),
      x: Number.isFinite(n.x) ? n.x : 60,
      y: Number.isFinite(n.y) ? n.y : 60,
      w: Number.isFinite(n.w) ? n.w : 260,
      h: Number.isFinite(n.h) ? n.h : 220,
      collapsed: !!n.collapsed,
      createdAt: Number.isFinite(n.createdAt) ? n.createdAt : now,
      updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : now
    };
  }

  // Does a note belong on the page identified by href?
  function noteMatchesPage(note, href) {
    if (!note) return false;
    if (note.scope === 'global') return true;
    if (note.scope === 'domain') return note.domain === domainFor(href);
    return note.matchKey === matchKeyFor(href); // 'url'
  }

  // ---- public CRUD --------------------------------------------------------

  async function createNote(href, overrides) {
    const settings = await getSettings();
    const base = normalizeNote(Object.assign({
      url: href,
      matchKey: matchKeyFor(href),
      domain: domainFor(href),
      color: settings.defaultColor,
      scope: settings.defaultScope
    }, overrides || {}));
    const notes = await getNotes();
    notes[base.id] = base;
    await setNotes(notes);
    return base;
  }

  async function updateNote(id, patch) {
    const notes = await getNotes();
    if (!notes[id]) return null;
    const merged = normalizeNote(Object.assign({}, notes[id], patch, {
      id: id,
      updatedAt: Date.now()
    }));
    notes[id] = merged;
    await setNotes(notes);
    return merged;
  }

  async function deleteNote(id) {
    const notes = await getNotes();
    if (notes[id]) {
      delete notes[id];
      await setNotes(notes);
      return true;
    }
    return false;
  }

  async function deleteAll() {
    await setNotes({});
    return true;
  }

  async function getNotesForPage(href) {
    const notes = await getNotes();
    return Object.values(notes).filter((n) => noteMatchesPage(n, href));
  }

  // ---- migration / import / export ---------------------------------------

  // Legacy format stored top-level keys: { "https://...": "note text" }.
  async function migrateLegacy() {
    const all = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
    if (all[MIGRATED_KEY]) return { migrated: false, count: 0 };

    const reserved = { [NOTES_KEY]: 1, [SETTINGS_KEY]: 1, [MIGRATED_KEY]: 1 };
    const legacyKeys = Object.keys(all).filter(
      (k) => !reserved[k] && typeof all[k] === 'string' && /^https?:\/\//i.test(k)
    );

    const notes = all[NOTES_KEY] && typeof all[NOTES_KEY] === 'object' ? all[NOTES_KEY] : {};
    let count = 0;

    for (const url of legacyKeys) {
      const text = all[url];
      if (!text) continue;
      const note = normalizeNote({
        url: url,
        matchKey: matchKeyFor(url),
        domain: domainFor(url),
        content: text,
        scope: 'url'
      });
      notes[note.id] = note;
      count++;
    }

    const writes = {};
    writes[NOTES_KEY] = notes;
    writes[MIGRATED_KEY] = true;
    await new Promise((resolve) => chrome.storage.local.set(writes, resolve));

    // Remove the old top-level keys we converted.
    if (legacyKeys.length) {
      await new Promise((resolve) => chrome.storage.local.remove(legacyKeys, resolve));
    }
    return { migrated: true, count: count };
  }

  function exportData(notes, settings) {
    return {
      app: 'Ghost Notes',
      schema: 2,
      exportedAt: new Date().toISOString(),
      settings: settings || null,
      notes: notes || {}
    };
  }

  // Accepts schema 2 exports OR legacy {url:text} maps. Returns {added, skipped}.
  async function importData(parsed, mode) {
    mode = mode || 'merge'; // 'merge' | 'replace'
    const incoming = {};

    if (parsed && parsed.schema === 2 && parsed.notes && typeof parsed.notes === 'object') {
      for (const id of Object.keys(parsed.notes)) {
        const n = normalizeNote(parsed.notes[id]);
        incoming[n.id] = n;
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        await setSettings(parsed.settings);
      }
    } else if (parsed && typeof parsed === 'object') {
      // legacy {url:text}
      for (const url of Object.keys(parsed)) {
        if (typeof parsed[url] !== 'string' || !/^https?:\/\//i.test(url)) continue;
        const n = normalizeNote({
          url: url, matchKey: matchKeyFor(url), domain: domainFor(url),
          content: parsed[url], scope: 'url'
        });
        incoming[n.id] = n;
      }
    } else {
      throw new Error('Unrecognized backup format');
    }

    const current = mode === 'replace' ? {} : await getNotes();
    let added = 0;
    for (const id of Object.keys(incoming)) {
      current[id] = incoming[id];
      added++;
    }
    await setNotes(current);
    return { added: added, total: Object.keys(current).length };
  }

  root.GhostStore = {
    NOTES_KEY, SETTINGS_KEY, MIGRATED_KEY,
    COLORS, DEFAULT_SETTINGS,
    getAll, getNotes, setNotes, getSettings, setSettings,
    createNote, updateNote, deleteNote, deleteAll, getNotesForPage,
    normalizeNote, noteMatchesPage, matchKeyFor, domainFor, safeUrl, uid,
    migrateLegacy, exportData, importData
  };
})(typeof self !== 'undefined' ? self : this);
