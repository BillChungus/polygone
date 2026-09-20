/**
 * detect.js
 * Finds the composition text on a page, using four tiers (most reliable first):
 *   1. jsonld  - schema.org Product data
 *   2. labeled - text under a "Composition" / "Materials" / "Details" label
 *   3. state   - composition inside the page's embedded script data (Shein)
 *   4. scan    - any short block containing fiber percentages
 * Every candidate is parsed and scored; the best one wins.
 *
 * Exposes: PolyCheck.isProductPage(), PolyCheck.analyzePage()
 */
(function () {
  const NS = (window.PolyCheck = window.PolyCheck || {});
  const { parseComposition, hasFiberPattern } = NS;

  const MIN_SCORE = 3;
  const MAX_SCAN_CANDIDATES = 60;

  // Regions that mention fabrics but aren't about the main product.
  const EXCLUDE_KEYWORDS = [
    "review", "recommend", "carousel", "related", "similar",
    "upsell", "cross-sell", "recently", "compar", "sponsored", "also-bought", "customers-also",
  ];
  const EXCLUDE_SELECTOR =
    EXCLUDE_KEYWORDS.map((k) => `[class*="${k}" i],[id*="${k}" i]`).join(",") +
    ",footer,nav";

  const LABEL_TEXT =
    /^(composition|material\s+composition|(?:material|fabric)\s+type|materials?|fabrics?|fabric\s*(?:&|and)\s*care|materials?\s*(?:&|and)\s*care|care\s*(?:&|and)\s*materials?|details|(?:product\s+)?details\s*(?:&|and)\s*care|product details|product information|description)\s*:?$/i;
  const KEYWORD_NEAR = /composition|material|fabric|shell|lining|content|made (?:of|from)/i;
  const PREFILTER = /%|poly|poli|聚酯/i;
  const TIER_BONUS = { jsonld: 3, labeled: 2, state: 1, scan: 0 };
  const PRODUCT_URL = /\/(?:products?|p|pd|dp|item|items|goods|prd)\/[^/]+/i;

  const norm = (s) => s.replace(/\s+/g, " ").trim();

  // ---------- Product-page detection ----------

  function flattenJsonLd(node, out) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => flattenJsonLd(n, out));
    const types = [].concat(node["@type"] || []);
    if (types.includes("Product") || types.includes("ProductGroup")) out.push(node);
    if (node["@graph"]) flattenJsonLd(node["@graph"], out);
  }

  function getJsonLdProducts() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { flattenJsonLd(JSON.parse(s.textContent), out); } catch { /* malformed JSON-LD is common */ }
    }
    return out;
  }

  function isProductPage() {
    if (getJsonLdProducts().length) return true;
    const ogType = document.querySelector('meta[property="og:type"]')?.content?.toLowerCase();
    if (ogType?.includes("product")) return true;
    const hasPrice = !!document.querySelector(
      '[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]'
    );
    const hasCart = [...document.querySelectorAll("button, input[type=submit], a[role=button]")]
      .some((b) => /add to (?:bag|cart|basket)/i.test(b.textContent || b.value || ""));
    // Client-rendered shops (e.g. Uniqlo) have no structured price, so accept a
    // cart button on a product-looking URL too.
    return hasCart && (hasPrice || PRODUCT_URL.test(location.pathname));
  }

  // ---------- Candidate extraction ----------

  // textContent (not innerText) so collapsed accordions are still readable.
  function* textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !n.parentElement || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    while (walker.nextNode()) yield walker.currentNode;
  }

  function jsonLdCandidates() {
    const out = [];
    for (const p of getJsonLdProducts()) {
      const texts = [];
      const mat = p.material;
      if (mat) texts.push(Array.isArray(mat) ? mat.join(", ") : typeof mat === "object" ? mat.name : String(mat));
      // Usually {name: "Material", value: "..."}. Zara instead sends
      // {propertyID: "Composition", name: "OUTER SHELL", value: "97% polyester, 3% elastane"},
      // where the name is the garment part, so keep it as a "Part:" label for the parser.
      const isFabricProp = (s) => /material|composition|fabric/i.test(s || "");
      const parts = [].concat(p.additionalProperty || [])
        .filter((prop) => prop && prop.value != null && (isFabricProp(prop.name) || isFabricProp(prop.propertyID)))
        .map((prop) => (isFabricProp(prop.name) || !prop.name ? "" : `${prop.name}: `) + String(prop.value));
      if (parts.length) texts.push(parts.join(". "));
      if (typeof p.description === "string") texts.push(p.description.replace(/<[^>]+>/g, " "));
      for (const t of texts) if (t) out.push({ tier: "jsonld", el: null, text: norm(t) });
    }
    return out;
  }

  // Text of an element with a space between text nodes. Plain textContent glues
  // neighbouring blocks together ("11% spandexTo care..."), which hides the fiber.
  const textOf = (el) => norm([...textNodes(el)].map((n) => n.data).join(" "));

  // The same text, one entry per visual line (<li>, <p>, <br>, ...), so the badge can show a page's
  // bullet list as bullets instead of one run-on paragraph. Table cells and dt/dd stay on one line.
  const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|DL|FIELDSET|FIGURE|FOOTER|FORM|H[1-6]|HEADER|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TBODY|THEAD|TFOOT|TR|UL)$/;
  const CELL = /^(TD|TH|DT|DD)$/;
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT)$/;
  const MAX_LINES = 12;
  const MAX_LINE = 200;
  // Some shops type their own bullets into the text ("• Material: 100% Cotton"); the panel draws its
  // own, so drop them or every line shows two. A lone "-" only counts when followed by a space.
  const LEADING_BULLET = /^(?:[•·∙▪▫◦●○■□‣⁃*]|[-–—](?=\s))\s*/;
  const UI_TEXT = /^(?:read|show|see|view) (?:more|less|all)$/i; // "Read more" buttons inside the block

  function linesOf(root) {
    const lines = [];
    let cur = "";
    const flush = () => {
      const t = norm(cur).replace(LEADING_BULLET, "");
      if (t && !UI_TEXT.test(t)) lines.push(t.length > MAX_LINE ? t.slice(0, MAX_LINE) + "…" : t);
      cur = "";
    };
    (function walk(node) {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) cur += c.data;
        else if (c.nodeType === 1 && !SKIP.test(c.tagName)) {
          if (c.tagName === "BR") flush();
          else if (BLOCK.test(c.tagName)) { flush(); walk(c); flush(); }
          else { walk(c); if (CELL.test(c.tagName)) cur += " "; }
        }
      }
    })(root);
    flush();
    return lines.slice(0, MAX_LINES);
  }

  // Some shops (Shein) never print the fabric; it only exists in the page's embedded state as
  // {"attrName":"Composition","attrValue":"94% Polyamide, 6% Elastane"}. That state is a JSON string
  // inside a script, so quotes may arrive escaped (\"). Only reads what is already in the page.
  const STATE_COMPOSITION =
    /\\*"(?:attr_?name(?:_en)?|attrName)\\*"\s*:\s*\\*"(?:Composition|Material composition|Fabric composition|Fabric content)\\*"\s*,\s*\\*"(?:attr_?value(?:_en)?|attrValue)\\*"\s*:\s*\\*"([^"\\]{3,160})/gi;

  // Target keeps its spec bullets in the same kind of state, as HTML inside JSON strings:
  // "<B>Material:</B> 100% Cotton" (the angle brackets usually arrive as \u003c / \u003e).
  const STATE_BULLET =
    /(?:\\u003c|<)[Bb](?:\\u003e|>)\s*(?:Material|Fabric Content|Composition)\s*:?\s*(?:\\u003c|<)\/[Bb](?:\\u003e|>)\s*:?\s*([^"\\<]{3,120})/g;

  function stateCandidates() {
    const seen = new Set();
    for (const s of document.scripts) {
      if (s.type === "application/ld+json" || s.textContent.length < 500 || !/omposition|abric content|aterial/.test(s.textContent)) continue;
      for (const m of s.textContent.matchAll(STATE_COMPOSITION)) seen.add(norm(m[1]));
      for (const m of s.textContent.matchAll(STATE_BULLET)) seen.add(norm(m[1]));
      if (seen.size >= 5) break;
    }
    return [...seen].map((v) => ({ tier: "state", el: null, text: `Composition: ${v}` }));
  }

  const isShort = (el) => el.textContent.length < 1500;

  // Given a label element ("Composition"), find the element holding its value:
  // the next sibling (accordion panel, <dd>, <td>) or a small parent ("Composition: 60% ...").
  function blockAfterLabel(labelEl) {
    let el = labelEl;
    for (let depth = 0; el && el !== document.body && depth < 6; depth++, el = el.parentElement) {
      const sib = el.nextElementSibling;
      if (sib && isShort(sib) && hasFiberPattern(textOf(sib))) return sib;
      const parent = el.parentElement;
      if (parent && isShort(parent) && hasFiberPattern(textOf(parent))) return parent;
    }
    return null;
  }

  function labeledCandidates() {
    const out = [];
    for (const node of textNodes(document.body)) {
      const t = node.data.trim();
      if (t.length < 3 || t.length > 40 || !LABEL_TEXT.test(t)) continue;
      const block = blockAfterLabel(node.parentElement);
      if (block) out.push({ tier: "labeled", el: block, text: textOf(block) });
    }
    return out;
  }

  function scanCandidates() {
    const out = [];
    const seen = new Set();
    for (const node of textNodes(document.body)) {
      if (!PREFILTER.test(node.data)) continue;
      let el = node.parentElement;
      if (!el || el.textContent.length > 600) continue;
      // "<li>Shell: <b>100% polyester</b></li>" splits across nodes: climb a little.
      for (let up = 0; el && up < 3 && !hasFiberPattern(textOf(el)); up++) {
        const parent = el.parentElement;
        if (!parent || parent.textContent.length > 300) { el = null; break; }
        el = parent;
      }
      if (!el || !hasFiberPattern(textOf(el))) continue;
      // Parts are often sibling lines ("Shell: 65% ..." / "Pockets: 60% ..." as two <li>s, or one fiber
      // per <li>). Stopping at the first hit would hide the rest, so take the shared parent instead.
      const parent = el.parentElement;
      if (parent && parent !== document.body && parent.textContent.length < 500 &&
          [...parent.children].filter((c) => hasFiberPattern(textOf(c))).length >= 2) {
        el = parent;
      }
      if (seen.has(el)) continue;
      seen.add(el);
      out.push({ tier: "scan", el, text: textOf(el) });
      if (out.length >= MAX_SCAN_CANDIDATES) break;
    }
    return out;
  }

  // ---------- Fibers named without percentages ----------

  // eBay, Etsy and marketplace listings often just say "Material: Polyester, Cotton". That proves
  // plastic is present even though no amount is given. Only short label values count: a whole page
  // mentions "polyester" in reviews and other products.
  const NAMED_LABEL =
    /^(?:materials?|material type|material composition|fabrics?|fabric type|fabric content|composition|outer material)s*:?$/i;
  const NAMED_INLINE =
    /^(?:materials?|material type|fabrics?|fabric type|composition)s*:s*(.{2,120})$/i;
  const NAMED_MAX = 120;

  function valueAfterLabel(labelEl) {
    let el = labelEl;
    for (let depth = 0; el && el !== document.body && depth < 5; depth++, el = el.parentElement) {
      const sib = el.nextElementSibling;
      if (!sib || sib.textContent.length > 400) continue;
      const text = textOf(sib);
      if (text.length <= NAMED_MAX && NS.findNamedFibers(text).length) return { el: sib, text };
    }
    return null;
  }

  function namedFiberCandidates() {
    const out = [];
    const add = (tier, el, text) => {
      if (el && el.closest(EXCLUDE_SELECTOR)) return;
      const all = NS.findNamedFibers(text);
      const plastic = all.filter(NS.isPlastic);
      if (plastic.length) out.push({ tier, text, all, plastic });
    };
    for (const p of getJsonLdProducts()) {
      const mat = p.material;
      if (mat) add("jsonld", null, norm(Array.isArray(mat) ? mat.join(", ") : typeof mat === "object" ? String(mat.name || "") : String(mat)));
    }
    for (const node of textNodes(document.body)) {
      const t = node.data.trim();
      if (t.length < 3 || t.length > 150) continue;
      const inline = t.match(NAMED_INLINE);
      if (inline) { add("labeled", node.parentElement, norm(inline[1])); continue; }
      if (t.length <= 30 && NAMED_LABEL.test(t)) {
        const v = valueAfterLabel(node.parentElement);
        if (v) add("labeled", v.el, v.text);
      }
      if (out.length >= 5) break;
    }
    return out;
  }

  // ---------- Scoring ----------

  function score(text, tier, comp) {
    let s = TIER_BONUS[tier] + (comp.confidence === "high" ? 4 : 1);
    if (KEYWORD_NEAR.test(text)) s += 2;
    if (text.length < 200) s += 1;
    else if (text.length > 600) s -= 2;
    return s;
  }

  // ---------- Public API ----------

  // Title text used only for satin/fleece hints when no composition is found.
  function nameText() {
    return [
      document.querySelector("h1")?.textContent,
      document.querySelector('meta[property="og:title"]')?.content,
      ...getJsonLdProducts().map((p) => p.name),
    ]
      .filter((t) => typeof t === "string")
      .join(" ");
  }

  function summarize(best) {
    let result = { status: "unknown" };

    if (best) {
      const comp = best.composition;
      const { plasticPct, breakdown, otherParts, parts, unrecognised } = NS.summarizeComposition(comp);

      // "No plastic" is only trustworthy if the composition adds up.
      // Otherwise we can't tell "none" from "we missed it".
      const status =
        plasticPct > 0 ? "found"
        : otherParts.length ? "partial"   // shell is clean, lining/fill isn't
        : comp.confidence === "high" ? (unrecognised.length ? "unrecognised" : "none")  // never green if a fiber is unknown
        : "unknown";

      result = {
        status,
        plasticPct,
        breakdown,
        otherParts,
        unrecognised,
        parts,
        segments: comp.segments,
        confidence: comp.confidence,
        tier: best.tier,
        snippet: best.text.slice(0, 240),
        lines: best.el ? linesOf(best.el) : [], // page's own line breaks, for the panel and reports
      };
    }

    if (result.status === "unknown") {
      // No usable percentages, but a "Material: Polyester" line still tells us plastic is in there.
      const named = namedFiberCandidates()[0];
      if (named) {
        return {
          ...result,
          status: "named",
          fibers: named.plastic,
          allFibers: named.all,
          tier: named.tier,
          snippet: named.text.slice(0, 240),
        };
      }
      const hints = NS.findHints(nameText());
      if (hints.length) result = { ...result, status: "possible", hints };
    }
    return result;
  }

  function analyzePage() {
    const candidates = [...jsonLdCandidates(), ...labeledCandidates(), ...scanCandidates(), ...stateCandidates()];
    let best = null;
    for (const c of candidates) {
      if (c.el && c.el.closest(EXCLUDE_SELECTOR)) continue;
      const composition = parseComposition(c.text);
      if (!composition) continue;
      const s = score(c.text, c.tier, composition);
      if (s >= MIN_SCORE && (!best || s > best.score)) best = { ...c, composition, score: s };
    }
    return summarize(best);
  }

  NS.isProductPage = isProductPage;
  NS.analyzePage = analyzePage;
})();
