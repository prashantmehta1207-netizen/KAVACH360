from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import cv2


def extract_frames(video_path: str | Path, output_dir: str | Path, max_frames: int = 6, interval_seconds: float = 2.0) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract a bounded set of timestamped JPEG frames from an uploaded video."""
    video_path = str(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not read this video. Please upload a valid MP4 or MOV file.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps > 0 else 0.0
    if duration <= 0:
        cap.release()
        raise ValueError("The uploaded video has no readable duration.")

    # Increase sampling interval for longer videos to keep the hackathon MVP responsive.
    step = max(float(interval_seconds), duration / max(1, max_frames - 1))
    timestamps = []
    t = 0.0
    while t < duration and len(timestamps) < max_frames:
        timestamps.append(t)
        t += step
    if not timestamps:
        timestamps = [0.0]

    extracted: list[dict[str, Any]] = []
    for index, timestamp in enumerate(timestamps):
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        # Resize large frames before sending them to a local vision model.
        height, width = frame.shape[:2]
        max_width = 1280
        if width > max_width:
            scale = max_width / width
            frame = cv2.resize(frame, (max_width, int(height * scale)), interpolation=cv2.INTER_AREA)
        filename = f"frame_{index + 1:02d}_{timestamp:.1f}s.jpg"
        target = output_dir / filename
        cv2.imwrite(str(target), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        extracted.append({"timestamp": round(timestamp, 2), "path": str(target), "filename": filename})
    cap.release()
    if not extracted:
        raise ValueError("No frames could be extracted from the video.")
    return extracted, {"duration_seconds": round(duration, 2), "fps": round(fps, 2), "total_frames": frame_count}
