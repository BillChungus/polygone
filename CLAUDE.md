# Poly Check

Chrome extension (Manifest V3) that reads a product page's fabric composition and shows a
floating badge with how much plastic-based fiber the garment contains. Targets all retailers,
product detail pages only. No build step: plain JS content scripts.

## Layout
- `manifest.json` - one content script on `<all_urls>` loading four files IN THIS ORDER
  (they share the `window.PolyCheck` namespace, no modules/bundler):
- `src/parser.js` - pure text -> composition logic, no DOM. Fiber regex, part splitting
  ("Shell:", "Lining:"), plastic set, `summarizeComposition`, `findHints`.
- `src/detect.js` - product-page check, 4-tier extraction (JSON-LD, labeled section like
  "Composition", embedded script state (Shein), full-page scan), scoring, `analyzePage()` -> result object.
- `src/badge.js` - shadow-DOM badge (states, colors, detail panel).
- `src/content.js` - settings (chrome.storage.sync), debounced MutationObserver, SPA nav,
  settle delay, orchestration.
- `test/run.js` - end-to-end checks in jsdom (no browser needed). `npm install && npm test`.
- `test/corpus/` - saved real product pages (`pages/`, listed in `urls.txt`), checked in section 4
  of run.js. `node test/corpus/fetch.js` downloads missing ones; `inspect.js` prints what the
  extension concludes plus every fiber-like snippet on each page, for writing expectations.
  curl only sees server-rendered HTML. For sites that block curl or fill in details after load, use
  `from-capture.js`: run the snippet in its header in the browser; the result is too big for the
  tool so it is saved to a file, which the script turns into a fixture (instructions in the file).
  A few older fixtures (Zara, Old Navy, Nordstrom) were reduced by hand from the rendered DOM.

## Behavior spec (decided with the user)
- **Plastic = polyester, nylon (polyamide), acrylic, spandex (elastane/Lycra), elastomultiester, polyurethane (PU), PVC.**
  Set is `PLASTIC` in parser.js. Recycled polyester counts. Any amount counts (no threshold).
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
- Everything runs locally; no network calls, no data leaves the browser.
- Color is never the only signal: keep the text label ("Plastic 12%").
- New behavior gets a case in `test/run.js`.

## Known gaps / next steps
- Settings UI (popup/options) for enabled toggle and per-site disable. Storage plumbing exists
  in content.js (`enabled`, `disabledHosts`); no UI yet.
- "Report wrong reading" button (TODO in badge.js). Must send URL + snippet only with consent.
- Toolbar icon (none yet); would need a background service worker to color it.
- Corpus has ~50 pages: Shopify stores, Uniqlo, Amazon UK/US, Nike, Boohoo, M&S, Target, John Lewis,
  ASOS, H&M, Macy's, eBay, Etsy, Shein UK. Not covered: Next (403 to curl; text confirmed in the
  rendered DOM), Walmart (marketplace pages list no composition), Shein US (CAPTCHA, see below).
- **Shein:** the fabric is never printed on the page. It only exists in an inline script's state as
  `{"attrName":"Composition","attrValue":"94% Polyamide, 6% Elastane"}` (or `attr_name`/`attr_value`, with
  escaped quotes), read by `stateCandidates()`. Shein shows a CAPTCHA (`/risk/challenge`) after a few
  automated page loads, UK and US; do not try to get past it. Verified on 3 real UK pages only.
- Nike "Body/Gusset Lining: 75% polyester/25% elastane. Mesh: ..." is labelled just "Lining" and the
  Mesh part is ignored (numbers are right, label is not).
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
- Fixed from the corpus: fiber modifiers ("baby alpaca", "Pima"), "recycled water bottles (RPET)"
  counted as polyester, text glued across blocks ("spandexTo care"), product-page detection
  without JSON-LD/price markup.
- Listing/search pages are intentionally skipped (no materials there; fetching each product
  is heavy and ToS-risky).
- Possible on-demand mode (`activeTab` + `scripting`) instead of `<all_urls>` for easier
  Chrome Web Store review.
- Fiber list is finite: a fiber missing from `FIBER_NAMES` makes a composition sum < 100
  and lowers confidence.
