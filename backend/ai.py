from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e2b")

SYSTEM_PROMPT = """You are a cautious construction-site visual inspection assistant. Analyze only what is visibly supported by the image. You are NOT a certified safety inspector. Do not claim that an incident or violation is confirmed. If an object is small, occluded, blurry, or uncertain, say so. Do not identify people. Do not infer identity, intent, or emotion. Provide practical review suggestions, not legal conclusions. Return one valid JSON object only."""

USER_PROMPT = """Review this construction-site video frame for visible potential safety concerns. Focus on PPE visibility, electrical hazards, blocked access/egress, housekeeping, fall protection, and unsafe site conditions. If no concern is visible, return category 'No clear concern' and explain that this single frame cannot establish overall site safety. Do not infer from missing context.

Return JSON with exactly these fields:
{
  "category": "PPE | Electrical | Fire Safety | Housekeeping | Fall Protection | Access/Egress | Other | No clear concern",
  "observation": "one concise factual observation",
  "evidence_description": "what is visible in the frame",
  "uncertainty": "what cannot be confirmed from this frame",
  "suggested_priority": "low | medium | high | needs_review",
  "recommended_action": "a cautious action for a qualified site supervisor",
  "requires_human_review": true
}
Always set requires_human_review to true. Use needs_review when visibility or context is insufficient. Never invent a timestamp; the application attaches it."""


def parse_json_content(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if match:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("Gemma returned a response that was not valid JSON. Try analyzing fewer or clearer frames.")


async def analyze_image(image_path: str | Path) -> dict[str, Any]:
    image_b64 = base64.b64encode(Path(image_path).read_bytes()).decode("ascii")
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT, "images": [image_b64]},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1, "num_ctx": 8192},
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=8.0)) as client:
        response = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        response.raise_for_status()
        body = response.json()
    content = body.get("message", {}).get("content", "")
    result = parse_json_content(content)
    allowed_categories = {"PPE", "Electrical", "Fire Safety", "Housekeeping", "Fall Protection", "Access/Egress", "Other", "No clear concern"}
    allowed_priorities = {"low", "medium", "high", "needs_review"}
    category = str(result.get("category", "Other"))
    priority = str(result.get("suggested_priority", "needs_review")).lower()
    return {
        "category": category if category in allowed_categories else "Other",
        "observation": str(result.get("observation", "Visual observation requires human review"))[:500],
        "evidence_description": str(result.get("evidence_description", ""))[:700],
        "uncertainty": str(result.get("uncertainty", "This frame may not show full context."))[:500],
        "suggested_priority": priority if priority in allowed_priorities else "needs_review",
        "recommended_action": str(result.get("recommended_action", "Ask a qualified site supervisor to review this frame."))[:700],
        "requires_human_review": True,
    }
