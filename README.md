# Poly Check

Chrome extension (Manifest V3) that reads a product page's fabric composition and shows a small
badge with how much plastic-based fiber the garment contains: polyester, nylon, acrylic,
spandex/elastane, elastomultiester, polyurethane (PU) and PVC.

- Red: more than 10% plastic. Orange: up to 10%. Green: none. Grey: fabric not found.
- Garments with several parts (shell, lining, pockets, ...) get one box per part.
- Everything runs locally in the page. No network requests, no data leaves the browser.

## Try it

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and choose this folder.
3. Visit a product page on a clothing retailer.

## Develop

```
npm install
npm test
```

Tests run in jsdom and include a corpus of saved real product pages (`test/corpus/pages`).
See `CLAUDE.md` for the design notes, behavior spec and known gaps.
