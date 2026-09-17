"""Optional visual document check: run export-qa-pdfs.mjs first. Requires PyMuPDF."""
from pathlib import Path
import fitz

for name, expected_pages in [('qa-slip', 1), ('qa-packet', 6), ('qa-long-packet', None)]:
    document = fitz.open(Path('test-results') / f'{name}.pdf')
    if expected_pages:
        assert len(document) == expected_pages, (name, len(document))
    for number, page in enumerate(document, 1):
        for drawing in page.get_drawings():
            assert drawing['rect'].y1 <= 765, (name, number, 'signature extends into footer or off page', drawing['rect'])
    text = '\n'.join(page.get_text() for page in document)
    assert 'Samuel Umar' in text, (name, 'missing releasing authority')
    assert 'Amina Ibrahim' in text, (name, 'missing applicant')
    print(f'{name}: {len(document)} pages, names present, signatures within printable area')
