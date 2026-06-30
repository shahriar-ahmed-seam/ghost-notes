/*
 * Ghost Notes — service worker (background.js)
 * Handles: install/migration, context menus, keyboard commands, badge count.
 */
importScripts('lib/store.js');

const MENU_ADD = 'gn_add_note';
const MENU_ADD_SELECTION = 'gn_add_from_selection';
const MENU_OPTIONS = 'gn_open_options';

// ---- install / update -------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await GhostStore.migrateLegacy();
  } catch (e) {
    console.warn('[Ghost Notes] migration failed', e);
  }
  buildMenus();
  if (details.reason === 'install') {
    // Open the options page once so new users see what's available.
    chrome.runtime.openOptionsPage().catch(() => {});
  }
});

chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(buildMenus);

// ---- context menus ----------------------------------------------------------

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ADD,
      title: 'Add a Ghost Note here',
      contexts: ['page', 'frame', 'editable', 'link', 'image']
    });
    chrome.contextMenus.create({
      id: MENU_ADD_SELECTION,
      title: 'New Ghost Note from "%s"',
      contexts: ['selection']
    });
    chrome.contextMenus.create({ id: 'gn_sep', type: 'separator', contexts: ['all'] });
    chrome.contextMenus.create({
      id: MENU_OPTIONS,
      title: 'Ghost Notes settings…',
      contexts: ['all']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_OPTIONS) {
    chrome.runtime.openOptionsPage().catch(() => {});
    return;
  }
  if (!tab || tab.id == null) return;
  const payload = { action: 'createNote' };
  if (info.menuItemId === MENU_ADD_SELECTION && info.selectionText) {
    payload.content = info.selectionText;
  }
  sendToTab(tab.id, payload);
});

// ---- keyboard commands ------------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await activeTab();
  if (!tab || tab.id == null) return;
  if (command === 'create_note') sendToTab(tab.id, { action: 'createNote' });
  if (command === 'toggle_notes') sendToTab(tab.id, { action: 'toggleNotes' });
});

// ---- badge: number of notes on the active tab -------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[GhostStore.NOTES_KEY]) {
    refreshBadgeForActiveTab();
  }
});

chrome.tabs.onActivated.addListener(refreshBadgeForActiveTab);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete' || info.url) refreshBadgeForActiveTab();
});

async function refreshBadgeForActiveTab() {
  try {
    const tab = await activeTab();
    if (!tab || !tab.url) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const notes = await GhostStore.getNotesForPage(tab.url);
    const count = notes.length;
    chrome.action.setBadgeBackgroundColor({ color: '#764ba2' });
    chrome.action.setBadgeText({
      text: count > 0 ? String(count > 99 ? '99+' : count) : '',
      tabId: tab.id
    });
  } catch (e) {
    // 'tabs' permission is not requested, so tab.url may be undefined on some
    // pages — fail silently rather than spam the console.
  }
}

// ---- helpers ----------------------------------------------------------------

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve((tabs && tabs[0]) || null);
    });
  });
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    // Swallow "receiving end does not exist" on pages where the content
    // script can't run (chrome://, Web Store, PDF viewer, etc.).
    void chrome.runtime.lastError;
  });
}
