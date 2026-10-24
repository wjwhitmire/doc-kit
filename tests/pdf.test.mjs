// Round trips through pdf-lib (a dev dependency: npm install). Skipped with a
// note when pdf-lib is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { C, html } from "./load_core.mjs";

const require = createRequire(import.meta.url);
let lib = null;
try { lib = require("pdf-lib"); } catch { lib = null; }
const skip = lib ? false : "pdf-lib not installed (run npm install)";

async function makePdf(sizes, label) {
  const d = await lib.PDFDocument.create();
  const font = await d.embedFont(lib.StandardFonts.Helvetica);
  sizes.forEach((s, i) => {
    const p = d.addPage(s);
    p.drawText(`${label} page ${i + 1}`, { x: 20, y: 20, size: 12, font });
  });
  return d.save();
}
const load = (b) => lib.PDFDocument.load(b, { updateMetadata: false });
const sizesOf = (d) => d.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
const rotsOf = (d) => d.getPages().map((p) => p.getRotation().angle);

test("the pinned pdf-lib version in app.html matches the tested one", { skip }, () => {
  const v = require("pdf-lib/package.json").version;
  assert.ok(html.includes(`pdf-lib@${v}/`), "app.html pins pdf-lib@" + v);
});

test("merge keeps every page in order", { skip }, async () => {
  const a = await makePdf([[100, 200], [110, 200]], "A");
  const b = await makePdf([[300, 400]], "B");
  const out = await C.assemblePdf(lib, [a, b], [
    { src: 0, index: 0 }, { src: 0, index: 1 }, { src: 1, index: 0 }
  ]);
  const d = await load(out);
  assert.deepEqual(sizesOf(d), [[100, 200], [110, 200], [300, 400]]);
  assert.equal(d.getProducer(), "Doc Kit");
});

test("split and extract select the right pages, reorder works", { skip }, async () => {
  const a = await makePdf([[101, 500], [102, 500], [103, 500], [104, 500], [105, 500]], "A");
  const idx = C.parseRange("4, 1-2", 5);
  const ex = await load(await C.assemblePdf(lib, [a], idx.map((i) => ({ src: 0, index: i }))));
  assert.deepEqual(sizesOf(ex).map((s) => s[0]), [104, 101, 102]);
  const parts = C.chunkIndices(5, 2);
  const outs = await Promise.all(parts.map((g) => C.assemblePdf(lib, [a], g.map((i) => ({ src: 0, index: i })))));
  const counts = await Promise.all(outs.map(async (b) => (await load(b)).getPageCount()));
  assert.deepEqual(counts, [2, 2, 1]);
  const last = await load(outs[2]);
  assert.equal(sizesOf(last)[0][0], 105);
});

test("rotation adds to the page's existing /Rotate and wraps at 360", { skip }, async () => {
  const d0 = await lib.PDFDocument.create();
  d0.addPage([200, 300]).setRotation(lib.degrees(270));
  d0.addPage([200, 300]);
  const a = await d0.save();
  const out = await load(await C.assemblePdf(lib, [a], [{ src: 0, index: 0, rotate: 180 }, { src: 0, index: 1, rotate: 90 }]));
  assert.deepEqual(rotsOf(out), [90, 90]);
  // round trip: rotating four times returns to the start
  let b = a;
  for (let k = 0; k < 4; k++) b = await C.assemblePdf(lib, [b], [{ src: 0, index: 0, rotate: 90 }, { src: 0, index: 1, rotate: 90 }]);
  assert.deepEqual(rotsOf(await load(b)), [270, 0]);
});

test("delete: omitted pages are gone", { skip }, async () => {
  const a = await makePdf([[101, 500], [102, 500], [103, 500]], "A");
  const out = await load(await C.assemblePdf(lib, [a], [{ src: 0, index: 0 }, { src: 0, index: 2 }]));
  assert.deepEqual(sizesOf(out).map((s) => s[0]), [101, 103]);
});

