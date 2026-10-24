import { test } from "node:test";
import assert from "node:assert/strict";
import { C } from "./load_core.mjs";

function solid(w, h, v) {
  const img = C.createImage(w, h);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  return img;
}

// A checkerboard-like grid: black lines every `step` px on white.
function gridImage(w, h, step) {
  const img = solid(w, h, 255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x % step < 2 || y % step < 2) { const o = (y * w + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; }
  }
  return img;
}

test("warp with the identity quad reproduces the image", () => {
  const img = gridImage(40, 30, 10);
  const out = C.warpPerspective(img, C.fullImageCorners(40, 30), 40, 30);
  let maxd = 0;
  for (let i = 0; i < img.data.length; i++) maxd = Math.max(maxd, Math.abs(img.data[i] - out.data[i]));
  assert.ok(maxd <= 1, "max diff " + maxd);
});

test("warp of a perspective-distorted grid recovers straight, evenly spaced lines", () => {
  // Make a flat grid, distort it with a known homography into a scene, then flatten it back.
  const W = 400, H = 400, step = 50;
  const flat = gridImage(W, H, step);
  const quad = [[60, 40], [330, 70], [370, 360], [20, 330]];
  const Hsf = C.homographyFromPoints(quad, C.fullImageCorners(W, H)); // scene -> flat
  const scene = solid(420, 420, 90);
  const px = new Float64Array(4);
  for (let y = 0; y < 420; y++) for (let x = 0; x < 420; x++) {
    const t = C.applyH(Hsf, x + 0.5, y + 0.5);
    if (t[0] < 0 || t[1] < 0 || t[0] > W || t[1] > H) continue;
    C.sampleBilinear(flat, t[0], t[1], px, 0);
    const o = (y * 420 + x) * 4;
    scene.data[o] = px[0]; scene.data[o + 1] = px[1]; scene.data[o + 2] = px[2];
  }
  const back = C.warpPerspective(scene, quad, W, H);
  // For each interior vertical grid line, find the darkest column near it in many rows:
  // the line must stay at one x (straight) and at the expected spacing.
  for (let k = 1; k < W / step; k++) {
    const xs = [];
    for (let y = 20; y < H - 20; y += 7) {
      if (y % step < 6) continue;
      let best = 1e9, bx = -1;
      for (let x = k * step - 6; x <= k * step + 6; x++) {
        const v = back.data[(y * W + x) * 4];
        if (v < best) { best = v; bx = x; }
      }
      assert.ok(best < 128, `line ${k} visible at row ${y}`);
      xs.push(bx);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    assert.ok(spread <= 2, `vertical line ${k} straight within 2 px (spread ${spread})`);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(Math.abs(mean - (k * step + 0.5)) <= 1.5, `line ${k} at ${mean}, expected ${k * step + 0.5}`);
  }
  // Same for horizontal lines.
  for (let k = 1; k < H / step; k++) {
    const ys = [];
    for (let x = 20; x < W - 20; x += 7) {
      if (x % step < 6) continue;
      let best = 1e9, by = -1;
      for (let y = k * step - 6; y <= k * step + 6; y++) {
        const v = back.data[(y * W + x) * 4];
        if (v < best) { best = v; by = y; }
      }
      ys.push(by);
    }
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 2, `horizontal line ${k} straight`);
  }
});

test("warp refuses a crossed quad with a clear message", () => {
  const img = solid(10, 10, 200);
  assert.throws(() => C.warpPerspective(img, [[0, 0], [10, 10], [10, 0], [0, 10]], 5, 5), (e) => e.code === "quad" && /cross/.test(e.message));
});

test("outputSizeForQuad uses the longer opposite sides and caps the long edge", () => {
  assert.deepEqual({ ...C.outputSizeForQuad([[0, 0], [100, 0], [110, 200], [0, 190]]) }, { width: 110, height: 200 });
  const big = C.outputSizeForQuad([[0, 0], [5000, 0], [5000, 2500], [0, 2500]], 2500);
  assert.deepEqual({ ...big }, { width: 2500, height: 1250 });
});

test("bilinear sampling interpolates and clamps at the edges", () => {
  const img = C.createImage(2, 1);
  img.data.set([0, 0, 0, 255, 200, 100, 50, 255]);
  const px = new Float64Array(4);
  C.sampleBilinear(img, 1.0, 0.5, px, 0); // halfway between the two pixel centers
  assert.deepEqual(Array.from(px), [100, 50, 25, 255]);
  C.sampleBilinear(img, -5, -5, px, 0);
  assert.deepEqual(Array.from(px), [0, 0, 0, 255]);
  C.sampleBilinear(img, 99, 99, px, 0);
  assert.deepEqual(Array.from(px), [200, 100, 50, 255]);
});

test("corner detection finds the synthetic receipt within a few pixels", () => {
  const scene = C.makeExampleScene();
  const r = C.detectDocument(scene.image);
  assert.equal(r.confident, true);
  r.corners.forEach((p, i) => {
    const d = Math.hypot(p[0] - scene.corners[i][0], p[1] - scene.corners[i][1]);
    assert.ok(d <= 3, `corner ${i} off by ${d.toFixed(2)} px`);
  });
});

