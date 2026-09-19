// Turns pages captured from a real browser into pages/NAME.html. For sites curl can't fetch or that
// fill in details after load (Macy's, H&M, Nordstrom, ...).
//
// 1. Open the product page in the browser and run this in its console / javascript tool. The padding
//    makes the result big enough that the tool saves it to a file instead of returning it:
//      (()=>{const c=document.documentElement.cloneNode(true);
//        c.querySelectorAll('style,svg,noscript,link,img,picture,source,iframe').forEach(e=>e.remove());
//        c.querySelectorAll('script').forEach(s=>{if(!(s.type==='application/ld+json'||/(polyester|cotton|nylon|elastane|spandex|composition)/i.test(s.textContent)))s.remove()});
//        return JSON.stringify({url:location.href,html:c.outerHTML,pad:' '.repeat(140000)})})()
// 2. node test/corpus/from-capture.js RESULT_FILE NAME [NAME ...]
//    A browser_batch can hold several navigate + capture steps; names are matched to captures in order.
const fs = require("fs");
const path = require("path");
const { trim } = require("./trim");

const [file, ...names] = process.argv.slice(2);
if (!file || !names.length) {
  console.error("usage: from-capture.js RESULT_FILE NAME [NAME ...]");
  process.exit(1);
}

const decode = (text) => {
  // drop the tool's "[javascript_tool:javascript_exec] " prefix (batches only) and "(captured at ...)" footer
  let d = text.split("\n\n(captured")[0].trim().replace(/^\[[\w:-]+\]\s*/, "");
  while (typeof d === "string") d = JSON.parse(d); // the tool JSON-encodes the value, so it may be double-encoded
  return d;
};

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const captures = (Array.isArray(raw) ? raw : [{ text: String(raw) }])
  .map((x) => x.text || "")
  .filter((t) => t.slice(0, 400).includes("url") && t.includes("html"))
  .map(decode);

names.forEach((name, i) => {
  const data = captures[i];
  if (!data) return console.log(`no capture for ${name}`);
  const out = `<!-- ${data.url} -->\n` + trim(data.html);
  fs.writeFileSync(path.join(__dirname, "pages", `${name}.html`), out);
  console.log(`saved ${name} (${Math.round(out.length / 1024)} KB) from ${data.url}`);
});
