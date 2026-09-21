#!/usr/bin/env node
// Builds the Chrome Web Store upload: dist/polygone-<version>.zip
//
//   npm run package
//
// The file list comes from manifest.json (content scripts, popup and the files it loads, icons), plus LICENSE,
// so the zip holds exactly what the extension uses and never tests, docs, node_modules or scratch files.
// Before writing it checks the manifest against the Web Store's limits. No dependencies: the zip is written
// here with node's zlib, in a fixed order with fixed timestamps, so the same source gives the same bytes.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const posix = (p) => p.split(path.sep).join("/");

// ---------- which files ship ----------

// Local files a page refers to: <script src>, <link href>, <img src>. Remote URLs are ignored.
function referencedFiles(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const out = [];
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
    if (/^(?:[a-z]+:|\/\/)/i.test(m[1])) continue;
    out.push(posix(path.relative(ROOT, path.resolve(path.dirname(htmlPath), m[1]))));
  }
  return out;
}

function fileList(manifest) {
  const files = new Set(["manifest.json", "LICENSE"]);
  for (const cs of manifest.content_scripts || []) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) files.add(f);
  }
  if (manifest.background?.service_worker) files.add(manifest.background.service_worker);
  for (const f of Object.values(manifest.icons || {})) files.add(f);
  const action = manifest.action || {};
  const icons = typeof action.default_icon === "string" ? [action.default_icon] : Object.values(action.default_icon || {});
  icons.forEach((f) => files.add(f));
  if (action.default_popup) {
    files.add(action.default_popup);
    referencedFiles(path.join(ROOT, action.default_popup)).forEach((f) => files.add(f));
  }
  if (manifest.options_page) files.add(manifest.options_page);
  return [...files].sort();
}

// ---------- checks against Web Store rules ----------

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function problems(manifest, files) {
  const bad = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  if (manifest.manifest_version !== 3) bad.push("manifest_version must be 3");
  if (!manifest.name || manifest.name.length > 75) bad.push("name is missing or longer than 75 characters");
  if (!manifest.description || manifest.description.length > 132) bad.push("description is missing or longer than 132 characters");
  if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version || "")) bad.push(`version "${manifest.version}" is not 1 to 4 dot-separated numbers`);
  if (manifest.version !== pkg.version) bad.push(`manifest version ${manifest.version} does not match package.json ${pkg.version}`);
  for (const size of ["16", "48", "128"]) {
    const f = manifest.icons?.[size];
    if (!f) { bad.push(`icons["${size}"] is missing`); continue; }
    if (!fs.existsSync(path.join(ROOT, f))) { bad.push(`icon ${f} does not exist`); continue; }
    const [w, h] = pngSize(path.join(ROOT, f));
    if (w !== Number(size) || h !== Number(size)) bad.push(`${f} is ${w}x${h}, expected ${size}x${size}`);
  }
  for (const f of files) if (!fs.existsSync(path.join(ROOT, f))) bad.push(`listed file is missing: ${f}`);
  for (const f of files) if (/^(test|node_modules|scripts|dist|\.git)\//.test(f) || /\.(md|map)$/i.test(f)) bad.push(`should not ship: ${f}`);
  return bad;
}

// ---------- zip (store and deflate, UTF-8 names, fixed timestamps) ----------

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = zlib.crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);                       // version needed
    lh.writeUInt16LE(0x0800, 6);                   // UTF-8 names
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8);       // method
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);                       // version made by
    ch.writeUInt16LE(20, 6);                       // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(0, 38);                       // external attrs
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// Reads a zip back (used to verify the build, and by the tests): [{name, data}]
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (zlib.crc32(data) !== crc) throw new Error(`checksum mismatch for ${name}`);
    out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------- main ----------

function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const files = fileList(manifest);
  const bad = problems(manifest, files);
  if (bad.length) throw new Error("Cannot package:\n  - " + bad.join("\n  - "));
  const entries = files.map((name) => ({ name, data: fs.readFileSync(path.join(ROOT, name)) }));
  return { manifest, files, buffer: zip(entries) };
}

module.exports = { fileList, problems, zip, unzip, build };

if (require.main === module) {
  try {
    const { manifest, files, buffer } = build();
    const dist = path.join(ROOT, "dist");
    fs.mkdirSync(dist, { recursive: true });
    const out = path.join(dist, `polygone-${manifest.version}.zip`);
    fs.writeFileSync(out, buffer);
    const back = unzip(fs.readFileSync(out)); // prove it reads back and every checksum matches
    console.log(`${path.relative(ROOT, out)}  ${(buffer.length / 1024).toFixed(1)} KB, ${back.length} files, checksums ok`);
    for (const e of back) console.log(`  ${e.name.padEnd(24)} ${String(e.data.length).padStart(7)} bytes`);
    console.log(`\nPermissions: ${(manifest.permissions || []).join(", ") || "none"}`);
    console.log(`Runs on: ${(manifest.content_scripts || []).flatMap((c) => c.matches).join(", ")}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
