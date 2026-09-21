# Polygone privacy policy

_Last updated: 21 September 2026_

**In short:** Polygone does not keep, send, sell or share any information about you or your browsing. It reads the
text of the shop page you are looking at, on your own device, to find the fabric composition and show a badge, and
that is all it does with it. Nothing leaves your browser.

Polygone is a free, open-source Chrome extension by [BillChungus](https://github.com/BillChungus). The source code
is at <https://github.com/BillChungus/polygone>, so everything below can be checked.

## What Polygone reads

When you open a web page, Polygone checks whether it looks like a clothing product page. If it does, Polygone
reads the page's own text and product data (the "Composition", "Materials" or "Details" section, and structured
product data such as JSON-LD) to find the fiber percentages, and shows a badge on that page. In the Chrome Web
Store's terms this is "website content": Polygone handles it to do its one job, and never keeps or sends it.

- This happens entirely on your device, inside the page you are viewing.
- The text is used only while it is being worked out. It is not saved, logged or sent anywhere.
- Polygone looks only for fabric information. It does not read or keep your browsing history, cookies, anything you
  type into forms, passwords or account details.

## What Polygone stores

Only your settings: the main on/off switch, and the list of websites you have turned Polygone off for. They are kept
in Chrome's extension storage (`chrome.storage.sync`). If you are signed in to Chrome with sync turned on, Chrome may
copy these settings between your own devices; that is done by Chrome, and Polygone never receives them. Turning a
site back on in the toolbar popup removes it from the list, and removing Polygone from Chrome deletes its settings
from your browser.

## What Polygone sends

Nothing. Polygone makes no network requests. It has no servers, accounts, analytics, tracking or advertising, and it
loads no code from anywhere: everything it runs is in the extension package.

## Optional: "Report wrong reading"

If Polygone reads a page wrongly, the details panel has a "Report wrong reading" button. It shows you the exact report
first: the page's web address without its query string or `#fragment`, what Polygone showed, the fabric text it read
from the page, Polygone's version number, and an optional comment you can type.

Polygone does not send the report. If you click the link, your browser opens GitHub's "new issue" page for this
project with the report text in the page address, so GitHub receives it at that moment. It is only posted if you
press GitHub's submit button, and issues on this project are **public**: anyone can read them. Please don't put
personal information in the comment. GitHub's own privacy statement applies to anything you send there.

## Why Polygone asks for its permissions

- **Access to all websites** (a content script): a garment can be on any shop's website, so Polygone has to be
  able to look at a product page wherever it is. It only reads the page as described above and adds the badge.
- **`activeTab`**: when you open the toolbar popup, Polygone reads the name of the site in the current tab so it can
  show "On for _site_" and let you turn Polygone off or on for that site.
- **`storage`**: to keep the settings described above.

## Selling, sharing and other uses

Polygone does not sell or share user data, does not use it for advertising, creditworthiness or lending, and no one
reads it, because it never leaves your device. Polygone's handling of user data follows the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including its [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) requirements.

## Children

Polygone is not directed at children, and it keeps no data about anyone.

## Changes

If this policy changes, the new version will be published at this address with a new date. The full history is
public in the project's repository.

## Contact

Questions or concerns: open an issue at <https://github.com/BillChungus/polygone/issues>. Issues are public, so
please don't include personal information.
