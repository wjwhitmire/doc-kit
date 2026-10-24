# Doc Kit

Scan paper to PDF with a phone camera, work on existing PDFs (merge, split, extract, rotate, delete, reorder, sign, number pages), and compress images. Everything runs in the browser. Your files never leave this device.

Live tool: https://wjwhitmire.github.io/doc-kit/

Free, open source (MIT), no account, no upload, no subscription. Not affiliated with any scanner or PDF app.

## What it does

**Scan to PDF**
- Add photos with the camera (`capture="environment"` opens the phone camera app), from files, or by drag and drop.
- Each photo is searched for a page outline. You can drag the four corner handles (or move them with the keyboard) to adjust.
- The page is flattened with a perspective transform, then one filter is applied: original, grayscale, black-and-white document (adaptive threshold), or enhanced color (auto contrast).
- Rotate, reorder (drag or arrow buttons), delete. Page size Letter, A4, or fit to image, with a margin. The size starts as Letter or A4 from the browser language, with a line saying why.
- On first load the scanner shows a generated photo of a receipt on a table, labeled "Example image", with its corners already detected.

**PDF tools**
- Add one or more PDFs; their pages join one list, so adding several files merges them.
- Rotate, delete, reorder pages; undo page edits.
- Extract a page range (`1-3, 5, 8-`), or split every N pages.
- Stamp a drawn signature or typed initials on any page, at a position you drag. The page starts as the last page. Output file names start from the name of the file you added.
- Add page numbers (`1`, `Page 1 of N`, `1 / N`) at the bottom center, bottom right or top right.
- Thumbnails come from pdf.js. If pdf.js cannot load, everything still works without thumbnails.
- A generated three-page example PDF ("Example data") is loaded at start.

**Image tools**
- Compress: re-encode as JPEG at a chosen quality, optionally downscale the long side, with sizes before and after.
- Images to PDF, one image per page.

**Output.** Every result is shown as a preview with a Download button. Downloads work on the GitHub Pages build. Some embedded viewers block downloads; in that case the page says so and points to the GitHub Pages version. The page never claims a file was saved: it only says the browser was asked to save it.

## Quick start

Open `docs/index.html` in a browser, or serve the `docs/` folder with GitHub Pages.

Development:

```
npm install          # dev dependency only: pdf-lib, for the PDF round-trip tests
npm test             # node:test suite
python3 web/build_pages.py   # web/app.html -> docs/index.html
```

`web/app.html` is the source of truth. It is a fragment (no `<html>`, `<head>` or `<body>`) so it can be embedded as is; `web/build_pages.py` wraps it into a full document with a Content-Security-Policy for GitHub Pages.

## Why there is no Python package

This repo is browser-first. Every operation is on images and PDFs inside the page, so a Python library would duplicate the work without a user. In place of the suite's pytest and Python/JS parity checks, the pure functions in the page's `<script id="core">` block (homography solve, warp sampling, corner detection, filters, page sizing, page ranges, PDF assembly) are extracted with `node:vm` and tested directly with `node:test`. See `tests/`.

## Method

### Corner detection

1. Downscale to 360 px on the long side by area averaging, convert to gray with Rec. 601 luma `Y = 0.299 R + 0.587 G + 0.114 B`.
2. Gaussian blur, sigma 1.4. Sobel gradient magnitude `sqrt(Gx^2 + Gy^2)` with the standard 3 x 3 kernels.
3. Threshold the gradient with Otsu's method (maximize between-class variance). Dilate the edge mask by one pixel.
4. Candidate A (edges): flood fill from the image border through non-edge pixels; the largest region not reached is the page.
   Candidate B (brightness): the largest connected region brighter than an Otsu split of the blurred gray image.
