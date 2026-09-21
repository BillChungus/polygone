# Polygone

Chrome extension (Manifest V3) that reads a product page's fabric composition and shows a
floating badge with how much plastic-based fiber the garment contains. Targets all retailers,
product detail pages only. No build step: plain JS content scripts.

## Naming
The extension was called "Poly Check" until 2026-09-21; it is now **Polygone**. Where the name lives: manifest
`name` and toolbar tooltip, popup title, the `window.Polygone` namespace shared by the content scripts, the badge's
DOM id `polygone-host`, `REPO` in src/report.js (`BillChungus/polygone`), package.json/lock, and the report text
("**Polygone showed:**", "_Polygone <version>_"). Chrome's extension id does not depend on the name. The local folder
may still be called `poly-check`; that is only a directory name.

## Layout
- `manifest.json` - one content script on `<all_urls>` loading six files IN THIS ORDER
  (they share the `window.Polygone` namespace, no modules/bundler):
- `src/parser.js` - pure text -> composition logic, no DOM. Fiber regex, part splitting
  ("Shell:", "Lining:"), plastic set, `summarizeComposition`, `findHints`.
- `src/detect.js` - product-page check, 4-tier extraction (JSON-LD, labeled section like
  "Composition", embedded script state (Shein), full-page scan), scoring, `analyzePage()` -> result object.
  Parts of the page that talk about OTHER products (reviews, recommendations, carousels, "compare", footer, nav) are
  skipped by `isExcluded(el)`: it matches WHOLE WORDS in class/id (camelCase split), never substrings, so a class
  like "preview" or "has-reviews" on <body> no longer blanks the page, and it stops at <body>/<html>. Keep it
  that way: a substring test once made a page with `class="product-preview"` invisible to the extension.
- `LICENSE` - MIT, (c) 2026 BillChungus. `PRIVACY.md` - the privacy policy. `store/` and `docs/demo/` - Chrome Web
  Store material (listing text, screenshots) and the made-up demo shop; see "Packaging and the Chrome Web Store".
- `src/report.js` - builds the "Report wrong reading" text and the pre-filled GitHub issue link. Pure.
  `REPO` at the top is where reports go: change it if the repo is renamed or moved. The text the extension read
  from the page is scraped, so it goes inside a fenced code block (a page can't inject markdown, links or
  @mentions into a public issue; backticks in scraped text become apostrophes so nothing closes the block
  early). The link is kept to
  `MAX_LINK` (7000) characters: `build()` shrinks the report (fewer quoted lines, then no quote, then a shorter
  comment) until it fits, because GitHub rejects very long URLs.
- `result.lines` (detect.js `linesOf`) is the page's own line structure for the winning block (max 12
  lines): the details panel shows it as bullets (fabric lines in bold) and reports quote it as a list.
  JSON-LD/embedded-state results have no lines and fall back to a plain quote of `snippet`.
