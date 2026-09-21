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
- `LICENSE` - MIT, (c) 2026 BillChungus.
- `src/report.js` - builds the "Report wrong reading" text and the pre-filled GitHub issue link. Pure.
  `REPO` at the top is where reports go: change it if the repo is renamed or moved.
- `result.lines` (detect.js `linesOf`) is the page's own line structure for the winning block (max 12
  lines): the details panel shows it as bullets (fabric lines in bold) and reports quote it as a list.
  JSON-LD/embedded-state results have no lines and fall back to a plain quote of `snippet`.
- `src/badge.js` - shadow-DOM badge (states, colors, detail panel, report view).
- `src/settings.js` - setting names/defaults and `isOn(settings, hostname)` (www ignored, a parent
  domain covers its subdomains). Shared by content.js and the popup; pure, no chrome.* calls.
- `src/content.js` - loads settings (chrome.storage.sync), debounced MutationObserver, SPA nav,
  settle delay, orchestration. Reacts to storage changes so popup switches apply instantly.
- `popup/` - toolbar popup (popup.html/css/js): "Show plastic badges" switch, "On for <this site>"
  switch, and a list of sites turned off with "Turn on". Needs the `activeTab` permission to read the
  current tab's host; hidden on chrome:// pages. Host names are inserted with textContent only.
- `test/run.js` - end-to-end checks in jsdom (no browser needed). `npm install && npm test`.
- `test/corpus/scan.js` - `npm run scan [-- --limit 20]`: fetches ~290 real product pages from curl-friendly
  retailers (Shopify stores, M&S, Boohoo, Nike, Target), runs the detector, and writes `scan-output/report.txt`
  (gitignored) flagging unrecognised fibers, misses, low-confidence and multi-part results. Static HTML only,
  so sites that build fabric text in the browser (Aloyoga) appear as false misses. Resumable, restarts itself
  in batches (jsdom leaks memory), polite (2 requests at a time). Use it to look for new fibers and layouts.
- `test/fuzz.js` - `npm run fuzz [seed] [count]`: seeded parser stress test with an oracle (random compositions in
  ~11 formats, known true plastic %). Found the "merino wool" bug (the stray word "wool" stole the next percentage),
  dropped trailing 0.5% fibers and the nylon-grade misread. Run it after any change to FIBER_NAMES/CANON/regexes.
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

## Known gaps / next steps
- Reports become PUBLIC GitHub issues once the repo is public (the report view says so). `REPO` in report.js must
  match the public repo's name.
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
