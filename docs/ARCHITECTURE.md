# Architecture notes

## Request flow

Browser (HTML/CSS/Vanilla JS) → FastAPI routes → SQLite / local storage → OpenCV frames → Ollama Gemma 4 image chat → validated structured observations → human review → corrective action → ReportLab PDF.

## Evidence model

Each model observation references an extracted frame row and therefore receives an application-generated video timestamp and locally stored evidence image URL. The model is instructed to describe only visible facts and always requires human review.

## Map model

A site has manually configured zones stored as normalized 0–100 position values. A selected camera is linked to one zone. For the first MVP, frame observations inherit that camera zone. Map markers represent zone-level context only, not exact pixel-level hazard localization.

## Data and privacy

- SQLite database: `.data/kavach360.db`
- Videos: `storage/videos/`
- Frames: `storage/frames/`
- Safety manuals: `storage/sops/`
- Generated reports: `storage/reports/`

These paths are excluded from Git. Keep real worker footage private and define a deletion/retention process before production use.
