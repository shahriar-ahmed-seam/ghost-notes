<div align="center">

# 👻 Ghost Notes

### Sticky notes for the web — pin them anywhere, they remember where they belong.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-39%20passing-brightgreen.svg)](tests/store.test.js)
[![No tracking](https://img.shields.io/badge/privacy-100%25%20local-success.svg)](PRIVACY.md)

Drag a note onto any page, type your thoughts, and forget about it. The next time you visit, your note is right where you left it.

</div>

---

## ✨ Features

- 🗒️ **Multiple notes per page** — stack as many as you need, each independently positioned and sized.
- 🎯 **Smart scopes** — pin a note to **this page**, the **whole site**, or **every website** you visit.
- 🎨 **Seven colour themes** — yellow, pink, green, blue, purple, orange, slate.
- 🧲 **Drag, resize & collapse** — position, dimensions, and collapsed state are all remembered.
- 💾 **Auto-save** — every keystroke is saved locally, debounced for performance.
- 🔄 **Live sync across tabs** — edit a global note in one tab and watch it update in another instantly.
- 🔎 **Powerful manager popup** — search, filter by scope, and jump straight to any note.
- ⌨️ **Keyboard shortcuts** — `Ctrl/Cmd + Shift + Y` to add, `Ctrl/Cmd + Shift + U` to show/hide.
- 🖱️ **Right-click integration** — "Add a Ghost Note here" or create one straight from selected text.
- 🌗 **Light / dark / system theme** for the popup and settings.
- ⬆️⬇️ **Backup & restore** — export everything to JSON and import it anywhere (legacy v2 backups supported).
- 🔒 **100% private** — all data lives in your browser. No accounts, no servers, no tracking.
- 🧭 **SPA-aware** — works on single-page apps (YouTube, Gmail, etc.) that change the URL without reloading.

---

## 📦 Installation

### From source (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `Ghost Notes` folder.
5. Pin the 👻 icon to your toolbar and you're set.

### From the Chrome Web Store

> Coming soon — see [STORE_LISTING.md](STORE_LISTING.md) for the submission package.

---

## 🚀 Usage

| Action | How |
| --- | --- |
| Add a note to the current page | Click the toolbar icon → **Add note to this page**, press `Ctrl+Shift+Y`, or right-click → *Add a Ghost Note here* |
| Note from selected text | Select text on a page → right-click → *New Ghost Note from "…"* |
| Move a note | Drag it by its coloured header |
| Resize | Drag the bottom-right corner |
| Collapse | Click the **–** button in the header |
| Change colour | Click **🎨** and pick a swatch |
| Change scope | Use the dropdown in the note footer (*This page / This site / Everywhere*) |
| Hide all notes | Press `Ctrl+Shift+U` |
| Manage / search all notes | Click the toolbar icon |
| Settings | Toolbar icon → ⚙️, or right-click → *Ghost Notes settings…* |

The badge on the toolbar icon shows how many notes live on the current page.

---

## 🧱 Project structure

```
Ghost Notes/
├─ manifest.json        # MV3 manifest (action, background, commands, content scripts)
├─ background.js        # service worker: migration, context menus, commands, badge
├─ content.js           # injected note UI, drag/resize, live sync, SPA handling
├─ content.css          # note styling (CSS variables per colour theme)
├─ popup.html/.css/.js  # manager popup: list, search, filter, backup
├─ options.html/.css/.js# settings page
├─ lib/
│  └─ store.js          # shared storage layer + data model + migration
├─ tests/
│  └─ store.test.js     # 39 unit tests (no browser needed)
├─ scripts/
│  └─ pack.js           # builds the store-ready zip
└─ icons/icon.png
```

### Data model

Notes are stored in `chrome.storage.local` under `gn_notes` as an id-keyed map:

```jsonc
{
  "id": "n_…",
  "scope": "url | domain | global",
  "url": "https://example.com/path",
  "matchKey": "https://example.com/path",  // origin+pathname+search (no hash)
  "domain": "example.com",
  "title": "",
  "content": "…",
  "color": "yellow",
  "x": 60, "y": 60, "w": 260, "h": 220,
  "collapsed": false,
  "createdAt": 0, "updatedAt": 0
}
```

Backups from the original `{ "url": "text" }` format are migrated automatically on update.

---

## 🧪 Development

```bash
npm test     # run the 39-test logic suite
npm run zip  # produce ghost-notes-v<version>.zip for the Web Store
```

The test suite mocks `chrome.storage.local` and covers URL matching, scope logic, CRUD, legacy migration, and import/export round-trips — no browser required.

---

## 🔐 Privacy

Ghost Notes stores everything locally in your browser and makes **zero** network requests. See [PRIVACY.md](PRIVACY.md).

---

## 🛠️ Regenerating the icons & promo art

Icons and store promo tiles are generated from a dependency-free script that
draws the ghost mascot as a vector and rasterises crisp PNGs:

```bash
npm run icons
```

This produces `icons/icon{16,32,48,128}.png` plus
`store/promo-small-440x280.png` and `store/promo-marquee-1400x560.png`.
`icons/icon.svg` is the editable vector master.

---

## 📄 License

[MIT](LICENSE) © Ghost Notes
