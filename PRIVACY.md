# Privacy Policy — Ghost Notes

_Last updated: June 30, 2026_

Ghost Notes is built privacy-first.

## What we collect

**Nothing.** Ghost Notes does not collect, transmit, sell, or share any personal
information or usage data.

## Where your notes live

- All notes and settings are stored locally in your browser using the
  `chrome.storage.local` API.
- Data never leaves your device unless **you** explicitly export it to a JSON
  file.
- There are no analytics, no telemetry, no remote servers, and no third-party
  scripts.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| `storage` | Save your notes and settings locally. |
| `activeTab` | Add a note to the page you're currently viewing. |
| `contextMenus` | Provide the right-click "Add a Ghost Note" menu. |
| `<all_urls>` (content script) | Display your saved notes on the websites where you created them. The script only reads the current page URL to decide which notes to show; it does not read or transmit page content. |

## Data deletion

You can delete individual notes from the popup, or delete everything at once
from **Settings → Danger zone → Delete all notes**. Removing the extension also
removes all locally stored data.

## Contact

Questions? Open an issue on the project's GitHub repository.
