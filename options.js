/* Ghost Notes — settings page (options.js) */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let settings = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    settings = await GhostStore.getSettings();
    buildColorPicker();
    bind();
    fill();
    refreshStats();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[GhostStore.NOTES_KEY]) refreshStats();
    });
  }

  function buildColorPicker() {
    const picker = $('colorPicker');
    picker.textContent = '';
    Object.keys(GhostStore.COLORS).forEach((key) => {
      const c = GhostStore.COLORS[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-swatch';
      b.style.background = c.header;
      b.title = c.name;
      b.setAttribute('data-color', key);
      b.addEventListener('click', () => {
        update({ defaultColor: key });
        markActiveColor(key);
      });
      picker.appendChild(b);
    });
  }

  function markActiveColor(key) {
    document.querySelectorAll('.color-swatch').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-color') === key);
    });
  }

  function bind() {
    $('theme').addEventListener('change', (e) => update({ theme: e.target.value }));
    $('defaultScope').addEventListener('change', (e) => update({ defaultScope: e.target.value }));
    $('autoShow').addEventListener('change', (e) => update({ autoShow: e.target.checked }));
    $('confirmDelete').addEventListener('change', (e) => update({ confirmDelete: e.target.checked }));
    $('spellcheck').addEventListener('change', (e) => update({ spellcheck: e.target.checked }));
    $('fontSize').addEventListener('input', (e) => {
      $('fontSizeOut').textContent = e.target.value + 'px';
    });
    $('fontSize').addEventListener('change', (e) => update({ fontSize: parseInt(e.target.value, 10) }));

    $('exportBtn').addEventListener('click', exportData);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', importData);
    $('clearBtn').addEventListener('click', clearAll);
  }

  function fill() {
    $('theme').value = settings.theme;
    $('defaultScope').value = settings.defaultScope;
    $('autoShow').checked = !!settings.autoShow;
    $('confirmDelete').checked = !!settings.confirmDelete;
    $('spellcheck').checked = !!settings.spellcheck;
    $('fontSize').value = settings.fontSize;
    $('fontSizeOut').textContent = settings.fontSize + 'px';
    markActiveColor(settings.defaultColor);
  }

  async function update(patch) {
    settings = await GhostStore.setSettings(patch);
    flash('Saved', true);
  }

  async function refreshStats() {
    const notes = await GhostStore.getNotes();
    const list = Object.values(notes);
    const domains = new Set(list.map((n) => n.domain).filter(Boolean)).size;
    $('dataStats').textContent =
      list.length + (list.length === 1 ? ' note' : ' notes') +
      ' stored across ' + domains + (domains === 1 ? ' site' : ' sites') + '.';
  }

  async function exportData() {
    const data = GhostStore.exportData(await GhostStore.getNotes(), settings);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ghost-notes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Backup exported', true);
  }

  function importData(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const res = await GhostStore.importData(parsed, 'merge');
        await refreshStats();
        if (parsed && parsed.settings) { settings = await GhostStore.getSettings(); fill(); }
        flash('Imported — ' + res.total + ' notes total', true);
      } catch (err) {
        flash('Invalid backup file', false);
      }
    };
    reader.onerror = () => flash('Could not read file', false);
    reader.readAsText(file);
  }

  async function clearAll() {
    if (!confirm('Delete ALL notes on every site? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? Consider exporting a backup first.')) return;
    await GhostStore.deleteAll();
    await refreshStats();
    flash('All notes deleted', true);
  }

  let timer = null;
  function flash(msg, ok) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status ' + (ok ? 'ok' : 'err');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2000);
  }
})();
