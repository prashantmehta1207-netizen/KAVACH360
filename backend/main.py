from __future__ import annotations

import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

from .ai import OLLAMA_MODEL, OLLAMA_URL, analyze_image
from .db import connect, init_db, new_id, now_iso
from .reports import build_inspection_pdf
from .sops import add_sop, best_rule
from .video import extract_frames

FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "storage"
for folder in (STORAGE / "videos", STORAGE / "frames", STORAGE / "sops", STORAGE / "reports"):
    folder.mkdir(parents=True, exist_ok=True)
MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "100"))
MAX_FRAMES = int(os.getenv("MAX_FRAMES_PER_VIDEO", "6"))

app = FastAPI(title="KAVACH360 AI", version="1.0.0", description="Construction safety inspection and evidence management MVP")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    init_db()


class SiteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    location: str = Field(default="", max_length=160)


class CameraCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    camera_code: str = Field(min_length=2, max_length=40)
    zone_id: str


class InspectionCreate(BaseModel):
    site_id: str
    name: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=500)
    camera_id: str | None = None


class ReviewUpdate(BaseModel):
    status: str
    reviewer_note: str = ""


class ActionCreate(BaseModel):
    assigned_to: str = ""
    due_date: str = ""
    notes: str = ""


class ActionUpdate(BaseModel):
    status: str
    assigned_to: str | None = None
    due_date: str | None = None
    notes: str | None = None


