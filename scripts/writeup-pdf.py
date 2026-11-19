"""Render docs/WRITEUP.md to docs/CrowdPlay-writeup.pdf (A4) and print the page count.
usage: python scripts/writeup-pdf.py"""
import pathlib, re, tempfile
import markdown
from playwright.sync_api import sync_playwright

docs = pathlib.Path(__file__).resolve().parent.parent / "docs"
md = (docs / "WRITEUP.md").read_text(encoding="utf-8")
md = re.sub(r"<!--.*?-->", "", md, flags=re.S)  # authoring notes stay out of the PDF
body = markdown.markdown(md, extensions=["tables", "fenced_code"])
css = """
@page { size: A4; margin: 13mm 14mm 14mm; }
body { font: 9.6pt/1.42 "Segoe UI", Inter, Arial, sans-serif; color: #1e1e22; }
h1 { font-size: 19pt; margin: 0 0 6pt; } h2 { font-size: 12.5pt; margin: 12pt 0 4pt; border-bottom: 1.5px solid #f5aa00; padding-bottom: 2pt; break-after: avoid; }
p, ul, ol { margin: 4pt 0; } li { margin: 1.5pt 0; }
table { border-collapse: collapse; width: 100%; margin: 5pt 0; font-size: 8.8pt; } tr, img { break-inside: avoid; }
thead:not(:has(th:not(:empty))) { display: none; }
th, td { border: 1px solid #d9d4c9; padding: 3pt 5pt; text-align: left; vertical-align: top; }
th { background: #fbf3dc; } td img { display: block; margin: 0 auto 2pt; }
pre { background: #f6f5f1; border: 1px solid #e3dfd5; padding: 6pt; font-size: 7.6pt; line-height: 1.3; break-inside: avoid; white-space: pre; }
code { font-family: Consolas, monospace; font-size: 0.92em; } a { color: #1e1e22; }
"""
html = f'<!doctype html><meta charset="utf-8"><base href="{docs.as_uri()}/"><style>{css}</style>{body}'
out = docs / "CrowdPlay-writeup.pdf"
with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    tmp = pathlib.Path(tempfile.mkdtemp()) / "writeup.html"  # a file:// page, so the screenshots load
    tmp.write_text(html, encoding="utf-8")
    page.goto(tmp.as_uri(), wait_until="load")
    page.pdf(path=str(out), format="A4", print_background=True, prefer_css_page_size=True)
pages = len(re.findall(rb"/Type\s*/Page[^s]", out.read_bytes()))
print(f"wrote {out} ({out.stat().st_size // 1024} KB, {pages} pages)")
assert pages <= 6, "write-up is limited to 6 pages"
