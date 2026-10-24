// Static checks on web/app.html and docs/index.html: the page contract and
// the security rules in SECURITY.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { html, coreSource } from "./load_core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

test("standalone page contract: starts with title, fonts link, style", () => {
  const lines = html.split("\n");
  assert.equal(lines[0], "<title>Doc Kit</title>");

  assert.ok(lines[1].startsWith('<link rel="stylesheet" href="https://fonts.googleapis.com/'));
  assert.equal(lines[2], "<style>");
  assert.ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html));
});

test("core block is pure: no DOM or network access", () => {
  for (const bad of ["document.", "window.", "fetch(", "XMLHttpRequest", "localStorage", "navigator."]) {
    assert.ok(!coreSource.includes(bad), "core uses " + bad);
  }
});

test("no network APIs, eval, inline handlers or HTML injection sinks", () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /\beval\s*\(/, /new\s+Function/,
    /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/];
  for (const re of banned) assert.ok(!re.test(scripts), "found " + re);
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), "inline event handler attribute");
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(scripts.replace(/app\.alert\(1\)/g, "")));
  assert.ok(!/window\.print/.test(scripts));
});

test("only pinned jsDelivr scripts and Google Fonts are referenced", () => {
  const urls = [...html.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => m[0]);
  for (const u of urls) {
    const ok = u.startsWith("https://fonts.googleapis.com/") ||
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/(pdf-lib@1\.17\.1|pdfjs-dist@3\.11\.174)\//.test(u);
    assert.ok(ok, "unexpected URL " + u);
  }
  const sri = [...html.matchAll(/sri:\s*"(sha384-[A-Za-z0-9+/=]+)"/g)];
  assert.equal(sri.length, 3, "three SRI hashes");
});

test("pdf.js is opened with eval and XFA off", () => {
  assert.ok(/isEvalSupported:\s*false/.test(html));
  assert.ok(/enableXfa:\s*false/.test(html));
});

test("labels the example and states the privacy line", () => {
  assert.ok(html.includes("Your files never leave this device."));
  assert.ok(html.includes("Example image"));
  assert.ok(html.includes("Example data"));
  assert.ok(html.includes("Method and limits"));
  assert.ok(html.includes('accept="image/*" capture="environment"'));
});

test("every form control has a label", () => {
  const ids = [...html.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[2]);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`), "no label for " + id);
});

test("docs/index.html is the current build with a strict CSP", () => {
  const p = join(root, "docs", "index.html");
  assert.ok(existsSync(p), "run python web/build_pages.py");
  const doc = readFileSync(p, "utf8");
  assert.ok(doc.startsWith("<!doctype html>"));
  assert.ok(doc.includes("connect-src 'none'"));
  assert.ok(doc.includes(html.slice(html.indexOf("<script id=\"core\">"), html.indexOf("<script id=\"core\">") + 2000)), "docs/index.html is stale");
});

test("no em dashes in the repo's text files", () => {
  const files = ["README.md", "SECURITY.md", "web/app.html", "docs/index.html", "web/build_pages.py"];
  for (const f of files) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    assert.ok(!readFileSync(p, "utf8").includes(String.fromCharCode(0x2014)), "em dash in " + f);
  }
});

test("visually hidden text cannot widen the page at 400 px", () => {
  // .sr-only is absolutely positioned; its containing block must be the
  // overflow-x container, or a wide table's hidden header pushes the page wider.
  assert.ok(/\.scroll \{[^}]*position: relative/.test(html));
  assert.ok(/\.sr-only \{[^}]*clip-path: inset\(50%\)/.test(html));
});