def rows(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connect() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def one(query: str, params: tuple = ()) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


def ensure_exists(entity: dict | None, label: str) -> dict:
    if not entity:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return entity


def decorate_observation(item: dict[str, Any]) -> dict[str, Any]:
    if item.get("timestamp") is None and item.get("frame_id"):
        frame = one("SELECT timestamp, image_path FROM frames WHERE id = ?", (item["frame_id"],))
    else:
        frame = None
    if frame:
        item["timestamp"] = frame["timestamp"]
        item["evidence_url"] = f"/uploads/{frame['image_path']}"
    else:
        item["evidence_url"] = None
        item.setdefault("timestamp", None)
    return item


def get_inspection_bundle(inspection_id: str) -> dict[str, Any]:
    inspection = ensure_exists(one("SELECT i.*, s.name AS site_name, s.location AS site_location FROM inspections i JOIN sites s ON s.id = i.site_id WHERE i.id = ?", (inspection_id,)), "Inspection")
    frames = rows("SELECT * FROM frames WHERE inspection_id = ? ORDER BY timestamp", (inspection_id,))
    for frame in frames:
        frame["image_url"] = f"/uploads/{frame['image_path']}"
    observations = rows(
        "SELECT o.*, z.name AS zone_name, f.timestamp, f.image_path FROM observations o LEFT JOIN zones z ON z.id = o.zone_id LEFT JOIN frames f ON f.id = o.frame_id WHERE o.inspection_id = ? ORDER BY f.timestamp, o.created_at",
        (inspection_id,),
    )
    for item in observations:
        item["evidence_url"] = f"/uploads/{item['image_path']}" if item.get("image_path") else None
    return {"inspection": inspection, "frames": frames, "observations": observations}


@app.get("/api/health")
async def health() -> dict:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            tags = response.json().get("models", [])
        available = [m.get("name", "") for m in tags]
        model_found = any(name == OLLAMA_MODEL for name in available) if ":" in OLLAMA_MODEL else any(name.split(":")[0] == OLLAMA_MODEL for name in available)
        return {"api": "online", "ollama": "connected", "model": OLLAMA_MODEL, "model_available": model_found, "installed_models": available}
    except Exception as exc:
        return {"api": "online", "ollama": "disconnected", "model": OLLAMA_MODEL, "model_available": False, "message": str(exc)[:180]}


@app.get("/api/dashboard")
def dashboard() -> dict:
    sites = rows("SELECT * FROM sites ORDER BY name")
    inspections = rows("SELECT i.*, s.name AS site_name FROM inspections i JOIN sites s ON s.id = i.site_id ORDER BY i.created_at DESC LIMIT 6")
    observations = rows("SELECT o.*, z.name AS zone_name, i.name AS inspection_name, s.name AS site_name, f.timestamp, f.image_path FROM observations o JOIN inspections i ON i.id = o.inspection_id JOIN sites s ON s.id = i.site_id LEFT JOIN zones z ON z.id = o.zone_id LEFT JOIN frames f ON f.id = o.frame_id ORDER BY o.created_at DESC LIMIT 8")
    total_inspections = one("SELECT COUNT(*) AS n FROM inspections") ["n"]
    analyzed = one("SELECT COUNT(*) AS n FROM inspections WHERE status = 'completed' AND source = 'real' AND video_path != ''") ["n"]
    potential = one("SELECT COUNT(*) AS n FROM observations WHERE review_status IN ('needs_review','confirmed')") ["n"]
    pending = one("SELECT COUNT(*) AS n FROM observations WHERE review_status = 'needs_review'") ["n"]
    verified = one("SELECT COUNT(*) AS n FROM observations WHERE review_status = 'confirmed'") ["n"]
    resolved = one("SELECT COUNT(*) AS n FROM actions WHERE status = 'Resolved'") ["n"] + one("SELECT COUNT(*) AS n FROM observations WHERE review_status = 'resolved'") ["n"]
    category_rows = rows("SELECT category, COUNT(*) AS count FROM observations GROUP BY category ORDER BY count DESC")
    for item in observations:
        item["evidence_url"] = f"/uploads/{item['image_path']}" if item.get("image_path") else None
        item["source"] = item.get("source", "real")
    return {"stats": {"total_inspections": total_inspections, "videos_analyzed": analyzed, "potential_hazards": potential, "pending_reviews": pending, "verified_incidents": verified, "resolved_actions": resolved}, "sites": sites, "recent_inspections": inspections, "recent_alerts": observations, "categories": category_rows}


@app.get("/api/sites")
def list_sites() -> list[dict]:
    result = rows("SELECT s.*, (SELECT COUNT(*) FROM zones z WHERE z.site_id=s.id) AS zone_count, (SELECT COUNT(*) FROM cameras c WHERE c.site_id=s.id) AS camera_count FROM sites s ORDER BY s.created_at DESC")
    return result


@app.post("/api/sites")
def create_site(payload: SiteCreate) -> dict:
    site_id = new_id("site")
    with connect() as conn:
        conn.execute("INSERT INTO sites (id, name, location, status, created_at) VALUES (?, ?, ?, 'Active', ?)", (site_id, payload.name.strip(), payload.location.strip(), now_iso()))
        # A minimal editable blueprint for a newly-created site.
        default_zones = [
            ("Work Area A", "work", 5, 8, 40, 32), ("Storage Zone", "storage", 55, 8, 40, 32),
            ("Electrical Zone", "electrical", 5, 52, 40, 30), ("Emergency Exit", "exit", 55, 52, 40, 30),
        ]
        for name, kind, x, y, w, h in default_zones:
            conn.execute("INSERT INTO zones VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (new_id("zone"), site_id, name, kind, x, y, w, h))
    return ensure_exists(one("SELECT * FROM sites WHERE id = ?", (site_id,)), "Site")


@app.post("/api/sites/{site_id}/cameras")
def create_camera(site_id: str, payload: CameraCreate) -> dict:
    ensure_exists(one("SELECT id FROM sites WHERE id=?", (site_id,)), "Site")
    ensure_exists(one("SELECT id FROM zones WHERE id=? AND site_id=?", (payload.zone_id, site_id)), "Zone")
    camera_id = new_id("cam")
    with connect() as conn:
        conn.execute("INSERT INTO cameras VALUES (?, ?, ?, ?, ?)", (camera_id, site_id, payload.zone_id, payload.name.strip(), payload.camera_code.strip()))
    return ensure_exists(one("SELECT * FROM cameras WHERE id=?", (camera_id,)), "Camera")


@app.get("/api/sites/{site_id}/map")
def site_map(site_id: str) -> dict:
    site = ensure_exists(one("SELECT * FROM sites WHERE id = ?", (site_id,)), "Site")
    zones = rows("SELECT * FROM zones WHERE site_id = ? ORDER BY name", (site_id,))
    cameras = rows("SELECT * FROM cameras WHERE site_id = ? ORDER BY camera_code", (site_id,))
    observations = rows("SELECT o.*, z.name AS zone_name, f.timestamp, f.image_path FROM observations o LEFT JOIN zones z ON z.id=o.zone_id LEFT JOIN frames f ON f.id=o.frame_id JOIN inspections i ON i.id=o.inspection_id WHERE i.site_id=? ORDER BY o.created_at DESC", (site_id,))
    for item in observations:
        item["evidence_url"] = f"/uploads/{item['image_path']}" if item.get("image_path") else None
    return {"site": site, "zones": zones, "cameras": cameras, "observations": observations}


@app.post("/api/inspections")
def create_inspection(payload: InspectionCreate) -> dict:
    ensure_exists(one("SELECT id FROM sites WHERE id = ?", (payload.site_id,)), "Site")
    if payload.camera_id:
        ensure_exists(one("SELECT id FROM cameras WHERE id=? AND site_id=?", (payload.camera_id, payload.site_id)), "Camera")
    inspection_id = new_id("insp")
    with connect() as conn:
        conn.execute("INSERT INTO inspections (id, site_id, camera_id, name, description, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'created', 'real', ?, ?)", (inspection_id, payload.site_id, payload.camera_id or "", payload.name.strip(), payload.description.strip(), now_iso(), now_iso()))
    return ensure_exists(one("SELECT * FROM inspections WHERE id = ?", (inspection_id,)), "Inspection")


@app.post("/api/inspections/{inspection_id}/video")
async def upload_video(inspection_id: str, file: UploadFile = File(...)) -> dict:
    inspection = ensure_exists(one("SELECT * FROM inspections WHERE id = ?", (inspection_id,)), "Inspection")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}:
        raise HTTPException(status_code=400, detail="Please upload an MP4, MOV, M4V, AVI, MKV or WebM video.")
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(file.filename or "video.mp4").name)[:100]
    rel_path = f"videos/{inspection_id}_{safe_name}"
    target = STORAGE / rel_path
    size = 0
    with target.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_VIDEO_MB * 1024 * 1024:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Video exceeds the {MAX_VIDEO_MB} MB limit.")
            out.write(chunk)
    with connect() as conn:
        conn.execute("UPDATE inspections SET video_path=?, video_filename=?, status='uploaded', error_message='', updated_at=? WHERE id=?", (rel_path, safe_name, now_iso(), inspection_id))
    return {"inspection_id": inspection_id, "filename": safe_name, "size_bytes": size, "status": "uploaded", "video_url": f"/uploads/{rel_path}"}


