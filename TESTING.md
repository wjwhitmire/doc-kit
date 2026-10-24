# Testing

This file lists every function of Doc Kit, how each was tested, and the result. Browser checks ran against the published form of the site: the tracked files with the release placeholders filled, `docs/` served under `/doc-kit/` on a local server, in headless Chromium at 1280 px (light and dark) and 400 px with touch (light and dark). pdf-lib and pdf.js were served from the npm package files, so the page's integrity hashes were checked against the real files. `web/app.html` was also opened from `file://`. Every downloaded PDF was opened with pypdf and rendered with pdfium; JPEGs were opened with Pillow.

## Function inventory

| # | Area | Function | How it was tested | Result |
|---|---|---|---|---|
| 1 | Page | Tabs: Scan, PDF tools, Image tools | Click and Left/Right arrow keys; last tab remembered after reload | Pass |
| 2 | Page | Light and dark theme, 400 px layout | No sideways scroll on any tab; every control at least 44 px on touch | Pass |
| 3 | Page | Method and limits panel | Opens | Pass |
| 4 | Page | Network | Only pinned pdf-lib and pdf.js (integrity checked) and Google Fonts; `connect-src 'none'`; no CSP violations | Pass |
| 5 | Scan | Example receipt photo | Built at load, outline found automatically | Pass |
| 6 | Scan | Add photos, Choose from files, drop zone | Perspective photo of a page on a table: "Edges found" | Pass |
| 7 | Scan | Flattened size | 923 x 903 px, the longer of each pair of opposite sides of the drawn page (hand measured) | Pass |
| 8 | Scan | Filters: Original, Grayscale, B&W document, Enhanced color | Each applies and is marked pressed | Pass |
| 9 | Scan | Rotate left and right (editor and card) | Width and height swap; turned page prints portrait | Pass |
| 10 | Scan | Auto detect, Use full image | Full image gives 1600 x 1200; Auto detect finds the edges again | Pass |
| 11 | Scan | Corner drag and keyboard (1 to 4, arrows, Shift) | Page re-flattens; crossing corners refused with a message | Pass |
| 12 | Scan | Reorder (arrows), delete | Order carries into the PDF | Pass |
| 13 | Scan | Page size Letter, A4, Fit; margin; quality; file name | 612 x 792, 595.28 x 841.89, long side 792 pt; margin -5 refused; unsafe name cleaned | Pass |
| 14 | Scan | Make PDF and Download | PDF opens and renders; page says the browser was asked to save, not that it saved | Pass |
| 15 | Scan | Bad input | Corrupt JPEG, 0-byte file, PDF in the photo picker: message, no hang. 9000 x 7000 photo capped at 2500 px; 1 x 1 photo works | Pass |
| 16 | PDF | Example PDF and thumbnails | 3 pages, pdf.js thumbnails in a worker | Pass |
| 17 | PDF | Add several PDFs (merge) | 9 pages in file order; existing `/Rotate` 90 and 180 kept; rotated page renders landscape | Pass |
| 18 | PDF | Per-page rotate, delete, move earlier and later | Carried into the output exactly | Pass |
| 19 | PDF | Rotate all right, Reverse order | Every `/Rotate` +90 mod 360, order reversed | Pass |
| 20 | PDF | Undo page edits | Restores the page list | Pass |
| 21 | PDF | Extract pages | `8-, 2, 4-5` gives pages 8, 9, 2, 4, 5 in that order; `0`, `10`, `abc`, `3-x` refused | Pass |
| 22 | PDF | Split every N | 4 gives p1-4, p5-8, p9; 0 refused | Pass |
| 23 | PDF | Drawn signature: draw, clear, size, drag position, keyboard | Image stamped on the chosen page | Pass |
| 24 | PDF | Typed initials | Latin-1 text stamped; CJK refused with a message to draw instead | Pass |
| 25 | PDF | Signature page number | Out of range refused; thumbnail tap picks a page; now starts on the last page | Pass |
| 26 | PDF | Remove a placed stamp | Pass | Pass |
| 27 | PDF | Page numbers: 3 formats, 3 positions, size | "Page k of 9" on every page; upright at the bottom right of a page shown rotated 90 degrees | Pass |
| 28 | PDF | Bad files | Encrypted, truncated, text renamed .pdf, image in the PDF picker: refused with a message | Pass |
| 29 | PDF | 300-page limit | 300-page file on top of 3 pages refused naming the limit | Pass |
| 30 | PDF | Remove file, Remove all | Pages and buttons update | Pass |
| 31 | Images | Add images, example image | JPEG and transparent PNG | Pass |
| 32 | Images | Quality, longest side, Compress | 1600 x 1200 to 800 x 600, -80% | Pass |
| 33 | Images | Download compressed image | JPEG 800 x 600 with no EXIF | Pass |
| 34 | Images | Compare before and after | Pass | Pass |
| 35 | Images | Result larger than original flagged | 1 x 1 PNG | Pass |
| 36 | Images | Images to PDF, with and without compression | Wide photo on a landscape page; without compression the PNG is embedded at 400 x 300 | Pass |
| 37 | Images | Remove one, Remove all | Pass | Pass |
| 38 | Fallback | pdf.js blocked | Thumbnails off with a note; Build still works; preview explains | Pass |
| 39 | Fallback | Whole CDN blocked | Scanner and compression work; PDF tools and Make PDF say the library did not load | Pass |
| 40 | Fallback | Web Workers blocked | Detection and pdf.js run on the main thread | Pass |
| 41 | Fallback | Page inside another site's frame | Note that the viewer may block downloads | Pass |
| 42 | file:// | `web/app.html` opened as a file | Scanner and PDF tools work | Pass |
| 43 | Core | Homography, warp, corner detection, filters, page sizing, ranges, PDF assembly, action stripping | `npm test`, 65 node tests | Pass |

Not present in this tool, so not tested: accounts, storage of files (nothing is stored), PWA install, network switches, CLI, Python package.

## Decisions the app now makes for you

| Decision point | Before | After |
|---|---|---|
| Page size for scans and image PDFs | Always started as Letter | Letter or A4 from the browser language region, with a line saying why; change the menu to override |
| Output file name in PDF tools and image PDFs | Always "document" or "images" | Taken from the file you added ("-merged" when there are several) until you type a name |
| Which page gets the signature | Page 1; you had to type the page | Last page, where signatures usually go, with a line saying why; tap a thumbnail or type to change |
| Page outline, flattening, output size | Already automatic | No change |
| Filter | Enhanced color by default | No change |

## How to rerun

```
npm ci && npm test
pip install pytest playwright pypdf && python -m playwright install chromium
pytest -q tests/test_published_site.py
python3 web/build_pages.py        # docs/index.html must match web/app.html
```

The browser test fills the placeholders the way the release does and serves `docs/` under `/doc-kit/`. It needs pdf-lib from jsDelivr; without network, set `PAGES_TEST_VENDOR` to a folder holding `pdf-lib.min.js`, `pdf.min.js` and `pdf.worker.min.js` from the pinned npm packages, or the PDF part skips.

Test counts: 63 node tests before this pass, 65 after, plus 2 browser tests.

## Known limits

- Detection needs contrast between the page and what it lies on; see the README.
- The page never knows whether a download was saved; it says the browser was asked to save it.
- Undo page edits restores the list as it was before the first edit since the last file change, not one step at a time.
