# Chrome Web Store listing for Polygone

Everything to paste into the developer dashboard (<https://chrome.google.com/webstore/devconsole>), tab by tab. Text
in code blocks is meant to be pasted as it is. Written for version 1.0.0; check the numbers if the extension changes.

## 1. Package

Upload `dist/polygone-1.0.0.zip` (build it with `npm run package`; the name, description, icons and version come from
`manifest.json`). A version can only be uploaded once, so bump `manifest.json` and `package.json` together for any
later upload.

## 2. Store listing tab

| Field | What to enter |
| --- | --- |
| Title | Polygone (from the package) |
| Summary | (from the package) "Shows how much plastic (polyester, nylon, acrylic, spandex and more) is in a garment's fabric, right on the product page." |
| Category | Shopping |
| Language | English |
| Store icon | `icons/icon128.png` (128x128) |
| Screenshots | The five files in `store/screenshots/`, in the order of their numbers (1280x800) |
| Small promo tile | `store/screenshots/promo-small-440x280.png` (440x280, required). A placeholder made from the icon: replace it with your own design if you like |
| Marquee promo tile, promo video | Skip (optional) |
| Homepage URL | `https://github.com/BillChungus/polygone` |
| Support URL | `https://github.com/BillChungus/polygone/issues` |

**Description**

```
Polygone shows how much plastic is in a garment's fabric while you shop.

Open a clothing product page and a small badge appears in the corner. Polygone has read the fabric composition for you and added up the synthetic fibers: polyester, nylon, acrylic, elastane (spandex) and similar. The badge is colored and labeled, so you can take it in at a glance:

• Red: more than 10% plastic
• Orange: up to 10%
• Green: none listed
• Gray: no fabric details found on the page

Click the badge to see the exact text it read and how it counted it.

BUILT FOR REAL PRODUCT PAGES
• One box per part. A jacket with a cotton shell and a polyester lining shows both, each with its own percentage, instead of one misleading total.
• It finds the details shoppers usually have to hunt for, including sections that are collapsed by default.
• It is honest when it isn't sure. If a page names a fiber but not the amount, the badge says so. If it can't find a composition, it says that, and never shows green just because nothing was found.

WHAT COUNTS
Polyester (including recycled polyester), nylon (polyamide), acrylic and modacrylic, elastane (spandex), polyurethane (PU), PVC, polypropylene, polyethylene, aramid, neoprene and other plastic-based fibers. Cotton, linen, wool and silk are not counted, and neither are fibers made from plant cellulose (viscose, modal, lyocell, cupro, acetate).

PRIVATE BY DESIGN
• Everything happens on your device. Polygone makes no network requests, needs no account, and keeps or sends nothing about you or your browsing.
• Turn it off everywhere, or for a single site, from the toolbar icon.
• If a reading is wrong, "Report wrong reading" prepares a public GitHub issue that you can read, edit and submit yourself. Nothing is sent until you choose to.

GOOD TO KNOW
• Shops' fabric details can be wrong or incomplete. If you have an allergy or a strict requirement, check the garment's own label.
• Polygone reads text on the page, so it can't read a care label that is only shown as a picture.
• It works on product pages, and is designed for English-language shops.

Free and open source (MIT license): https://github.com/BillChungus/polygone
Privacy policy: https://github.com/BillChungus/polygone/blob/main/PRIVACY.md
```

The store rejects keyword stuffing (a word repeated unnaturally more than 5 times, or lists of brands or sites). This
text names no shops, and none of its keywords is used more than 4 times outside the two links (`npm test` checks
that no word of 5 or more letters goes past 5).

## 3. Privacy practices tab

**Single purpose**

```
Polygone has one purpose: to show, on a clothing product page, how much plastic-based fiber (polyester, nylon, acrylic, elastane and similar) is in the garment's fabric.
```

**Permission justifications** (one box each)

`storage`
```
Saves the person's own settings so they stay between visits: the main on/off switch, and the list of websites where they turned Polygone off. It uses chrome.storage.sync and stores nothing else.
```

`activeTab`
```
When the person opens the toolbar popup, it reads the site name (hostname) of the current tab, so it can show "On for <site>" and let them turn Polygone off or on for that site. Nothing else is read from the tab.
```

Host permission (the content script that runs on all sites)
```
Polygone's single purpose is to show a garment's fabric composition on its product page. Clothing is sold on countless different shops' websites, so it cannot know in advance which sites to run on. On each page, the content script checks whether it is a product page and, only if it is, reads that page's own text and product data to find the fabric composition, then adds a small badge. It reads nothing else, keeps none of the page, and makes no network requests. It runs in the top frame only.
```

Remote code: **No, I am not using remote code.** (Everything Polygone runs is in the package; there is no `eval`, no
remotely hosted script, and no network access.)

**Data usage** (this is what users see on the listing)

- Tick **Website content** only. Polygone reads the text of the product page you are on to do its job, on your device.
  Google's own FAQ says an extension has to disclose this "even when data is processed or stored locally on a user's
  device and is not transmitted", so it is safer to declare it than to leave it out. `PRIVACY.md` explains that it
  never leaves the device, so the two agree. The list of sites turned off is the person's own setting, not browsing
  history, so nothing else needs ticking.
- Tick all three certifications: no selling or transferring data outside approved uses, no use unrelated to the
  single purpose, no use for creditworthiness or lending. All are true.

**Privacy policy URL**

```
https://github.com/BillChungus/polygone/blob/main/PRIVACY.md
```

The privacy fields must match the policy and what the extension really does, or the item can be removed. If the
extension ever starts sending anything, or reads anything else, update `PRIVACY.md` and these answers first.

## 4. Distribution tab

Visibility **Public**, all regions, free of charge.

## 5. Test instructions tab (optional, but worth filling in)

Polygone only does something on a clothing product page, so a reviewer who opens a news site sees nothing. This gives
them a page that works. It needs the demo shop online, see "Before you submit".

```
Polygone needs no account, sign-in or setup. It only does something on clothing product pages, so please use these:

1. Open the demo shop (a made-up store built for testing): https://billchungus.github.io/polygone/demo/ and open any product.
   - Odette Wrap Dress: one red badge, "Plastic 100%".
   - Ridley Field Jacket: three boxes, one per part (Shell green, Lining red, Pockets orange).
   - Harbour Rib Tee: one orange badge, "Plastic 5%".
   - Marlowe Linen Shirt: one green badge, "No plastic fibers".
   - Wren Boxy Top: one gray badge, "Material not found" (that page lists no fabric; the badge appears after about 3 seconds).
   The badge is in the bottom-right corner of the page.
2. Click a badge to open "How this was read". It shows the exact text Polygone found. "Report wrong reading" shows the report text and a link to GitHub's new-issue page. The extension sends nothing itself.
3. Click the Polygone toolbar icon. "Show plastic badges" turns it off everywhere; "On for <site>" turns it off for that site only. Changes apply straight away, without reloading.
4. It also works on real shops' product pages that list a fabric composition (search a clothing retailer for "polyester dress" and open a result). On pages that are not product pages, such as news or search results, it does nothing.
```

## 6. Account settings (one-off)

- Verify the contact email on the Account page.
- Declare your "trader" status (an account-level setting that every developer has to make because of European Union
  consumer law, see [Google's guidance](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)).
  It is your decision: a trader's name, address and contact details are shown publicly on the listing.

## Before you submit

- [ ] The repo `BillChungus/polygone` is **public** (the privacy URL, and the report link in the extension, do not
      work for other people while it is private).
- [ ] GitHub Pages is on: Settings, Pages, "Deploy from a branch", branch `main`, folder `/docs`. Then
      <https://billchungus.github.io/polygone/demo/> opens the demo shop. (Without it, delete step 1 of the test
      instructions and rely on step 4.)
- [ ] The privacy URL opens in a private window.
- [ ] `npm test` passes, the version in `manifest.json` and `package.json` is right, and `npm run package` was run
      after the last code change.
- [ ] Tag the release: `git tag v1.0.0 && git push origin v1.0.0`.

## Making the images again

`store/screenshots/` is made by `store/make-screenshots.js` from the demo shop in `docs/demo`, in real Chrome with the
extension loaded (so the badges, panel and popup are the real ones):

```
npm install --no-save puppeteer-core
node store/make-screenshots.js
```

To change a caption, edit the `shots` list in that file; to change the shop, edit the pages in `docs/demo`. Then run
it again.
