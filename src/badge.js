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
 * Exposes: Polygone.badge = { render(result, opts), remove(), HOST_ID }
 */
(function () {
  const NS = (window.Polygone = window.Polygone || {});
  const HOST_ID = "polygone-host";

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
    .panel ul.read {
      margin: 0 0 8px 2px; padding: 0 0 0 20px; border-left: 2px solid var(--line);
      color: var(--muted); overflow-wrap: anywhere;
    }
    .panel ul.read li.hit { color: var(--ink); }
    .panel label { display: block; margin: 0 0 4px; font-weight: 600; }
    .panel textarea {
      box-sizing: border-box; width: 100%; min-height: 52px; margin: 0 0 8px; padding: 6px 8px;
      font: inherit; color: var(--ink); background: var(--paper);
      border: 1px solid var(--line); border-radius: 4px; resize: vertical;
    }
    .panel pre {
      margin: 0 0 10px; padding: 6px 8px; max-height: 130px; overflow: auto;
      white-space: pre-wrap; overflow-wrap: anywhere;
      font: 12px/1.4 ui-monospace, Consolas, monospace; color: var(--muted);
      border: 1px solid var(--line); border-radius: 4px;
    }
    .actions { display: flex; align-items: center; gap: 14px; }
    .btn {
      all: unset; cursor: pointer; padding: 5px 10px; border-radius: 4px;
      background: var(--ink); color: var(--paper); font-size: 13px; font-weight: 600;
    }
    .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .muted { color: var(--muted); }
    .link { all: unset; cursor: pointer; text-decoration: underline; }
    .link:focus-visible, .pill:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

    /* A fixed overlay would print on top of the page. */
    @media print { .wrap { display: none; } }
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
  // "body/gusset lining" -> "Body/Gusset Lining"
  const titleCase = (s) => s.replace(/(^|[\s/])(\w)/g, (m, sep, ch) => sep + ch.toUpperCase());
  const fmtFiber = (f) =>
    `${fmt(f.pct)}% ${f.recycled ? "recycled " : ""}${DISPLAY[f.name] || f.name}`;

  // Plastic fibers in bold so they stand out in the breakdown.
  function fiberNodes(fibers) {
    const out = [];
    fibers.forEach((f, i) => {
      if (i) out.push(", ");
      const text = f.unrecognised ? `${fmtFiber(f)} (not recognised)` : fmtFiber(f);
      out.push(NS.isPlasticFiber(f) ? el("strong", {}, text) : text);
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
            .map((p) => `${titleCase(p.label || "other part")}: ${p.fibers.map(fmtFiber).join(", ")}`)
            .join("; "),
        };
      case "possible":
        return {
          state: "possible",
          title: "May contain plastic",
          note: `${r.hints.map(cap).join(" and ")} in the name; fabric not listed`,
        };
      case "unrecognised":
        return { state: "unknown", title: "Fiber not recognised", note: unrecognisedNote(r.unrecognised) };
      case "named":
        return { state: "named", title: "Contains plastic", note: "Amounts not found" };
      case "none":
        return { state: "none", title: "No plastic fibers", note: "Fabric is listed and has none" };
      default:
        return { state: "unknown", title: "Material not found", note: "No fabric percentages on this page" };
    }
  }

  // "xyz 2%, abc 5%": fibers we found next to a percentage but don't have in our list.
  const unrecognisedNote = (fibers) => `Can't tell if plastic: ${fibers.map((f) => `${f.name} ${fmt(f.pct)}%`).join(", ")}`;

  // One box per garment part. Each part is colored by its own plastic percentage.
  function describePart(p) {
    const part = p.label ? titleCase(p.label) : "Main fabric";
    if (p.plasticPct > 0) {
      return { part, state: colorFor(p.plasticPct), title: `Plastic ${fmt(p.plasticPct)}%`, note: p.breakdown.map(fmtFiber).join(", ") };
    }
    if (p.unrecognised?.length) return { part, state: "unknown", title: "Fiber not recognised", note: unrecognisedNote(p.unrecognised) };
    if (p.complete) return { part, state: "none", title: "No plastic fibers", note: "Fabric is listed and has none" };
    return { part, state: "unknown", title: "Material not found", note: "Percentages don't add up" };
  }

  const isMultiPart = (r) => r.parts?.length > 1 && ["found", "partial", "none", "unrecognised"].includes(r.status);

  // What the badge shows, one line per box. Goes into a report so it says what the person saw.
  const lineFor = (d) => `${d.part ? `${d.part}: ` : ""}${d.title}${d.note ? ` (${d.note})` : ""}`;

  // The "Report a wrong reading" view: shows the exact text of the report and links to a pre-filled
  // GitHub issue. Nothing is sent from here; the person submits on github.com themselves.
  function buildReportView(r, items, onCancel) {
    const comment = el("textarea", { id: "report-comment", rows: 2, maxLength: 500, placeholder: "e.g. The tag says 100% cotton" });
    const preview = el("pre", {});
    const send = el("a", { class: "btn", target: "_blank", rel: "noopener noreferrer" }, "Open GitHub issue");

    const refresh = () => {
      const report = NS.report.build({
        href: location.href,
        lines: items.map(lineFor),
        result: r,
        version: NS.report.version(),
        comment: comment.value,
      });
      preview.textContent = report.body;
      send.href = NS.report.issueUrl(report);
    };
    comment.addEventListener("input", refresh);

    const cancel = el("button", { class: "link", type: "button" }, "Cancel");
    cancel.addEventListener("click", onCancel);

    const view = el(
      "div",
      { hidden: true },
      el("h2", {}, "Report a wrong reading"),
      el("p", {}, "This opens a pre-filled issue on GitHub. Nothing is sent until you press Submit there, and you can edit or cancel first. GitHub issues are public: anyone can read what you submit."),
      el("label", { htmlFor: "report-comment" }, "What looks wrong? (optional)"),
      comment,
      el("p", {}, "This is what will be included:"),
      preview,
      el("div", { class: "actions" }, send, cancel)
    );
    return { view, refresh, focus: () => comment.focus() };
  }

  // The text we read, as the page laid it out: a bullet list when the source had separate lines
  // (lines with a fiber percentage stand out), otherwise a plain quote.
  function quoteNodes(r) {
    if (r.lines?.length > 1) {
      return [el("ul", { class: "read" }, ...r.lines.map((line) => el("li", { class: NS.hasFiberPattern(line) ? "hit" : "" }, line)))];
    }
    return r.snippet ? [el("blockquote", {}, r.snippet)] : [];
  }

  function buildPanel(r, opts, items = []) {
    const kids = [el("h2", {}, "How this was read")];

    if (r.segments?.length) {
      kids.push(
        el("ul", {}, ...r.segments.map((s) =>
          el("li", {}, el("span", { class: "muted" }, `${s.label ? titleCase(s.label) : "Fabric"}: `), ...fiberNodes(s.fibers))
        ))
      );
      kids.push(el("p", {}, `Read from ${SOURCE_LABEL[r.tier] || "the page"}. Counted as plastic: polyester, nylon, acrylic, spandex/elastane, elastomultiester, polyurethane (PU), PVC, polypropylene and similar.`));
      kids.push(...quoteNodes(r));
    } else if (r.status === "named") {
      const names = r.fibers.map((f) => DISPLAY[f] || f).join(", ");
      kids.push(el("p", {}, `The page names ${names} but gives no percentages, so we can't say how much plastic there is.`));
      kids.push(...quoteNodes(r));
    } else {
      kids.push(el("p", {}, "We couldn't find a fabric breakdown. Look for a tag photo or a Details section on the retailer's page."));
    }

    if (r.unrecognised?.length) {
      const names = r.unrecognised.map((f) => f.name).join(", ");
      const guessed = r.unrecognised.some((f) => f.plasticGuess);
      kids.push(el("p", {}, guessed
        ? `We don't have "${names}" in our fiber list. Its name looks like a plastic, so it is counted.`
        : `We don't have "${names}" in our fiber list, so we can't say whether it is plastic. It is not counted.`));
    }

    if (r.status === "possible") {
      kids.push(el("p", {}, `${r.hints.map((h) => HINT_NOTE[h]).join(" ")} Check the retailer's fabric list to be sure.`));
    }

    kids.push(el("p", {}, "Retailer labels can be wrong or incomplete. If you have an allergy, check the garment tag."));

    const report = el("button", { class: "link", type: "button" }, "Report wrong reading");
    const hide = el("button", { class: "link", type: "button" }, "Hide on this page");
    hide.addEventListener("click", () => opts.onDismiss?.());
    kids.push(el("div", { class: "actions" }, report, hide));

    const main = el("div", {}, ...kids);
    const reportView = buildReportView(r, items, () => {
      reportView.view.hidden = true;
      main.hidden = false;
      report.focus();
    });
    report.addEventListener("click", () => {
      main.hidden = true;
      reportView.view.hidden = false;
      reportView.refresh();
      reportView.focus();
    });

    return el("div", { class: "panel", id: "panel", hidden: true }, main, reportView.view);
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

    const panel = buildPanel(result, opts, items);
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

    const wrap = el("div", { class: "wrap", role: "status" }, panel, el("div", { class: "pills" }, ...pills));
    // Escape closes the details and hands focus back to the first box. Only when it is open: the page's own
    // Escape handling (closing its dialogs) is left alone the rest of the time.
    wrap.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || panel.hidden) return;
      toggle();
      pills[0].focus();
      e.stopPropagation();
    });

    root.append(style, wrap);
    document.documentElement.append(host); // not <body>: avoids body transforms breaking position:fixed
  }

  NS.badge = { render, remove, HOST_ID };
})();
