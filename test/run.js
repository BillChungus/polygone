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
  const NS = w.Polygone;
  const result = NS.analyzePage();
  NS.badge.render(result, {});
  const pills = [...w.document.getElementById("polygone-host").shadowRoot.querySelectorAll(".pill")];
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
const NS = load("<html><body></body></html>").Polygone;
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
  // Found by the stress test (see test/fuzz.js)
  ["50% merino wool 50% polyester", 50],              // "merino wool" was two fibers; the stray "wool" stole the 50%
  ["20% Merino Wool 80% Polyester", 80],
  ["21% spandex 22% merino wool 54% cotton 3% Polyester", 24],
  ["30% cashmere wool 70% acrylic", 70],
  ["100% new wool", 0],
  ["Nylon (99.5%), lycra (0.5%)", 100],                // a tiny trailing fiber was dropped at "99.5"
  ["17,2% wool, 82,5% cotton, 0,3% polyolefin.", 0.3],
  ["80% cotton 9,5% nylon 6,2% recycled polyamide 4,3% wool", 15.7], // "nylon 6,2%" is 6.2%, not nylon grade 6
  ["80% Nylon 6,6 20% Elastane", 100],
  // Found by scanning ~290 real product pages (Allbirds, Cuyana, Outdoor Voices, Knix, Boohoo)
  ["12% Merino Wool, 7% Tree-derived TENCEL™ Lyocell, 72% Organic Cotton, 9% Recycled Polyester", 9],
  ["Made from 72% organic cotton, 12% responsibly-sourced Merino wool, 9% recycled polyester, and 7% TENCEL™ Lyocell (tree fiber)", 9],
  ["80% Responsible Wool, 11% Cashmere, 9% Polyamide", 9],
  ["Heavyweight Fleece 63% Reclaimed Wool, 24% Nylon, 13% Polyester", 37],
  ["Body: 90% SUPIMA® Cotton, 10% Spandex", 10],
  ["100% PolyesterMachine wash according to instructions on care label", 100],
  ["Body: 77% Nylon, 23% LYCRA® XTRA LIFE™Spandex", 100],
  ["97% Cotton, 3% ElastoMultiester", 3],
  ["60% Cotton, 36% Polyester, 4% Carbon", 36],
  ["Gusset 1: 86% Cotton, 10%, Spandex, 4% Carbon", 10],   // stray comma after the % sign (Knix)
  // Found by a code review: invisible characters and camel-case brand names
  ["60%​ cotton, 40%​ polyester", 40],           // zero-width space after the % made the whole composition unreadable
  ["60% cotton, 40%⁠polyester", 40],                  // word joiner
  ["60% cotton, 40% poly­ester", 40],                  // soft hyphen inside the name
  ["45% EcoVero viscose, 55% Polyester", 55],              // "Eco Vero viscose" was read as an unknown fiber
  ["50% LivaEco viscose, 50% Polyester", 50],
  // Found by re-scanning ~290 real pages after the fixes
  ["Materials: 70% Organic Cotton, 25% LENZING™ ECOVERO™, 5% Elastane", 5],   // Everlane: brand with no "viscose" after it
  ["54% RWS merino wool, 46% cotton", 0],                                       // RWS = Responsible Wool Standard
  ["90% polyvinyl chloride, 10% iron", 90],                                     // M&S hair clip
  ["55% GOTS organic cotton, 45% GRS recycled polyester", 45],
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
  ["numbered parts keep their numbers, one box each (Knix gussets)", comp("Body: 100% cotton. Gusset 1: 86% Cotton, 10% Spandex, 4% Carbon; Gusset 2: 96% Polyester, 4% Spandex"), "none+low+high"],
  ["'Flex' is an unknown fiber, reported not hidden (Boohoo)", comp("Main: 15% Flex, 85% Cotton"), "unknown"],
  ["glued words still read (Boohoo)", page("<h1>Dress</h1><h3>Product Details &amp; Care</h3><p>100% PolyesterMachine wash according to instructions on care label</p>"), "high"],
  ["Target-style description list item in embedded data: '<li>50% Cotton 50% Polyester Preshrunk Fleece Knit</li>'", page("<h1>Hoodie</h1>", "<script>window.__DATA__=" + JSON.stringify({ pad: "x".repeat(600), description: String.raw`Details\r\n<ul><li>50% Cotton 50% Polyester Preshrunk Fleece Knit</li><li>Double-lined hood</li></ul>` }).replace(/\\\\u003c/g, "\\u003c").replace(/\\\\u003e/g, "\\u003e") + "</script>"), "high"],
  ["Target-style spec bullet in embedded data: '<B>Material:</B> 60% Cotton, 40% Polyester'", page("<h1>Tee</h1>", "<script>window.__DATA__=" + JSON.stringify({ pad: "x".repeat(600), bullets: [String.raw`<B>Material:</B> 60% Cotton, 40% Polyester`, String.raw`<B>Fabric Name:</B> Knit`] }).replace(/\\\\u003c/g, "\\u003c").replace(/\\\\u003e/g, "\\u003e") + "</script>"), "high"],
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
const R = load("<html><body></body></html>").Polygone.report;
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
check("report: the text it read is one line, no backticks, in a code block", rep.body.includes("```\nShell: 65% Polyester 'x' next line\n```"), true);
check("report: includes the person's comment", rep.body.includes("**What looks wrong:** tag says cotton"), true);
check("report: empty comment gets a prompt", R.build({ ...sample, comment: "" }).body.includes("(add details here)"), true);
const longComment = R.build({ ...sample, comment: "a".repeat(900) }).body.split("**What looks wrong:** ")[1].split("\n")[0];
check("report: comment is capped at 500 characters", longComment.length, 500);
check("report: page with no usable url says so", R.build({ ...sample, href: "chrome://x" }).body.includes("(not shared)"), true);
check("issue link targets the repo's new-issue page", R.issueUrl(rep).startsWith(`https://github.com/${R.REPO}/issues/new?title=`), true);
check("issue link carries the whole report", decodeURIComponent(R.issueUrl(rep).split("&body=")[1]), rep.body);
{
  // Scraped text is untrusted: it must stay inert in a public issue
  const evil = R.build({ ...sample, result: { status: "found", tier: "scan", snippet: "x", lines: ["Ping @someone see [click](http://evil.example) <img src=x> #123", "100% cotton"] } });
  const fence = evil.body.split("```");
  check("report: scraped text sits inside a code block (mentions, links and HTML stay inert)", fence.length === 3 && fence[1].includes("@someone") && fence[1].includes("<img"), true);
  check("report: nothing scraped appears outside the code block", /@someone|evil\.example|<img/.test(fence[0] + fence[2]), false);
  check("report: a backtick in scraped text cannot close the code block", R.build({ ...sample, result: { status: "found", snippet: "a ``` b" } }).body.split("```").length, 3);

  // Size: GitHub rejects very long links
  const longLines = Array.from({ length: 12 }, () => "Shell: 65% polyester, 29% cotton ✓ – café ".repeat(6).slice(0, 200));
  const boxes = Array.from({ length: 5 }, (_, i) => `Part ${i}: Plastic 65% (65% polyester, 5% spandex/elastane, 30% cotton, 20% other fibres, more text here…)`);
  const worst = R.build({ href: "https://shop.example/" + "very-long-product-slug-".repeat(20) + "/p/1", lines: boxes, result: { status: "found", tier: "labeled", snippet: "x".repeat(240), lines: longLines }, version: "1.0.0", comment: "é ".repeat(250) });
  check("report: the worst case still fits in a GitHub link", R.issueUrl(worst).length <= 7000, true);
  const cjk = R.build({ ...sample, result: { status: "found", tier: "scan", snippet: "x", lines: Array.from({ length: 12 }, () => "面料成分：涤纶 65%，棉 35% 请勿漂白 ".repeat(6)) } });
  check("report: a page in Chinese (9 encoded bytes per character) still fits", R.issueUrl(cjk).length <= 7000, true);
  check("report: the preview is exactly what the link carries", decodeURIComponent(R.issueUrl(worst).split("&body=")[1]), worst.body);
  const twelve = R.build({ ...sample, result: { ...sample.result, lines: Array.from({ length: 12 }, (_, i) => "line " + i) } });
  check("report: a normal report is not shortened", twelve.body.includes("line 11") && twelve.body.includes("tag says cotton"), true);
  check("report: a very long page path is cut", R.safeUrl("https://shop.example/" + "a".repeat(1000)).length <= 330, true);
}

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
  w.Polygone.badge.render(w.Polygone.analyzePage(), {});

  const sr = w.document.getElementById("polygone-host").shadowRoot;
  const button = (label) => [...sr.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  const preview = sr.querySelector("pre");
  const view = preview.parentElement;
  const link = sr.querySelector("a.btn");

  check("report view starts hidden", view.hidden, true);
  button("Report wrong reading").click();
  check("report view opens", view.hidden, false);
  check("report view warns that GitHub issues are public", /issues are public/i.test(view.textContent), true);
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
const linesOf = (body) => load(page(body)).Polygone.analyzePage().lines;
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
  w.Polygone.badge.render(w.Polygone.analyzePage(), {});
  const sr = w.document.getElementById("polygone-host").shadowRoot;
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
check("report puts bullet lines in a code block, one per line", bulletReport.body.includes("```\nBlue\nShell: 65% Polyester\n```"), true);

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
  w.Polygone.badge.render(w.Polygone.analyzePage(), {});
  const panel = w.document.getElementById("polygone-host").shadowRoot.querySelector(".panel");
  check("panel explains the unknown fiber", panel.textContent.includes('We don\'t have "zorbex" in our fiber list'), true);
  check("panel lists it as not recognised", panel.textContent.includes("2% zorbex (not recognised)"), true);
  const r = w.Polygone.analyzePage();
  check("result lists the unrecognised fibers", r.unrecognised.map((f) => f.name).join(","), "zorbex");
  check("status is unrecognised", r.status, "unrecognised");
}

