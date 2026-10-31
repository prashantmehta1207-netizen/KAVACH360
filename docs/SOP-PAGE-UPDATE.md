# KAVACH360 Safety SOPs page update

This update replaces only these frontend files:
- `frontend/index.html` (cache-busted CSS/JS URLs)
- `frontend/styles.css` (dark theme plus complete SOP page styles)
- `frontend/js/app.js` (complete Safety SOPs page layout and interactions)

It does not replace backend files, the SQLite database, uploads, reports, `.env`, or the root README/license.

## Install
Run from the KAVACH360 repository root:

```bash
unzip -o ~/Downloads/KAVACH360-SOP-Proper-Update.zip -d .
```

Then restart FastAPI:

```bash
# Stop the old server with Ctrl+C first
source .venv/bin/activate
python -m uvicorn backend.main:app --reload --reload-dir backend --reload-dir frontend --port 8000
```

Open `http://127.0.0.1:8000/#sops` and hard-refresh Chrome with `Cmd+Shift+R`.

## Verify the new files really installed
From the repository root:

```bash
grep -n "One source of truth for site safety procedures" frontend/js/app.js
grep -n "sop-metrics-grid" frontend/styles.css
grep -n "sop-proper3" frontend/index.html
```

Each command should return a matching line. If not, the ZIP was not extracted into the repository root.

## Page behavior
The SOP page now includes:
- Intro / explanation strip
- Indexed-manual, extracted-page and linked-observation metrics
- Site-scoped PDF upload with drag-and-drop and filename preview
- Document library with a useful empty state and honest status for PDFs with no selectable text
- Three-step workflow explanation
- Observation-to-SOP reference panel
- Human verification / scanned-PDF limitations notice

The page uses actual API data; it does not fabricate uploaded PDFs or rule matches. Scanned/image-only PDFs still require OCR, which is not included in this MVP.
