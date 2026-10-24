import { test } from "node:test";
import assert from "node:assert/strict";
import { C } from "./load_core.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b} (tol ${tol})`);

const CASES = [
  { src: [[10, 20], [300, 40], [280, 400], [5, 380]], dst: [[0, 0], [200, 0], [200, 300], [0, 300]] },
  { src: [[372, 92], [806, 130], [868, 840], [318, 804]], dst: [[0, 0], [551, 0], [551, 714], [0, 714]] },
  { src: [[0, 0], [1, 0], [1, 1], [0, 1]], dst: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  { src: [[1000, 1000], [3400, 1100], [3300, 4500], [900, 4400]], dst: [[0, 0], [2480, 0], [2480, 3508], [0, 3508]] },
  { src: [[0, 0], [4, 0], [3, 1], [1, 1]], dst: [[0, 0], [10, 0], [10, 10], [0, 10]] }
];

test("homography maps the four source corners exactly onto the targets", () => {
  for (const { src, dst } of CASES) {
    const H = C.homographyFromPoints(src, dst);
    const scale = Math.max(...dst.flat().map(Math.abs), 1);
    src.forEach((p, i) => {
      const q = C.applyH(H, p[0], p[1]);
      close(q[0], dst[i][0], 1e-9 * scale, "x");
      close(q[1], dst[i][1], 1e-9 * scale, "y");
    });
    assert.equal(H[8], 1);
  }
});

test("homography is invertible: H^-1 maps targets back, and H(src->dst) * H(dst->src) = I", () => {
  for (const { src, dst } of CASES) {
    const H = C.homographyFromPoints(src, dst);
    const Hi = C.invert3(H);
    dst.forEach((p, i) => {
      const q = C.applyH(Hi, p[0], p[1]);
      close(q[0], src[i][0], 1e-8 * Math.max(1, Math.abs(src[i][0])), "inv x");
      close(q[1], src[i][1], 1e-8 * Math.max(1, Math.abs(src[i][1])), "inv y");
    });
    const G = C.homographyFromPoints(dst, src);
    const P = C.mul3(H, G);
    const I = P.map((v) => v / P[8]);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, k) => close(I[k], v, 1e-9, "identity[" + k + "]"));
  }
});

test("homography of a pure affine map has zero perspective terms", () => {
  const src = [[0, 0], [10, 0], [10, 5], [0, 5]];
  const A = (x, y) => [2 * x + 0.5 * y + 3, -0.3 * x + 1.5 * y + 7];
  const H = C.homographyFromPoints(src, src.map((p) => A(p[0], p[1])));
  close(H[6], 0, 1e-12); close(H[7], 0, 1e-12);
  close(H[0], 2, 1e-12); close(H[1], 0.5, 1e-12); close(H[2], 3, 1e-12);
  // and it maps an interior point the same way
  const q = C.applyH(H, 3.3, 1.7), e = A(3.3, 1.7);
  close(q[0], e[0], 1e-10); close(q[1], e[1], 1e-10);
});

test("homography preserves collinearity of interior points", () => {
  const { src, dst } = CASES[1];
  const H = C.homographyFromPoints(src, dst);
  const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => C.applyH(H, 100 + 300 * t, 200 + 120 * t));
  for (let i = 1; i < pts.length - 1; i++) {
    const cr = (pts[i][0] - pts[0][0]) * (pts[4][1] - pts[0][1]) - (pts[i][1] - pts[0][1]) * (pts[4][0] - pts[0][0]);
    close(cr, 0, 1e-6);
  }
});

test("homography rejects degenerate and bad input with specific errors", () => {
  assert.throws(() => C.homographyFromPoints([[0, 0], [1, 1], [2, 2], [0, 5]], CASES[0].dst), (e) => e.code === "degenerate");
  assert.throws(() => C.homographyFromPoints([[0, 0], [0, 0], [0, 0], [0, 0]], CASES[0].dst), (e) => e.code === "degenerate");
  assert.throws(() => C.homographyFromPoints([[0, 0], [1, 0], [1, 1]], CASES[0].dst), (e) => e.code === "input");
  assert.throws(() => C.homographyFromPoints([[0, NaN], [1, 0], [1, 1], [0, 1]], CASES[0].dst), (e) => e.code === "input");
  assert.throws(() => C.homographyFromPoints([[0, 0], [1, 0], [1, Infinity], [0, 1]], CASES[0].dst), (e) => e.code === "input");
});

test("solveLinear solves a small system and refuses a singular one", () => {
  const x = C.solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
  [2, 3, -1].forEach((v, i) => close(x[i], v, 1e-12));
  assert.throws(() => C.solveLinear([[1, 2], [2, 4]], [1, 2]), (e) => e.code === "degenerate");
});

