# Changelog

All notable changes to Ghost Notes are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [3.0.0] — 2026-06-30

A full rewrite turning the single-note prototype into a production-ready,
Chrome-Web-Store-quality extension.

### Added
- Multiple notes per page, each with independent position, size, and colour.
- Note **scopes**: pin to a single page, an entire site, or every website.
- Seven colour themes with an in-note palette picker.
- Collapse/minimise notes; position, size, and collapsed state persist.
- Editable note titles and live word/character counts.
- Service worker (`background.js`) handling migration, context menus, commands, and a per-page badge counter.
- Keyboard shortcuts: `Ctrl/Cmd+Shift+Y` (add) and `Ctrl/Cmd+Shift+U` (toggle).
- Right-click context menu, including "new note from selected text".
- Settings page: theme, default colour/scope, font size, auto-show, confirm-delete, spellcheck, and a danger zone.
- Manager popup: search, scope filter, grouping by site, stats bar, and dark mode.
- Live synchronisation of notes across open tabs via `storage.onChanged`.
- SPA navigation support (history API hooks + hashchange + safety polling).
- JSON backup/restore with a versioned schema; automatic migration from the legacy `{url: text}` format.
- 39-test logic suite (`npm test`) and a store packaging script (`npm run zip`).
- MIT license, privacy policy, changelog, and store listing copy.

### Changed
- Storage moved from raw URL keys to a structured, id-keyed note model.
- Popup rendering hardened against XSS (note content is no longer injected as HTML).
- Notes are kept inside the viewport when dragged or when the window resizes.

### Fixed
- Notes from anchor/hash navigation no longer fragment into separate entries.
- Content script no longer runs inside iframes, preventing duplicate notes.

## [2.0] — Prototype
- Single draggable sticky note per URL, auto-save, search, and JSON export/import.