test("stamps and page numbers are drawn; text stamps reject unsupported characters", { skip }, async () => {
  const a = await makePdf([[612, 792], [612, 792]], "A");
  const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNkYPhfz8DAwMAAAAoAAX0xR9gAAAAASUVORK5CYII=", "base64"));
  const out = await C.assemblePdf(lib, [a], [
    { src: 0, index: 0, stamps: [{ kind: "text", text: "W.W.", fx: 0.6, fy: 0.8, fw: 0.2 }] },
    { src: 0, index: 1, rotate: 90, stamps: [{ kind: "image", png, aspect: 2, fx: 0.1, fy: 0.1, fw: 0.3 }] }
  ], { numbers: { format: "page-of", position: "bottom-center", size: 10 } });
  const d = await load(out);
  assert.equal(d.getPageCount(), 2);
  assert.ok(out.length > a.length);
  await assert.rejects(
    C.assemblePdf(lib, [a], [{ src: 0, index: 0, stamps: [{ kind: "text", text: "你好", fx: 0, fy: 0, fw: 0.2 }] }]),
    (e) => e.code === "charset");
});

test("page JavaScript and open actions do not carry into outputs", { skip }, async () => {
  const d0 = await lib.PDFDocument.create();
  const page = d0.addPage([200, 200]);
  const ctx = d0.context, N = lib.PDFName;
  const js = ctx.obj({ S: "JavaScript", JS: lib.PDFString.of("app.alert(1)") });
  page.node.set(N.of("AA"), ctx.obj({ O: js }));
  const annot = ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], A: js });
  page.node.set(N.of("Annots"), ctx.obj([ctx.register(annot)]));
  d0.catalog.set(N.of("OpenAction"), js);
  const src = await d0.save();
  const out = await C.assemblePdf(lib, [src], [{ src: 0, index: 0 }]);
  const text = Buffer.from(out).toString("latin1");
  assert.ok(!/JavaScript/.test(text), "no JavaScript action in output");
  const d = await load(out);
  assert.equal(d.catalog.get(N.of("OpenAction")), undefined);
});

test("images to PDF: one page per image with layout from pageLayout", { skip }, async () => {
  const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNkYPhfz8DAwMAAAAoAAX0xR9gAAAAASUVORK5CYII=", "base64"));
  const out = await C.imagesToPdf(lib, [{ bytes: png, type: "png" }, { bytes: png, type: "png", width: 100, height: 300 }], { size: "letter", marginPt: 36 });
  const d = await load(out);
  assert.deepEqual(sizesOf(d), [[792, 612], [612, 792]]);
  const fit = await load(await C.imagesToPdf(lib, [{ bytes: png, type: "png" }], { size: "fit", marginPt: 0 }));
  assert.deepEqual(sizesOf(fit), [[792, 396]]);
  await assert.rejects(C.imagesToPdf(lib, [], {}), (e) => e.code === "input");
});

test("limits and bad input fail with specific errors", { skip }, async () => {
  const a = await makePdf([[100, 100]], "A");
  const many = Array.from({ length: 301 }, () => ({ src: 0, index: 0 }));
  await assert.rejects(C.assemblePdf(lib, [a], many), (e) => e.code === "limit" && /300/.test(e.message));
  await assert.rejects(C.assemblePdf(lib, [a], []), (e) => e.code === "input");
  await assert.rejects(C.assemblePdf(lib, [a], [{ src: 0, index: 5 }]), (e) => e.code === "range");
  await assert.rejects(C.loadPdf(lib, new TextEncoder().encode("<script>alert(1)</script>")), (e) => e.code === "pdf");
});

test("the example PDF has three pages and a title", { skip }, async () => {
  const d = await load(await C.makeExamplePdf(lib));
  assert.equal(d.getPageCount(), 3);
  assert.equal(d.getTitle(), "Doc Kit example");
});

