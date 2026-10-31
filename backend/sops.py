from __future__ import annotations

import re
from pathlib import Path

import fitz

from .db import connect, new_id, now_iso


def extract_pdf_pages(pdf_path: str | Path) -> list[tuple[int, str]]:
    doc = fitz.open(str(pdf_path))
    pages = []
    for page_index, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        if text:
            pages.append((page_index, text[:12000]))
    doc.close()
    return pages


def add_sop(site_id: str | None, filename: str, file_path: str) -> dict:
    pages = extract_pdf_pages(file_path)
    sop_id = new_id("sop")
    with connect() as conn:
        conn.execute(
            "INSERT INTO sops (id, site_id, filename, file_path, page_count, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)",
            (sop_id, site_id, filename, file_path, len(pages), now_iso()),
        )
        for page_number, text in pages:
            # Store a page as a retrievable rule chunk; preserving page numbers supports citation.
            conn.execute(
                "INSERT INTO sop_rules (id, sop_id, page_number, section_title, content) VALUES (?, ?, ?, ?, ?)",
                (new_id("rule"), sop_id, page_number, f"Page {page_number}", text),
            )
    return {"id": sop_id, "filename": filename, "page_count": len(pages), "uploaded_at": now_iso(), "text_pages_found": len(pages)}


def best_rule(site_id: str, category: str, observation: str) -> str:
    query_words = set(re.findall(r"[a-z]{3,}", f"{category} {observation}".lower()))
    if not query_words:
        return ""
    with connect() as conn:
        rows = conn.execute(
            "SELECT sr.page_number, sr.content, s.filename FROM sop_rules sr JOIN sops s ON s.id = sr.sop_id WHERE s.site_id IS NULL OR s.site_id = ?",
            (site_id,),
        ).fetchall()
    best: tuple[int, str] | None = None
    for row in rows:
        page_words = set(re.findall(r"[a-z]{3,}", row["content"].lower()))
        score = len(query_words & page_words)
        if best is None or score > best[0]:
            snippet = " ".join(row["content"].split())[:260]
            best = (score, f"{row['filename']} · Page {row['page_number']}: {snippet}")
    return best[1] if best and best[0] >= 2 else ""
