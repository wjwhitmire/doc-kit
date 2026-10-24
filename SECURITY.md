# Security

## What the page does with your files

- Files are read in the browser from the file picker or drag and drop. They are processed in memory and never uploaded, stored or sent anywhere.
- The page makes no fetch, XHR, WebSocket, beacon or analytics requests. The only external resources are three pinned scripts from jsDelivr (pdf-lib 1.17.1 and pdf.js 3.11.174 with its worker), and the Google Fonts stylesheet. pdf-lib and pdf.js are loaded with Subresource Integrity hashes. The pdf.js worker is pinned by exact version; when it runs in a Web Worker it is loaded with `importScripts`, which cannot check an integrity hash, and it runs under the page's `connect-src 'none'` policy on the GitHub Pages build. When it runs on the main thread it is integrity-checked.
- The GitHub Pages build (`docs/index.html`) sets a Content-Security-Policy: `connect-src 'none'`, scripts only inline or from `https://cdn.jsdelivr.net`, workers only from `blob:`, images only from `blob:` and `data:`, no frames, objects or forms.
- PDF content is untrusted. pdf.js runs with `isEvalSupported: false`, XFA off, and without its scripting component, so PDF JavaScript never runs. Every action (JavaScript, Launch, SubmitForm, ImportData, URI and `/Next` chains) and every additional-action (`/AA`) entry is removed from copied pages, document-level scripts and open actions are not copied, and objects not reachable from the output's catalog are deleted before saving.
- File names and PDF metadata are shown with `textContent` only, after removing control and bidirectional-override characters. Download names are reduced to letters, digits, `.`, `_` and `-`.
- No `eval`, `new Function`, `innerHTML` or inline event-handler attributes. Web Workers are created from blob URLs built from the page's own code.
- localStorage holds one UI convenience (the last open tab). It never holds file data.
- Each file is capped at 50 MB and each output at 300 pages.

## Reporting a problem

Open a GitHub issue with the label `security`, or use GitHub's private vulnerability reporting on this repository if the issue should not be public. Include the steps to reproduce and the browser version.
