"""Browser test of the published site: placeholders filled, served under /doc-kit/.

Runs the scan, PDF and image workflows in headless Chromium and opens every
download. Needs Python with pytest, playwright and pypdf; skips without them.
  pip install pytest playwright pypdf && python -m playwright install chromium
  pytest -q tests/test_published_site.py
"""

from __future__ import annotations

import io

import pytest

from pages_site import install_routes, pages_root, release_tree, serve, watch

sync_api = pytest.importorskip("playwright.sync_api")
pypdf = pytest.importorskip("pypdf")
NAME = "doc-kit"


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    tree = release_tree(tmp_path_factory.mktemp("release"), NAME)
    assert "{{" + "LIVE_URL}}" not in (tree / "README.md").read_text(encoding="utf-8")
    with serve(pages_root(tree), NAME) as url:
        yield url


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception as exc:
            pytest.skip(f"Chromium not available: {exc}")
        yield b
        b.close()


def make_pdf(tmp_path):
    """Three pages told apart by size; the second carries /Rotate 90."""
    w = pypdf.PdfWriter()
    for size, rot in (((300, 400), 0), ((310, 410), 90), ((420, 320), 0)):
        pg = w.add_blank_page(*size)
        if rot:
            pg.rotate(rot)
    path = tmp_path / "Lease report.pdf"
    with open(path, "wb") as fh:
        w.write(fh)
    return path


def open_page(browser, url, errors, **kw):
    ctx = browser.new_context(accept_downloads=True, **kw)
    install_routes(ctx, url.split("/" + NAME)[0], errors)
    page = ctx.new_page()
    watch(page, errors)
    page.goto(url)
    return ctx, page


def wait_text(page, sel, pattern, timeout=60000):
    page.wait_for_function("([s,p]) => new RegExp(p).test(document.querySelector(s).textContent)", arg=[sel, pattern], timeout=timeout)
    return page.inner_text(sel)


def download(page, box, tmp_path, idx=0):
    with page.expect_download(timeout=20000) as dl:
        page.locator(box + " .out-item button.primary").nth(idx).click()
    out = tmp_path / dl.value.suggested_filename
    dl.value.save_as(out)
    return out, dl.value.suggested_filename


def pdf_lib_loaded(page):
    wait_text(page, "#pdf-lib-state", "ready|unavailable|pdf.js")
    return "unavailable" not in page.inner_text("#pdf-lib-state")


def test_scan_and_pdf_tools_keep_order_and_rotation(site, browser, tmp_path):
    errors: list = []
    ctx, page = open_page(browser, site, errors, locale="en-US")
    st = wait_text(page, "#scan-status", "Example image loaded|could not")
    assert "found automatically" in st
    assert page.input_value("#scan-size") == "letter" and "en-US" in page.inner_text("#scan-size-why")
    page.click("#tab-pdf")
    if not pdf_lib_loaded(page):
        pytest.skip("pdf-lib could not load (no network and no PAGES_TEST_VENDOR)")
    page.click("#tab-scan")
    page.click("#scan-make")
    wait_text(page, "#scan-status", "PDF ready|could not")
    out, name = download(page, "#scan-out", tmp_path)
    rd = pypdf.PdfReader(str(out))
    assert name == "scan.pdf" and len(rd.pages) == 1 and [float(x) for x in rd.pages[0].mediabox[2:]] == [612, 792]

    page.click("#tab-pdf")
    wait_text(page, "#pdf-status", "Example PDF loaded")
    page.set_input_files("#pdf-file", str(make_pdf(tmp_path)))
    wait_text(page, "#pdf-status", "pages from")
    # Minimal input: the name comes from the file and the signature goes on the last page.
    assert page.input_value("#pdf-name") == "Lease_report"
    assert page.input_value("#sig-page") == "6"
    page.locator("#pdf-pages li").nth(3).locator(".tools button").nth(2).click()   # rotate the 300x400 page
    page.locator("#pdf-pages li").nth(5).locator(".tools button").nth(0).click()   # move the last page up one
    page.click("#sig-mode-type")
    page.fill("#sig-text", "OK")
    page.click("#sig-add")
    page.click("#pdf-build")
    wait_text(page, "#pdf-status", "PDF ready|could not")
    out, name = download(page, "#pdf-out", tmp_path)
    rd = pypdf.PdfReader(str(out))
    sizes = [tuple(round(float(x)) for x in p.mediabox[2:]) for p in rd.pages]
    rots = [int(p.get("/Rotate", 0)) for p in rd.pages]
    assert name == "Lease_report.pdf"
    assert sizes[3:] == [(300, 400), (420, 320), (310, 410)]
    assert rots[3:] == [90, 0, 90]
    assert "OK" in (rd.pages[5].extract_text() or "")   # initials went on the last page
    assert page.evaluate("() => window.__csp") == []
    assert errors == []
    ctx.close()


def test_images_compress_and_paper_from_language(site, browser, tmp_path):
    errors: list = []
    ctx, page = open_page(browser, site, errors, locale="en-GB", viewport={"width": 400, "height": 800}, has_touch=True, is_mobile=True)
    wait_text(page, "#scan-status", "Example image loaded")
    page.click("#tab-img")
    wait_text(page, "#img-status", "Example image loaded")
    assert page.input_value("#img-size") == "a4" and "en-GB" in page.inner_text("#img-size-why")
    page.select_option("#img-maxedge", "800")
    page.click("#img-compress")
    wait_text(page, "#img-status", "Compressed|could not")
    with page.expect_download() as dl:
        page.locator("#img-table tbody tr").first.locator("button", has_text="Download").click()
    jpg = tmp_path / "small.jpg"
    dl.value.save_as(jpg)
    assert jpg.read_bytes()[:2] == b"\xff\xd8"
    assert page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0
    assert errors == []
    ctx.close()
