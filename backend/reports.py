from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether


def build_inspection_pdf(output_path: str | Path, inspection: dict, site: dict, observations: list[dict], storage_root: Path) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(output_path), pagesize=A4, rightMargin=16*mm, leftMargin=16*mm, topMargin=16*mm, bottomMargin=16*mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="KTitle", parent=styles["Title"], textColor=colors.HexColor("#10253c"), alignment=TA_LEFT, fontSize=20, leading=24, spaceAfter=5))
    styles.add(ParagraphStyle(name="MutedSmall", parent=styles["BodyText"], textColor=colors.HexColor("#64748b"), fontSize=8, leading=11))
    styles.add(ParagraphStyle(name="SectionBlue", parent=styles["Heading2"], textColor=colors.HexColor("#1457a6"), fontSize=12, leading=15, spaceBefore=10, spaceAfter=6))
    styles.add(ParagraphStyle(name="SmallBody", parent=styles["BodyText"], fontSize=8.5, leading=12, spaceAfter=3))
    story = [Paragraph("KAVACH360 AI", styles["KTitle"]), Paragraph("Construction Safety Inspection Report", styles["Heading2"]), Spacer(1, 2*mm)]
    if inspection.get("source") == "demo":
        story.append(Paragraph("SAMPLE / DEMO REPORT — NOT REAL INSPECTION DATA", ParagraphStyle(name="DemoAlert", parent=styles["BodyText"], textColor=colors.HexColor("#b45309"), fontSize=9, leading=12, spaceAfter=5)))
    story.append(Spacer(1, 3*mm))
    meta = [
        ["Site", escape(site.get("name", "—")), "Inspection", escape(inspection.get("name", "—"))],
        ["Location", escape(site.get("location", "—")), "Date", escape(inspection.get("created_at", "—")[:19].replace("T", " "))],
        ["Video", escape(inspection.get("video_filename", "Not attached")), "Status", escape(inspection.get("status", "—"))],
    ]
    table = Table(meta, colWidths=[22*mm, 62*mm, 22*mm, 62*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#475569")),
        ("TEXTCOLOR", (2,0), (2,-1), colors.HexColor("#475569")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"), ("FONTSIZE", (0,0), (-1,-1), 8),
        ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#dbe3ec")),
        ("PADDING", (0,0), (-1,-1), 7), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story += [table, Paragraph("Executive Summary", styles["SectionBlue"])]
    total = len(observations)
    pending = sum(1 for x in observations if x.get("review_status") == "needs_review")
    confirmed = sum(1 for x in observations if x.get("review_status") == "confirmed")
    story.append(Paragraph(f"The inspection produced {total} visual observation(s). {pending} require human review and {confirmed} have been marked confirmed by a reviewer. AI-generated observations are preliminary and are not a substitute for an on-site safety inspection.", styles["SmallBody"]))
    story.append(Paragraph("Observations and Evidence", styles["SectionBlue"]))
    for index, item in enumerate(observations, start=1):
        block = [Paragraph(f"{index}. {escape(item.get('category', 'Observation'))} · {escape(item.get('review_status', 'needs_review').replace('_', ' ').title())}", styles["Heading3"])]
        block.append(Paragraph(f"<b>Observation:</b> {escape(item.get('observation', ''))}", styles["SmallBody"]))
        block.append(Paragraph(f"<b>Evidence:</b> {escape(item.get('evidence_description', ''))}", styles["SmallBody"]))
        block.append(Paragraph(f"<b>Timestamp:</b> {item.get('timestamp', '—')} sec &nbsp;&nbsp; <b>Zone:</b> {escape(item.get('zone_name') or 'Not mapped')}", styles["SmallBody"]))
        block.append(Paragraph(f"<b>Uncertainty:</b> {escape(item.get('uncertainty', ''))}", styles["SmallBody"]))
        block.append(Paragraph(f"<b>Recommended action:</b> {escape(item.get('recommended_action', ''))}", styles["SmallBody"]))
        if item.get("sop_reference"):
            block.append(Paragraph(f"<b>Safety manual reference:</b> {escape(item['sop_reference'])}", styles["SmallBody"]))
        image_rel = item.get("image_path")
        if image_rel:
            image_path = storage_root / image_rel
            if image_path.is_file():
                try:
                    block.append(Image(str(image_path), width=105*mm, height=59*mm, kind="proportional"))
                except Exception:
                    block.append(Paragraph("Evidence image could not be embedded.", styles["MutedSmall"]))
        story.append(KeepTogether(block))
        story.append(Spacer(1, 3*mm))
    if not observations:
        story.append(Paragraph("No observations are available for this inspection.", styles["SmallBody"]))
    story += [Spacer(1, 6*mm), Paragraph("Review note", styles["SectionBlue"]), Paragraph("This report supports a human-led review process. Visual analysis can be incomplete due to camera angle, occlusion, lighting, resolution, or missing context. A qualified site safety professional must verify observations before action is taken.", styles["MutedSmall"])]
    doc.build(story)
