// Structural fuzz: random hostile documents (odd nesting, look-alike class names, zero-width text, broken JSON-LD,
// huge text, deep trees) through the real detector, badge and report builder. Checks that nothing throws or hangs,
// that results stay in range (status, percentages, box count), that a badge always appears, that the report link
// fits, and that scraped text never becomes markup.
//
//   node test/dom-fuzz.js [seed] [documents]      (defaults: seed 1, 400 documents)
//
// jsdom keeps memory it should release, so a few thousand documents in one process can run out of memory. Use
// several seeds of a few hundred instead: for s in 1 2 3 4 5; do node test/dom-fuzz.js $s 400; done
// Exit code is 1 if any document had a problem, and the first few are printed.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const SRC = path.join(__dirname, "..", "src");
const CODE = ["parser.js", "detect.js", "report.js", "badge.js"].map((f) => fs.readFileSync(path.join(SRC, f), "utf8"));

let seed = Number(process.argv[2] || 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const N = Number(process.argv[3] || 400);
const TIME_LIMIT_MS = 2500;

const TAGS = ["div", "p", "span", "li", "ul", "ol", "table", "tr", "td", "th", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "section", "article", "footer", "nav", "button", "a", "b", "i", "em", "strong", "small", "details", "summary", "label", "form", "main", "aside", "figure", "blockquote", "pre", "code", "svg", "template", "noscript", "select", "option", "textarea"];
const CLASSES = ["", "", "", "reviews", "customer-reviews", "product-preview", "recommended-items", "related", "similar-products", "carousel", "unrelated", "compare-at", "product-comparison", "recentlyViewed", "sponsored", "details", "accordion open", "has-reviews", "x".repeat(400), "a-b-c d_e_f", "ÜñíçødÉ", "\u200b", "review\u0000s"];
const TEXTS = [
  "60% cotton, 40% polyester", "Shell: 100% cotton. Lining: 100% polyester", "100% recycled polyester", "Composition", "Material:", "Materials & Care", "Details", "Description",
  "Fabric: 55% linen 45% cotton", "Save 50% off polyester tees", "polyester 3 stars", "20%", "%", "100%%%", "95% cotton 5% spandex", "Body: 77% Nylon, 23% LYCRA® XTRA LIFE™Spandex",
  "Machine wash", "• Material: 100% Cotton", "Read more", "Made from 60% polyester and 40% mystery fibre", "0% polyester", "101% cotton", "-5% cotton", "1e3% cotton", "60 %polyester40%cotton",
  "٦٠٪ قطن", "面料成分：涤纶 65% 棉 35%", "Ünïcödé 100% cötton", "\u202e100% cotton\u202c", "😀 100% 😀 polyester", "a".repeat(5000), "% ".repeat(500), "polyester ".repeat(300), "Polyester (60%), Elastane (5%), Cotton (35%)",
  "Material : Polyester", "Material:Spandex", "Gusset 1: 86% Cotton, 10%, Spandex", "Upper part: Viscose 48%, Polyester 52% Bottom part: Polyester 100%", "", " ", "\n\n\n",
];
const LDS = ['{"@type":"Product","name":"T","material":"78% Polyamide, 22% Elastane"}', '{"@type":"Product","description":"<p>100% polyester</p>"}', "{not json", "[]", "null", '{"@graph":[{"@type":"Product","additionalProperty":[{"name":"Material","value":"100% cotton"},null,5]}]}', '{"@type":["Product","ProductGroup"],"material":["a","b"]}', '{"@type":"Product","material":{"name":"Polyester"}}', '{"@type":"Product","material":5}', '{"@type":"Product","additionalProperty":"nope"}'];

function node(depth) {
  const tag = pick(TAGS);
  const cls = pick(CLASSES);
  let html = `<${tag}${cls ? ` class="${cls.replace(/"/g, "")}"` : ""}${rnd() < 0.05 ? ` id="${pick(CLASSES).replace(/"/g, "")}"` : ""}>`;
  const kids = depth > 0 ? int(0, 4) : 0;
  for (let i = 0; i < kids; i++) html += rnd() < 0.55 ? node(depth - 1) : pick(TEXTS);
  if (depth <= 0 || rnd() < 0.5) html += pick(TEXTS);
  return html + `</${tag}>`;
}
function doc() {
  const head = (rnd() < 0.7 ? '<meta property="og:type" content="product">' : "") + Array.from({ length: int(0, 3) }, () => `<script type="application/ld+json">${pick(LDS)}</script>`).join("") + (rnd() < 0.3 ? `<script>window.s=${JSON.stringify({ pad: "x".repeat(600), a: '\\u003cli\\u003e50% Cotton 50% Polyester\\u003c/li\\u003e', attrName: "Composition", b: pick(TEXTS) })}</script>` : "");
  let body = Array.from({ length: int(1, 14) }, () => node(int(1, 9))).join("");
  if (rnd() < 0.1) body = "<div>".repeat(int(50, 400)) + pick(TEXTS) + "</div>".repeat(1) + body; // deep nesting
  if (rnd() < 0.5) body += "<button>Add to bag</button>";
  return `<html><head>${head}</head><body${rnd() < 0.1 ? ' class="has-reviews"' : ""}>${body}</body></html>`;
}

const STATUS = new Set(["found", "partial", "none", "unknown", "possible", "named", "unrecognised"]);
let bad = 0, slowest = 0, statuses = {};
const fails = [];
for (let i = 0; i < N; i++) {
  const html = doc();
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://shop.example/p/1", virtualConsole: new VirtualConsole() });
  const w = dom.window;
  try {
    for (const c of CODE) w.eval(c);
    const NS = w.Polygone;
    const t0 = Date.now();
    const product = NS.isProductPage();
    const r = NS.analyzePage();
    NS.badge.render(r, {});
    const ms = Date.now() - t0;
    slowest = Math.max(slowest, ms);
    const problems = [];
    if (typeof product !== "boolean") problems.push("isProductPage not boolean");
    if (!STATUS.has(r.status)) problems.push("bad status " + r.status);
    if (r.plasticPct !== undefined && !(r.plasticPct >= 0 && r.plasticPct <= 100)) problems.push("plasticPct out of range " + r.plasticPct);
    if (r.parts && (r.parts.length > 5 || r.parts.length < 1)) problems.push("parts " + r.parts.length);
    if (r.lines && r.lines.length > 12) problems.push("lines " + r.lines.length);
    if (r.snippet && r.snippet.length > 240) problems.push("snippet too long");
    if (r.parts && r.parts.some((p) => !(p.plasticPct >= 0 && p.plasticPct <= 100))) problems.push("part pct out of range");
    if (ms > TIME_LIMIT_MS) problems.push("slow " + ms + "ms");
    const host = w.document.getElementById("polygone-host");
    if (!host) problems.push("no badge rendered");
    else {
      const sr = host.shadowRoot;
      if (sr.querySelectorAll(".pill").length < 1 || sr.querySelectorAll(".pill").length > 5) problems.push("pills " + sr.querySelectorAll(".pill").length);
      // building the report from any result must also work, and fit in a link
      const rep = NS.report.build({ href: "https://shop.example/p/1?x=1", lines: ["a"], result: r, version: "1", comment: "c" });
      if (NS.report.issueUrl(rep).length > 7000) problems.push("report link too long");
      // scraped text must never have become markup inside the badge
      if (sr.querySelector("script, img, iframe, style ~ style")) problems.push("markup injected into badge");
    }
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    if (problems.length) { bad++; if (fails.length < 8) fails.push({ i, problems, html: html.slice(0, 400) }); }
  } catch (e) {
    bad++;
    if (fails.length < 8) fails.push({ i, problems: ["THREW " + (e.stack || e.message).split("\n").slice(0, 3).join(" | ")], html: html.slice(0, 400) });
  } finally { w.close(); }
}
console.log(`seed ${process.argv[2] || 1}: ${N} hostile documents, ${bad} problems, slowest ${slowest} ms | statuses ${JSON.stringify(statuses)}`);
for (const f of fails) console.log("\n#" + f.i, f.problems.join("; "), "\n   ", f.html.replace(/\s+/g, " ").slice(0, 300));
process.exit(bad ? 1 : 0);
