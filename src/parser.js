/**
 * parser.js
 * Pure text -> composition logic. No DOM access, so it can be unit-tested in
 * Node against a corpus of real material strings.
 *
 * Exposes: PolyCheck.parseComposition(text), PolyCheck.hasFiberPattern(text),
 *          PolyCheck.summarizeComposition(comp), PolyCheck.findHints(text),
 *          PolyCheck.findNamedFibers(text),
 *          PolyCheck.isPlastic(name)
 */
(function () {
  const NS = (window.PolyCheck = window.PolyCheck || {});

  // Extend freely. A fiber missing from this list makes its segment sum to
  // less than 100, which lowers confidence (see parseComposition).
  const FIBER_NAMES = [
    "polyester", "poli[eé]ster", "polyestere", "聚酯纤维", "聚酯", "poly",
    "polyamide", "nylon", "polyurethane", "pu", "elasto-?multiester", "elastane", "elastan", "spandex", "lycra",
    "cotton", "coton", "algod[oó]n", "baumwolle",
    "viscose", "rayon", "modal", "lyocell", "tencel", "cupro",
    "wool", "merino", "cashmere", "alpaca", "mohair",
    "linen", "flax", "hemp", "silk",
    "acrylic", "acetate", "polypropylene", "leather",
    "polyvinyl chloride", "pvc", "vinyl",
    // Brands sometimes say what the polyester is made from instead of naming it:
    // "89% recycled water bottles (RPET)". "recycled" is required so a bare
    // "bottles" never counts.
    "rpet", "recycled\\s+(?:water\\s+|plastic\\s+)?bottles?", "recycled\\s+plastic",
  ];

  // Words that qualify a fiber without changing what it is: "98% BCI Cotton", "70% baby alpaca".
  const MODIFIERS =
    "recycled|upcycled|organic|regenerated|virgin|baby|pima|supima|egyptian|bci|combed|ring-?spun|lenzing|ecovero|refibra|extra\\s+fine|responsibly\\s+sourced";

  const NUM = "\\d{1,3}(?:[.,]\\d+)?";
  const FIBER =
    "(?<![a-z])(?:(?:" + MODIFIERS + ")\\s+)*(?:" +
    FIBER_NAMES.join("|") +
    ")";

  // One combined regex, scanned left to right, so each percentage is claimed
  // by exactly one fiber. This is what stops "60% cotton 40% polyester" from
  // also matching "cotton 40%".
  //   A: "60% polyester"      B: "polyester 60%" / "polyester (60%)"
  const FIBER_RE_SRC =
    `(?<pa>${NUM})\\s*%\\s*(?<fa>${FIBER})(?![a-z])` +
    `|(?<fb>${FIBER})(?![a-z])\\s*[:(]?\\s*(?<pb>${NUM})\\s*%`;

  const fiberRegex = () => new RegExp(FIBER_RE_SRC, "gi"); // fresh: /g keeps state
  const FIBER_TEST = new RegExp(FIBER_RE_SRC, "i");

  // Labels that start a new garment part: "Shell: ...", "Lining: ..."
  const LABEL_RE =
    /\b((?:upper|lower|bottom|top) part(?: lining)?|outer shell|shell|outer|exterior|main fabric|main material|main|body|pocket lining|pocketing|lining|filling|fill|padding|insulation|contrast|trim|rib|sleeves?|interior|pockets?(?: bags?)?|hood|waistband|collar|cuffs?|top|bottom|front|back)(?:\s*\d+)?\s*:/gi;
  const MAIN_LABELS =
    /^(outer shell|shell|outer|exterior|main fabric|main material|main|body)$/;

  const CANON = [
    [/^(polyester|poli[eé]ster|polyestere|poly|聚酯纤维|聚酯)$/, "polyester"],
    [/^(rpet|(water |plastic )?bottles?|plastic)$/, "polyester"],
    [/^(polyamide|nylon)$/, "nylon"],
    [/^(polyurethane|pu)$/, "polyurethane"],
    [/^elasto-?multiester$/, "elastomultiester"],
    [/^(elastane|elastan|spandex|lycra)$/, "elastane"],
    [/^(viscose|rayon)$/, "viscose"],
    [/^(cotton|coton|algod[oó]n|baumwolle)$/, "cotton"],
    [/^(wool|merino)$/, "wool"],
    [/^(tencel|lyocell)$/, "lyocell"],
    [/^(pvc|polyvinyl chloride|vinyl)$/, "pvc"],
  ];

  const round1 = (n) => Math.round(n * 10) / 10;

  function normalizeFiber(raw) {
    let s = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const recycled = /(^| )(recycled|upcycled) /.test(s);
    s = s.replace(new RegExp(`^(?:(?:${MODIFIERS}) )+`), "");
    for (const [re, name] of CANON) if (re.test(s)) return { name, recycled };
    return { name: s, recycled };
  }

  function parseFibers(text) {
    const fibers = [];
    for (const m of text.matchAll(fiberRegex())) {
      const g = m.groups;
      const pct = parseFloat((g.pa ?? g.pb).replace(",", "."));
      if (pct > 100) continue;
      fibers.push({ ...normalizeFiber(g.fa ?? g.fb), pct });
    }
    return fibers;
  }

  // Never sum across segments: 100% shell + 100% lining is not 200%.
  function splitSegments(text) {
    const marks = [...text.matchAll(LABEL_RE)];
    if (!marks.length) return [{ label: null, text }];
    const out = [];
    if (marks[0].index > 0) out.push({ label: null, text: text.slice(0, marks[0].index) });
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      out.push({ label: m[1].toLowerCase(), text: text.slice(m.index + m[0].length, end) });
    });
    return out;
  }

  // Pages often state the same fabric twice ("Material Type 65% polyester 35% cotton
  // Fabric Type 65% polyester 35% cotton"). Once the fibers reach 100 exactly, anything
  // after that starts a new statement, so stop there instead of summing to 200.
  function firstComposition(fibers) {
    let sum = 0;
    for (let i = 0; i < fibers.length - 1; i++) {
      sum += fibers[i].pct;
      if (Math.abs(sum - 100) <= 0.5) return fibers.slice(0, i + 1);
    }
    return fibers;
  }

  function pickMain(segments) {
    return (
      segments.find((s) => s.label && MAIN_LABELS.test(s.label)) ||
      segments.find((s) => !s.label) ||
      segments[0]
    );
  }

  /**
   * @returns {null | {
   *   segments: {label: string|null, fibers: {name, pct, recycled}[], sum: number, complete: boolean}[],
   *   main: object,               // the segment we summarise (usually the shell)
   *   confidence: "high"|"low"    // high = main segment sums to ~100
   * }}
   */
  function parseComposition(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    const segments = splitSegments(clean)
      .map((s) => {
        const fibers = firstComposition(parseFibers(s.text));
        const sum = round1(fibers.reduce((a, f) => a + f.pct, 0));
        return { label: s.label, fibers, sum, complete: Math.abs(sum - 100) <= 2 };
      })
      .filter((s) => s.fibers.length);
    if (!segments.length) return null;
    const main = pickMain(segments);
    return { segments, main, confidence: main.complete ? "high" : "low" };
  }

  // ---------- Plastic-based fibers ----------

  // From the "which fabrics contain plastic" chart. Edit this set to change
  // what counts. Satin and fleece are handled separately (HINTS): they name a
  // weave or finish, not a fiber.
  const PLASTIC = new Set(["polyester", "nylon", "acrylic", "elastane", "elastomultiester", "polyurethane", "pvc"]);

  // Words that suggest plastic but aren't fibers. Only used when the page has
  // no readable composition, because "silk satin" and "cotton fleece" exist.
  const HINTS = { fleece: /\bfleece\b/i, satin: /\bsatin\b/i };

  const plasticOf = (fibers) => fibers.filter((f) => PLASTIC.has(f.name));

  /**
   * Plastic content of a parsed composition.
   * plasticPct / breakdown describe the main fabric. otherParts lists plastic in
   * other garment parts (lining, fill, ...), which matters when the shell has none.
   * parts has one entry per garment part worth its own box in the badge (see MAX_PARTS).
   */
  function summarizeComposition(comp) {
    const breakdown = plasticOf(comp.main.fibers);
    const plasticPct = Math.min(100, round1(breakdown.reduce((a, f) => a + f.pct, 0)));
    const otherParts = comp.segments
      .filter((s) => s !== comp.main)
      .map((s) => ({ label: s.label, fibers: plasticOf(s.fibers) }))
      .filter((part) => part.fibers.length);
    return { plasticPct, breakdown, otherParts, parts: partsOf(comp) };
  }

  const MAX_PARTS = 5;

  // One entry per garment part ("Shell", "Lining", ...). A part that doesn't add up to 100 and has no
  // plastic is noise ("Trim: 5% ..."), so it only gets a box if it is the main fabric.
  function partsOf(comp) {
    return comp.segments
      .map((s) => {
        const breakdown = plasticOf(s.fibers);
        return {
          label: s.label,
          isMain: s === comp.main,
          complete: s.complete,
          breakdown,
          plasticPct: Math.min(100, round1(breakdown.reduce((a, f) => a + f.pct, 0))),
        };
      })
      .filter((part) => part.isMain || part.plasticPct > 0 || part.complete)
      .slice(0, MAX_PARTS);
  }

  /**
   * Fibers a text NAMES without giving percentages ("Polyester, Cotton"), for pages like eBay and
   * Etsy that only say "Material: Polyester". Returns canonical names, first mention first.
   * Only call this on short label values, never on whole pages ("polyester" appears in reviews).
   */
  function findNamedFibers(text) {
    const seen = new Set();
    for (const m of text.matchAll(new RegExp(FIBER + "(?![a-z])", "gi"))) {
      if (/(^|s)poly$/i.test(m[0])) continue; // bare "poly" is too ambiguous without a number
      seen.add(normalizeFiber(m[0]).name);
    }
    return [...seen];
  }

  const findHints = (text) => Object.keys(HINTS).filter((k) => HINTS[k].test(text));

  NS.parseComposition = parseComposition;
  NS.hasFiberPattern = (text) => FIBER_TEST.test(text);
  NS.summarizeComposition = summarizeComposition;
  NS.findHints = findHints;
  NS.findNamedFibers = findNamedFibers;
  NS.isPlastic = (name) => PLASTIC.has(name);
})();