async def run_analysis(inspection_id: str) -> None:
    inspection = one("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
    if not inspection or not inspection.get("video_path"):
        return
    try:
        with connect() as conn:
            conn.execute("UPDATE inspections SET status='analyzing', error_message='', updated_at=? WHERE id=?", (now_iso(), inspection_id))
            conn.execute("DELETE FROM observations WHERE inspection_id=?", (inspection_id,))
            conn.execute("DELETE FROM frames WHERE inspection_id=?", (inspection_id,))
        frame_dir = STORAGE / "frames" / inspection_id
        shutil.rmtree(frame_dir, ignore_errors=True)
        frame_dir.mkdir(parents=True, exist_ok=True)
        extracted, metadata = extract_frames(STORAGE / inspection["video_path"], frame_dir, max_frames=MAX_FRAMES)
        # Assign frame observations to the site's first configured zone for map display.
        default_zone = one("SELECT zone_id AS id FROM cameras WHERE id=? AND site_id=?", (inspection.get("camera_id") or "", inspection["site_id"])) if inspection.get("camera_id") else None
        for frame in extracted:
            frame_id = new_id("frame")
            rel = str(Path("frames") / inspection_id / Path(frame["path"]).name)
            with connect() as conn:
                conn.execute("INSERT INTO frames VALUES (?, ?, ?, ?)", (frame_id, inspection_id, frame["timestamp"], rel))
            result = await analyze_image(frame["path"])
            sop_ref = best_rule(inspection["site_id"], result["category"], result["observation"])
            # Do not create noise for an explicit no-concern frame; it remains in the extracted frame list.
            if result["category"] == "No clear concern":
                continue
            with connect() as conn:
                conn.execute(
                    """INSERT INTO observations (id, inspection_id, frame_id, zone_id, category, observation, evidence_description, uncertainty, priority, confidence, recommended_action, review_status, sop_reference, source, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', ?, 'real', ?)""",
                    (new_id("obs"), inspection_id, frame_id, default_zone["id"] if default_zone else None, result["category"], result["observation"], result["evidence_description"], result["uncertainty"], result["suggested_priority"], None, result["recommended_action"], sop_ref, now_iso()),
                )
        with connect() as conn:
            conn.execute("UPDATE inspections SET status='completed', error_message=?, updated_at=? WHERE id=?", (f"Analyzed {len(extracted)} frame(s); video duration {metadata['duration_seconds']} sec.", now_iso(), inspection_id))
    except Exception as exc:
        with connect() as conn:
            conn.execute("UPDATE inspections SET status='failed', error_message=?, updated_at=? WHERE id=?", (str(exc)[:500], now_iso(), inspection_id))


@app.post("/api/inspections/{inspection_id}/analyze")
async def start_analysis(inspection_id: str, background_tasks: BackgroundTasks) -> dict:
    inspection = ensure_exists(one("SELECT * FROM inspections WHERE id = ?", (inspection_id,)), "Inspection")
    if not inspection.get("video_path"):
        raise HTTPException(status_code=400, detail="Upload a video before starting analysis.")
    # Check model connectivity before queuing work so users receive an actionable error.
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            r.raise_for_status()
            models = [x.get("name", "") for x in r.json().get("models", [])]
        model_found = any(x == OLLAMA_MODEL for x in models) if ":" in OLLAMA_MODEL else any(x.split(":")[0] == OLLAMA_MODEL for x in models)
        if not model_found:
            raise HTTPException(status_code=503, detail=f"Ollama is connected, but model '{OLLAMA_MODEL}' is not installed. Run: ollama pull {OLLAMA_MODEL}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Ollama is not reachable. Start Ollama and check OLLAMA_BASE_URL.")
    background_tasks.add_task(run_analysis, inspection_id)
    with connect() as conn:
        conn.execute("UPDATE inspections SET status='queued', updated_at=? WHERE id=?", (now_iso(), inspection_id))
    return {"inspection_id": inspection_id, "status": "queued", "message": "Analysis started. Keep this app open and view progress on the inspection page."}


@app.get("/api/inspections")
def list_inspections() -> list[dict]:
    return rows("SELECT i.*, s.name AS site_name, (SELECT COUNT(*) FROM observations o WHERE o.inspection_id=i.id) AS observation_count FROM inspections i JOIN sites s ON s.id=i.site_id ORDER BY i.created_at DESC")


@app.get("/api/inspections/{inspection_id}")
def get_inspection(inspection_id: str) -> dict:
    return get_inspection_bundle(inspection_id)


@app.get("/api/observations")
def list_observations(site_id: str | None = None, status: str | None = None) -> list[dict]:
    query = "SELECT o.*, z.name AS zone_name, i.name AS inspection_name, s.name AS site_name, f.timestamp, f.image_path FROM observations o JOIN inspections i ON i.id=o.inspection_id JOIN sites s ON s.id=i.site_id LEFT JOIN zones z ON z.id=o.zone_id LEFT JOIN frames f ON f.id=o.frame_id WHERE 1=1"
    params: list[Any] = []
    if site_id:
        query += " AND i.site_id=?"; params.append(site_id)
    if status:
        query += " AND o.review_status=?"; params.append(status)
    query += " ORDER BY o.created_at DESC"
    result = rows(query, tuple(params))
    for item in result:
        item["evidence_url"] = f"/uploads/{item['image_path']}" if item.get("image_path") else None
    return result


@app.patch("/api/observations/{observation_id}/review")
def review_observation(observation_id: str, payload: ReviewUpdate) -> dict:
    allowed = {"confirmed", "dismissed", "needs_review", "resolved"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(allowed))}")
    ensure_exists(one("SELECT id FROM observations WHERE id=?", (observation_id,)), "Observation")
    with connect() as conn:
        conn.execute("UPDATE observations SET review_status=? WHERE id=?", (payload.status, observation_id))
    return ensure_exists(one("SELECT * FROM observations WHERE id=?", (observation_id,)), "Observation")