// Review fixes: every action type and cross-page reference is stripped, and
// objects not reachable from the output catalog are pruned.
test("Launch, SubmitForm, ImportData, URI /Next chains and field actions are removed", { skip }, async () => {
  const d0 = await lib.PDFDocument.create();
  const ctx = d0.context, N = lib.PDFName, pg = d0.addPage([300, 300]);
  const js = ctx.register(ctx.obj({ S: "JavaScript", JS: lib.PDFString.of("NEXT_MARKER") }));
  const field = ctx.obj({ FT: "Tx", T: lib.PDFString.of("f1"), AA: { K: ctx.register(ctx.obj({ S: "JavaScript", JS: lib.PDFString.of("FIELD_MARKER") })) } });
  const fieldRef = ctx.register(field);
  const annots = [
    { Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], A: { S: "Launch", F: lib.PDFString.of("calc.exe") } },
    { Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], A: { S: "URI", URI: lib.PDFString.of("https://x.test"), Next: js } },
    { Type: "Annot", Subtype: "Square", Rect: [0, 0, 9, 9], A: { S: "SubmitForm", F: lib.PDFString.of("https://x.test/c") } },
    { Type: "Annot", Subtype: "Square", Rect: [0, 0, 9, 9], A: { S: "ImportData", F: lib.PDFString.of("x.fdf") } },
    { Type: "Annot", Subtype: "Widget", Rect: [0, 0, 9, 9], Parent: fieldRef }
  ].map((a) => ctx.register(ctx.obj(a)));
  pg.node.set(N.of("Annots"), ctx.obj(annots));
  d0.catalog.set(N.of("AcroForm"), ctx.obj({ Fields: [fieldRef] }));
  const out = await C.assemblePdf(lib, [await d0.save({ useObjectStreams: false })], [{ src: 0, index: 0 }]);
  const d = await load(out);
  const kinds = [];
  for (const [, o] of d.context.enumerateIndirectObjects()) {
    if (!(o instanceof lib.PDFDict)) continue;
    if (o.get(N.of("S"))) kinds.push(String(o.get(N.of("S"))));
    if (o.get(N.of("AA")) || o.get(N.of("A"))) kinds.push("action-bearing dict");
    if (/MARKER/.test(String(o))) kinds.push("script text");
  }
  assert.deepEqual(kinds, []);
});

test("an extract does not carry content of omitted pages through link destinations", { skip }, async () => {
  const d0 = await lib.PDFDocument.create();
  const font = await d0.embedFont(lib.StandardFonts.Helvetica);
  const p1 = d0.addPage([200, 200]); p1.drawText("PUBLIC", { x: 10, y: 100, font, size: 12 });
  const p2 = d0.addPage([200, 200]); p2.drawText("OMITTED", { x: 10, y: 100, font, size: 12 });
  const ctx = d0.context;
  const link = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [p2.ref, "Fit"] }));
  p1.node.set(lib.PDFName.of("Annots"), ctx.obj([link]));
  const out = await C.assemblePdf(lib, [await d0.save({ useObjectStreams: false })], [{ src: 0, index: 0 }]);
  const d = await load(out);
  let pageDicts = 0, streams = 0;
  for (const [, o] of d.context.enumerateIndirectObjects()) {
    if (o instanceof lib.PDFDict && String(o.get(lib.PDFName.of("Type"))) === "/Page") pageDicts++;
    if (o instanceof lib.PDFRawStream && !o.dict.get(lib.PDFName.of("Type"))) streams++;
  }
  assert.equal(pageDicts, 1, "only the extracted page object is present");
  assert.ok(streams <= 1, "only one page content stream (found " + streams + ")");
});

test("a PDF with an /Encrypt trailer entry is refused with the encrypted message", { skip }, async () => {
  const raw = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\n4 0 obj << /Filter /Standard /V 5 /R 6 /Length 256 >> endobj\n" +
    "trailer << /Root 1 0 R /Encrypt 4 0 R /Size 5 >>\n%%EOF\n";
  await assert.rejects(C.loadPdf(lib, new TextEncoder().encode(raw)), (e) => e.code === "encrypted");
});
