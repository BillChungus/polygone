#!/usr/bin/env node
// Makes the Chrome Web Store images in store/screenshots/ from the made-up shop in docs/demo, using real Chrome with
// the extension loaded, so every badge, panel and popup in them is what the extension really draws.
//
//   npm install --no-save puppeteer-core     (once; the project does not depend on it)
//   node store/make-screenshots.js
//
// CHROME_PATH sets the Chrome to use if it is not in its usual place. EXT_DIR loads the extension from somewhere else
// (for example an unzipped store package) instead of this folder. Chrome opens visible windows for a minute; leave it.
//
// Sizes follow the Web Store: screenshots 1280x800, small promo tile 440x280, 24-bit PNG (no alpha).
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

let puppeteer;
try {
  puppeteer = require("puppeteer-core");
} catch {
  console.error("This needs puppeteer-core (version 25 or newer):  npm install --no-save puppeteer-core");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const EXT = path.resolve(process.env.EXT_DIR || ROOT);
const DEMO = path.join(ROOT, "docs", "demo");
const OUT = path.join(__dirname, "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const home = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    home && path.join(home, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH to chrome.exe (or the Chrome binary).");
  return found;
}

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const ICON = dataUri(path.join(ROOT, "icons", "icon128.png"));

// The badge colors, as the extension draws them (src/badge.js).
const RED = "#b42318", ORANGE = "#d95f02", GREEN = "#146c43", GRAY = "#4a5563";

// ---------- a tiny web server for the demo shop ----------

function serve() {
  const root = path.resolve(DEMO);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css" };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("not found");
    }
    res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

// ---------- helpers that work on a page with the badge ----------

async function openProduct(browser, port, file, { deviceScaleFactor } = {}) {
  const page = await browser.newPage();
  if (deviceScaleFactor) await page.setViewport({ width: 1024, height: 640, deviceScaleFactor });
  await page.goto(`http://localhost:${port}/${file}.html`, { waitUntil: "load" });
  await page.addStyleTag({ content: "html{scrollbar-width:none}" }); // no scrollbar in the image
  // A page with no fabric information gets its badge only after the extension has waited a few seconds.
  await page.waitForFunction(() => !!document.getElementById("polygone-host"), { timeout: 15000 });
  await sleep(700);
  return page;
}