{
  const labels = badge(comp("Body: 100% cotton. Gusset 1: 86% Cotton, 10% Spandex, 4% Carbon; Gusset 2: 96% Polyester, 4% Spandex")).parts.join("|");
  check("numbered part labels are kept", labels, "Body|Gusset 1|Gusset 2");
  const fibersOf = (t) => NS.parseComposition(t).main.fibers;
  check("a preceding word ('Fleece 63%') is not taken as a fiber when '63% Reclaimed Wool' follows",
    fibersOf("Heavyweight Fleece 63% Reclaimed Wool, 24% Nylon, 13% Polyester").filter((f) => f.unrecognised).length, 0);
  check("carbon is known, so 4% carbon adds up without being unrecognised",
    fibersOf("60% Cotton, 36% Polyester, 4% Carbon").filter((f) => f.unrecognised).length, 0);
  check("hyphenated modifier is not a separate fiber",
    fibersOf("Made from 72% organic cotton, 12% responsibly-sourced Merino wool, 9% recycled polyester, and 7% TENCEL™ Lyocell (tree fiber)").filter((f) => f.unrecognised).length, 0);
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
// The saved retailer pages are not part of the public repo (they are copies of other people's sites and
// contain third-party details), so a fresh clone only has the three small hand-reduced fixtures. Missing
// pages are skipped, not failed. Maintainers keep the full set in test/corpus/pages (gitignored).
const skipped = [];
for (const [name, [status, pct]] of Object.entries(corpusCases)) {
  if (!fs.existsSync(path.join(CORPUS, `${name}.html`))) { skipped.push(name); continue; }
  const html = fs.readFileSync(path.join(CORPUS, `${name}.html`), "utf8");
  const url = html.match(/^<!-- (\S+) -->/)[1];
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  for (const f of ["parser.js", "detect.js"]) dom.window.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  const pc = dom.window.Polygone;
  const r = pc.analyzePage();
  check(`${name}: product page`, pc.isProductPage(), true);
  check(`${name}: status`, r.status, status);
  if (pct !== undefined) check(`${name}: plastic %`, r.plasticPct, pct);
  if (name === "33mm-elliot-jacket") check("33mm-elliot-jacket: no doubled bullets or UI text", r.lines[0] === "Material: 100% Cotton" && !r.lines.some((l) => /^[•·]|Read more/.test(l)), true);
  if (name === "tkmaxx-joggers") check("tkmaxx-joggers: bullets", r.lines.includes("Pockets: 60% Cotton, 40% Polyester") && r.lines.length === 10, true);
  if (corpusParts[name] !== undefined) check(`${name}: boxes`, r.parts.length, corpusParts[name]);
}
if (skipped.length) {
  console.log(`SKIP  ${skipped.length} of ${Object.keys(corpusCases).length} saved pages not present (not in the public repo). Everything else still ran.`);
}

// ---- Demo shop (docs/demo): the pages behind the store screenshots and the reviewers' test instructions ----
// If a parser change moves one of these readings, the screenshots and store/listing.md are out of date too.
console.log("\nDemo shop");
{
  const DEMO = path.join(__dirname, "..", "docs", "demo");
  const demoCases = {
    "wrap-dress": { states: ["high"], titles: ["Plastic 100%"] },
    "linen-shirt": { states: ["none"], titles: ["No plastic fibers"] },
    "rib-tee": { states: ["low"], titles: ["Plastic 5%"] },
    "field-jacket": { states: ["none", "high", "low"], titles: ["No plastic fibers", "Plastic 100%", "Plastic 5%"], parts: ["Shell", "Lining", "Pockets"] },
    "boxy-top": { states: ["unknown"], titles: ["Material not found"] },
  };
  for (const [name, want] of Object.entries(demoCases)) {
    const html = fs.readFileSync(path.join(DEMO, `${name}.html`), "utf8");
    const got = badge(html);
    check(`demo ${name}: colors`, got.states.join(","), want.states.join(","));
    check(`demo ${name}: titles`, got.titles.join(","), want.titles.join(","));
    if (want.parts) check(`demo ${name}: parts`, got.parts.join(","), want.parts.join(","));
  }
  const index = fs.readFileSync(path.join(DEMO, "index.html"), "utf8");
  check("demo index: not a product page (no badge)", load(index).Polygone.isProductPage(), false);
  check("demo index: links to every product page", Object.keys(demoCases).every((n) => index.includes(`href="${n}.html"`)), true);
  const docsRoot = fs.readFileSync(path.join(DEMO, "..", "index.html"), "utf8");
  check("docs root (GitHub Pages home): sends visitors to the demo shop", /http-equiv="refresh"[^>]*url=demo\//i.test(docsRoot) && docsRoot.includes('href="demo/"'), true);
  check("docs root: not a product page", load(docsRoot).Polygone.isProductPage(), false);
  const all = fs.readdirSync(DEMO).filter((f) => f.endsWith(".html")).map((f) => fs.readFileSync(path.join(DEMO, f), "utf8")).join("\n");
  check("demo pages: no scripts other than product data, and nothing loaded from other sites", /<script(?![^>]*ld\+json)/i.test(all) || /(?:src|href)=["'](?:https?:)?\/\//i.test(all), false);
}

// ---- Store listing and privacy policy: must keep agreeing with the manifest ----
// The store removes items whose privacy answers contradict what the extension does, so a permission added to the
// manifest without a matching line in the policy and the listing text should fail here, not in review.
console.log("\nStore listing");
{
  const ROOT = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const listing = fs.readFileSync(path.join(ROOT, "store", "listing.md"), "utf8");
  const privacy = fs.readFileSync(path.join(ROOT, "PRIVACY.md"), "utf8");
  const permissions = manifest.permissions || [];
  check("listing: quotes the manifest description as the summary", listing.includes(manifest.description), true);
  check("listing: has a justification for every permission in the manifest", permissions.every((p) => listing.includes("`" + p + "`")), true);
  check("listing: covers the all-sites content script", /<all_urls>/.test(JSON.stringify(manifest.content_scripts)) && /content script that runs on all sites/i.test(listing), true);
  check("privacy policy: mentions every permission in the manifest", permissions.every((p) => privacy.includes(p)), true);
  check("privacy policy: says nothing is sent and gives a contact", /makes no network requests/i.test(privacy) && /issues/i.test(privacy), true);
  check("privacy policy: names the report link's repository", privacy.includes(`github.com/${load("<html><body></body></html>").Polygone.report.REPO}`), true);

  // The store rejects a description that repeats a word unnaturally (more than 5 times) or lists shops.
  const desc = listing.match(/\*\*Description\*\*\s+```\n([\s\S]*?)```/)[1];
  const counts = {};
  for (const w of desc.replace(/https?:\/\/\S+/g, "").toLowerCase().match(/[a-z][a-z'-]{4,}/g)) counts[w] = (counts[w] || 0) + 1;
  check("listing: no long word in the description is used more than 5 times", Math.max(...Object.values(counts)) <= 5, true);
  check("listing: description is not empty and fits the store's limit", desc.length > 500 && desc.length <= 16000, true);

  // Rejected once (23 Sep 2026, "excessive keywords") for a sentence that packed ten fiber names together
  // ("Polyester (including ...), nylon (...), acrylic and modacrylic, elastane (...), polyurethane (...), PVC, ..."),
  // which read as a keyword list even though every word was accurate. Guard against that shape coming back: no
  // sentence in the description should read as a comma-separated pile of terms.
  const sentences = desc.split(/[\n.!?]+/).map((s) => s.trim()).filter(Boolean);
  const mostCommas = Math.max(...sentences.map((s) => (s.match(/,/g) || []).length));
  check("listing: no sentence in the description is a long comma list (reads as keyword stuffing)", mostCommas <= 2, true);
}

// ---- Store package: what ships, the Web Store checks, and that the zip is sound ----
console.log("\nPackage");
{
  const ROOT = path.join(__dirname, "..");
  const pack = require(path.join(ROOT, "scripts", "package.js"));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const files = pack.fileList(manifest);

  const needed = ["manifest.json", "LICENSE", "popup/popup.html", "popup/popup.css", "popup/popup.js", ...manifest.content_scripts[0].js, ...Object.values(manifest.icons)];
  check("package: includes the manifest, license, popup, every content script and icon", needed.every((f) => files.includes(f)), true);
  check("package: every listed file exists", files.every((f) => fs.existsSync(path.join(ROOT, f))), true);
  check("package: nothing from tests, scripts, docs or node_modules", files.some((f) => /^(test|scripts|node_modules|dist)\//.test(f) || /\.md$/i.test(f)), false);
  check("package: passes the Web Store checks", pack.problems(manifest, files).join("; "), "");
  check("package: manifest version matches package.json", manifest.version, version);

  const built = pack.build();
  const back = pack.unzip(built.buffer);
  check("package: zip holds exactly the listed files", back.map((e) => e.name).join(","), files.join(","));
  check("package: every file in the zip is byte-identical to the source", back.every((e) => Buffer.compare(e.data, fs.readFileSync(path.join(ROOT, e.name))) === 0), true);
  check("package: entry names use forward slashes", back.every((e) => !e.name.includes("\\")), true);
  check("package: building twice gives identical bytes", Buffer.compare(pack.build().buffer, built.buffer), 0);
  check("package: stays well under the store's size limit", built.buffer.length < 1024 * 1024, true);

  const problem = (m, f = files) => pack.problems(m, f).join("; ");
  check("package check: over-long description is caught", /description/.test(problem({ ...manifest, description: "x".repeat(133) })), true);
  check("package check: over-long name is caught", /name/.test(problem({ ...manifest, name: "x".repeat(76) })), true);
  check("package check: version mismatch is caught", /does not match/.test(problem({ ...manifest, version: "9.9.9" })), true);
  check("package check: bad version format is caught", /not 1 to 4/.test(problem({ ...manifest, version: "1.0-beta" })), true);
  check("package check: missing 128 px icon is caught", /128/.test(problem({ ...manifest, icons: { 16: manifest.icons[16], 48: manifest.icons[48] } })), true);
  check("package check: wrong icon size is caught", /expected 16x16/.test(problem({ ...manifest, icons: { ...manifest.icons, 16: manifest.icons[128] } })), true);
  check("package check: a missing file is caught", /missing/.test(problem(manifest, [...files, "src/nope.js"])), true);
  check("package check: test files are refused", /should not ship/.test(problem(manifest, [...files, "test/run.js"])), true);
  check("package check: a corrupt zip is refused", (() => { try { pack.unzip(Buffer.from("not a zip")); return "accepted"; } catch { return "refused"; } })(), "refused");
}

// ---- 5. Settings: on/off rule, toolbar popup, and the content script reacting to changes ----
console.log("\nSettings");
const S = load("<html><body></body></html>");
S.eval(fs.readFileSync(path.join(SRC, "settings.js"), "utf8"));
const st = S.Polygone.settings;
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
// Damaged stored data must never make the on/off question throw (that would switch Polygone off everywhere)
const safely = (settings, host) => { try { return st.isOn(settings, host); } catch { return "THREW"; } };
check("settings: a string instead of a list is ignored, not fatal", safely({ enabled: true, disabledHosts: "shop.example" }, "shop.example"), true);
check("settings: a number instead of a list is ignored", safely({ enabled: true, disabledHosts: 5 }, "shop.example"), true);
check("settings: null instead of a list is ignored", safely({ enabled: true, disabledHosts: null }, "shop.example"), true);
check("settings: non-text entries in the list are skipped, real ones still work", safely({ enabled: true, disabledHosts: [null, 5, {}, "shop.example"] }, "shop.example"), false);
check("settings: missing settings object means on", safely(null, "shop.example"), true);
check("settings: only an explicit false turns it off everywhere", safely({ enabled: 0 }, "shop.example"), true);

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
  return { has: () => !!w.document.getElementById("polygone-host"), chrome: w.chrome };
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
  p = await openPopup({ enabled: "yes", disabledHosts: "junk" }, "https://shop.example/");
  check("popup: damaged stored settings still render", p.$("site").checked && !p.$("off-section").hidden === false, true);
  {
    // A save that fails must be reported, not swallowed
    p = await openPopup({}, "https://shop.example/");
    p.w.chrome.storage.sync.set = async () => { throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded"); };
    check("popup: no error shown before anything fails", p.$("save-error").hidden, true);
    p.$("site").click();
    await tick();
    check("popup: a failed save says so", p.$("save-error").hidden === false && /couldn't save/i.test(p.$("save-error").textContent), true);
    p.w.chrome.storage.sync.set = async () => {};
    p.$("site").click();
    await tick();
    check("popup: the error goes away after a save works", p.$("save-error").hidden, true);
  }
  {
    // Badge: Escape closes the open details; the print rule hides the overlay
    const w = load(comp("Shell: 100% cotton. Lining: 100% polyester"));
    w.Polygone.badge.render(w.Polygone.analyzePage(), {});
    const sr = w.document.getElementById("polygone-host").shadowRoot;
    const pill = sr.querySelector(".pill");
    const panel = sr.querySelector(".panel");
    const key = (target, k) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }));
    key(pill, "Escape");
    check("badge: Escape with the details closed does nothing (the page keeps its own Escape)", panel.hidden, true);
    pill.click();
    check("badge: details open after a click", panel.hidden, false);
    key(pill, "a");
    check("badge: other keys leave the details open", panel.hidden, false);
    key(pill, "Escape");
    check("badge: Escape closes the details", panel.hidden, true);
    check("badge: aria-expanded is reset when Escape closes it", pill.getAttribute("aria-expanded"), "false");
    check("badge: hidden when printing", /@media print\s*\{\s*\.wrap\s*\{\s*display:\s*none/.test(sr.querySelector("style").textContent), true);
  }

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

  // ---- Bug-hunt regressions: content script lifecycle ----
  console.log("\nContent script lifecycle");
  const FILES = ["parser.js", "detect.js", "report.js", "badge.js", "settings.js", "content.js"];
  async function live(html, opts = {}) {
    const dom = new JSDOM(html, { runScripts: "outside-only", url: opts.url || "https://shop.example/p/1", contentType: opts.contentType });
    const w = dom.window;
    w.chrome = fakeChrome({}, null);
    let adds = 0; // how many times the badge was (re)created: guards against feedback loops
    new w.MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.id === "polygone-host") adds++; }).observe(w.document, { childList: true, subtree: true });
    let done;
    for (const f of FILES) done = w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
    await done; // content.js is an async IIFE
    return { w, badges: () => w.document.querySelectorAll("#polygone-host").length, adds: () => adds, text: () => w.document.getElementById("polygone-host")?.shadowRoot.textContent || "" };
  }
  const head = '<meta property="og:type" content="product">';
  const withComp = "<h1>Tee</h1><h3>Composition</h3><p>100% polyester</p>";

  {
    // 1. A page that changes constantly must still get scanned (a debounce would restart on every change)
    const p = await live(page("<h1>Tee</h1><p>Loading…</p>", head));
    const spin = setInterval(() => p.w.document.body.append(p.w.document.createElement("span")), 60);
    await tick(250);
    p.w.document.body.insertAdjacentHTML("beforeend", "<h3>Composition</h3><p>100% polyester</p>");
    await tick(1400);
    clearInterval(spin);
    check("content: a page that never stops changing still gets its badge", p.badges(), 1);
  }
  {
    // 2. Client-side navigation to another product must not leave the old product's badge up
    const p = await live(page(withComp, head), { url: "https://shop.example/p/one" });
    await tick(80);
    check("content: badge shows for the first product", p.badges(), 1);
    p.w.history.pushState({}, "", "/p/two");
    p.w.document.body.innerHTML = "<h1>Other tee</h1><p>Details loading…</p>";
    await tick(900);
    check("content: the previous product's badge is removed when the URL changes", p.badges(), 0);
  }
  {
    // 3. Frameworks that swap <body> (Turbo, htmx): the observer must survive it
    const p = await live(page("<h1>Tee</h1><p>Loading…</p>", head));
    await tick(80);
    const newBody = p.w.document.createElement("body");
    newBody.innerHTML = withComp;
    p.w.document.documentElement.replaceChild(newBody, p.w.document.body);
    await tick(900);
    check("content: still works after the page replaces <body>", p.badges(), 1);
    newBody.insertAdjacentHTML("beforeend", "<p>more</p>");
    await tick(50);
  }
  {
    // 4. If the page removes our badge, it comes back
    const p = await live(page(withComp, head));
    await tick(80);
    p.w.document.getElementById("polygone-host").remove();
    p.w.document.body.append(p.w.document.createElement("i")); // any change wakes the scan
    await tick(900);
    check("content: a badge removed by the page is restored", p.badges(), 1);
  }
  {
    // 5. Adding our own badge must not trigger scan after scan
    const p = await live(page(withComp, head));
    await tick(1800);
    check("content: no re-render loop (badge created once)", p.adds(), 1);
  }
  {
    // 6. A document with no <body> (SVG/XML) must not throw
    let threw = false;
    try {
      const p = await live('<svg xmlns="http://www.w3.org/2000/svg"><text>100% polyester</text></svg>', { contentType: "image/svg+xml" });
      await tick(100);
      check("content: an SVG document gets no badge", p.badges(), 0);
    } catch { threw = true; }
    check("content: an SVG document does not throw", threw, false);
  }
  {
    // 7. A scan that throws is contained and later scans still work. The page starts undecided (no fabric yet),
    //    so scans keep happening; a page with a final answer is deliberately not scanned again.
    const p = await live(page("<h1>Tee</h1><button>Add to bag</button>", head));
    await tick(120);
    const real = p.w.Polygone.analyzePage;
    let attempts = 0;
    p.w.Polygone.analyzePage = () => { attempts++; throw new Error("boom"); };
    p.w.document.body.insertAdjacentHTML("beforeend", "<p>Material: coming soon</p>"); // matters, so a scan really runs
    await tick(800);
    check("content: the scan was attempted (and threw, contained)", attempts >= 1, true);
    p.w.Polygone.analyzePage = real;
    p.w.document.body.insertAdjacentHTML("beforeend", "<h3>Composition</h3><p>100% cotton</p>");
    await tick(900);
    check("content: a failed scan does not stop later scans", p.badges(), 1);
  }
  {
    // 9. Only changes that could matter cost a scan (carousels, timers and chat widgets never do)
    const p = await live(page("<h1>Plain tee</h1><button>Add to bag</button>", head));
    await tick(120);
    let scans = 0;
    const real = p.w.Polygone.analyzePage;
    p.w.Polygone.analyzePage = () => { scans++; return real(); };
    for (let i = 0; i < 25; i++) {
      const d = p.w.document.createElement("div");
      d.textContent = `tick ${i} of the carousel`;
      p.w.document.body.append(d);
      await tick(30);
    }
    await tick(600);
    check("content: 25 unrelated page changes cause no scan at all", scans, 0);
    // (text that mentions fabric but gives no answer, so the page stays undecided and keeps being scanned)
    p.w.document.body.insertAdjacentHTML("beforeend", "<p>Material: soft and lovely</p>");
    await tick(700);
    check("content: a change that mentions fabric does cause a scan", scans >= 1, true);
    const before = scans;
    p.w.document.body.insertAdjacentHTML("beforeend", "<script type='application/ld+json'>{}</script>");
    await tick(700);
    check("content: new structured data (a <script>) causes a scan", scans > before, true);
    const c2 = scans;
    p.w.document.body.firstElementChild.firstChild.data = "Plain tee, now 20% off";
    await tick(700);
    check("content: text changed in place that mentions a percentage causes a scan", scans > c2, true);
  }
  {
    // 8. Unrecognised fibers are a final answer: the page is not rescanned forever
    const p = await live(page("<h1>Tee</h1><h3>Composition</h3><p>98% cotton, 2% Zorbex</p>", head));
    await tick(80);
    check("content: an unrecognised-fiber result is shown", /not recognised/i.test(p.text()), true);
  }

  // ---- Bug-hunt regressions: what the detector reads ----
  console.log("\nDetector regressions");
  const state = (html) => badge(html).states.join("+");
  check("a 'product-preview' wrapper does not hide the fabric (it contains 'review')", state(page('<h1>Tee</h1><div class="product-preview"><h3>Composition</h3><p>100% polyester</p></div>')), "high");
  check("a class on <body> ('has-reviews') does not blank the whole page", state(`<html><head>${head}</head><body class="has-reviews"><h1>Tee</h1><h3>Composition</h3><p>100% polyester</p></body></html>`), "high");
  check("'unrelated-content' is not 'related'", state(page('<h1>Tee</h1><div class="unrelated-content"><h3>Composition</h3><p>100% polyester</p></div>')), "high");
  check("camelCase 'customerReviews' is still excluded", state(page('<h1>Tee</h1><h3>Composition</h3><p>100% cotton</p><div class="customerReviews"><p>Feels like 100% polyester</p></div>')), "none");
  check("an id like 'recently-viewed' is still excluded", state(page('<h1>Tee</h1><h3>Composition</h3><p>100% cotton</p><section id="recentlyViewed"><p>Other tee 100% polyester</p></section>')), "none");
  check("'comparison' tables are still excluded", state(page('<h1>Tee</h1><h3>Composition</h3><p>100% cotton</p><div class="product-comparison-table"><p>Rival 100% polyester</p></div>')), "none");
  check("<nav> and <footer> are still excluded", state(page('<h1>Tee</h1><h3>Composition</h3><p>100% cotton</p><footer><p>Shop 100% polyester basics</p></footer>')), "none");
  const cards = Array.from({ length: 70 }, (_, i) => `<div class="recommended-item"><p>Tee ${i} 100% cotton</p></div>`).join("");
  check("70 recommendation cards before the real fabric do not use up the candidate cap", state(page(`<h1>Tee</h1>${cards}<p>Made from 100% polyester</p>`)), "high");

  check("named: whitespace before the colon ('Material : Polyester')", state(page("<h1>Tee</h1><p>Material : Polyester</p>")), "named");
  check("named: no space after the colon, value starting with s ('Material:Spandex, Cotton')", state(page("<h1>Tee</h1><p>Material:Spandex, Cotton</p>")), "named");
  check("named: 'recycled poly' alone is too vague to count", state(page("<h1>Tee</h1><p>Material: Recycled poly</p>")), "unknown");
  {
    const w = load(page("<h1>Tee</h1><h3>Composition</h3><p>40% cotton</p><p>Material: Polyester</p>"));
    const r = w.Polygone.analyzePage();
      check("the main fabric keeps its box even when it comes after five other parts",
    badge(comp("Lining: 100% polyester. Trim: 100% nylon. Rib: 100% acrylic. Hood: 100% nylon. Pocket: 100% polyester. Shell: 100% cotton.")).parts.join("|"),
    "Lining|Trim|Rib|Hood|Shell");
  check("a named-fiber result carries no leftover segments from a low-confidence composition", r.status === "named" && r.segments === undefined && r.parts === undefined, true);
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
