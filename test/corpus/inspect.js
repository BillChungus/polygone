// Dev aid: for each saved page, show what the extension concludes and every
// fiber-like snippet on the page, so expectations in expected.json can be checked by eye.
// Usage: node test/corpus/inspect.js [name ...]
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "..", "src");
const dir = path.join(__dirname, "pages");
const only = process.argv.slice(2);

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  const name = f.replace(/\.html$/, "");
  if (only.length && !only.includes(name)) continue;
  const html = fs.readFileSync(path.join(dir, f), "utf8");
  const url = html.match(/^<!-- (\S+) -->/)?.[1] || "https://shop.example/";
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  const w = dom.window;
  for (const s of ["parser.js", "detect.js"]) w.eval(fs.readFileSync(path.join(SRC, s), "utf8"));
  const NS = w.Polygone;
  const r = NS.analyzePage();
  console.log(`\n=== ${name}  product=${NS.isProductPage()}  status=${r.status}  plastic=${r.plasticPct ?? "-"}  tier=${r.tier ?? "-"}  conf=${r.confidence ?? "-"}`);
  if (r.snippet) console.log(`  used: ${r.snippet.slice(0, 160)}`);
  const text = w.document.body.textContent.replace(/\s+/g, " ");
  const seen = new Set();
  for (const m of text.matchAll(/.{0,50}\d{1,3}\s*%\s*(?:recycled |organic )?(?:polyester|nylon|polyamide|elastane|spandex|lycra|acrylic|cotton|wool|viscose|rayon|linen|silk|modal|lyocell|tencel|cashmere).{0,60}/gi)) {
    const s = m[0].trim();
    if (!seen.has(s) && seen.size < 4) { seen.add(s); console.log(`  page: ${s}`); }
  }
  if (!seen.size) console.log("  page: (no fiber % text found in static HTML)");
}
