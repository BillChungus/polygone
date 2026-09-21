/**
 * report.js
 * Builds a "wrong reading" report as a pre-filled GitHub issue. Pure functions, no DOM, no network.
 *
 * Nothing is sent by the extension. The badge shows the exact report text and offers a link to
 * github.com's new-issue page; the person reads it, can edit it, and presses Submit there themselves.
 *
 * Privacy: only origin + path of the page URL is included. Query strings and #fragments are dropped
 * because they can carry tracking ids or personal data.
 *
 * Safety: the text the page showed is scraped, so it goes in a code block. GitHub shows a code block as plain
 * text, so a page cannot slip @mentions, links, images or HTML into a public issue through its fabric text.
 *
 * Size: the whole report has to fit in a link (GitHub rejects very long ones), so build() shortens it until it
 * does, and the preview shows exactly what the link carries.
 *
 * Exposes: Polygone.report = { REPO, safeUrl, build, issueUrl, version }
 */
(function () {
  const NS = (window.Polygone = window.Polygone || {});

  // Reports open a new issue here. The repo is public, so the issue (page URL without query string, what the
  // badge showed, the text it read, the person's comment) is public too; the report view says so.
  const REPO = "BillChungus/polygone";
  const MAX_SNIPPET = 240;
  const MAX_COMMENT = 500;
  const MAX_PATH = 300;
  const MAX_LINK = 7000; // GitHub answers "URI too long" a little above 8000

  // One line, no backticks (they would close the code block the text sits in).
  const oneLine = (s, max) => String(s || "").replace(/`/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

  function safeUrl(href) {
    try {
      const u = new URL(href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.origin + u.pathname.slice(0, MAX_PATH);
    } catch {
      return "";
    }
  }

  const version = () => {
    try { return chrome.runtime.getManifest().version; } catch { return "unknown"; }
  };

  // The text it read, in a code block, one line per line on the page (or the one-line snippet).
  function quoted(result, keep) {
    const lines = result.lines && result.lines.length > 1
      ? result.lines.slice(0, keep).map((l) => oneLine(l, MAX_SNIPPET))
      : result.snippet ? [oneLine(result.snippet, MAX_SNIPPET)] : [];
    return lines.length ? `**Text it read:**\n\`\`\`\n${lines.join("\n")}\n\`\`\`` : "**Text it read:** none";
  }

  const issueUrl = ({ title, body }) =>
    `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  /**
   * @param {{href: string, lines: string[], result: object, version: string, comment?: string}} p
   *   lines: what the badge showed, one entry per box ("Shell: Plastic 70% (65% polyester, ...)")
   * @returns {{title: string, body: string}}
   */
  function build({ href, lines, result, version: ver, comment }) {
    const url = safeUrl(href);
    let host = "";
    try { host = new URL(url).hostname; } catch { /* no usable URL */ }
    const title = `Wrong reading: ${host || "unknown site"}`;

    const compose = (o) =>
      [
        `**Page:** ${url || "(not shared)"}`,
        `**Polygone showed:** ${lines.map((l) => oneLine(l, o.boxMax)).join("; ") || "nothing"}`,
        `**Status:** ${result.status}${result.tier ? ` (read from ${result.tier})` : ""}`,
        o.omitQuote ? "**Text it read:** (too long to include in a link)" : quoted(result, o.keep),
        `**What looks wrong:** ${oneLine(comment, o.commentMax) || "(add details here)"}`,
        `_Polygone ${ver}_`,
      ].join("\n\n");

    // Shrink the least useful parts first until the link fits: extra quoted lines, then long box text, then the
    // quote, and only last the person's own comment.
    const o = { keep: 12, boxMax: 200, commentMax: MAX_COMMENT, omitQuote: false };
    let body = compose(o);
    while (issueUrl({ title, body }).length > MAX_LINK) {
      if (o.keep > 1) o.keep -= 1;
      else if (o.boxMax > 60) o.boxMax = 60;
      else if (!o.omitQuote) o.omitQuote = true;
      else if (o.commentMax > 120) o.commentMax = 120;
      else break;
      body = compose(o);
    }
    return { title, body };
  }

  NS.report = { REPO, safeUrl, build, issueUrl, version };
})();
