/*
 * Ghost Notes — content script (content.js)
 * Renders sticky notes onto the page, keeps them in sync across tabs, and
 * reacts to SPA navigation. Relies on the global GhostStore (lib/store.js).
 */
(function () {
  'use strict';

  // Only run in the top frame and in real document contexts.
  if (window.top !== window) return;
  if (typeof GhostStore === 'undefined') return;

  const ROOT_ID = 'ghost-notes-root';
  const rendered = new Map();   // noteId -> { el, els, note }
  let host = null;              // container appended to <body>
  let settings = Object.assign({}, GhostStore.DEFAULT_SETTINGS);
  let currentHref = location.href;
  let notesHidden = false;
  let activeEditId = null;      // note being typed in (avoid clobber on sync)
  let busyId = null;            // note being dragged/resized (avoid clobber)
  const saveTimers = new Map(); // debounced content saves

  init();

  async function init() {
    try { settings = await GhostStore.getSettings(); } catch (e) {}
    ensureHost();
    if (settings.autoShow) reconcile();
    watchStorage();
    watchNavigation();
    watchMessages();
  }

  // ---- host container -------------------------------------------------------

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    if (!document.body) {
      // body not ready yet (very early run) — retry shortly.
      window.requestAnimationFrame(ensureHost);
      return null;
    }
    host = document.getElementById(ROOT_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = ROOT_ID;
      document.body.appendChild(host);
    }
    return host;
  }

  // ---- reconcile rendered notes with storage --------------------------------

  async function reconcile() {
    if (notesHidden) return;
    if (!ensureHost()) return;
    let pageNotes;
    try { pageNotes = await GhostStore.getNotesForPage(currentHref); }
    catch (e) { return; }

    const wanted = new Map(pageNotes.map((n) => [n.id, n]));

    // Remove notes that no longer belong here.
    for (const [id, entry] of rendered) {
      if (!wanted.has(id)) {
        entry.el.remove();
        rendered.delete(id);
        clearTimer(id);
      }
    }

    // Add or update.
    for (const note of pageNotes) {
      if (rendered.has(id_(note))) updateNoteEl(note);
      else renderNote(note);
    }
  }

  function id_(n) { return n.id; }

  // ---- rendering ------------------------------------------------------------

  function renderNote(note) {
    const el = document.createElement('div');
    el.className = 'ghost-note';
    el.setAttribute('data-id', note.id);

    const header = document.createElement('div');
    header.className = 'ghost-note-header';

    const titleInput = document.createElement('input');
    titleInput.className = 'ghost-note-title';
    titleInput.type = 'text';
    titleInput.placeholder = 'Untitled note';
    titleInput.spellcheck = false;
    titleInput.value = note.title || '';

    const tools = document.createElement('div');
    tools.className = 'ghost-note-tools';

    const colorBtn = iconBtn('ghost-btn-color', '🎨', 'Change colour');
    const collapseBtn = iconBtn('ghost-btn-collapse', '–', 'Collapse / expand');
    const closeBtn = iconBtn('ghost-btn-close', '✕', 'Hide note (kept saved)');
    const deleteBtn = iconBtn('ghost-btn-delete', '🗑', 'Delete note permanently');

    tools.appendChild(colorBtn);
    tools.appendChild(collapseBtn);
    tools.appendChild(closeBtn);
    tools.appendChild(deleteBtn);

    header.appendChild(titleInput);
    header.appendChild(tools);

    // colour palette (hidden until toggled)
    const palette = document.createElement('div');
    palette.className = 'ghost-note-palette';
    Object.keys(GhostStore.COLORS).forEach((key) => {
      const sw = document.createElement('button');
      sw.className = 'ghost-swatch';
      sw.title = GhostStore.COLORS[key].name;
      sw.style.background = GhostStore.COLORS[key].header;
      sw.setAttribute('data-color', key);
      palette.appendChild(sw);
    });

    const body = document.createElement('div');
    body.className = 'ghost-note-body';

    const textarea = document.createElement('textarea');
    textarea.className = 'ghost-note-area';
    textarea.placeholder = 'Type your thoughts here…';
    textarea.spellcheck = !!settings.spellcheck;
    textarea.value = note.content || '';
    textarea.style.fontSize = (settings.fontSize || 14) + 'px';

    const footer = document.createElement('div');
    footer.className = 'ghost-note-footer';

    const scopeSelect = document.createElement('select');
    scopeSelect.className = 'ghost-note-scope';
    [['url', 'This page'], ['domain', 'This site'], ['global', 'Everywhere']]
      .forEach(([val, label]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = label;
        scopeSelect.appendChild(o);
      });
    scopeSelect.value = note.scope;

    const meta = document.createElement('span');
    meta.className = 'ghost-note-meta';

    footer.appendChild(scopeSelect);
    footer.appendChild(meta);

    body.appendChild(textarea);
    body.appendChild(footer);

    el.appendChild(header);
    el.appendChild(palette);
    el.appendChild(body);
    host.appendChild(el);

    const els = { el, header, titleInput, textarea, scopeSelect, meta, palette, collapseBtn };
    rendered.set(note.id, { el, els, note });

    applyVisual(note, els);
    wireEvents(note.id, els);
  }

  function iconBtn(cls, glyph, title) {
    const b = document.createElement('button');
    b.className = 'ghost-icon-btn ' + cls;
    b.textContent = glyph;
    b.title = title;
    b.type = 'button';
    return b;
  }

  function applyVisual(note, els) {
    const c = GhostStore.COLORS[note.color] || GhostStore.COLORS.yellow;
    const el = els.el;
    el.style.setProperty('--gn-bg', c.bg);
    el.style.setProperty('--gn-header', c.header);
    el.style.setProperty('--gn-text', c.text);
    el.style.setProperty('--gn-accent', c.accent);
    el.style.left = clampX(note.x, note.w) + 'px';
    el.style.top = clampY(note.y) + 'px';
    el.style.width = note.w + 'px';
    el.style.height = note.collapsed ? 'auto' : note.h + 'px';
    el.classList.toggle('collapsed', !!note.collapsed);
    els.collapseBtn.textContent = note.collapsed ? '+' : '–';
    updateMeta(note, els);
  }

  function updateMeta(note, els) {
    const text = note.content || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    els.meta.textContent = words + (words === 1 ? ' word' : ' words') +
      ' · ' + text.length + ' chars';
    els.meta.title = 'Updated ' + new Date(note.updatedAt).toLocaleString();
  }

  // Sync an already-rendered element with new stored data (from another tab).
  function updateNoteEl(note) {
    const entry = rendered.get(note.id);
    if (!entry) return;
    entry.note = note;
    const els = entry.els;
    if (activeEditId !== note.id) {
      if (els.textarea.value !== note.content) els.textarea.value = note.content || '';
      if (els.titleInput.value !== note.title) els.titleInput.value = note.title || '';
      els.scopeSelect.value = note.scope;
    }
    if (busyId !== note.id) {
      applyVisual(note, els);
    } else {
      updateMeta(note, els);
    }
  }

  // ---- events ---------------------------------------------------------------

  function wireEvents(id, els) {
    const { el, header, titleInput, textarea, scopeSelect, palette } = els;

    // content auto-save (debounced)
    textarea.addEventListener('focus', () => { activeEditId = id; });
    textarea.addEventListener('blur', () => { if (activeEditId === id) activeEditId = null; });
    textarea.addEventListener('input', () => {
      const entry = rendered.get(id);
      if (entry) { entry.note.content = textarea.value; updateMeta(entry.note, els); }
      debouncedSave(id, { content: textarea.value });
    });

    titleInput.addEventListener('focus', () => { activeEditId = id; });
    titleInput.addEventListener('blur', () => { if (activeEditId === id) activeEditId = null; });
    titleInput.addEventListener('input', () => {
      debouncedSave(id, { title: titleInput.value });
    });

    scopeSelect.addEventListener('change', () => {
      save(id, { scope: scopeSelect.value });
    });

    // colour palette
    els.el.querySelector('.ghost-btn-color').addEventListener('click', (e) => {
      e.stopPropagation();
      palette.classList.toggle('open');
    });
    palette.addEventListener('click', (e) => {
      const sw = e.target.closest('.ghost-swatch');
      if (!sw) return;
      const color = sw.getAttribute('data-color');
      palette.classList.remove('open');
      const entry = rendered.get(id);
      if (entry) { entry.note.color = color; applyVisual(entry.note, els); }
      save(id, { color });
    });
    document.addEventListener('mousedown', (e) => {
      if (palette.classList.contains('open') && !el.contains(e.target)) {
        palette.classList.remove('open');
      }
    });

    // collapse
    els.el.querySelector('.ghost-btn-collapse').addEventListener('click', () => {
      const entry = rendered.get(id);
      if (!entry) return;
      const collapsed = !entry.note.collapsed;
      entry.note.collapsed = collapsed;
      applyVisual(entry.note, els);
      save(id, { collapsed });
    });

    // hide (keeps note saved, just removes from view this session)
    els.el.querySelector('.ghost-btn-close').addEventListener('click', () => {
      el.remove();
      rendered.delete(id);
      clearTimer(id);
    });

    // delete permanently
    els.el.querySelector('.ghost-btn-delete').addEventListener('click', async () => {
      if (settings.confirmDelete && !window.confirm('Delete this note permanently?')) return;
      await GhostStore.deleteNote(id);
      // reconcile() via storage listener will clean the DOM up.
    });

    // bring-to-front on any interaction
    el.addEventListener('mousedown', () => bringToFront(el));

    // drag + persist size
    setupDrag(id, el, header);
    setupResizePersist(id, el);
  }

  function bringToFront(el) {
    let max = 2147483000;
    rendered.forEach((entry) => {
      const z = parseInt(entry.el.style.zIndex || '0', 10);
      if (z > max) max = z;
    });
    el.style.zIndex = String(max + 1);
  }

  // ---- save helpers ---------------------------------------------------------

  function debouncedSave(id, patch) {
    clearTimer(id);
    const t = setTimeout(() => { save(id, patch); saveTimers.delete(id); }, 350);
    saveTimers.set(id, t);
  }

  function clearTimer(id) {
    const t = saveTimers.get(id);
    if (t) { clearTimeout(t); saveTimers.delete(id); }
  }

  async function save(id, patch) {
    try { await GhostStore.updateNote(id, patch); }
    catch (e) { /* quota or transient error — ignore, UI keeps value */ }
  }

  // ---- drag -----------------------------------------------------------------

  function setupDrag(id, el, handle) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ghost-icon-btn') ||
          e.target.closest('.ghost-note-title')) return;
      e.preventDefault();
      dragging = true; busyId = id;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      bringToFront(el);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      const nx = ox + (e.clientX - sx);
      const ny = oy + (e.clientY - sy);
      el.style.left = clampX(nx, el.offsetWidth) + 'px';
      el.style.top = clampY(ny) + 'px';
    }

    function onUp() {
      if (!dragging) return;
      dragging = false; busyId = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const x = parseInt(el.style.left, 10);
      const y = parseInt(el.style.top, 10);
      const entry = rendered.get(id);
      if (entry) { entry.note.x = x; entry.note.y = y; }
      save(id, { x, y });
    }
  }

  // persist textarea/container resize
  function setupResizePersist(id, el) {
    if (typeof ResizeObserver === 'undefined') return;
    let raf = null;
    const ro = new ResizeObserver(() => {
      busyId = id;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.offsetWidth, h = el.offsetHeight;
        const entry = rendered.get(id);
        if (entry && !entry.note.collapsed &&
            (entry.note.w !== w || entry.note.h !== h)) {
          entry.note.w = w; entry.note.h = h;
          debouncedSave(id, { w, h });
        }
        busyId = null;
      });
    });
    ro.observe(el);
  }

  // ---- viewport clamping ----------------------------------------------------

  function clampX(x, w) {
    const max = Math.max(0, window.innerWidth - Math.min(w || 80, window.innerWidth));
    return Math.min(Math.max(0, x), max);
  }
  function clampY(y) {
    const max = Math.max(0, window.innerHeight - 40);
    return Math.min(Math.max(0, y), max);
  }

  // ---- live sync across tabs ------------------------------------------------

  function watchStorage() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[GhostStore.SETTINGS_KEY]) {
        settings = Object.assign({}, GhostStore.DEFAULT_SETTINGS,
          changes[GhostStore.SETTINGS_KEY].newValue || {});
        applySettingsToOpen();
      }
      if (changes[GhostStore.NOTES_KEY]) reconcile();
    });
  }

  function applySettingsToOpen() {
    rendered.forEach((entry) => {
      entry.els.textarea.style.fontSize = (settings.fontSize || 14) + 'px';
      entry.els.textarea.spellcheck = !!settings.spellcheck;
    });
  }

  // ---- SPA navigation -------------------------------------------------------

  function watchNavigation() {
    const onChange = () => {
      if (location.href === currentHref) return;
      currentHref = location.href;
      // page identity changed: drop notes that no longer match, load new ones
      for (const [id, entry] of rendered) { entry.el.remove(); clearTimer(id); }
      rendered.clear();
      if (settings.autoShow && !notesHidden) reconcile();
    };
    // history API hooks
    ['pushState', 'replaceState'].forEach((m) => {
      const orig = history[m];
      if (typeof orig === 'function') {
        history[m] = function () {
          const r = orig.apply(this, arguments);
          window.dispatchEvent(new Event('gn:locationchange'));
          return r;
        };
      }
    });
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    window.addEventListener('gn:locationchange', onChange);
    // safety net for frameworks that bypass the above
    setInterval(onChange, 1200);
    // keep notes inside the viewport on resize
    window.addEventListener('resize', () => {
      rendered.forEach((entry) => {
        const el = entry.el;
        el.style.left = clampX(parseInt(el.style.left, 10) || 0, el.offsetWidth) + 'px';
        el.style.top = clampY(parseInt(el.style.top, 10) || 0) + 'px';
      });
    });
  }

  // ---- messages from popup / background -------------------------------------

  function watchMessages() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (!req || !req.action) return;
      if (req.action === 'createNote') {
        createHere(req.content || '').then((ok) => sendResponse({ ok }));
        return true; // async response
      }
      if (req.action === 'toggleNotes') {
        toggleNotes();
        sendResponse({ ok: true, hidden: notesHidden });
        return false;
      }
      if (req.action === 'ping') { sendResponse({ ok: true }); return false; }
    });
  }

  async function createHere(content) {
    if (!ensureHost()) return false;
    if (notesHidden) toggleNotes(); // reveal so the new note is visible
    // stagger position so stacked notes don't overlap exactly
    const offset = rendered.size * 24;
    try {
      const note = await GhostStore.createNote(currentHref, {
        content: content || '',
        x: 60 + offset,
        y: 60 + offset
      });
      // render immediately (storage event will also fire, reconcile dedupes)
      if (!rendered.has(note.id)) renderNote(note);
      const entry = rendered.get(note.id);
      if (entry) {
        bringToFront(entry.el);
        (content ? entry.els.titleInput : entry.els.textarea).focus();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function toggleNotes() {
    notesHidden = !notesHidden;
    if (notesHidden) {
      rendered.forEach((entry) => { entry.el.style.display = 'none'; });
    } else {
      rendered.forEach((entry) => { entry.el.style.display = ''; });
      reconcile();
    }
  }
})();