test("corner detection works for other placements and image sizes", () => {
  const tex = C.makeReceiptTexture(420, 600, 3);
  const layouts = [
    { width: 900, height: 1200, corners: [[150, 210], [720, 160], [780, 1010], [120, 1060]] },
    { width: 1600, height: 1200, corners: [[500, 150], [1150, 210], [1100, 1080], [430, 1030]] },
    { width: 640, height: 480, corners: [[220, 40], [430, 60], [420, 440], [200, 420]] }
  ];
  for (const L of layouts) {
    const scene = C.makeExampleScene(tex, L);
    const r = C.detectDocument(scene.image);
    assert.equal(r.confident, true, "confident for " + L.width + "x" + L.height);
    const tol = Math.max(3, Math.max(L.width, L.height) / 360 * 1.5);
    r.corners.forEach((p, i) => {
      const d = Math.hypot(p[0] - L.corners[i][0], p[1] - L.corners[i][1]);
      assert.ok(d <= tol, `${L.width}x${L.height} corner ${i} off by ${d.toFixed(2)} px`);
    });
  }
});

test("corner detection falls back to the full image when there is no page", () => {
  const flat = solid(300, 200, 128);
  const r = C.detectDocument(flat);
  assert.equal(r.confident, false);
  assert.deepEqual(r.corners.map((p) => Array.from(p)), [[0, 0], [300, 0], [300, 200], [0, 200]]);
  // random noise: also unsure
  const noise = C.createImage(300, 200), rand = C.rng(5);
  for (let i = 0; i < noise.data.length; i++) noise.data[i] = (i % 4 === 3) ? 255 : rand() * 255;
  assert.equal(C.detectDocument(noise).confident, false);
});

test("detectDocument rejects non-images", () => {
  assert.throws(() => C.detectDocument({ width: 2, height: 2, data: new Uint8ClampedArray(3) }), (e) => e.code === "input");
  assert.throws(() => C.detectDocument(null), (e) => e.code === "input");
});

test("B&W (Sauvola) produces strictly binary output and separates ink from paper", () => {
  const scene = C.makeExampleScene();
  const flat = C.warpPerspective(scene.image, scene.corners);
  const bw = C.filterSauvola(flat);
  let black = 0;
  for (let i = 0; i < bw.data.length; i += 4) {
    const v = bw.data[i];
    assert.ok(v === 0 || v === 255, "binary value");
    assert.ok(bw.data[i + 1] === v && bw.data[i + 2] === v && bw.data[i + 3] === 255);
    if (v === 0) black++;
  }
  const frac = black / (bw.width * bw.height);
  assert.ok(frac > 0.02 && frac < 0.4, "ink fraction " + frac);
});

test("Sauvola keeps a uniform page white and finds dark text on a shaded page", () => {
  const page = solid(120, 80, 220);
  const out = C.filterSauvola(page);
  for (let i = 0; i < out.data.length; i += 4) assert.equal(out.data[i], 255);
  // gradient lighting plus a dark bar: bar must be black, both bright and dim paper white
  const g = C.createImage(200, 60);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 200; x++) {
    const o = (y * 200 + x) * 4, paper = 120 + x * 0.6, ink = y >= 25 && y < 32 && x > 20 && x < 180;
    g.data[o] = g.data[o + 1] = g.data[o + 2] = ink ? paper * 0.3 : paper; g.data[o + 3] = 255;
  }
  const b = C.filterSauvola(g, { window: 21 });
  const at = (x, y) => b.data[(y * 200 + x) * 4];
  assert.equal(at(30, 28), 0); assert.equal(at(170, 28), 0);
  assert.equal(at(30, 5), 255); assert.equal(at(170, 55), 255);
});

test("grayscale uses Rec. 601 weights", () => {
  const img = C.createImage(3, 1);
  img.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const g = C.filterGrayscale(img);
  assert.deepEqual([g.data[0], g.data[4], g.data[8]], [76, 150, 29]);
});

test("enhance stretches contrast to the full range and leaves flat images alone", () => {
  const img = C.createImage(100, 1);
  for (let x = 0; x < 100; x++) { const o = x * 4, v = 100 + x * 0.5; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255; }
  const e = C.filterEnhance(img);
  let lo = 255, hi = 0;
  for (let i = 0; i < e.data.length; i += 4) { lo = Math.min(lo, e.data[i]); hi = Math.max(hi, e.data[i]); }
  assert.ok(lo <= 3 && hi >= 252, `range ${lo}..${hi}`);
  const flat = solid(10, 10, 140);
  assert.equal(C.filterEnhance(flat).data[0], 140);
});

test("applyFilter dispatches and rejects unknown names", () => {
  const img = solid(4, 4, 10);
  assert.equal(C.applyFilter(img, "original"), img);
  assert.throws(() => C.applyFilter(img, "<b>x</b>"), (e) => e.code === "input");
});

test("rotate90 turns pixels clockwise and four turns is the identity", () => {
  const img = C.createImage(3, 2);
  for (let i = 0; i < 6; i++) img.data[i * 4] = i + 1;
  const r = C.rotate90(img, 1);
  assert.equal(r.width, 2); assert.equal(r.height, 3);
  // original rows [1 2 3],[4 5 6] -> clockwise [4 1],[5 2],[6 3]
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => r.data[i * 4]), [4, 1, 5, 2, 6, 3]);
  let x = img;
  for (let k = 0; k < 4; k++) x = C.rotate90(x, 1);
  assert.deepEqual(Array.from(x.data), Array.from(img.data));
  assert.deepEqual(Array.from(C.rotate90(img, -1).data), Array.from(C.rotate90(img, 3).data));
});

test("Otsu splits a bimodal set between the modes", () => {
  const v = new Float32Array(200);
  for (let i = 0; i < 200; i++) v[i] = i < 100 ? 20 + (i % 5) : 200 + (i % 5);
  const t = C.otsu(v);
  assert.ok(t > 24 && t <= 200, "threshold " + t);
});
