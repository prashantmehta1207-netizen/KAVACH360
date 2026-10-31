from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / ".data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv("DATABASE_PATH", str(DATA_DIR / "kavach360.db")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class ClosingConnection(sqlite3.Connection):
    """SQLite connection that closes itself when used in a with block."""
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, factory=ClosingConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS zones (
                id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
                name TEXT NOT NULL, zone_type TEXT DEFAULT 'work', x REAL NOT NULL,
                y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cameras (
                id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
                zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL, name TEXT NOT NULL,
                camera_code TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS inspections (
                id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id), camera_id TEXT DEFAULT '',
                name TEXT NOT NULL, description TEXT DEFAULT '', video_path TEXT DEFAULT '',
                video_filename TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'created',
                error_message TEXT DEFAULT '', source TEXT NOT NULL DEFAULT 'real',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS frames (
                id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
                timestamp REAL NOT NULL, image_path TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sops (
                id TEXT PRIMARY KEY, site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
                filename TEXT NOT NULL, file_path TEXT NOT NULL, page_count INTEGER DEFAULT 0,
                uploaded_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sop_rules (
                id TEXT PRIMARY KEY, sop_id TEXT NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
                page_number INTEGER NOT NULL, section_title TEXT DEFAULT '', content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
                frame_id TEXT REFERENCES frames(id) ON DELETE SET NULL,
                zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
                category TEXT NOT NULL, observation TEXT NOT NULL, evidence_description TEXT DEFAULT '',
                uncertainty TEXT DEFAULT '', priority TEXT DEFAULT 'needs_review', confidence REAL,
                recommended_action TEXT DEFAULT '', review_status TEXT NOT NULL DEFAULT 'needs_review',
                sop_reference TEXT DEFAULT '', source TEXT NOT NULL DEFAULT 'real', created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS actions (
                id TEXT PRIMARY KEY, observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
                assigned_to TEXT DEFAULT '', due_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending',
                notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL, created_at TEXT NOT NULL
            );
            """
        )
        # Lightweight schema migration for databases created by an earlier MVP build.
        inspection_columns = {row[1] for row in conn.execute("PRAGMA table_info(inspections)").fetchall()}
        if "camera_id" not in inspection_columns:
            conn.execute("ALTER TABLE inspections ADD COLUMN camera_id TEXT DEFAULT ''")
        count = conn.execute("SELECT COUNT(*) FROM sites").fetchone()[0]
        if count == 0:
            seed_demo_data(conn)


def seed_demo_data(conn: sqlite3.Connection) -> None:
    """Insert clearly-labelled sample records so the dashboard is useful on first launch."""
    now = datetime.now().astimezone()
    site1, site2 = "site_tower_a", "site_warehouse"
    conn.execute("INSERT INTO sites VALUES (?, ?, ?, ?, ?)", (site1, "Tower Block A", "Ahmedabad, Gujarat", "Active", now.isoformat(timespec="seconds")))
    conn.execute("INSERT INTO sites VALUES (?, ?, ?, ?, ?)", (site2, "Warehouse Site", "Ahmedabad, Gujarat", "Active", now.isoformat(timespec="seconds")))
    zones = [
        ("zone_storage", site1, "Storage Zone", "storage", 5, 6, 29, 32),
        ("zone_electrical", site1, "Electrical Zone", "electrical", 66, 6, 29, 32),
        ("zone_work_a", site1, "Work Area A", "work", 5, 48, 29, 30),
        ("zone_work_b", site1, "Work Area B", "work", 66, 48, 29, 30),
        ("zone_gate", site1, "Main Gate", "gate", 37, 84, 24, 10),
        ("zone_exit", site1, "Emergency Exit", "exit", 74, 84, 21, 10),
        ("zone_wh_storage", site2, "Warehouse Storage", "storage", 5, 6, 42, 37),
        ("zone_wh_work", site2, "Loading Bay", "work", 53, 6, 42, 37),
    ]
    conn.executemany("INSERT INTO zones VALUES (?, ?, ?, ?, ?, ?, ?, ?)", zones)
    conn.executemany(
        "INSERT INTO cameras VALUES (?, ?, ?, ?, ?)",
        [
            ("cam_01", site1, "zone_work_a", "Main Work Area Camera", "CAM-01"),
            ("cam_02", site1, "zone_electrical", "Electrical Zone Camera", "CAM-02"),
            ("cam_03", site1, "zone_storage", "Storage Camera", "CAM-03"),
            ("cam_04", site1, "zone_exit", "Emergency Exit Camera", "CAM-04"),
        ],
    )
    demo_inspections = [
        ("insp_demo_01", site1, "Tower Block A – Daily Check", "Morning inspection sample", "", "", "completed", "", "demo", (now - timedelta(hours=2)).isoformat(timespec="seconds")),
        ("insp_demo_02", site1, "Electrical Zone Review", "Sample electrical walkthrough", "", "", "completed", "", "demo", (now - timedelta(days=1)).isoformat(timespec="seconds")),
        ("insp_demo_03", site2, "Warehouse Walkthrough", "Sample warehouse review", "", "", "completed", "", "demo", (now - timedelta(days=2)).isoformat(timespec="seconds")),
    ]
    for item in demo_inspections:
        iid, sid, name, desc, vp, vf, status, err, source, created = item
        conn.execute("INSERT INTO inspections (id, site_id, camera_id, name, description, video_path, video_filename, status, error_message, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (iid, sid, "", name, desc, vp, vf, status, err, source, created, created))
    demo_obs = [
        ("obs_demo_01", "insp_demo_01", None, "zone_work_a", "PPE", "Helmet is not clearly visible in the sample frame", "Sample dashboard record; no real evidence image is attached.", "Helmet visibility is uncertain from this view.", "needs_review", None, "Ask the site supervisor to verify PPE compliance.", "needs_review", "", "demo", (now - timedelta(hours=2)).isoformat(timespec="seconds")),
        ("obs_demo_02", "insp_demo_01", None, "zone_electrical", "Electrical", "Possible exposed wiring requires inspection", "Sample dashboard record; no real evidence image is attached.", "Cable condition cannot be confirmed from the sample record.", "high", None, "Have a qualified electrician inspect and isolate the area if required.", "needs_review", "", "demo", (now - timedelta(hours=2)).isoformat(timespec="seconds")),
        ("obs_demo_03", "insp_demo_02", None, "zone_exit", "Housekeeping", "Possible obstruction near emergency exit", "Sample dashboard record; no real evidence image is attached.", "Clearance should be checked on site.", "medium", None, "Ask the safety officer to verify exit clearance.", "confirmed", "", "demo", (now - timedelta(days=1)).isoformat(timespec="seconds")),
        ("obs_demo_04", "insp_demo_03", None, "zone_storage", "Housekeeping", "Storage arrangement needs a housekeeping review", "Sample dashboard record; no real evidence image is attached.", "No confirmed violation can be inferred from this sample.", "low", None, "Review storage arrangement against the site checklist.", "resolved", "", "demo", (now - timedelta(days=2)).isoformat(timespec="seconds")),
    ]
    conn.executemany("INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", demo_obs)
    conn.execute(
        "INSERT INTO actions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("action_demo_01", "obs_demo_03", "Site Supervisor", (now + timedelta(days=1)).date().isoformat(), "In Progress", "Sample action for demo only.", now.isoformat(timespec="seconds"), now.isoformat(timespec="seconds")),
    )