// A real mouse click, as a person would: a synthetic click from the page does not reach the badge.
async function clickBadge(page) {
  const c = await page.evaluate(() => {
    const r = document.getElementById("polygone-host").shadowRoot.querySelector(".pill").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(c.x, c.y);
  await sleep(500);
}

// A headline strip across the top of the page, so the picture explains itself in the store's small preview.
async function addBand(page, headline, sub) {
  await page.evaluate(({ headline, sub, icon }) => {
    const band = document.createElement("div");
    band.style.cssText =
      "position:fixed;left:0;right:0;top:0;height:76px;z-index:2147483000;display:flex;align-items:center;gap:16px;" +
      "padding:0 28px;background:#0c2a38;color:#fff;font-family:'Segoe UI',system-ui,sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.25)";
    const img = document.createElement("img");
    img.src = icon; img.width = 44; img.height = 44; img.alt = "";
    const text = document.createElement("div");
    const h = document.createElement("div");
    h.style.cssText = "font-size:23px;font-weight:650;line-height:1.2";
    h.textContent = headline;
    const s = document.createElement("div");
    s.style.cssText = "font-size:14px;color:#a9dcef;margin-top:3px";
    s.textContent = sub;
    text.append(h, s);
    band.append(img, text);
    document.documentElement.append(band);
  }, { headline, sub, icon: ICON });
}

async function productShot(browser, port, { file, scroll = 124, open = false, headline, sub, out }) {
  const page = await openProduct(browser, port, file);
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
  if (open) await clickBadge(page);
  await addBand(page, headline, sub);
  await page.mouse.move(2, 2);
  await sleep(300);
  await page.screenshot({ path: out, type: "png" });
  await page.close();
}

// The first box of a page's badge on a plain background, for the color guide.
async function badgeCrop(browser, port, file) {
  const page = await openProduct(browser, port, file, { deviceScaleFactor: 2 });
  await page.addStyleTag({ content: "html{background:#fff!important} body{visibility:hidden!important}" });
  await sleep(200);
  const box = await page.evaluate(() => {
    const r = document.getElementById("polygone-host").shadowRoot.querySelector(".pill").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const pad = 12;
  const png = await page.screenshot({
    type: "png",
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
  });
  await page.close();
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

// The toolbar popup as Chrome shows it. It is opened as a tab, with the tab lookup answered as if the shop were open.
async function popupCrop(browser, port) {
  const probe = await browser.newPage();
  const client = await probe.createCDPSession();
  let extId = null;
  client.on("Runtime.executionContextCreated", (e) => {
    const m = (e.context.origin || "").match(/^chrome-extension:\/\/([a-p]{32})/);
    if (m) extId = m[1];
  });
  await client.send("Runtime.enable");
  await probe.goto(`http://localhost:${port}/wrap-dress.html`, { waitUntil: "load" });
  await sleep(1500);
  await probe.close();
  if (!extId) throw new Error("Could not find the extension. Is Chrome 137+ and is EXT_DIR right?");

  const popupJs = fs.readFileSync(path.join(EXT, "popup", "popup.js"), "utf8");
  const stub = 'chrome.tabs.query = async () => [{ url: "https://www.linden-co.example/products/odette-wrap-dress" }];\n';
  const popup = await browser.newPage();
  await popup.setViewport({ width: 300, height: 400, deviceScaleFactor: 2 });
  await popup.setRequestInterception(true);
  popup.on("request", (req) => {
    if (req.url().endsWith("/popup/popup.js")) return req.respond({ status: 200, contentType: "text/javascript", body: stub + popupJs });
    req.continue();
  });
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: "load" });
  await popup.evaluate(() => chrome.storage.sync.set({ enabled: true, disabledHosts: ["discount-outlet.example"] }));
  await popup.reload({ waitUntil: "load" });
  await sleep(700);
  const png = await (await popup.$("body")).screenshot({ type: "png" });
  await popup.evaluate(() => chrome.storage.sync.clear()); // leave the profile as it was
  await popup.close();
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

// ---------- designed images (HTML rendered by Chrome) ----------

const FONT = "'Segoe UI',system-ui,-apple-system,Roboto,sans-serif";

const colorGuideHtml = (crops) => {
  const rows = [
    [crops.red, RED, "Red", "More than 10% plastic-based fiber"],
    [crops.orange, ORANGE, "Orange", "Up to 10%"],
    [crops.green, GREEN, "Green", "No plastic fibers listed"],
    [crops.gray, GRAY, "Gray", "No fabric details on the page. It says so instead of showing green"],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:56px;padding:0 84px;color:#fff;font-family:${FONT};
      background:radial-gradient(90% 120% at 15% 10%,#175a75 0%,#0c2a38 62%)}
    .l{flex:1 1 0;min-width:0} .l img{width:72px;height:72px;display:block}
    h1{font-size:54px;line-height:1.05;margin:24px 0 16px;font-weight:650;letter-spacing:-.01em;white-space:nowrap}
    .l p{font-size:24px;line-height:1.45;margin:0;color:#b9e4f4;max-width:400px}
    .card{flex:none;width:640px;background:#fff;border-radius:22px;padding:10px 34px;box-shadow:0 24px 60px rgba(0,0,0,.35);color:#161a1f}
    .row{display:flex;align-items:center;gap:26px;padding:18px 0;border-bottom:1px solid #e6ebf0} .row:last-child{border-bottom:0}
    .row img{width:260px;flex:none;display:block} .t b{display:block;font-size:25px;margin-bottom:3px} .t span{font-size:19px;line-height:1.35;color:#4a5563}
  </style></head><body>
    <div class="l"><img src="${ICON}" alt=""><h1>Know at a glance</h1><p>Every clothing product page gets a badge you can read in a second.</p></div>
    <div class="card">${rows.map(([img, color, name, text]) =>
      `<div class="row"><img src="${img}" alt=""><div class="t"><b style="color:${color}">${name}</b><span>${text}</span></div></div>`).join("")}</div>
  </body></html>`;
};

const popupSceneHtml = (popupImg) => `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:60px;padding:0 84px;color:#fff;font-family:${FONT};
      background:radial-gradient(90% 120% at 15% 10%,#175a75 0%,#0c2a38 62%)}
    .l{flex:1 1 0;min-width:0} .l img{width:72px;height:72px;display:block}
    h1{font-size:60px;line-height:1.05;margin:24px 0 16px;font-weight:650;letter-spacing:-.01em}
    .l p{font-size:24px;line-height:1.45;margin:0 0 14px;color:#b9e4f4;max-width:440px}
    .scene{flex:none;width:560px}
    .bar{display:flex;align-items:center;gap:12px;height:56px;padding:0 14px;background:#dde4e9;border-radius:14px 14px 0 0}
    .omni{flex:1;height:34px;border-radius:17px;background:#fff;color:#5d6560;font-size:15px;line-height:34px;padding:0 16px;overflow:hidden;white-space:nowrap}
    .btn{width:38px;height:38px;border-radius:9px;background:#fff;display:grid;place-items:center;box-shadow:0 0 0 2px #2ec0ea}
    .btn img{width:26px;height:26px}
    .page{height:60px;background:#f3f5f7;border-radius:0 0 14px 14px}
    .pop{margin:-6px 6px 0 auto;width:450px;border-radius:12px;overflow:hidden;box-shadow:0 22px 50px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.08);position:relative}
    .pop img{display:block;width:450px}
  </style></head><body>
    <div class="l"><img src="${ICON}" alt=""><h1>You're in control</h1>
      <p>Turn Polygone off everywhere, or for a single shop, from the toolbar icon.</p>
      <p>It works on your device. Nothing leaves your browser.</p></div>
    <div class="scene">
      <div class="bar"><div class="omni">linden-co.example/products/odette-wrap-dress</div><div class="btn"><img src="${ICON}" alt=""></div></div>
      <div class="page"></div>
      <div class="pop" style="margin-top:-46px"><img src="${popupImg}" alt=""></div>
    </div>
  </body></html>`;

const promoTileHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;width:440px;height:280px;display:grid;place-items:center;font-family:${FONT};
      background:radial-gradient(120% 130% at 18% 8%,#1d7396 0%,#0c2a38 66%)}
    .c{text-align:center} .c img{width:104px;height:104px;display:block;margin:0 auto}
    .n{margin-top:6px;font-size:42px;font-weight:650;color:#fff;letter-spacing:.01em}
    .d{display:flex;gap:9px;justify-content:center;margin-top:16px}
    .d i{width:46px;height:10px;border-radius:5px;display:block}
  </style></head><body>
    <div class="c"><img src="${ICON}" alt=""><div class="n">Polygone</div>
      <div class="d"><i style="background:#ff6459"></i><i style="background:#ffa73d"></i><i style="background:#6fd39b"></i></div></div>
  </body></html>`;

async function renderHtml(browser, html, width, height, out) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await sleep(300);
  await page.screenshot({ path: out, type: "png" });
  await page.close();
}

// ---------- checks on what was written ----------

function checkPng(file, width, height) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colorType = b[25];
  if (w !== width || h !== height) throw new Error(`${path.basename(file)} is ${w}x${h}, expected ${width}x${height}`);
  if (colorType === 6 || colorType === 4) throw new Error(`${path.basename(file)} has an alpha channel; the store wants 24-bit PNG`);
  return `${path.basename(file).padEnd(34)} ${w}x${h}  ${(b.length / 1024).toFixed(0)} KB`;
}

// ---------- main ----------

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "polygone-shots-"));
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: false,
    // 1024x640 at 125% is 1280x800 pixels, and is how many laptops show a page.
    defaultViewport: { width: 1024, height: 640, deviceScaleFactor: 1.25 },
    userDataDir: profile, pipe: true, enableExtensions: [EXT],
    ignoreDefaultArgs: ["--enable-automation"], args: ["--no-first-run", "--window-position=0,0"],
  });
  try {
    await sleep(2500); // the extension registers a moment after Chrome starts

    const shots = [
      { file: "wrap-dress", headline: "See the plastic in your clothes before you buy",
        sub: "A badge on the product page shows how much of the fabric is plastic-based.", out: "1-see-the-plastic.png" },
      { file: "field-jacket", headline: "One box for every part of the garment",
        sub: "Shell, lining, pockets: each part gets its own reading.", out: "2-every-part.png" },
      { file: "rib-tee", open: true, headline: "Click the badge to see what it read",
        sub: "The text it found on the page, and how it was counted.", out: "3-what-it-read.png" },
    ];
    for (const s of shots) await productShot(browser, port, { ...s, out: path.join(OUT, s.out) });

    const crops = {
      red: await badgeCrop(browser, port, "wrap-dress"),
      orange: await badgeCrop(browser, port, "rib-tee"),
      green: await badgeCrop(browser, port, "linen-shirt"),
      gray: await badgeCrop(browser, port, "boxy-top"),
    };
    await renderHtml(browser, colorGuideHtml(crops), 1280, 800, path.join(OUT, "4-color-guide.png"));
    await renderHtml(browser, popupSceneHtml(await popupCrop(browser, port)), 1280, 800, path.join(OUT, "5-you-are-in-control.png"));
    await renderHtml(browser, promoTileHtml(), 440, 280, path.join(OUT, "promo-small-440x280.png"));
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files; the temp folder is harmless */ }
  }

  for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith(".png")).sort()) {
    console.log(checkPng(path.join(OUT, f), f.startsWith("promo-small") ? 440 : 1280, f.startsWith("promo-small") ? 280 : 800));
  }
})().catch((e) => { console.error(e); process.exit(2); });