5. For each candidate: trace its boundary pixels, take the convex hull (Andrew's monotone chain), and pick the largest-area quadrilateral with vertices on the hull (exhaustive, hull subsampled to at most 90 points). Assign boundary pixels to the nearest side (ignoring the 10% nearest each corner), fit a total-least-squares line per side, and intersect neighboring lines for the corners.
6. Score: fill ratio (region area over quad area) times edge support (share of points along the quad perimeter with a strong gradient). Accept only a candidate with fill above 0.88, support above 0.55, area between 8% and 99.5% of the photo, and not hugging all four borders. Otherwise use the full image and mark the page "Detection unsure".
7. Refine at full resolution: at 47 points along each side, search along the side's normal (radius about 2.5 downscale pixels) for the largest central difference in brightness, refine with a parabolic fit, fit a line through the hits with one outlier-rejection pass, and intersect.

### Flattening (homography)

A plane-to-plane perspective map is a 3 x 3 matrix H, defined up to scale:

```
[u w]   [h11 h12 h13] [x]
[v w] = [h21 h22 h23] [y]
[  w]   [h31 h32  1 ] [1]
```

With `h33 = 1`, each corner pair gives two linear equations (the direct linear transform):

```
h11 x + h12 y + h13 - u h31 x - u h32 y = u
h21 x + h22 y + h23 - v h31 x - v h32 y = v
```

Four pairs give 8 equations in 8 unknowns, solved by Gaussian elimination with partial pivoting. Points are first normalized (Hartley: centroid at the origin, mean distance sqrt 2) and the result is denormalized, `H = Td^-1 Hn Ts`. Three collinear corners are refused. Source: Hartley and Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., sections 4.1 and 4.4.

Output size is the longer of each pair of opposite sides, capped at 2,500 px on the long side. Each output pixel center `(x + 0.5, y + 0.5)` is mapped back through the homography from the output rectangle to the photo quad, and the photo is sampled bilinearly (edge-clamped).

### Filters

- **Grayscale:** Rec. 601 luma (ITU-R BT.601).
- **B&W document:** Sauvola's threshold, `T = m (1 + k (s / R - 1))`, with m and s the mean and standard deviation over a square window, k = 0.2, R = 128, window about 1/16 of the short side (minimum 15 px, odd). Means and variances come from integral images of the value and its square, so the cost does not depend on the window size. Source: J. Sauvola and M. Pietikainen, "Adaptive document image binarization", *Pattern Recognition* 33 (2000) 225-236.
- **Enhanced color:** find the 1st and 99th percentile of luma, then map `c' = 255 (c - lo) / (hi - lo)` on each of R, G and B with the same gain, so hue is kept. Flat images (hi - lo < 8) are left alone.

### Page sizing

PDF units are points, 1 pt = 1/72 in, 1 in = 25.4 mm.

- Letter: 8.5 x 11 in = 612 x 792 pt.
- A4: 210 x 297 mm = 595.28 x 841.89 pt (ISO 216).
- The page is landscape when the image is wider than tall. The image is scaled by `s = min((W - 2m) / w, (H - 2m) / h)` and centered.
- Fit to image: the image's long side becomes 792 pt, and the page is the image plus the margin on every side.

### PDF operations

pdf-lib copies the chosen pages into a new document, adds the extra rotation to each page's existing `/Rotate` (mod 360), and draws stamps and page numbers. Placement is computed in display coordinates (the page as you see it, after rotation) and mapped back to the page's own coordinates, so stamps and numbers come out upright on rotated pages. Every action is removed from copied pages: `/AA` on pages, link, media and file-attachment annotations, and `/A`, `/AA`, `/Dest` and `/Parent` on the annotations that remain, so no JavaScript, Launch, SubmitForm, ImportData or `/Next` chain survives. Document-level scripts, open actions, outlines and the AcroForm are not copied because only pages are copied. Before saving, every object not reachable from the document catalog is deleted, so content of pages left out of an extract or split cannot ride along through a link destination.

## Limits

- 50 MB per file, 300 pages per output, with a message naming the limit.
- Photos are processed at up to 2,500 px on the long side (about 210 dpi on Letter), so a 12 MP phone photo is reduced. Heavy pixel work runs in a Web Worker created from a blob URL; if workers are blocked, it runs on the main thread.
- Detection expects one page that contrasts with what it lies on. White paper on a white desk, pages that run off the edge of the photo, folded or curled pages, and busy backgrounds can fail; adjust the corners by hand. Page curl and lens distortion are not corrected.
- No text recognition (OCR). Scanned PDFs are images and are not searchable.
- Encrypted or password-protected PDFs are refused with a message.
- Outputs drop all links (internal and web), bookmarks, outlines and form actions. Form fields keep their printed appearance but are no longer fillable.
- Typed initials use the PDF standard Helvetica font (WinAnsi encoding: Western European characters only); other scripts are refused with a message suggesting drawing instead.
- A drawn signature is an image stamped on the page. It is not a cryptographic digital signature and does not certify anything.
- Compression always produces JPEG: transparency becomes white and photo metadata (including GPS location) is dropped. When the result is larger than the original, the table flags it.
- HEIC photos decode only where the browser supports them (Safari).
- Files stay in this tab's memory and are gone when it closes.

## Third-party code

Loaded at run time from jsDelivr, pinned to exact versions with Subresource Integrity (SHA-384) hashes taken from the npm packages:

| Library | Version | URL |
|---|---|---|
| pdf-lib (MIT) | 1.17.1 | https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js |
| pdf.js (Apache-2.0) | 3.11.174 | https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js |
| pdf.js worker | 3.11.174 | https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js |

pdf.js runs with `isEvalSupported: false`, `enableXfa: false` and no scripting component, so PDF JavaScript is never executed. Its worker is started from a blob URL that imports the pinned worker script. `importScripts` cannot check an integrity hash, so in that path the worker script is pinned by exact version but not hash-checked; the page and the docs build's CSP (`connect-src 'none'`, which a blob worker inherits) still keep it from sending anything. If the worker is blocked, the worker code is loaded on the main thread as an integrity-checked script. If pdf.js does not load at all, thumbnails and previews are skipped and every tool still works. Without pdf-lib, scanning and image compression still work, and the page says PDF output is unavailable.

The only other external resource is the Google Fonts stylesheet.

## Validation

`npm test` runs 65 tests:

- Homography: the four source corners map onto the targets within 1e-9 relative, `H(src->dst) H(dst->src)` is the identity, the inverse maps targets back, affine maps give zero perspective terms, collinearity is preserved, degenerate and non-finite corners are refused.
- Warp: identity quad reproduces the image; a grid distorted by a known homography and flattened back has straight grid lines (spread at most 2 px) at the expected spacing (within 1.5 px).
- Corner detection: the generated receipt photo is found within 3 px at every corner (measured: under 1 px), plus three other sizes and placements; a flat image and pure noise fall back to the full image.
- Filters: Sauvola output is strictly 0 or 255 with plausible ink coverage, keeps a uniform page white, and finds text across a lighting gradient; grayscale weights; contrast stretch; quarter-turn rotation.
- Page sizing: Letter and A4 in points, landscape switching, fit to image, margins never exceeded, bad margins refused.
- PDF (pdf-lib 1.17.1 in node): merge, extract, split, delete and rotate round trips; stamps and page numbers; every action type (JavaScript, Launch, SubmitForm, ImportData, URI /Next chains, field actions) removed; pages left out of an extract do not ride along; encrypted input refused; images to PDF; 300-page limit.
- Page contract and security: header lines, no network APIs, eval, inline handlers or HTML injection sinks, only pinned CDN URLs, every control labeled, docs build current, no em dashes.

`pytest -q tests/test_published_site.py` (needs `pip install pytest playwright pypdf` and `python -m playwright install chromium`) builds the site the way the release does, with the placeholders filled, serves it under `/doc-kit/`, and runs the scan, PDF and image workflows, opening every download. See `TESTING.md` for the full function inventory and results.

## License

MIT. Copyright (c) 2026 Will Whitmire.
