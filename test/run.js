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
  for (const f of ["parser.js", "detect.js", "report.js", "badge.js"]) {
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
  // Wider fiber list: plastic
  ["80% cotton, 15% modacrylic, 5% polypropylene", 20],
  ["100% PES", 100],
  ["50% cotton 50% TPU", 50],
  ["100% Kevlar", 100],
  ["60% cotton 40% polyolefin", 40],
  ["95% cotton 5% elastodiene", 5],
  ["97% cotton 3% elastolefin", 3],
  ["100% Dyneema", 100],
  ["70% cotton 30% PLA fibre", 0],
  ["70% cotton 30% polylactic acid", 30],
  ["Nylon 60%, Cotton 40%", 60],
  ["Nylon 6,6 80% Elastane 20%", 100],
  ["80% Polyamide 6 20% Elastane", 100],
  ["100% chlorofibre", 100],
  // Wider fiber list: not plastic
  ["90% down, 10% feathers", 0],
  ["95% cotton, 5% other fibres", 0],
  ["98% cotton, 2% metallic fibre", 0],
  ["60% wool 40% kapok", 0],
  ["70% lambswool 30% angora", 0],
  ["100% jute", 0],
  ["55% ramie 45% cotton", 0],
  ["100% micro modal", 0],
  ["50% camel hair, 50% wool", 0],
  ["100% triacetate", 0],
  // Unknown fibers that complete the composition are accepted; text that doesn't isn't
  ["60% cotton, 38% polyester, 2% xyzfibre", 38],
  ["98% cotton, 2% Polyxyzene fibre", 2],
  ["70% cotton 30% Zorbex", 0],
  ["Save 40% off polyester tees", null],
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
  ["compound label is one part: 'Body/Gusset Lining' + 'Mesh'", comp("Body/Gusset Lining: 75% polyester/25% elastane. Mesh: 81% nylon/19% elastane."), "high+high"],
  ["compound label starting with body is the main fabric", comp("Lining: 100% polyester. Body/Gusset Lining: 100% cotton"), "high+none"],
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
const nikeLeggings = badge(comp("Body/Gusset Lining: 75% polyester/25% elastane. Mesh: 81% nylon/19% elastane."));
check("compound label reads as one part, title-cased", nikeLeggings.parts.join("|"), "Body/Gusset Lining|Mesh");
check("hood lining is its own part", badge(comp("Body: 100% cotton. Hood lining: 100% polyester")).parts.join("|"), "Body|Hood Lining");
check("single part has no label line", badge(comp("60% cotton, 40% polyester")).parts[0], undefined);
const many = badge(comp("Shell: 100% cotton. Lining: 100% polyester. Fill: 100% polyester. Trim: 100% nylon. Rib: 100% acrylic. Sleeves: 100% wool"));
check("at most 5 boxes", many.states.length, 5);

// ---- Report a wrong reading: pre-filled GitHub issue, nothing sent by the extension ----
console.log("\nReport");
const R = load("<html><body></body></html>").PolyCheck.report;
check("url: query and fragment are dropped", R.safeUrl("https://shop.example/p/1?utm=abc&email=a@b.c#reviews"), "https://shop.example/p/1");
check("url: credentials are dropped", R.safeUrl("https://user:pw@shop.example/p/1"), "https://shop.example/p/1");
check("url: non-web pages are not shared", R.safeUrl("chrome://extensions/"), "");
check("url: junk is not shared", R.safeUrl("nonsense"), "");

const sample = {
  href: "https://shop.example/p/1?x=1",
  lines: ["Shell: Plastic 70% (65% polyester)"],
  result: { status: "found", tier: "scan", snippet: "Shell: 65% Polyester `x`\nnext line" },
  version: "0.1.0",
  comment: "tag says cotton",
};
const rep = R.build(sample);
check("report: title has the host only", rep.title, "Wrong reading: shop.example");
check("report: page line is the clean url", rep.body.split("\n")[0], "**Page:** https://shop.example/p/1");
check("report: no query string anywhere", rep.body.includes("x=1"), false);
check("report: says what the badge showed", rep.body.includes("Shell: Plastic 70% (65% polyester)"), true);
check("report: snippet is one line, no backticks", rep.body.includes("> Shell: 65% Polyester 'x' next line"), true);
check("report: includes the person's comment", rep.body.includes("**What looks wrong:** tag says cotton"), true);
check("report: empty comment gets a prompt", R.build({ ...sample, comment: "" }).body.includes("(add details here)"), true);
const longComment = R.build({ ...sample, comment: "a".repeat(900) }).body.split("**What looks wrong:** ")[1].split("\n")[0];
check("report: comment is capped at 500 characters", longComment.length, 500);
check("report: page with no usable url says so", R.build({ ...sample, href: "chrome://x" }).body.includes("(not shared)"), true);
check("issue link targets the repo's new-issue page", R.issueUrl(rep).startsWith(`https://github.com/${R.REPO}/issues/new?title=`), true);
check("issue link carries the whole report", decodeURIComponent(R.issueUrl(rep).split("&body=")[1]), rep.body);

// The panel: opening the report view, editing, cancelling. Any network call or window.open would count.
{
  const dom = new JSDOM(comp("Shell: 100% cotton. Lining: 100% polyester"), {
    runScripts: "outside-only",
    url: "https://shop.example/p/1?utm_source=newsletter&email=me@example.com#frag",
  });
  const w = dom.window;
  let sent = 0;
  w.fetch = () => sent++;
  w.open = () => sent++;
  w.XMLHttpRequest = function () { sent++; };
  w.navigator.sendBeacon = () => sent++;
  for (const f of ["parser.js", "detect.js", "report.js", "badge.js"]) w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  w.PolyCheck.badge.render(w.PolyCheck.analyzePage(), {});

  const sr = w.document.getElementById("polycheck-host").shadowRoot;
  const button = (label) => [...sr.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  const preview = sr.querySelector("pre");
  const view = preview.parentElement;
  const link = sr.querySelector("a.btn");

  check("report view starts hidden", view.hidden, true);
  button("Report wrong reading").click();
  check("report view opens", view.hidden, false);
  check("preview shows the clean page url", preview.textContent.includes("**Page:** https://shop.example/p/1\n"), true);
  check("preview has no query string or fragment", /utm_source|example\.com|frag/.test(preview.textContent), false);
  check("preview says what the boxes showed", preview.textContent.includes("Lining: Plastic 100%"), true);
  check("link opens a new tab without opener", link.target === "_blank" && /noopener/.test(link.rel), true);
  check("link goes to github.com", link.href.startsWith("https://github.com/"), true);

  const textarea = sr.querySelector("textarea");
  textarea.value = "The tag says 100% cotton";
  textarea.dispatchEvent(new w.Event("input"));
  check("typing updates the preview", preview.textContent.includes("The tag says 100% cotton"), true);
  check("typing updates the link", decodeURIComponent(link.href).includes("The tag says 100% cotton"), true);

  button("Cancel").click();
  check("cancel closes the report view", view.hidden, true);
  check("cancel brings back the details", button("Hide on this page").closest(".actions").parentElement.hidden, false);
  check("nothing was sent by the extension", sent, 0);
}

// ---- "How this was read" keeps the page's own lines, shown as bullets ----
console.log("\nBullets");
const linesOf = (body) => load(page(body)).PolyCheck.analyzePage().lines;
check(
  "list items become separate lines",
  linesOf("<h1>Joggers</h1><h3>Composition</h3><ul><li>Blue</li><li>Shell: 65% polyester, 35% cotton</li><li>Machine wash</li></ul>").join("|"),
  "Blue|Shell: 65% polyester, 35% cotton|Machine wash"
);
check(
  "<br> splits lines",
  linesOf("<h1>Tee</h1><h3>Composition</h3><p>Shell: 100% cotton<br>Lining: 100% polyester</p>").join("|"),
  "Shell: 100% cotton|Lining: 100% polyester"
);
check(
  "a table cell is one line, not split at commas or cells",
  linesOf("<h1>Tee</h1><table><tr><th>Composition</th><td>60% cotton, <b>40% polyester</b></td></tr></table>").join("|"),
  "60% cotton, 40% polyester"
);
check(
  "inline markup stays on one line",
  linesOf("<h1>Tee</h1><h3>Composition</h3><ul><li>Shell: <b>100% polyester</b></li></ul>").join("|"),
  "Shell: 100% polyester"
);
check(
  "typed-in bullet characters are dropped",
  linesOf("<h1>Jacket</h1><h3>Composition</h3><p>• Material: 100% Cotton<br>· Do not bleach<br>- Iron low<br>Read more</p>").join("|"),
  "Material: 100% Cotton|Do not bleach|Iron low"
);
check(
  "a hyphen inside a word is kept",
  linesOf("<h1>Tee</h1><h3>Composition</h3><ul><li>-5% off</li><li>Long-sleeve: 100% cotton</li></ul>").join("|"),
  "-5% off|Long-sleeve: 100% cotton"
);
check(
  "at most 12 lines",
  linesOf("<h1>Tee</h1><h3>Composition</h3><ul>" + Array.from({ length: 20 }, (_, i) => `<li>Line ${i}</li>`).join("") + "<li>100% cotton</li></ul>").length,
  12
);

function bulletsIn(html) {
  const w = load(html);
  w.PolyCheck.badge.render(w.PolyCheck.analyzePage(), {});
  const sr = w.document.getElementById("polycheck-host").shadowRoot;
  return {
    items: [...sr.querySelectorAll("ul.read li")].map((li) => li.textContent),
    hits: [...sr.querySelectorAll("ul.read li.hit")].map((li) => li.textContent),
    quote: sr.querySelector("blockquote")?.textContent,
  };
}
const shown = bulletsIn(page("<h1>Joggers</h1><h3>Composition</h3><ul><li>Blue</li><li>Shell: 65% polyester, 35% cotton</li><li>Machine wash</li></ul>"));
check("panel shows bullets", shown.items.join("|"), "Blue|Shell: 65% polyester, 35% cotton|Machine wash");
check("panel highlights the fabric line only", shown.hits.join("|"), "Shell: 65% polyester, 35% cotton");
check("no run-on quote when bullets are shown", shown.quote, undefined);
const single = bulletsIn(page("<h1>Tee</h1><h3>Composition</h3><p>100% cotton</p>"));
check("one line falls back to a plain quote", single.quote, "100% cotton");
const fromJson = bulletsIn(page("<h1>Legging</h1>", '<script type="application/ld+json">{"@type":"Product","name":"Legging","material":"78% Polyamide, 22% Elastane"}</script>'));
check("data without page lines uses a plain quote", fromJson.quote, "78% Polyamide, 22% Elastane");

const bulletReport = R.build({ ...sample, result: { ...sample.result, lines: ["Blue", "Shell: 65% Polyester"] } });
check("report quotes bullet lines", bulletReport.body.includes("> - Blue\n> - Shell: 65% Polyester"), true);

// ---- Fibers the list doesn't know: accepted when they complete a composition, always reported ----
console.log("\nUnknown fibers");
const boxes = (txt) => badge(comp(txt));
check("unrecognised fiber is never green", boxes("98% cotton, 2% Zorbex").states.join("+"), "unknown");
check("unrecognised: title", boxes("98% cotton, 2% Zorbex").titles[0], "Fiber not recognised");
check("unrecognised: note names the fiber and amount", boxes("98% cotton, 2% Zorbex").notes[0], "Can't tell if plastic: zorbex 2%");
check("unrecognised fiber that looks like a plastic is counted", boxes("90% cotton, 10% Polyxyzene").states.join("+"), "low");
check("known plastic plus an unrecognised fiber still shows the plastic", boxes("60% cotton, 30% polyester, 10% Zorbex").states.join("+"), "high");
check("regenerated cellulose 'polynosic' is not guessed to be plastic", boxes("45% wool, 55% Polynosic").states.join("+"), "unknown");
check("'40% off' is not a fiber", boxes("60% cotton, 40% off").states.join("+"), "unknown");
check("'40% off' does not make it green either", boxes("60% cotton, 40% off").titles[0], "Material not found");
check("a part with an unknown fiber gets its own box", boxes("Shell: 98% cotton, 2% Zorbex. Lining: 100% polyester").states.join("+"), "unknown+high");
check("a page with only unknown words is not a composition", plasticOf("50% Zorbex 50% Blorf"), null);
{
  const w = load(comp("98% cotton, 2% Zorbex"));
  w.PolyCheck.badge.render(w.PolyCheck.analyzePage(), {});
  const panel = w.document.getElementById("polycheck-host").shadowRoot.querySelector(".panel");
  check("panel explains the unknown fiber", panel.textContent.includes('We don\'t have "zorbex" in our fiber list'), true);
  check("panel lists it as not recognised", panel.textContent.includes("2% zorbex (not recognised)"), true);
  const r = w.PolyCheck.analyzePage();
  check("result lists the unrecognised fibers", r.unrecognised.map((f) => f.name).join(","), "zorbex");
  check("status is unrecognised", r.status, "unrecognised");
}

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
  "33mm-elliot-jacket": ["none", 0],        // page types its own "•" bullets and has a "Read more" button
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
const corpusParts = { "tkmaxx-joggers": 2, "hm-1343736001": 3, "nike-hoodie": 3, "nike-leggings": 2, "nike-shorts": 3, "asos-chiffon": 2, "macys-kensie": 1 };
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
  if (name === "33mm-elliot-jacket") check("33mm-elliot-jacket: no doubled bullets or UI text", r.lines[0] === "Material: 100% Cotton" && !r.lines.some((l) => /^[•·]|Read more/.test(l)), true);
  if (name === "tkmaxx-joggers") check("tkmaxx-joggers: bullets", r.lines.includes("Pockets: 60% Cotton, 40% Polyester") && r.lines.length === 10, true);
  if (corpusParts[name] !== undefined) check(`${name}: boxes`, r.parts.length, corpusParts[name]);
}

// ---- 5. Settings: on/off rule, toolbar popup, and the content script reacting to changes ----
console.log("\nSettings");
const S = load("<html><body></body></html>");
S.eval(fs.readFileSync(path.join(SRC, "settings.js"), "utf8"));
const st = S.PolyCheck.settings;
const on = (settings, host) => st.isOn({ ...st.DEFAULTS, ...settings }, host);
check("on by default", on({}, "shop.example"), true);
check("global off", on({ enabled: false }, "shop.example"), false);
check("site off", on({ disabledHosts: ["shop.example"] }, "shop.example"), false);
check("other sites stay on", on({ disabledHosts: ["shop.example"] }, "other.example"), true);
check("www is ignored when matching", on({ disabledHosts: ["shop.example"] }, "www.shop.example"), false);
check("stored www entry still matches", on({ disabledHosts: ["www.shop.example"] }, "shop.example"), false);
check("a parent domain covers subdomains", on({ disabledHosts: ["amazon.co.uk"] }, "smile.amazon.co.uk"), false);
check("lookalike host is not covered", on({ disabledHosts: ["shop.example"] }, "notshop.example"), true);
check("empty entry matches nothing", on({ disabledHosts: [""] }, "shop.example"), true);
check("host case is ignored", on({ disabledHosts: ["Shop.Example"] }, "SHOP.example"), false);

// Fake chrome API backed by a plain object; listeners are kept so tests can fire storage changes.
function fakeChrome(store, tabUrl) {
  const listeners = [];
  return {
    listeners,
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (o) => {
          const changes = {};
          for (const [k, v] of Object.entries(o)) {
            changes[k] = { newValue: v };
            store[k] = v;
          }
          listeners.forEach((l) => l(changes, "sync"));
        },
      },
      onChanged: { addListener: (l) => listeners.push(l) },
    },
    tabs: { query: async () => (tabUrl ? [{ url: tabUrl }] : []) },
  };
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function openPopup(store, tabUrl) {
  const html = fs.readFileSync(path.join(__dirname, "..", "popup", "popup.html"), "utf8");
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ""), {
    runScripts: "outside-only",
    url: "chrome-extension://x/popup/popup.html",
  });
  const w = dom.window;
  w.chrome = fakeChrome(store, tabUrl);
  w.eval(fs.readFileSync(path.join(SRC, "settings.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(__dirname, "..", "popup", "popup.js"), "utf8"));
  await tick();
  return { w, $: (id) => w.document.getElementById(id), store };
}

// Loads the real content script into a product page with the fake chrome API.
async function runContent(store) {
  const html = comp("Shell: 100% cotton. Lining: 100% polyester");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://shop.example/p/1" });
  const w = dom.window;
  w.chrome = fakeChrome(store, null);
  for (const f of ["parser.js", "detect.js", "report.js", "badge.js", "settings.js", "content.js"]) {
    w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  }
  await tick(60);
  return { has: () => !!w.document.getElementById("polycheck-host"), chrome: w.chrome };
}

(async () => {
  // Popup
  let p = await openPopup({}, "https://www.shop.example/p/1?x=1");
  check("popup: enabled switch starts on", p.$("enabled").checked, true);
  check("popup: site row shows the host without www", p.$("site-label").textContent, "On for shop.example");
  check("popup: site switch starts on", p.$("site").checked, true);
  check("popup: no 'sites turned off' section yet", p.$("off-section").hidden, true);
  p.$("site").click();
  await tick();
  check("popup: turning a site off stores it", p.store.disabledHosts.join(","), "shop.example");
  check("popup: turned-off site is listed", p.$("off-list").textContent.includes("shop.example"), true);
  p.$("site").click();
  await tick();
  check("popup: turning it back on removes it", p.store.disabledHosts.length, 0);
  p.$("enabled").click();
  await tick();
  check("popup: global off stores enabled=false", p.store.enabled, false);
  check("popup: site switch is disabled while everything is off", p.$("site").disabled, true);

  p = await openPopup({ disabledHosts: ["shop.example", "other.example"] }, "https://shop.example/");
  check("popup: existing entry shows the switch off", p.$("site").checked, false);
  p.w.document.querySelector("#off-list button").click();
  await tick();
  check("popup: 'Turn on' in the list removes just that site", p.store.disabledHosts.join(","), "other.example");

  p = await openPopup({ disabledHosts: ["shop.example"] }, "https://sub.shop.example/");
  check("popup: subdomain of a turned-off site shows off", p.$("site").checked, false);
  p.$("site").click();
  await tick();
  check("popup: turning the subdomain on drops the parent entry", p.store.disabledHosts.length, 0);

  p = await openPopup({}, "chrome://extensions/");
  check("popup: no site switch on browser pages", p.$("site-row").hidden, true);
  p = await openPopup({}, undefined);
  check("popup: no site switch without a tab", p.$("site-row").hidden, true);
  p = await openPopup({ disabledHosts: ["<img src=x onerror=alert(1)>"] }, undefined);
  check("popup: stored host text is plain text, not markup", p.w.document.querySelectorAll("img").length, 0);

  // Content script: badge appears, then follows the settings live
  let c = await runContent({});
  check("content: badge shows by default", c.has(), true);
  await c.chrome.storage.sync.set({ enabled: false });
  await tick(60);
  check("content: switching off removes the badge at once", c.has(), false);
  await c.chrome.storage.sync.set({ enabled: true });
  await tick(60);
  check("content: switching back on brings it back", c.has(), true);
  await c.chrome.storage.sync.set({ disabledHosts: ["www.shop.example"] });
  await tick(60);
  check("content: turning this site off removes the badge", c.has(), false);
  await c.chrome.storage.sync.set({ disabledHosts: ["other.example"] });
  await tick(60);
  check("content: turning off a different site leaves it", c.has(), true);
  c = await runContent({ enabled: false });
  check("content: starts with no badge when turned off", c.has(), false);
  c = await runContent({ disabledHosts: ["shop.example"] });
  check("content: starts with no badge on a turned-off site", c.has(), false);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
