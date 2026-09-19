// Downloads the product pages listed in urls.txt into pages/, trimmed (see trim.js).
// Sites that build the fabric text with JavaScript need capture.js instead.
// Usage: node test/corpus/fetch.js [name ...]   (no names = everything missing)
const fs = require("fs");
const path = require("path");
const { trim } = require("./trim");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const dir = path.join(__dirname, "pages");

(async () => {
  const only = process.argv.slice(2);
  const entries = fs.readFileSync(path.join(__dirname, "urls.txt"), "utf8")
    .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/));
  for (const [name, url] of entries) {
    const file = path.join(dir, `${name}.html`);
    if (only.length ? !only.includes(name) : fs.existsSync(file)) continue;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, redirect: "follow" });
      if (!res.ok) { console.log(`FAIL ${name}: HTTP ${res.status}`); continue; }
      const out = `<!-- ${url} -->\n` + trim(await res.text());
      fs.writeFileSync(file, out);
      console.log(`ok   ${name} (${Math.round(out.length / 1024)} KB)`);
    } catch (e) {
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }
})();