@app.get("/api/actions")
def list_actions() -> list[dict]:
    return rows("SELECT a.*, o.category, o.observation, o.review_status, z.name AS zone_name, i.name AS inspection_name, s.name AS site_name FROM actions a JOIN observations o ON o.id=a.observation_id JOIN inspections i ON i.id=o.inspection_id JOIN sites s ON s.id=i.site_id LEFT JOIN zones z ON z.id=o.zone_id ORDER BY a.created_at DESC")


@app.post("/api/observations/{observation_id}/actions")
def create_action(observation_id: str, payload: ActionCreate) -> dict:
    ensure_exists(one("SELECT id FROM observations WHERE id=?", (observation_id,)), "Observation")
    action_id = new_id("action")
    with connect() as conn:
        conn.execute("INSERT INTO actions VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?)", (action_id, observation_id, payload.assigned_to.strip(), payload.due_date, payload.notes.strip(), now_iso(), now_iso()))
    return ensure_exists(one("SELECT * FROM actions WHERE id=?", (action_id,)), "Action")


@app.patch("/api/actions/{action_id}")
def update_action(action_id: str, payload: ActionUpdate) -> dict:
    allowed = {"Pending", "In Progress", "Resolved"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid action status")
    existing = ensure_exists(one("SELECT * FROM actions WHERE id=?", (action_id,)), "Action")
    with connect() as conn:
        conn.execute("UPDATE actions SET status=?, assigned_to=?, due_date=?, notes=?, updated_at=? WHERE id=?", (payload.status, payload.assigned_to if payload.assigned_to is not None else existing["assigned_to"], payload.due_date if payload.due_date is not None else existing["due_date"], payload.notes if payload.notes is not None else existing["notes"], now_iso(), action_id))
    return ensure_exists(one("SELECT * FROM actions WHERE id=?", (action_id,)), "Action")


@app.get("/api/sops")
def list_sops() -> list[dict]:
    return rows("SELECT * FROM sops ORDER BY uploaded_at DESC")


@app.post("/api/sops")
async def upload_sop(file: UploadFile = File(...), site_id: str | None = Form(default=None)) -> dict:
    if Path(file.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF safety manual.")
    if site_id:
        ensure_exists(one("SELECT id FROM sites WHERE id=?", (site_id,)), "Site")
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(file.filename or "manual.pdf").name)[:100]
    sop_id = new_id("sop")
    rel_path = f"sops/{sop_id}_{filename}"
    target = STORAGE / rel_path
    target.write_bytes(await file.read())
    try:
        result = add_sop(site_id, filename, str(target))
        # add_sop creates a separate ID; retain file path for serving and use returned ID.
        with connect() as conn:
            conn.execute("UPDATE sops SET file_path=? WHERE id=?", (rel_path, result["id"]))
        return result
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read this PDF. It may be scanned or password-protected. Details: {str(exc)[:180]}")


@app.post("/api/inspections/{inspection_id}/report")
def generate_report(inspection_id: str) -> dict:
    bundle = get_inspection_bundle(inspection_id)
    site = ensure_exists(one("SELECT * FROM sites WHERE id=?", (bundle["inspection"]["site_id"],)), "Site")
    report_id = new_id("report")
    filename = f"{report_id}.pdf"
    rel_path = f"reports/{filename}"
    observations = bundle["observations"]
    for item in observations:
        if item.get("timestamp") is not None:
            item["timestamp"] = f"{item['timestamp']:.1f}"
    try:
        build_inspection_pdf(STORAGE / rel_path, bundle["inspection"], site, observations, STORAGE)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate PDF: {str(exc)[:180]}")
    with connect() as conn:
        conn.execute("INSERT INTO reports VALUES (?, ?, ?, ?)", (report_id, inspection_id, rel_path, now_iso()))
    return {"id": report_id, "inspection_id": inspection_id, "filename": filename, "download_url": f"/uploads/{rel_path}", "created_at": now_iso()}


@app.get("/api/reports")
def list_reports() -> list[dict]:
    items = rows("SELECT r.*, i.name AS inspection_name, s.name AS site_name FROM reports r JOIN inspections i ON i.id=r.inspection_id JOIN sites s ON s.id=i.site_id ORDER BY r.created_at DESC")
    for item in items:
        item["download_url"] = f"/uploads/{item['file_path']}"
    return items


@app.get("/api/config")
def config() -> dict:
    return {"max_video_mb": MAX_VIDEO_MB, "max_frames_per_video": MAX_FRAMES, "ollama_model": OLLAMA_MODEL, "ollama_base_url": OLLAMA_URL, "frontend_mode": "HTML + CSS + Vanilla JavaScript"}


# Serve generated uploads and reports; never expose environment files or the SQLite database.
app.mount("/uploads", StaticFiles(directory=str(STORAGE)), name="uploads")
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