test("orderCorners returns TL, TR, BR, BL from any order", () => {
  const q = [[868, 840], [372, 92], [318, 804], [806, 130]];
  assert.deepEqual(C.orderCorners(q), [[372, 92], [806, 130], [868, 840], [318, 804]]);
  assert.ok(C.isConvexQuad(C.orderCorners(q)));
  assert.equal(C.isConvexQuad([[0, 0], [10, 10], [10, 0], [0, 10]]), false); // bow tie
  assert.equal(C.isConvexQuad([[0, 0], [10, 0], [2, 2], [0, 10]]), false);   // dart (concave)
});

test("convex hull and maximum-area quad on a known shape", () => {
  const pts = [];
  for (let i = 0; i <= 20; i++) { pts.push([i, 0], [i, 10], [0, i / 2], [20, i / 2]); }
  pts.push([5, 5], [10, 3]);
  const hull = C.convexHull(pts);
  assert.equal(hull.length, 4);
  const q = C.maxAreaQuad(hull);
  close(Math.abs(C.polygonArea(q)), 200, 1e-9);
});

test("fitLine recovers a line direction", () => {
  const pts = [];
  for (let i = 0; i < 50; i++) pts.push([i, 3 + 0.5 * i]);
  const L = C.fitLine(pts);
  close(Math.abs(L.d[1] / L.d[0]), 0.5, 1e-9);
});

test("parseRange reads lists, open ranges and reversed ranges, and rejects bad ones", () => {
  assert.deepEqual(C.parseRange("1-3, 5, 8-", 10), [0, 1, 2, 4, 7, 8, 9]);
  assert.deepEqual(C.parseRange("", 3), [0, 1, 2]);
  assert.deepEqual(C.parseRange("all", 2), [0, 1]);
  assert.deepEqual(C.parseRange("3-1", 5), [2, 1, 0]);
  assert.deepEqual(C.parseRange("-2,last", 5), [0, 1, 4]);
  assert.deepEqual(C.parseRange("2,2,2", 5), [1]);
  assert.throws(() => C.parseRange("0", 5), (e) => e.code === "range");
  assert.throws(() => C.parseRange("6", 5), (e) => e.code === "range" && /5 pages/.test(e.message));
  assert.throws(() => C.parseRange("1-x", 5), (e) => e.code === "range");
  assert.throws(() => C.parseRange("<script>", 5), (e) => e.code === "range");
  assert.throws(() => C.parseRange("1", 0), (e) => e.code === "range");
});

test("chunkIndices splits into groups of N", () => {
  assert.deepEqual(C.chunkIndices(5, 2), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(C.chunkIndices(3, 10), [[0, 1, 2]]);
  assert.throws(() => C.chunkIndices(3, 0), (e) => e.code === "range");
});

test("displayToUser handles all four /Rotate values", () => {
  const box = { x: 0, y: 0, width: 612, height: 792 };
  // the display's top-left corner
  assert.deepEqual(Array.from(C.displayToUser(0, 0, box, 0)), [0, 792]);
  assert.deepEqual(Array.from(C.displayToUser(0, 0, box, 90)), [0, 0]);
  assert.deepEqual(Array.from(C.displayToUser(0, 0, box, 180)), [612, 0]);
  assert.deepEqual(Array.from(C.displayToUser(0, 0, box, 270)), [612, 792]);
  // display size swaps for quarter turns
  assert.deepEqual(Array.from(C.displaySize(box, 90)), [792, 612]);
  assert.deepEqual(Array.from(C.displaySize(box, -90)), [792, 612]);
  // offset media box
  assert.deepEqual(Array.from(C.displayToUser(10, 20, { x: 5, y: 7, width: 100, height: 200 }, 0)), [15, 187]);
});

test("stampPlacement keeps the stamp inside the page", () => {
  const box = { x: 0, y: 0, width: 612, height: 792 };
  const s = C.stampPlacement(box, 0, 0.95, 0.95, 0.5, 2);
  close(s.width, 306, 1e-9); close(s.height, 153, 1e-9);
  close(s.x, 306, 1e-9); close(s.y, 0, 1e-9);
  const r = C.stampPlacement(box, 90, 0, 0, 0.25, 4);
  assert.equal(r.rotate, 90);
  close(r.width, 198, 1e-9);
});

test("page number text", () => {
  assert.equal(C.formatPageNumber("plain", 0, 3), "1");
  assert.equal(C.formatPageNumber("page-of", 2, 3), "Page 3 of 3");
  assert.equal(C.formatPageNumber("slash", 1, 4), "2 / 4");
});
