// Bulk scan: fetch a few hundred real product pages from retailers that answer plain requests, run the
// extension's parser and detector over each, and flag anything suspicious. Nothing is added to the corpus;
// results go to test/corpus/scan-output/ (gitignored).
//
//   npm run scan                 full scan (~290 pages, several minutes)
//   node test/corpus/scan.js --limit 20    quick trial
//   node test/corpus/scan.js --fresh       forget the cached page list and results first
//
// What it flags (in scan-output/report.txt):
//   UNRECOGNISED  fibers the list doesn't know: names to add to FIBER_NAMES / CANON in src/parser.js
//   MISSES        page text has fiber percentages but the extension found nothing
//   LOW CONFIDENCE / NAMED / MULTI-PART / NOT DETECTED as a product page
// Caveat: this reads static HTML (no JavaScript runs), so sites that build the fabric text in the browser
// (Aloyoga, some Target/Zara data) show up as MISSES even though a real browser shows the text.
// Be polite: a few requests at a time with a pause between them. Don't point this at more pages than needed.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const { JSDOM, VirtualConsole } = require("jsdom");

const SRC = path.join(__dirname, "..", "..", "src");
const OUT = path.join(__dirname, "scan-output");
const JOBS = path.join(OUT, "jobs.json");
const RESULTS = path.join(OUT, "results.jsonl");
const REPORT = path.join(OUT, "report.txt");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BATCH = 40; // pages per process; jsdom leaks memory, so the runner restarts itself between batches

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- runner: restart a worker per batch until the report is written ----------
if (!flag("--worker")) {
  fs.mkdirSync(OUT, { recursive: true });
  if (flag("--fresh")) for (const f of [JOBS, RESULTS, REPORT]) fs.rmSync(f, { force: true });
  else fs.rmSync(REPORT, { force: true });
  for (let i = 0; i < 40 && !fs.existsSync(REPORT); i++) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=4096", __filename, "--worker", ...args], { stdio: "inherit" });
    if (r.status !== 0 && !fs.existsSync(REPORT)) console.log(`worker exited with ${r.status}; continuing (results are saved as they arrive)`);
  }
  console.log(fs.existsSync(REPORT) ? `\nReport: ${REPORT}` : "\nStopped before finishing; run again to resume.");
  process.exit(0);
}

// ---------- fetching ----------
async function get(url, timeout = 25000) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "en-GB,en;q=0.9", accept: "text/html,application/json,application/xml,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return (/\.gz(\?|$)/.test(url) && buf[0] === 0x1f ? zlib.gunzipSync(buf) : buf).toString("utf8");
}
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const spread = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));

// ---------- discovery: which pages to scan ----------
const NOT_APPAREL = /shoe|sock|sneaker|boot|sandal|bag\b|bags|hat\b|cap\b|beanie|gift|card|accessor|sticker|jewel|candle|mug|bottle|towel|blanket|pillow|mask|watch|sunglass|belt|wallet|scarf|glove|fragrance|book|poster|print|toy|bundle|insurance|coverage|protection/i;
const SHOPIFY = ["allbirds.com", "aloyoga.com", "colorfulstandard.com", "cuyana.com", "everlane.com", "girlfriend.com", "outdoorvoices.com", "taylorstitch.com", "kithnyc.com", "33-mm.com", "tentree.com", "pangaia.com", "noahny.com", "fearofgod.com", "knix.com", "jennikayne.com"];

