/**
 * content.js
 * Entry point. Loaded last, after parser.js, detect.js and badge.js
 * (order is set in manifest.json; they share the PolyCheck namespace).
 *
 * Flow: load settings -> run() now -> re-run (debounced) when the DOM changes
 * or the URL changes -> stop re-scanning once a confident result is shown.
 */
(async function () {
  const NS = window.PolyCheck;

  const DEFAULTS = NS.settings.DEFAULTS;
  const SETTLE_MS = 3000; // wait this long before admitting "material not found"
  const DEBOUNCE_MS = 500;

  let settings = { ...DEFAULTS };
  try {
    settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  } catch (e) {
    console.debug("[Poly Check] storage unavailable, using defaults", e);
  }

  let pageStart = Date.now();
  let currentHref = location.href;
  let lastKey = "";        // avoids re-rendering an identical badge
  let settledHref = "";    // URL for which we already showed a confident result
  let dismissed = false;   // user pressed "Hide on this page"
  let timer = 0;

  const siteDisabled = () => !NS.settings.isOn(settings, location.hostname);

  function resetForNewPage() {
    currentHref = location.href;
    pageStart = Date.now();
    lastKey = "";
    settledHref = "";
    dismissed = false;
  }

  function run() {
    if (location.href !== currentHref) resetForNewPage();
    if (siteDisabled() || dismissed) return NS.badge.remove();
    if (settledHref === location.href) return; // done until URL or settings change

    if (!NS.isProductPage()) {
      lastKey = "";
      return NS.badge.remove();
    }

    const result = NS.analyzePage();

    // Details often load late. Don't flash "not found" until the page has settled.
    const pending = ["unknown", "possible", "named"].includes(result.status);
    if (pending && Date.now() - pageStart < SETTLE_MS) return;

    const key = JSON.stringify([result.status, result.plasticPct, result.hints, result.snippet, result.parts, result.fibers]);
    if (key === lastKey) return;
    lastKey = key;

    NS.badge.render(result, {
      onDismiss: () => {
        dismissed = true;
        NS.badge.remove();
      },
    });

    if (["found", "partial", "none"].includes(result.status) && result.confidence === "high") {
      settledHref = location.href;
    }
  }

  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  // Infinite scroll, lazy-loaded accordions, client-side rendering.
  new MutationObserver(() => schedule()).observe(document.body, {
    childList: true,
    subtree: true,
  });

  // SPA route changes (Navigation API is available in Chrome 102+).
  window.navigation?.addEventListener("navigatesuccess", () => schedule(800));

  // React to popup/options changes without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue ?? DEFAULTS[key];
    }
    lastKey = "";
    settledHref = "";
    schedule(0);
  });

  run();
  setTimeout(run, SETTLE_MS + 100); // surface "not found" if nothing showed up
})();
