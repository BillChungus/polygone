// Parser stress test. Usage: node test/fuzz.js [seed] [count]   (or: npm run fuzz)
// Parser stress test with an oracle: generate random compositions in many formats, know the true plastic %,
// and check the extension's parser agrees. Seeded, so any failure can be reproduced.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "src");
const w = new JSDOM("<html><body></body></html>", { runScripts: "outside-only" }).window;
for (const f of ["parser.js"]) w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
const NS = w.PolyCheck;

// mulberry32
let seed = Number(process.argv[2] || 12345);
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// [name as written, is plastic]
const FIBERS = [
  ["polyester", 1], ["Polyester", 1], ["POLYESTER", 1], ["nylon", 1], ["Nylon", 1], ["polyamide", 1], ["Polyamide", 1],
  ["acrylic", 1], ["elastane", 1], ["Elastane", 1], ["spandex", 1], ["Spandex", 1], ["lycra", 1], ["PU", 1], ["polyurethane", 1],
  ["elastomultiester", 1], ["modacrylic", 1], ["polypropylene", 1], ["polyolefin", 1], ["PES", 1], ["PVC", 1],
  ["cotton", 0], ["Cotton", 0], ["COTTON", 0], ["organic cotton", 0], ["BCI cotton", 0], ["viscose", 0], ["Viscose", 0], ["rayon", 0],
  ["modal", 0], ["lyocell", 0], ["tencel", 0], ["cupro", 0], ["wool", 0], ["merino wool", 0], ["lambswool", 0], ["cashmere", 0],
  ["linen", 0], ["Linen", 0], ["hemp", 0], ["silk", 0], ["Silk", 0], ["alpaca", 0], ["mohair", 0], ["leather", 0], ["acetate", 0],
  ["jute", 0], ["ramie", 0], ["kapok", 0], ["down", 0], ["feathers", 0], ["angora", 0], ["camel hair", 0], ["bamboo", 0],
];
const REC = ["recycled polyester", "recycled nylon", "recycled polyamide", "Recycled Polyester"]; // plastic

// random split of 100 into n parts (integers, or one decimal)
function split(n, decimals) {
  const unit = decimals ? 10 : 1;
  const total = 100 * unit;
  const cuts = new Set();
  while (cuts.size < n - 1) cuts.add(int(1, total - 1));
  const s = [0, ...[...cuts].sort((a, b) => a - b), total];
  return s.slice(1).map((v, i) => (v - s[i]) / unit);
}
const fmtPct = (p, comma) => { let s = Number.isInteger(p) ? String(p) : p.toFixed(1); if (comma) s = s.replace(".", ","); return s; };

const FORMATS = [
  (f) => f.map((x) => `${x.p}% ${x.n}`).join(", "),
  (f) => f.map((x) => `${x.p}% ${x.n}`).join(" "),
  (f) => f.map((x) => `${x.p}% ${x.n}`).join(" / "),
  (f) => f.map((x) => `${x.p}%${x.n}`).join(""),               // Amazon: 70%Rayon30%Linen
  (f) => f.map((x) => `${x.n} ${x.p}%`).join(", "),
  (f) => f.map((x) => `${x.n} (${x.p}%)`).join(", "),
  (f) => f.map((x) => `${x.n}: ${x.p}%`).join(", "),
  (f) => f.map((x) => `${x.p} % ${x.n}`).join(", "),
  (f) => f.map((x) => `${x.p}% ${x.n}`).join(" and "),
  (f) => f.map((x) => `${x.p}% ${x.n}`).join("/"),
  (f) => f.map((x) => `${x.p}% ${x.n}`).join(", ") + ".",
];
const PREFIX = ["", "", "", "Composition: ", "Material: ", "Fabric: ", "Shell: ", "Main fabric: ", "Body: ", "Materials & Care "];
const SUFFIX = ["", "", "", " Machine wash at 30°C.", " Do not tumble dry", " Made in Portugal", " Imported", " Care instructions: Hand wash only", " Style No. 12345", " Exclusive of decoration"];

const N = Number(process.argv[3] || 20000);
const bad = [];
let checked = 0, nullResults = 0;
for (let i = 0; i < N; i++) {
  const n = int(1, 4);
  const decimals = rnd() < 0.15;
  const comma = decimals && rnd() < 0.3;
  const pcts = split(n, decimals);
  const used = new Set();
  const fibers = pcts.map((p) => {
    let f;
    for (let tries = 0; tries < 20; tries++) {
      f = rnd() < 0.15 ? [pick(REC), 1] : pick(FIBERS);
      const key = f[0].toLowerCase().replace(/^recycled /, "");
      if (!used.has(key)) { used.add(key); break; }
    }
    return { n: f[0], plastic: f[1], p: fmtPct(p, comma), v: p };
  });
  // duplicates by normalised family (polyester + recycled polyester, cotton + organic cotton...) would sum into one anyway: fine.
  const text = pick(PREFIX) + pick(FORMATS)(fibers) + pick(SUFFIX);
  const want = Math.round(fibers.reduce((a, f) => a + (f.plastic ? f.v : 0), 0) * 10) / 10;
  let got;
  try {
    const comp = NS.parseComposition(text);
    got = comp ? NS.summarizeComposition(comp).plasticPct : null;
  } catch (e) { bad.push({ text, want, got: "THROW " + e.message }); continue; }
  checked++;
  if (got === null) nullResults++;
  if (got === null || Math.abs(got - want) > 0.11) bad.push({ text, want, got });
}

console.log(`seed ${process.argv[2] || 12345}: ${checked} compositions, ${bad.length} wrong (${nullResults} unreadable)`);
const groups = {};
for (const b of bad) {
  // group by rough shape to see patterns
  const k = b.text.replace(/\d+([.,]\d+)?/g, "N").replace(/[A-Za-z]+/g, "w").slice(0, 40);
  (groups[k] = groups[k] || []).push(b);
}
for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
  console.log(`\n[${v.length}x] shape ${k}`);
  for (const b of v.slice(0, 3)) console.log(`   want ${b.want}  got ${b.got}   <- ${JSON.stringify(b.text)}`);
}
process.exit(bad.length ? 1 : 0);
