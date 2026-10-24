import { test } from "node:test";
import assert from "node:assert/strict";
import { C } from "./load_core.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

test("page sizes in points: Letter 612 x 792, A4 595.28 x 841.89", () => {
  assert.deepEqual(Array.from(C.PAGE_SIZES.letter), [612, 792]);
  close(C.PAGE_SIZES.a4[0], 595.2756, 1e-3);
  close(C.PAGE_SIZES.a4[1], 841.8898, 1e-3);
  close(C.mmToPt(25.4), 72, 1e-12);
  close(C.mmToPt(10), 28.3465, 1e-4);
});

test("portrait image on Letter with margin: fits, keeps aspect, centered", () => {
  const L = C.pageLayout(1000, 2000, { size: "letter", marginPt: 36 });
  assert.equal(L.pageW, 612); assert.equal(L.pageH, 792);
  close(L.h, 720, 1e-9); close(L.w, 360, 1e-9); // height-limited
  close(L.x, (612 - 360) / 2, 1e-9); close(L.y, 36, 1e-9);
  close(L.w / L.h, 0.5, 1e-12);
});

test("wide image on A4 turns the page landscape", () => {
  const L = C.pageLayout(3000, 2000, { size: "a4", marginPt: 0 });
  close(L.pageW, 841.89, 0.01); close(L.pageH, 595.28, 0.01);
  close(L.w, L.pageW, 1e-9); close(L.h, L.pageW * 2 / 3, 1e-9);
  close(L.y, (L.pageH - L.h) / 2, 1e-9);
  const P = C.pageLayout(3000, 2000, { size: "a4", orientation: "portrait" });
  assert.ok(P.pageW < P.pageH);
});

test("fit to image: long side 792 pt plus margins, exact aspect", () => {
  const L = C.pageLayout(1200, 900, { size: "fit", marginPt: 10 });
  close(L.w, 792, 1e-9); close(L.h, 594, 1e-9);
  close(L.pageW, 812, 1e-9); close(L.pageH, 614, 1e-9);
  assert.equal(L.x, 10); assert.equal(L.y, 10);
  const T = C.pageLayout(500, 1000, { size: "fit" });
  close(T.h, 792, 1e-9); close(T.w, 396, 1e-9);
});

test("the image box never leaves the margins", () => {
  for (const size of ["letter", "a4"]) for (const [w, h] of [[1, 1], [10, 1000], [1000, 10], [851, 1100]]) for (const m of [0, 17, 72]) {
    const L = C.pageLayout(w, h, { size, marginPt: m });
    assert.ok(L.x >= m - 1e-9 && L.y >= m - 1e-9);
    assert.ok(L.x + L.w <= L.pageW - m + 1e-9 && L.y + L.h <= L.pageH - m + 1e-9);
    close(L.w / L.h, w / h, 1e-9 * (w / h));
  }
});

test("bad page layout input fails with a specific message", () => {
  assert.throws(() => C.pageLayout(0, 10), (e) => e.code === "input");
  assert.throws(() => C.pageLayout(10, 10, { marginPt: -1 }), (e) => e.code === "margin");
  assert.throws(() => C.pageLayout(10, 10, { marginPt: NaN }), (e) => e.code === "margin");
  assert.throws(() => C.pageLayout(10, 10, { size: "letter", marginPt: 400 }), (e) => e.code === "margin" && /smaller margin/.test(e.message));
  assert.throws(() => C.pageLayout(10, 10, { size: "tabloid" }), (e) => e.code === "input");
});

test("capScale and limits", () => {
  assert.equal(C.capScale(5000, 3000, 2500), 0.5);
  assert.equal(C.capScale(800, 600, 2500), 1);
  assert.equal(C.LIMITS.maxFileBytes, 50 * 1024 * 1024);
  assert.equal(C.LIMITS.maxPages, 300);
  assert.equal(C.LIMITS.workMaxEdge, 2500);
});

test("file names are sanitized for downloads", () => {
  assert.equal(C.safeFileBase("<img src=x onerror=alert(1)>.pdf"), "img_src_x_onerror_alert_1_");
  assert.equal(C.safeFileBase("../../etc/passwd"), "etc_passwd");
  assert.equal(C.safeFileBase("", "scan"), "scan");
  assert.equal(C.safeFileBase("My Scan 2026.pdf"), "My_Scan_2026");
  assert.ok(C.safeFileBase("x".repeat(500)).length <= 60);
});

test("formatBytes", () => {
  assert.equal(C.formatBytes(512), "512 B");
  assert.equal(C.formatBytes(2048), "2.0 KB");
  assert.equal(C.formatBytes(50 * 1024 * 1024), "50.0 MB");
  assert.equal(C.formatBytes(1.5 * 1024 * 1024), "1.50 MB");
});

test("processScan flattens, filters and rotates the example in one call", () => {
  const scene = C.makeExampleScene();
  const out = C.processScan(scene.image, scene.corners, "grayscale", 1, 2500);
  const sz = C.outputSizeForQuad(scene.corners);
  assert.equal(out.width, sz.height); assert.equal(out.height, sz.width);
  for (let i = 0; i < out.data.length; i += 4 * 97) assert.ok(out.data[i] === out.data[i + 1] && out.data[i] === out.data[i + 2]);
});

test("paper size follows the browser language region", () => {
  for (const l of ["en-US", "en-CA", "fr-CA", "es-MX", "en-PH", "es-CL", "en", "", undefined, "zh-Hant-US"]) assert.equal(C.paperForLocale(l), "letter", l);
  for (const l of ["en-GB", "de-DE", "fr-FR", "en-AU", "en-IN", "ja-JP", "zh-Hans-CN", "pt-BR"]) assert.equal(C.paperForLocale(l), "a4", l);
});

test("output name comes from the files added", () => {
  assert.equal(C.outputBaseName([], "document"), "document");
  assert.equal(C.outputBaseName(["Lease report.pdf"], "document"), "Lease_report");
  assert.equal(C.outputBaseName(["a.pdf", "b.pdf"], "document"), "a-merged");
  assert.equal(C.outputBaseName(["../../etc.pdf"], "document"), "etc");
  assert.ok(C.outputBaseName(["x".repeat(80) + ".pdf", "y.pdf"], "d").length <= 60);
});
