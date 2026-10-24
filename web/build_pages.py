"""Wrap web/app.html into docs/index.html as a full HTML document for GitHub Pages.

Run: python web/build_pages.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "app.html"
OUT = ROOT / "docs" / "index.html"

CDN = "https://cdn.jsdelivr.net"

# The page loads pdf-lib and pdf.js from jsDelivr (pinned versions, SRI
# hashes). Workers are created from blob: URLs. Nothing is fetched or sent.
CSP = (
    "default-src 'none'; "
    f"script-src 'unsafe-inline' {CDN}; "
    "worker-src blob:; "
    "style-src 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com data:; "
    "img-src blob: data:; "
    "connect-src 'none'; object-src 'none'; frame-src 'none'; "
    "form-action 'none'; base-uri 'none'"
)

HEAD = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="no-referrer">
<meta name="description" content="Scan paper to PDF, merge, split, rotate and sign PDFs, and compress images. Runs in your browser; your files never leave your device.">
<style>
:root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
body {{ margin: 0; }}
</style>
"""


def build() -> Path:
    app = SRC.read_text(encoding="utf-8")
    cut = app.index("<style>")
    head_part = app[:cut]
    body_part = app[cut:]
    style_end = body_part.index("</style>") + len("</style>")
    doc = HEAD + head_part + body_part[:style_end] + "\n</head>\n<body>\n" + body_part[style_end:].lstrip("\n") + "</body>\n</html>\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(doc, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
