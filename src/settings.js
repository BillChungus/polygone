/**
 * settings.js
 * Setting names, defaults and the "is Polygone on here?" rule. Shared by the content script
 * (content.js) and the toolbar popup (popup/popup.js), so both agree on what counts as turned off.
 * Pure functions, no chrome.* calls.
 *
 * Stored in chrome.storage.sync: { enabled: boolean, disabledHosts: string[] }
 *
 * Exposes: Polygone.settings = { DEFAULTS, normalizeHost, hostDisabled, isOn }
 */
(function () {
  const NS = (window.Polygone = window.Polygone || {});

  const DEFAULTS = { enabled: true, disabledHosts: [] };

  // "WWW.Amazon.co.uk" -> "amazon.co.uk"
  const normalizeHost = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

  // Stored values come from chrome.storage and can be anything if that data was ever damaged or written by an
  // older version. A wrong type must never make the "is it on?" question throw: that would silently switch
  // Polygone off on every page.
  const cleanHosts = (v) => (Array.isArray(v) ? v.filter((h) => typeof h === "string") : []);

  // A stored "amazon.co.uk" also covers www.amazon.co.uk and any other subdomain of it.
  function hostDisabled(settings, hostname) {
    const host = normalizeHost(hostname);
    return cleanHosts(settings && settings.disabledHosts).some((h) => {
      const d = normalizeHost(h);
      return d !== "" && (host === d || host.endsWith("." + d));
    });
  }

  const isOn = (settings, hostname) => !(settings && settings.enabled === false) && !hostDisabled(settings, hostname);

  NS.settings = { DEFAULTS, normalizeHost, hostDisabled, isOn, cleanHosts };
})();
