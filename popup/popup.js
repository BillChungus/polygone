/**
 * popup.js
 * Toolbar popup: a global on/off switch, an on/off switch for the site in the current tab, and a
 * list of sites that are turned off. Writes chrome.storage.sync; content.js listens for changes
 * and updates open pages straight away.
 *
 * All page-derived text (host names) goes in via textContent, never innerHTML.
 */
(async function () {
  const S = window.Polygone.settings;
  const $ = (id) => document.getElementById(id);

  let settings = { ...S.DEFAULTS, disabledHosts: [] };
  try {
    settings = { ...settings, ...(await chrome.storage.sync.get(S.DEFAULTS)) };
  } catch (e) {
    console.debug("[Polygone] storage unavailable, using defaults", e);
  }
  // Damaged stored data must not break the popup.
  settings.enabled = settings.enabled !== false;
  settings.disabledHosts = S.cleanHosts(settings.disabledHosts);

  // The active tab's host. Needs the activeTab permission, which the toolbar click grants.
  // Null on chrome:// pages, the Web Store, new tab, etc.
  let host = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.protocol === "http:" || url.protocol === "https:") host = S.normalizeHost(url.hostname);
  } catch { /* no tab or no access: the site switch stays hidden */ }

  // Saving can fail (Chrome's sync storage allows 8 KB per item, which a very long list of sites could hit).
  // Say so instead of leaving a switch that looks changed but was not saved.
  async function save() {
    try {
      await chrome.storage.sync.set({ enabled: settings.enabled, disabledHosts: settings.disabledHosts });
      $("save-error").hidden = true;
    } catch (e) {
      console.debug("[Polygone] could not save settings", e);
      $("save-error").textContent = "Couldn't save that change, so it won't apply.";
      $("save-error").hidden = false;
    }
  }

  function render() {
    $("enabled").checked = settings.enabled;

    // Current site
    const row = $("site-row");
    const note = $("site-note");
    if (host) {
      row.hidden = false;
      $("site-label").textContent = `On for ${host}`;
      $("site").checked = !S.hostDisabled(settings, host);
      // If the whole extension is off, this switch can't do anything.
      $("site").disabled = !settings.enabled;
      row.classList.toggle("disabled", !settings.enabled);
      note.hidden = settings.enabled;
      note.textContent = "Polygone is off everywhere.";
    } else {
      row.hidden = true;
      note.hidden = false;
      note.textContent = "Open a shop's product page to turn Polygone on or off for that site.";
    }

    // Sites turned off
    const list = $("off-list");
    list.replaceChildren();
    for (const h of settings.disabledHosts) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = h;
      const undo = document.createElement("button");
      undo.type = "button";
      undo.textContent = "Turn on";
      undo.setAttribute("aria-label", `Turn on for ${h}`);
      undo.addEventListener("click", () => {
        settings.disabledHosts = settings.disabledHosts.filter((x) => x !== h);
        save();
        render();
      });
      item.append(name, undo);
      list.append(item);
    }
    $("off-section").hidden = settings.disabledHosts.length === 0;
  }

  $("enabled").addEventListener("change", (e) => {
    settings.enabled = e.target.checked;
    save();
    render();
  });

  $("site").addEventListener("change", (e) => {
    // "On for this site" checked = not in the disabled list.
    // Turning on must also drop a parent-domain entry ("shop.com" covers "sub.shop.com").
    const rest = settings.disabledHosts.filter((h) => !S.hostDisabled({ disabledHosts: [h] }, host));
    settings.disabledHosts = e.target.checked ? rest : [...rest, host];
    save();
    render();
  });

  render();
})();
