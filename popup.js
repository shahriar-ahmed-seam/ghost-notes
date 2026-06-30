/* Ghost Notes — popup manager (popup.js) */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const listEl = $('notesList');
  const searchEl = $('searchInput');
  const scopeFilterEl = $('scopeFilter');
  const statusEl = $('statusMsg');
  const statsEl = $('statsBar');

  let notes = {};       // id -> note
  let settings = {};
  let activeTab = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    settings = await GhostStore.getSettings();
    applyTheme(settings.theme);
    activeTab = await getActiveTab();

    await load();

    searchEl.addEventListener('input', render);
    scopeFilterEl.addEventListener('change', render);
    $('addNoteBtn').addEventListener('click', addNoteToPage);
    $('exportBtn').addEventListener('click', exportData);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', importData);
    $('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('themeBtn').addEventListener('click', cycleTheme);

    // live refresh if notes change while popup is open
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[GhostStore.NOTES_KEY]) load();
    });
  }

  async function load() {
    notes = await GhostStore.getNotes();
    render();
  }

  // ---- rendering ------------------------------------------------------------

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const scopeF = scopeFilterEl.value;
    const all = Object.values(notes);

    renderStats(all);

    let filtered = all.filter((n) => {
      if (scopeF !== 'all' && n.scope !== scopeF) return false;
      if (!q) return true;
      return (n.title && n.title.toLowerCase().includes(q)) ||
             (n.content && n.content.toLowerCase().includes(q)) ||
             (n.url && n.url.toLowerCase().includes(q)) ||
             (n.domain && n.domain.toLowerCase().includes(q));
    });

    listEl.textContent = '';

    if (all.length === 0) {
      listEl.appendChild(empty(
        'No notes yet.',
        'Open any web page and click “Add note to this page”, or press Ctrl+Shift+Y.'
      ));
      return;
    }
    if (filtered.length === 0) {
      listEl.appendChild(empty('No matches.', 'Try a different search or filter.'));
      return;
    }

    // sort newest-updated first, then group by domain
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    const groups = new Map();
    filtered.forEach((n) => {
      const key = n.scope === 'global' ? '🌐 Everywhere' : (n.domain || 'Unknown');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });

    groups.forEach((items, label) => {
      const lbl = document.createElement('div');
      lbl.className = 'gn-group-label';
      lbl.textContent = label;
      listEl.appendChild(lbl);
      items.forEach((n) => listEl.appendChild(noteRow(n)));
    });
  }

  function renderStats(all) {
    const total = all.length;
    const onThisPage = activeTab && activeTab.url
      ? all.filter((n) => GhostStore.noteMatchesPage(n, activeTab.url)).length
      : 0;
    const domains = new Set(all.map((n) => n.domain).filter(Boolean)).size;
    statsEl.textContent = total + (total === 1 ? ' note' : ' notes') +
      ' · ' + domains + (domains === 1 ? ' site' : ' sites') +
      ' · ' + onThisPage + ' on this page';
  }

  function noteRow(note) {
    const row = document.createElement('div');
    row.className = 'note-item';
    const color = GhostStore.COLORS[note.color] || GhostStore.COLORS.yellow;
    row.style.borderLeftColor = color.header;

    const info = document.createElement('div');
    info.className = 'note-info';
    info.title = note.url || note.domain;

    const top = document.createElement('div');
    top.className = 'note-top';

    const dot = document.createElement('span');
    dot.className = 'note-dot';
    dot.style.background = color.header;

    const domain = document.createElement('span');
    domain.className = 'note-domain';
    domain.textContent = note.scope === 'global' ? 'Everywhere' : (note.domain || note.url || '');

    const badge = document.createElement('span');
    badge.className = 'note-badge';
    badge.textContent = scopeLabel(note.scope);

    top.appendChild(dot);
    top.appendChild(domain);
    top.appendChild(badge);
    info.appendChild(top);

    if (note.title) {
      const t = document.createElement('div');
      t.className = 'note-title';
      t.textContent = note.title;
      info.appendChild(t);
    }

    const preview = document.createElement('div');
    preview.className = 'note-preview';
    preview.textContent = note.content
      ? note.content.replace(/\s+/g, ' ').trim()
      : '(empty note)';
    info.appendChild(preview);

    info.addEventListener('click', () => openNote(note));

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '🗑';
    del.title = 'Delete permanently';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeNote(note);
    });

    row.appendChild(info);
    row.appendChild(del);
    return row;
  }

  function scopeLabel(scope) {
    return scope === 'domain' ? 'site' : scope === 'global' ? 'global' : 'page';
  }

  function empty(title, sub) {
    const d = document.createElement('div');
    d.className = 'gn-empty';
    const strong = document.createElement('div');
    strong.style.fontWeight = '600';
    strong.style.marginBottom = '6px';
    strong.textContent = title;
    const p = document.createElement('div');
    p.textContent = sub;
    d.appendChild(strong);
    d.appendChild(p);
    return d;
  }

  // ---- actions --------------------------------------------------------------

  function openNote(note) {
    if (note.scope === 'global') {
      // global notes aren't tied to a URL — focus current tab instead
      if (activeTab && activeTab.id != null) {
        chrome.tabs.sendMessage(activeTab.id, { action: 'createNote' }, () => void chrome.runtime.lastError);
        window.close();
      }
      return;
    }
    chrome.tabs.create({ url: note.url });
  }

  async function removeNote(note) {
    if (settings.confirmDelete && !confirm('Delete this note permanently?')) return;
    await GhostStore.deleteNote(note.id);
    await load();
    flash('Note deleted', true);
  }

  async function addNoteToPage() {
    if (!activeTab || activeTab.id == null) { flash('No active tab', false); return; }
    const url = activeTab.url || '';
    if (/^(chrome|edge|about|chrome-extension|devtools|view-source):/i.test(url) ||
        url.includes('chromewebstore.google.com')) {
      flash("Can't add notes on this page", false);
      return;
    }
    chrome.tabs.sendMessage(activeTab.id, { action: 'createNote' }, () => {
      if (chrome.runtime.lastError) {
        flash('Reload the page, then try again', false);
      } else {
        window.close();
      }
    });
  }

  // ---- backup ---------------------------------------------------------------

  async function exportData() {
    const data = GhostStore.exportData(await GhostStore.getNotes(), await GhostStore.getSettings());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'ghost-notes-backup-' + stamp + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Exported ' + Object.keys(data.notes).length + ' notes', true);
  }

  function importData(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-importing same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const res = await GhostStore.importData(parsed, 'merge');
        await load();
        flash('Imported — ' + res.total + ' notes total', true);
      } catch (err) {
        flash('Invalid backup file', false);
      }
    };
    reader.onerror = () => flash('Could not read file', false);
    reader.readAsText(file);
  }

  // ---- theme ----------------------------------------------------------------

  function applyTheme(theme) {
    const dark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', dark);
  }

  async function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length];
    settings = await GhostStore.setSettings({ theme: next });
    applyTheme(next);
    flash('Theme: ' + next, true);
  }

  // ---- utils ----------------------------------------------------------------

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve((tabs && tabs[0]) || null);
      });
    });
  }

  let flashTimer = null;
  function flash(msg, ok) {
    statusEl.textContent = msg;
    statusEl.className = 'gn-status ' + (ok ? 'ok' : 'err');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'gn-status'; }, 2500);
  }
})();
