// Extract the <script id="core"> block from web/app.html and evaluate it with
// node:vm in this realm (pdf-lib type checks need same-realm arrays).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
export const APP_PATH = join(here, "..", "web", "app.html");
export const html = readFileSync(APP_PATH, "utf8");

const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("core script block not found in web/app.html");
export const coreSource = m[1];

const script = new vm.Script(coreSource + "\n;DocCore;", { filename: "app.html#core" });
export const C = script.runInThisContext();
