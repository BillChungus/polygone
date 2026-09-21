/**
 * parser.js
 * Pure text -> composition logic. No DOM access, so it can be unit-tested in
 * Node against a corpus of real material strings.
 *
 * Exposes: Polygone.parseComposition(text), Polygone.hasFiberPattern(text),
 *          Polygone.summarizeComposition(comp), Polygone.findHints(text),
 *          Polygone.findNamedFibers(text),
 *          Polygone.isPlastic(name)
 */
(function () {
  const NS = (window.Polygone = window.Polygone || {});

  // Extend freely. A fiber missing from this list makes its segment sum to
  // less than 100, which lowers confidence (see parseComposition).
  // Grouped by what the fiber is; PLASTIC (below) says which canonical names count as plastic.
  const FIBER_NAMES = [
    // synthetic: polyester family (PES/PET/PBT are ISO and trade names; PTT = Sorona/triexta)
    "polyester", "poli[eé]ster", "polyestere", "聚酯纤维", "聚酯", "poly", "pes", "pet", "pbt", "ptt",
    "triexta", "sorona", "coolmax", "polyethylene terephthalate",
    // synthetic: nylon family ("nylon 6", "nylon 6,6", aramid = Kevlar/Nomex)
    // The grade suffix must not eat the start of a number: "Nylon 60%" is nylon at 60% (not "nylon 6" at 0%),
    // and "nylon 6,2%" is nylon at 6.2%.
    "polyamide(?:\\s*6(?:[.,]?6)?(?![\\d%]|[.,]\\d))?", "nylon(?:\\s*6(?:[.,]?6)?(?![\\d%]|[.,]\\d))?", "tactel", "supplex", "meryl", "cordura",
    "aramid", "kevlar", "nomex",
    // synthetic: acrylic, olefin, PU, vinyl, stretch
    "acrylic", "modacrylic", "polypropylene", "polyolefin", "polyethylene", "dyneema",
    "polylactic acid", "polylactide", "neoprene",
    "polyurethane", "pu", "tpu", "elasto[- ]?multiester", "elasto[- ]?diene", "elasto[- ]?lefin",
    "elastane", "elastan", "spandex", "lycra",
    "polyvinyl chloride", "polyvinylchloride", "pvc", "vinyl", "chlorofib(?:er|re)",
    // natural and regenerated (never plastic)
    "cotton", "coton", "algod[oó]n", "baumwolle",
    "viscose", "rayon", "modal", "micro[- ]?modal", "lyocell", "tencel(?:\\s+(?:lyocell|modal|luxe))?", "cupro", "acetate", "triacetate", "livaeco",
    // "<animal> wool" is one fiber. If only "merino" were matched, the leftover word "wool" would claim the
    // next percentage ("50% merino wool 50% polyester" lost its polyester), so the full name must match.
    "wool", "lambs?-?wool", "merino(?:\\s+wool)?", "shetland(?:\\s+wool)?", "cashmere(?:\\s+wool)?", "alpaca(?:\\s+wool)?",
    "mohair(?:\\s+wool)?", "angora(?:\\s+wool)?", "camel(?:\\s+(?:hair|wool))?", "yak(?:\\s+wool)?", "llama(?:\\s+wool)?", "vicu[nñ]a",
    "linen", "flax", "hemp", "jute", "ramie", "kapok", "bamboo", "nettle", "silk",
    "leather", "suede", "fur", "(?:duck\\s+|goose\\s+)?down", "feathers?",
    // "other fibres", metallic threads: not named, not counted as plastic
    "other\\s+(?:fib(?:er|re)s?|materials?)", "metallic(?:\\s+fib(?:er|re)s?)?", "metallised(?:\\s+fib(?:er|re)s?)?", "metal", "lurex", "carbon(?:\\s+fib(?:er|re)s?)?",
    // Brands sometimes say what the polyester is made from instead of naming it:
    // "89% recycled water bottles (RPET)". "recycled" is required so a bare
    // "bottles" never counts.
    "rpet", "recycled\\s+(?:water\\s+|plastic\\s+)?bottles?", "recycled\\s+plastic",
  ];

  // Words that qualify a fiber without changing what it is: "98% BCI Cotton", "70% baby alpaca".
  const MODIFIERS =
    "recycled|upcycled|organic|regenerated|virgin|new|baby|pima|supima|egyptian|bci|combed|ring-?spun|lenzing|ecovero|refibra|extra\\s+fine|responsibly[- ]sourced|responsible|reclaimed|tree[- ]derived|certified|sustainable";

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
    // (,? tolerates a stray comma after the percent sign: "10%, Spandex" on Knix)
    `(?<pa>${NUM})\\s*%\\s*,?\\s*(?<fa>${FIBER})(?![a-z])` +
    `|(?<fb>${FIBER})(?![a-z])\\s*[:(]?\\s*(?<pb>${NUM})\\s*%`;

  const fiberRegex = () => new RegExp(FIBER_RE_SRC, "gi"); // fresh: /g keeps state
  const FIBER_TEST = new RegExp(FIBER_RE_SRC, "i");

  // Labels that start a new garment part: "Shell: ...", "Lining: ..."
  // Words that start a garment part: "Shell: ...", "Hood lining: ...", "Mesh: ...". A part can also be
  // several of these joined by slashes ("Body/Gusset Lining: ..."), which is one part, not two.
  const LABEL_WORDS = [
    "(?:upper|lower|bottom|top) part(?: lining)?",
    "outer shell", "shell", "outer", "exterior", "main fabric", "main material", "main", "body",
    "(?:hood|sleeve|waistband|gusset|body|front|back|side) lining", "pocket lining", "pocketing", "lining",
    "filling", "fill", "padding", "insulation", "contrast", "trim", "rib", "sleeves?", "interior",
    "pockets?(?: bags?)?(?: palm side)?", "hood", "waistband", "collar", "cuffs?", "top", "bottom",
    "front", "back", "gusset", "mesh", "brief",
  ];
  const LABEL_WORD = `(?:${LABEL_WORDS.join("|")})`;
  // The number stays in the label: "Gusset 1", "Gusset 2" are different parts, not one part three times.
  const LABEL_RE = new RegExp(String.raw`\b(${LABEL_WORD}(?:\s*/\s*${LABEL_WORD})*(?:\s*\d+)?)\s*:`, "gi");
  const MAIN_LABELS =
    /^(outer shell|shell|outer|exterior|main fabric|main material|main|body)$/;
  // A compound label is main if its first part is ("Body/Gusset Lining" is the body fabric).
  const isMainLabel = (label) => MAIN_LABELS.test(label.split("/")[0].trim().replace(/\s*\d+$/, ""));

  const CANON = [
    [/^(polyester|poli[eé]ster|polyestere|poly|聚酯纤维|聚酯|pes|pet|pbt|ptt|triexta|sorona|coolmax|polyethylene terephthalate)$/, "polyester"],
    [/^(rpet|(water |plastic )?bottles?|plastic)$/, "polyester"],
    [/^(polyamide|nylon|tactel|supplex|meryl|cordura)(?: ?6[.,]?6?)?$/, "nylon"],
    [/^(aramid|kevlar|nomex)$/, "aramid"],
    [/^(polyurethane|pu|tpu)$/, "polyurethane"],
    [/^elasto[- ]?multiester$/, "elastomultiester"],
    [/^elasto[- ]?diene$/, "elastodiene"],
    [/^elasto[- ]?lefin$/, "elastolefin"],
    [/^(elastane|elastan|spandex|lycra)$/, "elastane"],
    [/^(dyneema|polyethylene)$/, "polyethylene"],
    [/^(polylactic acid|polylactide)$/, "polylactic acid"],
    [/^(viscose|rayon|livaeco)$/, "viscose"],
    [/^(modal|micro[- ]?modal)$/, "modal"],
    [/^(cotton|coton|algod[oó]n|baumwolle)$/, "cotton"],
    [/^(wool|lambs?-?wool|merino(?: wool)?|shetland(?: wool)?)$/, "wool"],
    [/^cashmere(?: wool)?$/, "cashmere"],
    [/^alpaca(?: wool)?$/, "alpaca"],
    [/^mohair(?: wool)?$/, "mohair"],
    [/^angora(?: wool)?$/, "angora"],
    [/^yak(?: wool)?$/, "yak"],
    [/^llama(?: wool)?$/, "llama"],
    [/^tencel modal$/, "modal"],
    [/^(tencel|tencel lyocell|tencel luxe|lyocell)$/, "lyocell"],
    [/^carbon(?: fib(?:er|re)s?)?$/, "carbon"],
    [/^(acetate|triacetate)$/, "acetate"],
    [/^camel(?: hair| wool)?$/, "camel"],
    [/^(down|duck down|goose down)$/, "down"],
    [/^feathers?$/, "feather"],
    [/^(pvc|polyvinyl chloride|polyvinylchloride|vinyl|chlorofib(?:er|re))$/, "pvc"],
    [/^other (?:fib(?:er|re)s?|materials?)$/, "other"],
    [/^(metallic|metallised|metal|lurex)(?: fib(?:er|re)s?)?$/, "metallic"],
  ];

  // Real page text is messy in two ways that hide fibers from the matcher:
  //  - registered marks stuck to names: "90% SUPIMA® Cotton", "TENCEL™ Lyocell"
  //  - words run together where a tag or line break was lost: "100% PolyesterMachine wash" (Boohoo)
  // Marks become spaces; a lowercase letter followed by a capital gets a space between them.
  const tidy = (s) => s.replace(/[®™©℠]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

  const round1 = (n) => Math.round(n * 10) / 10;

  function normalizeFiber(raw) {
    let s = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const recycled = /(^| )(recycled|upcycled) /.test(s);
    s = s.replace(new RegExp(`^(?:(?:${MODIFIERS}) )+`), "");
    for (const [re, name] of CANON) if (re.test(s)) return { name, recycled };
    return { name: s, recycled };
  }

  // ---------- Fibers we don't know yet ----------
  // The fiber list is finite, and a name missing from it used to make a composition add up to less
  // than 100 and hide the result. So a word next to a percentage that the list doesn't know is accepted
  // as an "unrecognised" fiber, but only if it completes the composition to ~100%, which keeps
  // "50% off" and similar text out. Unrecognised fibers are always reported, never silently dropped.

  // Words that follow a percentage without being a fiber.
  const NOT_FIBERS = new Set(
    ("off of on in at to for from with and or the a an this that your our new sale save extra free more less " +
     "only was now over under up gbp usd eur discount deposit apr vat tax cashback interest fee star stars " +
     "rating positive recommended customers satisfaction shell lining body main fabric material materials " +
     "composition content care machine wash by as is are be not no yes per cent percent").split(" ")
  );
  // "5% Xyz fibre" -> "xyz"
  const GENERIC_TAIL = new Set(["fibre", "fibres", "fiber", "fibers", "yarn", "yarns", "blend", "fabric"]);
  // Name stems that mean a plastic. Used only for fibers we don't know: better counted than missed.
  const PLASTIC_STEMS = /(poly|acryl|nylon|elast|ester$|olefin|vinyl|plastic|rubber|neoprene|aramid|urethane|amide)/;
  const NOT_PLASTIC_STEMS = /^(polynosic)$/; // "poly..." but regenerated cellulose

  // "5% Xyz" (number first) is much stronger evidence than "Xyz 5%": the word before a number is often
  // just the preceding text ("Heavyweight Fleece 63% Reclaimed Wool"). So the number-first form is
  // searched over the whole text before the word-first form gets a look.
  const UNKNOWN_RES = () => [
    new RegExp(`(?<pa>${NUM})\\s*%\\s*(?<na>[a-z][a-z-]{1,24}(?:\\s+[a-z][a-z-]{1,24}){0,2})`, "gi"),
    new RegExp(`(?<nb>[a-z][a-z-]{2,24})\\s*[:(]?\\s*(?<pb>${NUM})\\s*%`, "gi"),
  ];

  function cleanName(raw) {
    const words = [];
    for (const w of raw.toLowerCase().split(/\s+/)) {
      if (NOT_FIBERS.has(w)) break;
      words.push(w);
    }
    while (words.length && GENERIC_TAIL.has(words[words.length - 1])) words.pop();
    const name = words.join(" ");
    return name.length >= 3 && name.length <= 40 ? name : "";
  }

  function unknownCandidates(text, known) {
    const inKnown = (i) => known.some((k) => i >= k.at && i < k.end);
    const seen = new Set();
    const out = [];
    for (const re of UNKNOWN_RES()) {
      for (const m of text.matchAll(re)) {
        const g = m.groups;
        const raw = g.na ?? g.nb;
        const pctText = g.pa ?? g.pb;
        const at = g.pa !== undefined ? m.index : m.index + m[0].lastIndexOf(pctText);
        const pct = parseFloat(pctText.replace(",", "."));
        const name = cleanName(raw);
        if (!name || pct > 100 || pct <= 0 || inKnown(at) || seen.has(at)) continue;
        seen.add(at);
        out.push({
          name,
          recycled: false,
          pct,
          at,
          unrecognised: true,
          plasticGuess: PLASTIC_STEMS.test(name) && !NOT_PLASTIC_STEMS.test(name),
        });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }

  // Which unknown candidates (if any) bring the composition to 100 (within 2 points)? Must be a real
  // improvement, so a composition that already adds up exactly is left alone. A composition that is
  // "close enough" (98) still lets a matching 2% unknown fiber in, so it is reported, not hidden.
  function pickGapFillers(knownSum, candidates) {
    const err = (total) => Math.abs(total - 100);
    const before = err(knownSum);
    if (!candidates.length || before <= 0.5 || knownSum > 102) return [];
    const better = (total) => err(total) <= 2 && err(total) < before;
    const all = knownSum + candidates.reduce((a, c) => a + c.pct, 0);
    if (better(all)) return candidates;
    const singles = candidates
      .filter((c) => better(knownSum + c.pct))
      .sort((a, b) => err(knownSum + a.pct) - err(knownSum + b.pct));
    return singles.slice(0, 1);
  }

  function parseFibers(text) {
    const known = [];
    for (const m of text.matchAll(fiberRegex())) {
      const g = m.groups;
      const pct = parseFloat((g.pa ?? g.pb).replace(",", "."));
      if (pct > 100) continue;
      known.push({ ...normalizeFiber(g.fa ?? g.fb), pct, at: m.index, end: m.index + m[0].length });
    }
    // Unknown words only get a say once something is recognised ("Save 50% off" alone is not a composition).
    const knownSum = known.reduce((a, f) => a + f.pct, 0);
    const extra = known.length ? pickGapFillers(knownSum, unknownCandidates(text, known)) : [];
    return [...known, ...extra]
      .sort((a, b) => a.at - b.at)
      .map(({ at, end, ...fiber }) => fiber);
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
  // "Reached 100" means exactly 100, or 99+ with a next fiber that would push it past 101. A looser
  // rule dropped real trailing fibers: "99.5% nylon, 0.5% lycra" must keep the lycra.
  function firstComposition(fibers) {
    let sum = 0;
    for (let i = 0; i < fibers.length - 1; i++) {
      sum += fibers[i].pct;
      const exact = Math.abs(sum - 100) <= 0.05;
      const overshoots = sum >= 99 && sum + fibers[i + 1].pct > 101;
      if (exact || overshoots) return fibers.slice(0, i + 1);
    }
    return fibers;
  }

  function pickMain(segments) {
    return (
      segments.find((s) => s.label && isMainLabel(s.label)) ||
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
    const clean = tidy(text).replace(/\s+/g, " ").trim();
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
  const PLASTIC = new Set([
    "polyester", "nylon", "aramid", "acrylic", "modacrylic", "polypropylene", "polyolefin", "polyethylene",
    "polylactic acid", "neoprene", "elastane", "elastomultiester", "elastodiene", "elastolefin",
    "polyurethane", "pvc",
  ]);

  // Words that suggest plastic but aren't fibers. Only used when the page has
  // no readable composition, because "silk satin" and "cotton fleece" exist.
  const HINTS = { fleece: /\bfleece\b/i, satin: /\bsatin\b/i };

  // A fiber the list doesn't know but whose name looks like a plastic ("polyxyz") counts too.
  const isPlasticFiber = (f) => PLASTIC.has(f.name) || !!f.plasticGuess;
  const plasticOf = (fibers) => fibers.filter(isPlasticFiber);
  const unrecognisedOf = (fibers) => fibers.filter((f) => f.unrecognised);

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
    return { plasticPct, breakdown, otherParts, unrecognised: unrecognisedOf(comp.main.fibers), parts: partsOf(comp) };
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
          unrecognised: unrecognisedOf(s.fibers),
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
  NS.hasFiberPattern = (text) => FIBER_TEST.test(tidy(text));
  NS.summarizeComposition = summarizeComposition;
  NS.findHints = findHints;
  NS.findNamedFibers = findNamedFibers;
  NS.isPlastic = (name) => PLASTIC.has(name);
  NS.isPlasticFiber = isPlasticFiber;
})();