- `src/badge.js` - shadow-DOM badge (states, colors, detail panel, report view).
- `src/settings.js` - setting names/defaults and `isOn(settings, hostname)` (www ignored, a parent
  domain covers its subdomains). Shared by content.js and the popup; pure, no chrome.* calls. Stored values are
  untrusted: a damaged `disabledHosts` (not a list, entries that aren't strings) or `enabled` must never switch
  the extension off everywhere, so `isOn`/`hostDisabled`/`cleanHosts` tolerate anything (tested).
- `src/content.js` - loads settings (chrome.storage.sync), MutationObserver, SPA nav, settle delay,
  orchestration. Reacts to storage changes so popup switches apply instantly. It runs on EVERY page the person
  visits, so it is built to be cheap and hard to break (see "Content script rules" below).
- `popup/` - toolbar popup (popup.html/css/js): "Show plastic badges" switch, "On for <this site>"
  switch, and a list of sites turned off with "Turn on". Needs the `activeTab` permission to read the
  current tab's host; hidden on chrome:// pages. Host names are inserted with textContent only.
- `test/run.js` - end-to-end checks in jsdom (no browser needed). `npm install && npm test`.
- `test/corpus/scan.js` - `npm run scan [-- --limit 20]`: fetches ~290 real product pages from curl-friendly
  retailers (Shopify stores, M&S, Boohoo, Nike, Target), runs the detector, and writes `scan-output/report.txt`
  (gitignored) flagging unrecognised fibers, misses, low-confidence and multi-part results. Static HTML only,
  so sites that build fabric text in the browser (Aloyoga) appear as false misses. Resumable, restarts itself
  in batches (jsdom leaks memory), polite (2 requests at a time). Use it to look for new fibers and layouts.
- `test/fuzz.js` - `npm run fuzz` (or `node test/fuzz.js <seed> <count>` for another seed/size): seeded parser stress
  test with an oracle (random compositions in ~11 formats, known true plastic %). Found the "merino wool" bug (the
  stray word "wool" stole the next percentage), dropped trailing 0.5% fibers and the nylon-grade misread. Run it
  after any change to FIBER_NAMES/CANON/regexes. Last full run: 5 seeds x 60,000 compositions, 0 wrong.
- `test/dom-fuzz.js` - `npm run fuzz:dom` (or `node test/dom-fuzz.js <seed> <documents>`): random hostile documents
  (deep/odd nesting, look-alike class names like "preview"/"reviews", zero-width text, broken JSON-LD, huge text)
  through detector + badge + report builder; checks no throw/hang, values in range, a badge always appears, report
  link fits, scraped text never becomes markup. jsdom leaks memory, so run several seeds of ~400, not one huge run.
  Last full run: 12 seeds x 400 documents, 0 problems, slowest 76 ms.
- `test/corpus/` - saved real product pages (`pages/`, listed in `urls.txt`), checked in section 4
  of run.js. `node test/corpus/fetch.js` downloads missing ones; `inspect.js` prints what the
  extension concludes plus every fiber-like snippet on each page, for writing expectations.
  curl only sees server-rendered HTML. For sites that block curl or fill in details after load, use
  `from-capture.js`: run the snippet in its header in the browser; the result is too big for the
  tool so it is saved to a file, which the script turns into a fixture (instructions in the file).
  A few older fixtures (Zara, Old Navy, Nordstrom) were reduced by hand from the rendered DOM.
  **The saved pages are not in the public repo** (they are retailers' HTML and contain third-party details,
  e.g. an eBay seller's email). `pages/*` is gitignored except the three hand-reduced fixtures. On a fresh
  clone `npm test` skips the ~49 missing pages ("SKIP ...") and still runs everything else. Maintainers keep
  the full set locally (the pre-public private repo holds a copy). To rebuild: `fetch.js` for pages curl can
  reach, `from-capture.js` for the rest. Never commit a new page: it is ignored on purpose; if a page is
  needed as a permanent public test, hand-reduce it to the fabric markup (like the Zara/Old Navy/Nordstrom ones)
  and add a `!` line to .gitignore.

## Behavior spec (decided with the user)
- **Plastic = polyester (PES/PET/PTT/Sorona), nylon (polyamide, Tactel, Cordura), aramid (Kevlar, Nomex), acrylic,
  modacrylic, polypropylene, polyolefin, polyethylene (Dyneema), polylactic acid (PLA), neoprene, spandex
  (elastane/Lycra), elastomultiester, elastodiene, elastolefin, polyurethane (PU/TPU), PVC.**
  Set is `PLASTIC` in parser.js. NOT counted: cotton, linen, wool etc., regenerated cellulose (viscose,
  modal, lyocell, cupro, acetate/triacetate), down/feathers, leather, and "other fibres" / metallic
  fibres (judgement calls: acetate is semi-synthetic, metallic threads are often polyester film). Recycled polyester counts. Any amount counts (no threshold).
- **Colors:** red if plastic > 10%, orange if > 0% and <= 10%, green if 0%.
  Cutoff is `HIGH_ABOVE` in badge.js. Percent = sum across all plastic fibers in the main fabric.
- **Multi-part garments:** one box per part ("Shell", "Lining", "Upper part", ...), each with its
  own percentage and color. Never sum across parts (100% shell + 100% lining is not 200%). Max 5
  boxes (`MAX_PARTS`); a part that doesn't add up to 100 and has no plastic gets no box unless it
  is the main fabric. `result.parts` feeds the boxes; `plasticPct`/`status` still describe the
  main fabric. All boxes open the same details panel. Parts on separate sibling lines (TK Maxx:
  "Shell: ..." and "Pockets: ..." as two <li>s) are merged by scanCandidates via their shared parent;
  part labels live in `LABEL_RE` (parser.js), so a new label word there is often the whole fix.
- **Fiber named, no percentage** ("Material: Polyester, Cotton" on eBay/Etsy/Amazon): status
  "named", box says "Contains plastic / Amounts not found" (orange, dashed edge). Only from short
  label values (`namedFiberCandidates` in detect.js), never whole-page text, and only when a
  plastic fiber is named; "Materials: Linen" stays "Material not found". Percentages always win.
- **Satin and fleece are not fibers.** They only produce "May contain plastic" when the page
  has NO readable composition and the product name mentions them ("cotton fleece" and
  "silk satin" exist; a fabric list always wins).
- **Unknown is not zero.** "No plastic" (green) is only shown when the composition sums to
  ~100%. Otherwise the badge says "Material not found" (grey, dashed edge), as does
  "May contain plastic".
- Text only in images (care-label photos) is out of scope (would need OCR).

## Rules to keep
- Never put scraped page text into `innerHTML`; badge.js builds DOM with `append(string)`.
- Use `textContent`, not `innerText`, when reading page text (collapsed accordions still count).
- Render UI in the shadow root so site CSS can't affect it. Don't use localStorage.
- Everything runs locally; no network calls, no data leaves the browser. The one exception is the
  "Report wrong reading" flow, and even that sends nothing itself: it shows the exact report text
  (page URL WITHOUT query string/#fragment, what the badge showed, the text it read, an optional
  comment) and an `<a target=_blank>` link to github.com/<REPO>/issues/new. The person presses Submit
  on GitHub. Keep it that way: no fetch/XHR/beacon/window.open for reports (tested).
- Color is never the only signal: keep the text label ("Plastic 12%").
- New behavior gets a case in `test/run.js`.
- Text from the page is data, never markup or a command: badge text is set with textContent/`append(string)`, and
  the report puts scraped text in a code block. Unrecognised fiber names can only contain letters, spaces and
  hyphens (the regex in parser.js), so they are safe outside the code block too.
- Keep source files free of invisible characters: write zero-width/soft-hyphen/mark characters as `\uXXXX`
  escapes (parser.js `tidy()`), never as literals. When editing regex-heavy code, use the editor tools, not shell
  heredocs or `node -e` strings: those silently ate backslashes several times (`\s*` became `s*`, `\n` became a
  real newline) and the tests only caught some of it.

## Content script rules (src/content.js runs on every page the person opens)
- **Throttle, don't debounce.** A debounce restarts on every DOM change, so a page that changes constantly
  (carousel, chat widget, video) is never scanned. `schedule()` keeps a pending run and enforces a minimum gap
  between scans, `gapFor(age)`: 0.4 s for the first 3 s, 1.5 s to 15 s, 4 s to 90 s, then 10 s. This cut CPU on a
  heavy product page with no fabric list from +2.2 s to +0.09 s per 20 s.
- **Only relevant changes count.** `matters()` looks at what was added (text/elements containing `%`, fibre or
  "material/composition" words, an add-to-bag button, `<script>`/`<meta>` for JSON-LD and og:type) and ignores the
  rest. Adding a fibre word to a new fabric layout? Check `RELEVANT` in content.js still covers it.
- **Observe `document.documentElement`, not `<body>`.** Turbo/htmx/Barba replace <body>; an observer on the old one
  would silently stop working. If the page removes our badge (`polygone-host`), the removal counts as relevant
  and the badge comes back.
- **A new URL resets everything** (`resetForNewPage`): the old badge is removed at once, so a client-side
  navigation never leaves the previous garment's fabric on screen while the new page loads.
- **Contain failures.** `run()` wraps `scan()` in try/catch; documents without a <body> (SVG/XML) are skipped.
- **Stop when done.** A confident result (`isFinal`) is not re-scanned until the URL or a setting changes.
- Badge: Escape closes the details panel (only when it is open, so the page still gets its own Escape) and returns
  focus to the first box; the badge is hidden when printing (`@media print`).

## Packaging and the Chrome Web Store
- The version lives in `manifest.json` and `package.json`; they must match (`npm run package` refuses otherwise).
  Currently 1.0.0. Bump both for every store upload (the store rejects a version it already has).
- `npm run package` -> `dist/polygone-<version>.zip` (dist/ is gitignored). Needs Node 22.22+/24.15+ (the same as
  jsdom; the zip writer uses `zlib.crc32`). The file list comes from the manifest (content scripts, popup and what
  it loads, icons) plus LICENSE, so tests, docs and node_modules can never ship. It checks name <= 75 and
  description <= 132 characters, 16/48/128 icons of the right size, and a valid version, then writes a
  reproducible zip (fixed order and timestamps) and reads it back to verify every checksum.
  Rebuild it after ANY code change; a zip built earlier does not contain later fixes.
- Permissions: `storage` (the on/off switch and the list of sites turned off, kept in chrome.storage.sync),
  `activeTab` (the popup reads the current tab's site name for "On for <site>"), and a content script on
  `<all_urls>` (a garment can be on any retailer's site; the script only reads the page text in the tab, makes no
  network requests, and only checks whether a page is a product page otherwise). The wording for each dashboard box
  is in `store/listing.md`.
- **Privacy is a promise in three places that must agree:** `PRIVACY.md` (the policy URL the store links to),
  the dashboard's privacy answers (in `store/listing.md`: "Website content" ticked, nothing sold or transferred), and
  what the code really does. The store removes items whose privacy fields contradict their behavior. So if the
  extension ever reads something new, stores something new, sends anything, or asks for another permission,
  update `PRIVACY.md` and `store/listing.md` in the same change. Today: reads only product-page text, on the device;
  stores only `enabled` and `disabledHosts`; no network requests (the report link is opened by the person).
- `PRIVACY.md` - the privacy policy. Store URL: https://github.com/BillChungus/polygone/blob/main/PRIVACY.md
  (works once the repo is public).
- `store/listing.md` - everything to paste into the dashboard (description, single purpose, permission
  justifications, data-usage answers, test instructions) and a submit checklist. Description rules: no shop/brand
  lists, no word more than 5 times.
- `store/screenshots/` - five 1280x800 screenshots and the 440x280 small promo tile (required by the store), made
  by `store/make-screenshots.js` in real Chrome with the extension loaded (`npm install --no-save puppeteer-core`,
  then `node store/make-screenshots.js`; needs Chrome and takes about a minute). Screenshots must be 24-bit PNG
  without alpha; the script checks size and alpha. Re-run it whenever the badge, panel or popup changes visibly.
  The promo tile is a placeholder made from the icon.
- `docs/demo/` - a made-up shop ("Linden & Co.", five product pages, one per badge state, plain static HTML). It is
  the backdrop for the screenshots and a stable page for store reviewers: with GitHub Pages on (Settings, Pages,
  branch main, folder /docs) it is at https://billchungus.github.io/polygone/demo/. Keep it free of real brands and
  photos. To try it locally: `python -m http.server -d docs/demo`, then open a page (file:// pages need "Allow access
  to file URLs" for the extension).
- Still to do before the listing goes live: make the GitHub repo PUBLIC (the report link and the privacy URL 404 for
  anyone who is not a collaborator while it is private), turn on GitHub Pages, fill in the dashboard from
  `store/listing.md` (contact email, "trader" declaration), tag `v1.0.0` after the final commit.

## Known gaps / next steps
- Reports become PUBLIC GitHub issues once the repo is public (the report view says so). `REPO` in report.js must
  match the public repo's name.
- Limits found in the 1.0.0 bug hunt, not fixed on purpose: fabric text that exists only inside a shadow DOM is
  invisible to the extension (textContent does not cross shadow roots); fibre names are English plus a few others
  (poliéster, coton, algodón, Baumwolle, 聚酯), so other languages come out as "Fiber not recognised" (never as
  "No plastic", and counted as plastic when the name looks like one: "Polyamid", "Elasthanne") and a page where
  every fibre is unknown ("70% Cotone, 30% Poliestere") gives "Material not found"; a wrapper element flagged with an excluded word (e.g. `product--has-reviews`) hides everything inside it (none
  seen in the 52 saved pages or ~290 scanned ones); pages where the composition differs per colour show one.
- Icons: the user's own design is in `icons/` (16/48/128 px PNGs, transparent), registered in the manifest
  (`icons` and `action.default_icon`). Not done: a 32 px size for sharper toolbar icons on high-DPI screens
  (Chrome scales the 48 down), and an icon that changes color per page (needs a background service worker
  and per-tab state).
- Corpus has ~50 pages: Shopify stores, Uniqlo, Amazon UK/US, Nike, Boohoo, M&S, Target, John Lewis,
  ASOS, H&M, Macy's, eBay, Etsy, Shein UK. Not covered: Next (403 to curl; text confirmed in the
  rendered DOM), Walmart (marketplace pages list no composition), Shein US (CAPTCHA, see below).
- **Target:** spec bullets live only in embedded state as `<B>Material:</B> 100% Cotton` (JSON string, often
  `<B>`); `STATE_BULLET` in detect.js reads them. Target's own data can disagree: prose says "60% cotton /
  40% polyester" while the Material spec says 50/50, and prose may list every colour's composition
  ("Birch 60/40; other solids 100% cotton; ..."). The structured spec is preferred (it is for the colour shown).
- **Shein:** the fabric is never printed on the page. It only exists in an inline script's state as
  `{"attrName":"Composition","attrValue":"94% Polyamide, 6% Elastane"}` (or `attr_name`/`attr_value`, with
  escaped quotes), read by `stateCandidates()`. Shein shows a CAPTCHA (`/risk/challenge`) after a few
  automated page loads, UK and US; do not try to get past it. Verified on 3 real UK pages only.
- Real-Chrome check: Chrome 153 ignores `--load-extension`; puppeteer-core with
  `pipe: true, enableExtensions: [path]` loads it (throwaway profile). Only real mouse clicks reach
  the badge (a synthetic `.click()` from the page world doesn't). Macy's and H&M return "Access
  Denied" to automated Chrome. A site's modal dialog (cookie banner) blocks clicks on the badge.
- **Zara:** the Composition tab is empty until clicked, but the fabric is already in the page's
  JSON-LD as `{propertyID: "Composition", name: "OUTER SHELL", value: "97% polyester, 3% elastane"}`.
  jsonLdCandidates reads propertyID and turns the name into a "Part:" label. No fetching needed;
  prefer reading data already in the page over any request. Its fixture is reduced by hand.
- Old Navy and Nordstrom fill in their details after load (curl sees none of it); fixtures are
  reduced by hand from the rendered DOM. Walmart marketplace listings often give no composition
  at all ("linen-like fabric"), which is correctly "not found".
- Amazon (curl works, ~1 MB): no JSON-LD, no itemprop price, values have no spaces
  ("70%Rayon30%Linen"), "Material Type"/"Fabric Type" rows repeat the composition, and a
  "compare with similar items" table lists other products' fabrics (excluded via "compar").
  Product detection there relies on the `/dp/` URL + "Add to basket" button.
- Real-page scan (~290 pages, 16-20 Shopify stores + M&S, Boohoo, Nike, Target; `test/corpus/scan.js`) found:
  page text with words run together ("100% PolyesterMachine wash": `tidy()` splits lowercase-to-capital and drops
  ®/™), qualifier words (tree-derived, responsibly-sourced, responsible, reclaimed, certified), "TENCEL Lyocell" as
  one fiber, numbered parts ("Gusset 1/2/3" keep their numbers), a stray comma ("10%, Spandex"). Static-HTML scans
  false-alarm on Aloyoga (fabric is in script data but rendered as text in a browser) and Jenni Kayne (nav menu).
- **Compositions that differ by colour** (Amazon "Blue Stripes are 75% polyester...; other colours 30% linen...", Target
  prose) are read as one composition; nothing tells the shopper it varies. Possible "varies by colour" note.
- Fixed from the corpus: fiber modifiers ("baby alpaca", "Pima"), "recycled water bottles (RPET)"
  counted as polyester, text glued across blocks ("spandexTo care"), product-page detection
  without JSON-LD/price markup.
- Listing/search pages are intentionally skipped (no materials there; fetching each product
  is heavy and ToS-risky).
- Possible on-demand mode (`activeTab` + `scripting`) instead of `<all_urls>` for easier
  Chrome Web Store review.
- **Unknown fibers.** The list (`FIBER_NAMES` + `CANON` + `PLASTIC` in parser.js) is finite, so a word next to a
  percentage that isn't in it is accepted as an *unrecognised* fiber only if it brings the composition to
  100% (within 2 points and closer than before): "50% off" and prices stay out. Unrecognised fibers are
  never hidden and never green: status "unrecognised" ("Fiber not recognised / Can't tell if plastic: xyz 2%"),
  listed in the panel and in reports. If the name looks like a plastic (`PLASTIC_STEMS`: poly, acryl,
  nylon, elast, ...-ester, olefin, vinyl, ...) it is counted as plastic. To teach it a new fiber, add its
  pattern to `FIBER_NAMES`, a canonical name to `CANON`, and to `PLASTIC` if it is one. Reports ("Polygone
  showed") reveal which unknown names real shoppers hit.
