/**
 * content.js
 * Entry point. Loaded last, after parser.js, detect.js, report.js, badge.js and settings.js
 * (order is set in manifest.json; they share the Polygone namespace).
 *
 * Flow: load settings -> run() now -> re-run (throttled) when the page changes or the URL changes
 * -> stop re-scanning once a confident result is shown.
 *
 * This runs on every page the person visits, so it has to be cheap and hard to break:
 *  - Re-scans are THROTTLED, not debounced. A debounce restarts its timer on every DOM change, so a page that
 *    changes constantly (carousel, chat widget, video player) would never get scanned at all.
 *  - The gap between scans grows with the page's age (quick while details load, rare afterwards), so a page
 *    that never shows a fabric list can't keep the CPU busy for as long as the tab is open.
 *  - The observer watches the whole document, not just <body>: frameworks that swap <body> on navigation
 *    (Turbo, htmx, Barba) would otherwise leave it attached to a detached node and the extension silently dead.
 *  - A scan that throws is contained; it never breaks the page or later scans.
 */
(async function () {
  const NS = window.Polygone;

  const DEFAULTS = NS.settings.DEFAULTS;
  const SETTLE_MS = 3000; // wait this long before admitting "material not found"

  // Minimum time between scans, by how long the page has been open.
  const gapFor = (ageMs) => (ageMs < 3_000 ? 400 : ageMs < 15_000 ? 1_500 : ageMs < 90_000 ? 4_000 : 10_000);

  // A page change only matters if it could change the answer: new text that could be about fabric or add a
  // cart button, or structured data (JSON-LD and og:type arrive as <script>/<meta>). Carousels, timers, ads and
  // chat widgets change the page constantly and never match, so they no longer cost a scan.
  const RELEVANT = /%|poly|poli|聚酯|material|fabric|composition|cotton|nylon|wool|linen|silk|viscose|rayon|elastane|spandex|lycra|acrylic|lining|shell|add to (?:bag|cart|basket)|@type/i;

  let settings = { ...DEFAULTS };
  try {
    settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  } catch (e) {
    console.debug("[Polygone] storage unavailable, using defaults", e);
  }

  let pageStart = Date.now();
  let currentHref = location.href;
  let lastKey = "";        // avoids re-rendering an identical badge
  let settledHref = "";    // URL for which we already showed a confident result
  let dismissed = false;   // user pressed "Hide on this page"
  let lastRunAt = 0;
  let timer = 0;

  const siteDisabled = () => !NS.settings.isOn(settings, location.hostname);

  // Results that will not change if we look again.
  const isFinal = (r) => ["found", "partial", "none", "unrecognised"].includes(r.status) && r.confidence === "high";

  function resetForNewPage() {
    currentHref = location.href;
    pageStart = Date.now();
    lastKey = "";
    settledHref = "";
    dismissed = false;
    // The old badge describes a different product. Without this it stays on screen while the new page's
    // details load (up to SETTLE_MS), showing the wrong garment's fabric.
    NS.badge.remove();
  }

  function scan() {
    if (location.href !== currentHref) resetForNewPage();
    if (siteDisabled() || dismissed) return NS.badge.remove();
    if (!document.body) return; // XML/SVG documents
    if (settledHref === location.href && document.getElementById(NS.badge.HOST_ID)) return; // done until URL or settings change

    if (!NS.isProductPage()) {
      lastKey = "";
      return NS.badge.remove();
    }

    const result = NS.analyzePage();

    // Details often load late. Don't flash "not found" until the page has settled.
    const pending = ["unknown", "possible", "named"].includes(result.status);
    if (pending && Date.now() - pageStart < SETTLE_MS) return;

    const key = JSON.stringify([result.status, result.plasticPct, result.hints, result.snippet, result.parts, result.fibers, result.unrecognised]);
    // Same result and the badge is still there: nothing to do. If the page removed our badge, put it back.
    if (key === lastKey && document.getElementById(NS.badge.HOST_ID)) return;
    lastKey = key;

    NS.badge.render(result, {
      onDismiss: () => {
        dismissed = true;
        NS.badge.remove();
      },
    });

    if (isFinal(result)) settledHref = location.href;
  }

  function run() {
    lastRunAt = Date.now();
    try {
      scan();
    } catch (e) {
      console.debug("[Polygone] scan failed", e);
    }
  }

  // Run soon, but never more often than the gap allows. An already-pending run is kept (that is what stops a
  // busy page starving the scan) unless the caller needs a fresh one right away (settings changed, new URL).
  function schedule(delay = 0, { force = false } = {}) {
    if (timer && !force) return;
    clearTimeout(timer);
    const gap = force ? 0 : gapFor(Date.now() - pageStart);
    const wait = Math.max(delay, lastRunAt + gap - Date.now(), 0);
    timer = setTimeout(() => {
      timer = 0;
      run();
    }, wait);
  }

  // Our own badge being added must not trigger another scan.
  const isOurs = (n) => n.id === NS.badge.HOST_ID;
  const onlyOurAdditions = (m) =>
    m.target === document.documentElement && m.addedNodes.length > 0 && [...m.addedNodes].every(isOurs) && m.removedNodes.length === 0;

  // Should this change cause a scan?
  function matters(m) {
    if (m.type === "characterData") return RELEVANT.test(m.target.data);
    // The page removed our badge: look again, so it comes back.
    for (const n of m.removedNodes) if (isOurs(n)) return true;
    for (const n of m.addedNodes) {
      if (isOurs(n)) continue;
      if (n.nodeType === 3) { if (RELEVANT.test(n.data)) return true; }
      else if (n.nodeType === 1) {
        if (n.tagName === "SCRIPT" || n.tagName === "META") return true; // structured data / og:type
        if (RELEVANT.test(n.textContent)) return true;
      }
    }
    return false;
  }

  // Infinite scroll, lazy-loaded accordions, client-side rendering. characterData catches text that a framework
  // updates in place (React/Vue set nodeValue), which childList alone would not report.
  new MutationObserver((mutations) => {
    // A new URL always matters (client-side navigation), whether or not the Navigation API told us.
    if (location.href !== currentHref) return schedule(800, { force: true });
    if (mutations.some((m) => !onlyOurAdditions(m) && matters(m))) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // SPA route changes (Navigation API is available in Chrome 102+).
  window.navigation?.addEventListener("navigatesuccess", () => schedule(800, { force: true }));

  // React to popup changes without a reload.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        settings[key] = newValue ?? DEFAULTS[key];
      }
      lastKey = "";
      settledHref = "";
      schedule(0, { force: true });
    });
  } catch (e) {
    console.debug("[Polygone] settings changes will not apply until reload", e);
  }

  run();
  setTimeout(run, SETTLE_MS + 100); // surface "not found" if nothing showed up
})();
