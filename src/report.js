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
 * Exposes: Polygone.report = { REPO, safeUrl, build, issueUrl, version }
 */
(function () {
  const NS = (window.Polygone = window.Polygone || {});

  // Reports open a new issue here. The repo is public, so the issue (page URL without query string, what the
  // badge showed, the text it read, the person's comment) is public too; the report view says so.
  const REPO = "BillChungus/polygone";
  const MAX_SNIPPET = 240;
  const MAX_COMMENT = 500;

  // One line, no backticks, so scraped text can't break out of the quoted line in the issue.
  const oneLine = (s, max) => String(s || "").replace(/`/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

  function safeUrl(href) {
    try {
      const u = new URL(href);
      return u.protocol === "http:" || u.protocol === "https:" ? u.origin + u.pathname : "";
    } catch {
      return "";
    }
  }

  const version = () => {
    try { return chrome.runtime.getManifest().version; } catch { return "unknown"; }
  };

  // The text it read, quoted. Keeps the page's own bullet lines when there are several.
  function quoted(result) {
    if (result.lines && result.lines.length > 1) {
      return `**Text it read:**\n${result.lines.map((l) => `> - ${oneLine(l, MAX_SNIPPET)}`).join("\n")}`;
    }
    return result.snippet ? `**Text it read:**\n> ${oneLine(result.snippet, MAX_SNIPPET)}` : "**Text it read:** none";
  }

  /**
   * @param {{href: string, lines: string[], result: object, version: string, comment?: string}} p
   *   lines: what the badge showed, one entry per box ("Shell: Plastic 70% (65% polyester, ...)")
   * @returns {{title: string, body: string}}
   */
  function build({ href, lines, result, version: ver, comment }) {
    const url = safeUrl(href);
    let host = "";
    try { host = new URL(url).hostname; } catch { /* no usable URL */ }

    const body = [
      `**Page:** ${url || "(not shared)"}`,
      `**Polygone showed:** ${lines.map((l) => oneLine(l, 200)).join("; ") || "nothing"}`,
      `**Status:** ${result.status}${result.tier ? ` (read from ${result.tier})` : ""}`,
      quoted(result),
      `**What looks wrong:** ${oneLine(comment, MAX_COMMENT) || "(add details here)"}`,
      `_Polygone ${ver}_`,
    ].join("\n\n");

    return { title: `Wrong reading: ${host || "unknown site"}`, body };
  }

  const issueUrl = ({ title, body }) =>
    `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  NS.report = { REPO, safeUrl, build, issueUrl, version };
})();
