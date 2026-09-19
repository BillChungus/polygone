/**
 * badge.js
 * Floating badge in a shadow root (site CSS can't leak in or out).
 * All text is set via textContent / append(string), never innerHTML, so
 * scraped page text can't inject markup.
 *
 * Color follows the plastic percentage, and is always backed up by text:
 *   red    - more than HIGH_ABOVE (10)% plastic
 *   orange - some plastic, up to and including 10%
 *   green  - 0% plastic (composition found and adds up)
 *   grey with a dashed edge - uncertain: "possible" (product name says fleece
 *            or satin, no fabric list) and "unknown" (no usable composition;
 *            NOT the same as green)
 * orange with a dashed edge - "named": the page says the fabric is polyester (etc.) but gives no
 *            percentages, so plastic is certain and the amount is unknown.
 * Garments with several parts (shell, lining, ...) get one box per part, each colored on its own.
 *
 * Exposes: PolyCheck.badge = { render(result, opts), remove(), HOST_ID }
 */
(function () {
  const NS = (window.PolyCheck = window.PolyCheck || {});
  const HOST_ID = "polycheck-host";

  const CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .wrap {
      --ink: #161a1f; --paper: #ffffff; --line: #c3cbd4; --muted: #4a5563;
      --red: #b42318;     --red-bg: #fdecea;
      --orange: #d95f02;  --orange-bg: #ffeddc;
      --green: #146c43;   --green-bg: #e4f4ea;
      --grey: #4a5563;    --grey-bg: #edf0f3;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--ink);
    }
    @media (prefers-color-scheme: dark) {
      .wrap {
        --ink: #eef1f4; --paper: #1b2027; --line: #3b444f; --muted: #aab4c0;
        --red: #ff6459;     --red-bg: #3d1512;
        --orange: #ffa73d;  --orange-bg: #3a2510;
        --green: #6fd39b;   --green-bg: #12301f;
        --grey: #aab4c0;    --grey-bg: #262c34;
      }
    }
    .high     { --accent: var(--red);    --bg: var(--red-bg); }
    .low      { --accent: var(--orange); --bg: var(--orange-bg); }
    .none     { --accent: var(--green);  --bg: var(--green-bg); }
    .named    { --accent: var(--orange); --bg: var(--orange-bg); }
    .possible, .unknown { --accent: var(--grey); --bg: var(--grey-bg); }

    .pills { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

    .pill {
      all: unset; box-sizing: border-box; cursor: pointer;
      display: flex; flex-direction: column; gap: 2px;
      max-width: min(320px, calc(100vw - 32px));
      padding: 8px 14px 8px 12px;
      background: var(--bg); color: var(--ink);
      border: 1px solid var(--line); border-left: 6px solid var(--accent);
      border-radius: 6px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    .pill.possible, .pill.unknown, .pill.named { border-left-style: dashed; }
    .part  { font-size: 11px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
    .title { font-size: 15px; font-weight: 650; }
    .note  { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }

    .panel {
      box-sizing: border-box; width: min(320px, calc(100vw - 32px));
      padding: 12px 14px; font-size: 13px;
      background: var(--paper); border: 1px solid var(--line);
      border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .panel h2 { all: unset; display: block; font-weight: 650; margin-bottom: 6px; }
    .panel ul { margin: 0 0 8px; padding-left: 18px; }
    .panel p  { margin: 0 0 8px; color: var(--muted); }
    .panel blockquote {
      margin: 0 0 8px; padding-left: 8px; color: var(--muted);
      border-left: 2px solid var(--line); overflow-wrap: anywhere;
    }
    .muted { color: var(--muted); }
    .link { all: unset; cursor: pointer; text-decoration: underline; }
    .link:focus-visible, .pill:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  `;

  const SOURCE_LABEL = {
    jsonld: "the page's product data",
    labeled: "a details section",
    state: "the page's embedded data",
    scan: "general page text (less certain)",
  };
  const DISPLAY = { elastane: "spandex/elastane", polyurethane: "polyurethane (PU)", pvc: "PVC" };
  const HINT_NOTE = {
    fleece: "Fleece is usually polyester.",
    satin: "Satin is often polyester, but can be silk.",
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "type" || k === "role" || k.startsWith("aria-")) node.setAttribute(k, v);
      else node[k] = v;
    }
    node.append(...children); // strings become text nodes: safe
    return node;
  }

  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtFiber = (f) =>
    `${fmt(f.pct)}% ${f.recycled ? "recycled " : ""}${DISPLAY[f.name] || f.name}`;

  // Plastic fibers in bold so they stand out in the breakdown.
  function fiberNodes(fibers) {
    const out = [];
    fibers.forEach((f, i) => {
      if (i) out.push(", ");
      out.push(NS.isPlastic(f.name) ? el("strong", {}, fmtFiber(f)) : fmtFiber(f));
    });
    return out;
  }

  // Red above this many percent plastic; orange at or below it (but above 0).
  const HIGH_ABOVE = 10;
  const colorFor = (pct) => (pct > HIGH_ABOVE ? "high" : "low");
  // For "partial", the worst single part (lining, fill, ...) drives the color.
  const worstOtherPart = (r) =>
    Math.max(...r.otherParts.map((p) => p.fibers.reduce((a, f) => a + f.pct, 0)));

  function describe(r) {
    switch (r.status) {
      case "found":
        return {
          state: colorFor(r.plasticPct),
          title: `Plastic ${fmt(r.plasticPct)}%`,
          note: r.breakdown.map(fmtFiber).join(", "),
        };
      case "partial":
        return {
          state: colorFor(worstOtherPart(r)),
          title: "Plastic in other parts",
          note: r.otherParts
            .map((p) => `${cap(p.label || "other part")}: ${p.fibers.map(fmtFiber).join(", ")}`)
            .join("; "),
        };
      case "possible":
        return {
          state: "possible",
          title: "May contain plastic",
          note: `${r.hints.map(cap).join(" and ")} in the name; fabric not listed`,
        };
      case "named":
        return { state: "named", title: "Contains plastic", note: "Amounts not found" };
      case "none":
        return { state: "none", title: "No plastic fibers", note: "Fabric is listed and has none" };
      default:
        return { state: "unknown", title: "Material not found", note: "No fabric percentages on this page" };
    }
  }

  // One box per garment part. Each part is colored by its own plastic percentage.
  function describePart(p) {
    const part = p.label ? cap(p.label) : "Main fabric";
    if (p.plasticPct > 0) {
      return { part, state: colorFor(p.plasticPct), title: `Plastic ${fmt(p.plasticPct)}%`, note: p.breakdown.map(fmtFiber).join(", ") };
    }
    if (p.complete) return { part, state: "none", title: "No plastic fibers", note: "Fabric is listed and has none" };
    return { part, state: "unknown", title: "Material not found", note: "Percentages don't add up" };
  }

  const isMultiPart = (r) => r.parts?.length > 1 && ["found", "partial", "none"].includes(r.status);

  function buildPanel(r, opts) {
    const kids = [el("h2", {}, "How this was read")];

    if (r.segments?.length) {
      kids.push(
        el("ul", {}, ...r.segments.map((s) =>
          el("li", {}, el("span", { class: "muted" }, `${s.label ? cap(s.label) : "Fabric"}: `), ...fiberNodes(s.fibers))
        ))
      );
      kids.push(el("p", {}, `Read from ${SOURCE_LABEL[r.tier] || "the page"}. Counted as plastic: polyester, nylon, acrylic, spandex/elastane, PVC.`));
      if (r.snippet) kids.push(el("blockquote", {}, r.snippet));
    } else if (r.status === "named") {
      const names = r.fibers.map((f) => DISPLAY[f] || f).join(", ");
      kids.push(el("p", {}, `The page names ${names} but gives no percentages, so we can't say how much plastic there is.`));
      if (r.snippet) kids.push(el("blockquote", {}, r.snippet));
    } else {
      kids.push(el("p", {}, "We couldn't find a fabric breakdown. Look for a tag photo or a Details section on the retailer's page."));
    }

    if (r.status === "possible") {
      kids.push(el("p", {}, `${r.hints.map((h) => HINT_NOTE[h]).join(" ")} Check the retailer's fabric list to be sure.`));
    }

    kids.push(el("p", {}, "Retailer labels can be wrong or incomplete. If you have an allergy, check the garment tag."));

    // TODO: "Report wrong reading" button here. Send URL + snippet only with explicit user consent.
    const hide = el("button", { class: "link", type: "button" }, "Hide on this page");
    hide.addEventListener("click", () => opts.onDismiss?.());
    kids.push(hide);

    return el("div", { class: "panel", id: "panel", hidden: true }, ...kids);
  }

  function remove() {
    document.getElementById(HOST_ID)?.remove();
  }

  function render(result, opts = {}) {
    remove();
    const items = isMultiPart(result) ? result.parts.map(describePart) : [describe(result)];

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;

    const panel = buildPanel(result, opts);
    const pills = items.map((d) =>
      el(
        "button",
        { class: `pill ${d.state}`, type: "button", "aria-expanded": "false", "aria-controls": "panel" },
        ...(d.part ? [el("span", { class: "part" }, d.part)] : []),
        el("span", { class: "title" }, d.title),
        el("span", { class: "note" }, d.note)
      )
    );
    // Every box opens the same details panel.
    const toggle = () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      pills.forEach((p) => p.setAttribute("aria-expanded", String(opening)));
    };
    pills.forEach((p) => p.addEventListener("click", toggle));

    root.append(style, el("div", { class: "wrap", role: "status" }, panel, el("div", { class: "pills" }, ...pills)));
    document.documentElement.append(host); // not <body>: avoids body transforms breaking position:fixed
  }

  NS.badge = { render, remove, HOST_ID };
})();
