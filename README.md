# KAVACH360 AI

**Multimodal Construction Safety Intelligence Platform**  
Tagline: *See the Risk. Understand the Danger. Prevent the Incident.*

A hackathon-ready, modular MVP built with **HTML5, CSS3, Vanilla JavaScript, Python FastAPI, SQLite, OpenCV, PyMuPDF, ReportLab, and Ollama/Gemma 4**.

> Safety note: this is a decision-support prototype. Model observations are preliminary visual cues, not confirmed violations or a substitute for a qualified site safety inspection. Every AI observation is marked for human review.

## What's included

- Professional responsive dashboard inspired by the supplied KAVACH360 reference.
- Video inspection creation, upload, preview, bounded OpenCV frame extraction, and analysis status.
- Configurable Ollama multimodal image analysis using Gemma 4.
- Structured observation records with evidence frame URLs and timestamps.
- 2D construction-site blueprint with configured zones and clickable observation markers.
- PDF safety manual upload and text extraction with lightweight page-level keyword matching.
- Human review actions: confirm, dismiss, or request more evidence.
- Corrective action tracker with assignee, due date, and status.
- PDF inspection report generation.
- SQLite persistence and clearly-labelled seeded demo records.

## Requirements

- macOS, Windows, or Linux
- Python 3.10+ (Python 3.11 or 3.12 is a safe choice for the broadest wheel compatibility)
- Ollama with a Gemma 4 model installed for actual visual analysis
- 4 GB or more free RAM for basic backend operation; model memory depends on the chosen Gemma variant

The user's earlier terminal output showed Ollama `0.40.13`. That is an old release and predates Gemma 4 support. Upgrade Ollama to a current release before pulling Gemma 4. On macOS, install/update from <https://ollama.com/download> or update the Homebrew package if that is how Ollama was installed.

## Run on macOS

Open Terminal in the **KAVACH360 repository root** (the folder containing `frontend/`, `backend/`, and this README).

```bash
# 1. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Python packages
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

# 3. Configure the local model
cp .env.example .env

# 4. Start or update Ollama separately, then pull Gemma 4 E2B
ollama --version
ollama pull gemma4:e2b
ollama list

# 5. Start KAVACH360 from the repository root
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000> in your browser.

If Ollama is already running as a macOS app, leave it open. Otherwise run `ollama serve` in a separate Terminal window. Do not run a second Ollama server if the app already owns port `11434`.

### Configure a different model

Edit `.env`:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:e2b
MAX_VIDEO_MB=100
MAX_FRAMES_PER_VIDEO=6
DATABASE_PATH=.data/kavach360.db
```

Use a model name that appears in `ollama list`. Restart FastAPI after changing `.env`.

### macOS model sizing note

Gemma 4 model requirements vary by variant and quantization. Start with `gemma4:e2b`, check the model's current Ollama library size, and monitor Activity Monitor. If your MacBook Air M2 has 16 GB RAM, close memory-heavy apps before loading a local vision model. A 6 GB RTX 3050 is not a good target for larger Gemma variants.

## Windows

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
pip install -r backend/requirements.txt
copy .env.example .env
ollama pull gemma4:e2b
py -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

## First-use walkthrough

1. Open the Dashboard. It starts with sample sites and sample observations labelled **DEMO DATA**.
2. Go to **Video Inspections** and create an inspection.
3. Select a site, optionally choose a camera, and upload a short MP4/MOV video.
4. Start Gemma 4 analysis. The backend extracts up to six frames and sends them individually to Ollama.
5. Open the inspection analysis page to view actual model responses, timestamps, and frame evidence.
6. Use **Detected Safety Observations** / **Action Center** to make a human review decision.
7. Upload a text-based PDF in **Safety SOPs**. The MVP does page-level keyword matching, not advanced RAG or OCR.
8. Use **Smart Site Map** to view configured zones and their linked observations.
9. Create a PDF report from a completed inspection in **Reports**.

## API overview

- `GET /api/health` — backend and Ollama/model health
- `GET /api/dashboard` — dashboard counts and latest records
- `GET /api/sites`, `POST /api/sites`
- `GET /api/sites/{site_id}/map`, `POST /api/sites/{site_id}/cameras`
- `POST /api/inspections`
- `POST /api/inspections/{inspection_id}/video`
- `POST /api/inspections/{inspection_id}/analyze`
- `GET /api/inspections`, `GET /api/inspections/{inspection_id}`
- `GET /api/observations`
- `PATCH /api/observations/{observation_id}/review`
- `GET /api/actions`, `POST /api/observations/{observation_id}/actions`
- `PATCH /api/actions/{action_id}`
- `GET /api/sops`, `POST /api/sops`
- `POST /api/inspections/{inspection_id}/report`, `GET /api/reports`

Interactive API documentation is available at <http://127.0.0.1:8000/docs>.

## Project structure

```text
KAVACH360/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── js/app.js
├── backend/
│   ├── main.py
│   ├── db.py
│   ├── ai.py
│   ├── video.py
│   ├── sops.py
│   ├── reports.py
│   └── requirements.txt
├── storage/                 # uploaded videos, frames, SOPs, generated PDFs
├── .data/                   # SQLite database (created at runtime)
├── .env.example
└── .gitignore
```

## Important limitations (MVP)

- A video is sampled into a maximum of six still frames. This is not continuous video understanding or live CCTV monitoring.
- The current site-map assigns observations to a configured camera zone. If no camera is selected, an observation remains unmapped until a camera-to-zone mapping is configured. It does not infer GPS coordinates or exact image coordinates.
- SOP matching is lightweight keyword overlap against extracted PDF text. Scanned PDFs need OCR, which is not included.
- Gemma 4 is a general vision-language model, not a dedicated PPE certification detector. Low visibility and context limits can cause missed or incorrect observations.
- The report is a review aid, not a certified safety audit.
- Authentication, multi-user roles, cloud storage, notifications, live CCTV, geofencing, and regulatory compliance mapping are not implemented.

## GitHub checklist

Before publishing:

- Keep `.env`, `.data/`, `storage/`, real worker videos, and private documents out of Git.
- Review all sample content and replace the demo data with your own verified test footage.
- Keep Gemma and third-party notices/licenses separate from your project's MIT license.
- Add team members and acknowledgements to the repository README.










