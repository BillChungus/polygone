// End-to-end checks: loads the extension scripts into a simulated DOM (jsdom),
// analyzes sample pages, and inspects the rendered badge. Run with: npm test
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "src");
let failed = 0;

function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `   (want ${want}, got ${got})`}`);
}

function load(html) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://shop.example/p/1" });
  for (const f of ["parser.js", "detect.js", "badge.js"]) {
    dom.window.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  }
  return dom.window;
}

const page = (body, head = '<meta property="og:type" content="product">') =>
  `<html><head>${head}</head><body>${body}</body></html>`;

// Renders the badge for a page and returns its color state + text.
function badge(html) {
  const w = load(html);
  const NS = w.PolyCheck;
  const result = NS.analyzePage();
  NS.badge.render(result, {});
  const pills = [...w.document.getElementById("polycheck-host").shadowRoot.querySelectorAll(".pill")];
  const text = (p, sel) => p.querySelector(sel)?.textContent;
  return {
    status: result.status,
    states: pills.map((p) => p.className.replace("pill ", "")),
    titles: pills.map((p) => text(p, ".title")),
    notes: pills.map((p) => text(p, ".note")),
    parts: pills.map((p) => text(p, ".part")),
  };
}

// ---- 1. Parser: composition string -> total plastic % (null = not a composition) ----
console.log("\nParser");
const NS = load("<html><body></body></html>").PolyCheck;
const plasticOf = (text) => {
  const comp = NS.parseComposition(text);
  return comp ? NS.summarizeComposition(comp).plasticPct : null;
};
const parserCases = [
  ["60% cotton 40% polyester", 40],
  ["Cotton 60%, Polyester 40%", 40],
  ["Polyester (60%), Elastane (5%), Cotton (35%)", 65],
  ["Shell: 100% polyester. Lining: 100% polyester. Fill: 100% recycled polyester", 100],
  ["100% poly", 100],
  ["60 % Poliéster, 40 % Algodón", 60],
  ["Polyamide 80% Elastane 20%", 100],
  ["95% cotton 5% spandex", 5],
  ["100% PVC", 100],
  ["Polyvinyl chloride 100%", 100],
  ["80% acrylic 20% wool", 80],
  ["Main fabric: 55% linen 45% cotton", 0],
  ["polyester 3 stars, feels cheap", null],
  ["Save 50% off polyester tees", null],
  ["copolyester 100%", null],
  // Strings taken from real product pages (see test/corpus)
  ["94% Polyester, 6% Elastane", 100],
  ["​​92% Polyester, 8% Spandex", 100],
  ["72% Nylon, 17% Lycra, 11% Polyester", 100],
  ["53% Cotton, 47% Polyester ( 30% Uses Recycled Polyester Fiber )Imported", 47],
  ["100% Cashmere (70% Recycled)", 0],
  ["70% baby alpaca , 30% wool", 0],
  ["100% Pima cotton", 0],
  ["89% recycled water bottles (RPET) and 11% spandex", 100],
  ["50% recycled plastic, 50% cotton", 50],
  ["20% bottles of water", null],
  // Amazon repeats the fabric in "Material Type" and "Fabric Type" rows, with no spaces
  ["Material Type 65%Polyester35%Cotton Fabric Type 65%Polyester35%Cotton", 65],
  ["60% cotton, 38% polyester, 2% elastane", 40],
  ["98% BCI Cotton 2% Elastane 14 Wals Cord", 2],
  ["Body: 51% polyester/25% modal/15% cotton/9% elastane. Hood lining: 51% polyester/25% modal/15% cotton/9% elastane.", 60],
  ["Lining: 100% Polyester, Shell: 100% Cotton", 0],
  ["Shell 1: 100% Cotton, Shell 2: 100% Polyester", 0],
  ["Main: 55% Polyester, 45% Cotton", 55],
  ["80% cotton 20% polyurethane", 20],
  ["100% PU", 100],
  ["62% cotton, 36% polyester, 2% elastomultiester", 38],
  ["Elastomultiester 3%, Cotton 97%", 3],
  ["98% cotton 2% elasto-multiester", 2],
  ["70% cotton, 30% PU", 30],
  ["Shell: 100% cotton. Coating: 100% PU", 0],
  ["Upper part: Viscose 48%, Polyester 28%, Polyamide 19%, Elastane 5% Bottom part: Polyester 100% Bottom part lining: Polyester 100%", 52],
];
for (const [text, want] of parserCases) check(text, plasticOf(text), want);

// ---- 2. Whole pages: detection, exclusions, states ----
console.log("\nPages");
const comp = (txt) => page(`<h1>Item</h1><h3>Composition</h3><p>${txt}</p>`);
const pageCases = [
  ["cotton tee with 2% elastane", comp("98% cotton, 2% elastane"), "low"],
  ["cotton shell, polyester lining: one box per part", comp("Shell: 100% cotton. Lining: 100% recycled polyester"), "none+high"],
  ["three parts, three boxes", comp("Shell: 100% cotton. Lining: 100% polyester. Fill: 100% recycled polyester"), "none+high+high"],
  ["incomplete non-plastic part gets no box", comp("Body: 100% cotton. Pocketing: 40% cotton"), "none"],
  ["named: dt/dd 'Material: Polyester, Cotton'", page("<h1>Tee</h1><dl><dt>Material</dt><dd>Polyester, Cotton</dd></dl>"), "named"],
  ["named: table row (Amazon style)", page("<h1>Shirt</h1><table><tr><th> Material Type </th><td> Polyester </td></tr></table>"), "named"],
  ["named: inline 'Material: Nylon'", page("<h1>Jacket</h1><p>Material: Nylon</p>"), "named"],
  ["named: JSON-LD material without percentages", page("<h1>Dress</h1>", '<script type="application/ld+json">{"@type":"Product","name":"Dress","material":"polyester/elastane"}</script>'), "named"],
  ["parts on sibling lines (TK Maxx): one box each", page("<h1>Joggers</h1><div><ul><li>Shell: 65% Polyester, 29% Cotton, 5% Elastane</li><li>Pockets: 60% Cotton, 40% Polyester</li><li>Machine washable</li></ul></div>"), "high+high"],
  ["parts on sibling <p> lines, no heading", page("<h1>Coat</h1><div><p>Shell: 100% cotton</p><p>Lining: 100% polyester</p></div>"), "none+high"],
  ["one fiber per <li>, no label", page("<h1>Tee</h1><ul><li>60% cotton</li><li>40% polyester</li></ul>"), "high"],
  ["natural fibers only stay unknown, never green", page("<h1>Dress</h1><p>Materials: Linen</p>"), "unknown"],
  ["named ignores reviews", page('<h1>Shirt</h1><div class="customer-reviews"><p>Material: Polyester</p></div>'), "unknown"],
  ["percentages beat a named fiber", page("<h1>Tee</h1><p>Material: Polyester</p><h3>Composition</h3><p>100% cotton</p>"), "none"],
  ["acrylic/nylon/wool", page("<h1>Beanie</h1><dl><dt>Fabric</dt><dd>55% acrylic, 30% nylon, 15% wool</dd></dl>"), "high"],
  ["PVC raincoat (found by page scan)", page("<h1>Rain Mac</h1><p>Composition: 100% PVC</p>"), "high"],
  ["pure cotton", comp("100% cotton"), "none"],
  ["fleece in name, no fabric list", page("<h1>Sherpa Fleece Pullover</h1><p>Cosy.</p>"), "possible"],
  ["satin in name but label says silk", page("<h1>Satin Slip Dress</h1><h3>Composition</h3><p>100% silk</p>"), "none"],
  ["polyester only in reviews is ignored", page('<h1>Linen Shirt</h1><h3>Composition</h3><p>100% linen</p><div class="customer-reviews"><p>Feels like 100% polyester</p></div>'), "none"],
  ["no fabric info anywhere", page("<h1>Mystery</h1><p>Lovely.</p>"), "unknown"],
  ["other products' fabrics in a comparison table are ignored", page('<h1>Shirt</h1><div id="comparison-table"><table><tr><th>Material</th><td>96%polyester4%Spandex</td></tr></table></div>'), "unknown"],
  ["JSON-LD composition under propertyID, part name as label", page("<h1>Dress</h1>", '<script type="application/ld+json">{"@type":"ProductGroup","name":"Satin Dress","additionalProperty":[{"@type":"PropertyValue","propertyID":"Composition","name":"OUTER SHELL","value":"100% cotton"},{"@type":"PropertyValue","propertyID":"Composition","name":"LINING","value":"100% polyester"}]}</script>'), "none+high"],
  ["JSON-LD material", page("<h1>Legging</h1>", '<script type="application/ld+json">{"@type":"Product","name":"Legging","material":"78% Polyamide, 22% Elastane"}</script>'), "high"],
];
// "none+high" = two boxes: a green one, then a red one
for (const [name, html, want] of pageCases) check(name, badge(html).states.join("+"), want);

// Wording of the new boxes
console.log("\nBox text");
const named = badge(page("<h1>Tee</h1><dl><dt>Material</dt><dd>Polyester, Cotton</dd></dl>"));
check("named: title", named.titles[0], "Contains plastic");
check("named: note", named.notes[0], "Amounts not found");
check("named: one box", named.states.length, 1);
const multi = badge(comp("Shell: 100% cotton. Lining: 100% polyester"));
check("multi: labels", multi.parts.join("|"), "Shell|Lining");
check("multi: titles", multi.titles.join("|"), "No plastic fibers|Plastic 100%");
check("single part has no label line", badge(comp("60% cotton, 40% polyester")).parts[0], undefined);
const many = badge(comp("Shell: 100% cotton. Lining: 100% polyester. Fill: 100% polyester. Trim: 100% nylon. Rib: 100% acrylic. Sleeves: 100% wool"));
check("at most 5 boxes", many.states.length, 5);

// ---- 3. Color boundaries: red > 10%, orange <= 10%, green 0% ----
console.log("\nColors");
const colorCases = [
  ["0% plastic", "100% cotton", "none"],
  ["exactly 10%", "90% cotton, 10% polyester", "low"],
  ["10.5%", "89.5% cotton, 10.5% polyester", "high"],
  ["sum of fibers is 12%", "88% cotton, 7% polyester, 5% acrylic", "high"],
  ["sum of fibers is 9%", "91% cotton, 5% polyester, 4% spandex", "low"],
  ["lining 100% polyester", "Shell: 100% cotton. Lining: 100% polyester", "none+high"],
  ["pocketing 5% polyester", "Body: 100% cotton. Pocketing: 95% cotton, 5% polyester", "none+low"],
  ["both parts colored on their own", "Shell: 92% cotton, 8% polyester. Lining: 100% polyester", "low+high"],
];
for (const [name, txt, want] of colorCases) check(name, badge(comp(txt)).states.join("+"), want);

// ---- 4. Real product pages saved in test/corpus/pages ----
// Expectations were read off each page's fabric text by hand. Refresh or extend
// with test/corpus/fetch.js (urls.txt). Pages that build their fabric text with
// JavaScript can't be saved this way; their strings live in the parser cases above.
console.log("\nReal pages");
const CORPUS = path.join(__dirname, "corpus", "pages");
const corpusCases = {
  "colorful-crew": ["none", 0],
  "colorful-sweatpants": ["none", 0],
  "cuyana-cape": ["none", 0],               // "baby alpaca" once broke the sum
  "cuyana-scarf": ["none", 0],
  "everlane-dress": ["none", 0],
  "girlfriend-bodysuit": ["found", 100],    // "recycled water bottles (RPET)" + spandex
  "girlfriend-tank": ["found", 100],
  "outdoorvoices-short": ["found", 100],
  "outdoorvoices-polo": ["none", 0],
  "taylorstitch-cardigan": ["none", 0],
  "taylorstitch-quarterzip": ["none", 0],
  "uniqlo-e465185": ["found", 47],          // no JSON-LD: product page found via cart button + URL
  "amazon-uk-linen-shirt": ["none", 0],     // "70%Rayon30%Linen" (no spaces); comparison table lists other shirts
  "nike-hoodie": ["found", 60],             // slash-separated: "51% polyester/25% modal/..."
  "nike-leggings": ["found", 100],
  "nike-shorts": ["found", 100],
  "nike-football-tee": ["none", 0],
  "boohoo-tee": ["none", 0],
  "boohoo-dress": ["found", 100],
  "boohoo-bikini": ["unknown", undefined],  // no material anywhere on the page
  "mns-jeans": ["found", 1],
  "mns-beach-dress": ["found", 80],
  "mns-cotton-dress": ["none", 0],
  "target-hoodie": ["found", 15],
  "target-tee": ["unknown", undefined],
  "jl-shirt": ["none", 0],
  "jl-trousers": ["found", 2],              // "98% BCI Cotton 2% Elastane"
  "jl-dress": ["none", 0],
  "jl-polo": ["none", 0],
  "tkmaxx-joggers": ["found", 70],          // "Shell: ..." and "Pockets: ..." are separate <li>s
  "asos-chiffon": ["found", 100],
  "asos-shirt-dress": ["found", 100],       // "Shell 1: 100% Polyester, Shell 2: 100% Cotton"
  "asos-supersoft": ["found", 55],
  "oldnavy-dress": ["none", 0],             // label is buried in h2 > button > div > div > span; one fiber per <li>
  "nordstrom-maeve": ["found", 100],        // "100% polyester" is one bullet under "Details & care"
  "macys-kensie": ["found", 100],           // "Shell & lining: 100% polyester" (rendered DOM capture)
  "amazon-us-workout-shirt": ["found", 100],
  "amazon-us-kinglaman": ["found", 100],
  "ebay-133788765446": ["named", undefined], // "Material: Polyester, Cotton" - fibers named, no percentages
  "ebay-298351800570": ["found", 50],       // seller-typed "Material: Cotton, Polyester, 50% Polyester 50% Cotton"
  "hm-1135758001": ["found", 4],            // "Composition Cotton 96%, Elastane 4%"
  "hm-1229297002": ["found", 5],            // JSON-LD description first; "Shell: 70% Organic cotton, 25% Recycled cotton, 5% Recycled elastane"
  "hm-1343736001": ["found", 52],           // "Upper part: ... Bottom part: Polyester 100% Bottom part lining: ..."
  "etsy-linen-slip": ["unknown", undefined],   // "Materials: Linen" - no percentages
  "etsy-cotton-linen-maxi": ["unknown", undefined],
  "shein-mesh-dress": ["found", 100],       // Shein: composition only in embedded script state
  "shein-lune-dress": ["found", 100],
  "shein-knit-dress": ["found", 100],
  "zara-satin-dress": ["found", 100],       // composition only in JSON-LD (propertyID "Composition"); tab is empty until clicked
  "allbirds-dasher": ["unknown", undefined], // page names no percentages: unknown, never "none"
  "allbirds-cruiser": ["unknown", undefined],
};
// Pages whose garment has several parts: how many boxes the badge should show
const corpusParts = { "tkmaxx-joggers": 2, "hm-1343736001": 3, "nike-hoodie": 2, "asos-chiffon": 2, "macys-kensie": 1 };
for (const [name, [status, pct]] of Object.entries(corpusCases)) {
  const html = fs.readFileSync(path.join(CORPUS, `${name}.html`), "utf8");
  const url = html.match(/^<!-- (\S+) -->/)[1];
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  for (const f of ["parser.js", "detect.js"]) dom.window.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  const pc = dom.window.PolyCheck;
  const r = pc.analyzePage();
  check(`${name}: product page`, pc.isProductPage(), true);
  check(`${name}: status`, r.status, status);
  if (pct !== undefined) check(`${name}: plastic %`, r.plasticPct, pct);
  if (corpusParts[name] !== undefined) check(`${name}: boxes`, r.parts.length, corpusParts[name]);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
