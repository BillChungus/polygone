/**
 * settings.js
 * Setting names, defaults and the "is Poly Check on here?" rule. Shared by the content script
 * (content.js) and the toolbar popup (popup/popup.js), so both agree on what counts as turned off.
 * Pure functions, no chrome.* calls.
 *
 * Stored in chrome.storage.sync: { enabled: boolean, disabledHosts: string[] }
 *
 * Exposes: PolyCheck.settings = { DEFAULTS, normalizeHost, hostDisabled, isOn }
 */
(function () {
  const NS = (window.PolyCheck = window.PolyCheck || {});

  const DEFAULTS = { enabled: true, disabledHosts: [] };

  // "WWW.Amazon.co.uk" -> "amazon.co.uk"
  const normalizeHost = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

  // A stored "amazon.co.uk" also covers www.amazon.co.uk and any other subdomain of it.
  function hostDisabled(settings, hostname) {
    const host = normalizeHost(hostname);
    return (settings.disabledHosts || []).some((h) => {
      const d = normalizeHost(h);
      return d !== "" && (host === d || host.endsWith("." + d));
    });
  }

  const isOn = (settings, hostname) => settings.enabled !== false && !hostDisabled(settings, hostname);

  NS.settings = { DEFAULTS, normalizeHost, hostDisabled, isOn };
})();