async function discover() {
  const jobs = [];
  const log = {};
  for (const domain of SHOPIFY) {
    try {
      const j = JSON.parse(await get(`https://${domain}/products.json?limit=250`));
      const apparel = (j.products || []).filter((p) => !NOT_APPAREL.test(`${p.product_type} ${p.title} ${(p.tags || []).join(" ")}`));
      spread(apparel, 12).forEach((p) => jobs.push({ site: domain, url: `https://${domain}/products/${p.handle}` }));
      log[domain] = apparel.length;
    } catch (e) { log[domain] = `skip (${e.message})`; }
  }
  const sitemap = async (site, url, filter, n) => {
    try {
      const urls = locs(await get(url)).filter((u) => filter.test(u));
      spread(urls, n).forEach((u) => jobs.push({ site, url: u }));
      log[site] = urls.length;
    } catch (e) { log[site] = `skip (${e.message})`; }
  };
  await sitemap("marksandspencer.com", "https://www.marksandspencer.com/sitemap/uk_sitemap_women_products.xml", /\/p\//, 20);
  await sitemap("boohoo.com", "https://www.boohoo.com/sitemap/boohooww/products-0.xml", /dress|top|tee|shirt|jean|jogger|hoodie|jumper|coat|jacket|legging|short|skirt|trouser|bodysuit|bra/i, 25);
  await sitemap("nike.com", "https://www.nike.com/sitemap-v2-pdp-en-gb.xml", /shirt|top|shorts|hoodie|jacket|leggings|tights|joggers|pants|tee|dress|bra|vest/i, 25);
  try {
    const first = locs(await get("https://www.target.com/sitemap_pdp-index.xml.gz"))[0];
    await sitemap("target.com", first, /hoodie|t-shirt|dress|jeans|leggings|sweater|jacket|shorts|pants|joggers|shirt/i, 25);
  } catch (e) { log["target.com"] = `skip (${e.message})`; }
  const seen = new Set();
  return { log, list: jobs.filter((j) => !seen.has(j.url) && seen.add(j.url)) };
}

// ---------- analysis ----------
const CODE = ["parser.js", "detect.js"].map((f) => fs.readFileSync(path.join(SRC, f), "utf8"));
const FIBER_TEXT = /(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:recycled |organic )?(polyester|cotton|nylon|polyamide|viscose|elastane|spandex|wool|linen|silk|acrylic|lyocell|modal|rayon|cashmere|hemp)/i;

function analyse(html, url) {
  const t0 = Date.now();
  const dom = new JSDOM(html, { runScripts: "outside-only", url, virtualConsole: new VirtualConsole() }); // quiet: no CSS-parse noise
  const w = dom.window;
  try {
    for (const c of CODE) w.eval(c);
    const NS = w.PolyCheck;
    const product = NS.isProductPage();
    const r = NS.analyzePage();
    const body = w.document.body ? w.document.body.textContent.replace(/\s+/g, " ") : "";
    return {
      product, ms: Date.now() - t0, status: r.status, plastic: r.plasticPct ?? null, tier: r.tier || null, conf: r.confidence || null,
      parts: (r.parts || []).map((p) => `${p.label || "main"}:${p.plasticPct}${p.unrecognised?.length ? "?" : ""}`),
      unrecognised: (r.unrecognised || []).map((f) => `${f.name} ${f.pct}%${f.plasticGuess ? "*" : ""}`),
      snippet: (r.snippet || "").slice(0, 160),
      rawFiber: body.match(new RegExp(".{0,60}" + FIBER_TEXT.source + ".{0,60}", "i"))?.[0] || null,
    };
  } finally { w.close(); }
}

const readResults = () => (fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

function writeReport(log, results) {
  const ok = results.filter((r) => !r.error);
  const errs = results.filter((r) => r.error);
  const count = (f) => ok.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
  const lines = [
    `Scanned ${results.length} pages: ${ok.length} fetched, ${errs.length} failed to fetch`,
    "Discovery: " + JSON.stringify(log),
    "Status counts: " + JSON.stringify(count((r) => r.status)),
    "Tier counts: " + JSON.stringify(count((r) => r.tier || "-")),
    `Detected as product page: ${ok.filter((r) => r.product).length}/${ok.length}`,
    "Slowest analyses (ms): " + ok.map((r) => r.ms).sort((a, b) => b - a).slice(0, 5).join(", "),
    "Fetch failures: " + JSON.stringify(errs.reduce((m, r) => ((m[r.error] = (m[r.error] || 0) + 1), m), {})),
  ];
  const section = (title, rows, fmt) => {
    lines.push(`\n=== ${title} (${rows.length}) ===`);
    rows.slice(0, 40).forEach((r) => lines.push(fmt(r)));
  };
  section("UNRECOGNISED fibers (names to look into)", ok.filter((r) => r.unrecognised.length), (r) => `${r.url}\n    ${r.unrecognised.join(", ")}  | ${r.snippet}`);
  section("MISSES: page text has fiber percentages but nothing was found", ok.filter((r) => ["unknown", "possible", "named"].includes(r.status) && r.rawFiber), (r) => `${r.url}  [${r.status}]\n    page text: ${r.rawFiber}`);
  section("LOW CONFIDENCE (composition did not add up)", ok.filter((r) => r.conf === "low" && r.status !== "unknown"), (r) => `${r.url}  [${r.status} ${r.plastic}%]\n    ${r.snippet}`);
  section("NAMED only (fiber named, no percentages)", ok.filter((r) => r.status === "named"), (r) => `${r.url}\n    ${r.snippet}`);
  section("MULTI-PART garments", ok.filter((r) => r.parts.length > 1), (r) => `${r.url}\n    ${r.parts.join(" | ")}`);
  section("NOT detected as a product page (but fabric text present)", ok.filter((r) => !r.product && r.rawFiber), (r) => `${r.url}\n    ${r.rawFiber}`);
  fs.writeFileSync(REPORT, lines.join("\n"));
}

(async () => {
  let cached;
  if (fs.existsSync(JOBS)) {
    cached = JSON.parse(fs.readFileSync(JOBS, "utf8"));
  } else {
    console.log("discovering pages...");
    cached = await discover();
    fs.writeFileSync(JOBS, JSON.stringify(cached));
  }
  const list = cached.list.slice(0, LIMIT);
  const done = new Set(readResults().map((r) => r.url));
  const todo = list.filter((j) => !done.has(j.url));
  console.log(`${list.length} pages, ${todo.length} left`);

  let next = 0;
  const batch = todo.slice(0, BATCH);
  async function worker() {
    while (next < batch.length) {
      const job = batch[next++];
      await sleep(300);
      try {
        const html = await get(job.url);
        fs.appendFileSync(RESULTS, JSON.stringify({ ...job, bytes: html.length, ...analyse(html, job.url) }) + "\n");
      } catch (e) {
        fs.appendFileSync(RESULTS, JSON.stringify({ ...job, error: e.message }) + "\n");
      }
    }
  }
  await Promise.all([worker(), worker()]);
  console.log(`  batch done (${Math.min(todo.length, BATCH)} pages)`);
  if (todo.length <= BATCH) {
    const wanted = new Set(list.map((j) => j.url));
    writeReport(cached.log, readResults().filter((r) => wanted.has(r.url)));
  }
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
