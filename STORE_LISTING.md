# Chrome Web Store — Listing Copy

Reference copy for submitting Ghost Notes to the Chrome Web Store.

## Name (≤ 45 chars)
```
Ghost Notes — Sticky Notes for the Web
```

## Summary / short description (≤ 132 chars)
```
Pin draggable sticky notes to any web page. Multiple notes, colours, smart scopes, instant search, and private local backup.
```

## Category
Productivity

## Language
English

## Detailed description

```
Ghost Notes turns any web page into a notepad. Drag a sticky note onto a page,
jot down a thought, and it stays exactly where you left it — automatically, the
next time you visit.

WHY YOU'LL LOVE IT

• Multiple notes per page — stack as many as you need, each moved, resized, and
  coloured independently.
• Smart scopes — pin a note to THIS PAGE, the WHOLE SITE, or EVERY website you
  browse. Perfect for to-dos, research, reminders, and reading notes.
• Seven colours to organise at a glance.
• Drag, resize, and collapse — and every bit of that state is remembered.
• Auto-save — every keystroke is stored instantly. Nothing to click, nothing to
  lose.
• Live sync across tabs — edit a note in one tab, see it update in another.
• Powerful manager — search across all your notes, filter by scope, and jump
  straight to the page a note belongs to.
• Keyboard shortcuts — Ctrl+Shift+Y to add a note, Ctrl+Shift+U to show/hide.
• Right-click to add a note, or create one straight from selected text.
• Light, dark, and system themes.
• Backup & restore your notes as a JSON file — your data, your control.
• Works on single-page apps like YouTube and Gmail.

PRIVACY FIRST

Ghost Notes stores everything locally in your browser. No accounts. No servers.
No tracking. No data ever leaves your device unless you export it yourself.

Get organised without leaving the page. Install Ghost Notes and start pinning.
```

## Permission justifications (for review)

- **storage** — Save the user's notes and preferences locally on their device.
- **activeTab** — Add a note to the page the user is currently viewing when they click the action button or a context-menu item.
- **contextMenus** — Provide right-click options to add a note or create one from selected text.
- **Host access (`<all_urls>`)** — The content script displays saved notes on the sites where the user created them. It reads only the page's URL to decide which notes to show; it does not read or transmit page content, and makes no network requests.

## Single purpose statement

```
Ghost Notes lets users create and manage sticky notes pinned to web pages, with
all data stored locally in the browser.
```

## Suggested search tags / keywords

```
sticky notes, notes, web notes, annotation, annotate, reminders, to-do,
productivity, page notes, research, bookmarks, memo, post-it, highlighter
```

## Assets checklist

- [ ] 128×128 store icon (PNG)
- [ ] At least one 1280×800 (or 640×400) screenshot
- [ ] Small promo tile 440×280 (optional)
- [ ] Marquee promo 1400×560 (optional)
- [ ] Privacy policy URL (host PRIVACY.md or link to the repo)
```
