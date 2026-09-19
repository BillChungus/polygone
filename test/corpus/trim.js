// Shrinks a saved page to what the extension reads: markup and JSON-LD.
// Scripts carrying Shein-style composition state are kept. Other scripts, styles, SVG and data-* attributes are dropped.
exports.trim = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, (s) =>
      /attr_?name\\*"\s*:\s*\\*"Composition/i.test(s) ? s : ""
    )
    .replace(/<(style|svg|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/\s+data-[\w-]+="[^"]*"/g, "")
    .replace(/\n\s*\n+/g, "\n");
