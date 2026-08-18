from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090c10"
PANEL = "#151a21"
INK = "#f5f7fa"
MUTED = "#aab4c2"
GOLD = "#e4b94e"
GREEN = "#31c48d"
RED = "#ef6a6a"


def font(size: int, bold: bool = False):
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def rounded(draw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw, text: str, max_width: int, chosen_font):
    lines, current = [], ""
    for word in text.split():
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def contain(image: Image.Image, box):
    x1, y1, x2, y2 = box
    fitted = ImageOps.contain(image, (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    return fitted, (x1 + (x2 - x1 - fitted.width) // 2, y1 + (y2 - y1 - fitted.height) // 2)


def title_card():
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#303945", 2)
    draw.rectangle((48, 48, 1032, 70), fill=GOLD)
    draw.text((90, 130), "GLDN OPS LIVE PROOF", font=font(30, True), fill=GOLD)
    y = 250
    for line in wrap(draw, "Move .99 failure recovery", 880, font(68, True)):
        draw.text((90, y), line, font=font(68, True), fill=INK)
        y += 84
    draw.text((90, y + 35), "v3.7.45 | signed-in Chrome Profile 2", font=font(31), fill=MUTED)
    results = [
        "Unsafe generic filter stopped before Apply",
        "Final Submit (163) left untouched",
        "2,563 listings verified after interruption",
        "2,335 exact retry rows, 0 batches submitted",
    ]
    y = 800
    for result in results:
        rounded(draw, (90, y, 990, y + 120), "#202630", 18)
        draw.ellipse((125, y + 42, 155, y + 72), fill=GREEN)
        draw.text((185, y + 34), result, font=font(29, True), fill=INK)
        y += 145
    rounded(draw, (90, 1630, 990, 1740), "#2a1719", 18, RED, 2)
    draw.text((170, 1663), "NO SUBMIT, SAVE, OR LISTING WRITE", font=font(31, True), fill=RED)
    draw.text((90, 1810), "Captured 2026-07-16", font=font(25), fill=MUTED)
    return canvas


def evidence_slide(title: str, subtitle: str, image_path: Path, result: str, status: str, color: str):
    source = Image.open(image_path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)

    draw.text((52, 50), title, font=font(43, True), fill=INK)
    y = 112
    for line in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((52, y), line, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (45, 235, 1035, 1110), PANEL, 24, "#303945", 2)
    full, position = contain(source, (65, 255, 1015, 1090))
    canvas.paste(full, position)

    rounded(draw, (45, 1150, 1035, 1770), "#202630", 24, color, 3)
    rounded(draw, (75, 1190, 380, 1260), color, 18)
    draw.text((105, 1207), status, font=font(27, True), fill="#080c10")
    y = 1325
    for line in wrap(draw, result, 880, font(33, True))[:7]:
        draw.text((80, y), line, font=font(33, True), fill=INK)
        y += 45
    draw.text((52, 1830), "No eBay Submit, Revise, Save, or listing write occurred.", font=font(23), fill=MUTED)
    return canvas


def append_seconds(writer, frame, seconds: float, fps: int):
    data = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(data)


def build(evidence_dir: Path, output: Path, fps: int):
    slides = [
        (title_card(), 5.0),
        (evidence_slide(
            "Failure reproduced safely",
            "eBay returned a generic Store-category token and the old build scanned the whole account.",
            evidence_dir / "02-unsafe-generic-filter-blocked-before-apply.png",
            "8,096 scanned and 7,868 false candidates. Scan Only / Close was used; Apply remained untouched.",
            "FAILURE CAPTURED",
            RED,
        ), 6.0),
        (evidence_slide(
            "Exact numeric filter enforced",
            "v3.7.45 re-entered through the configured source IDs 44678633011 and 1.",
            evidence_dir / "03-v3745-exact-numeric-source-filter.png",
            "The generic token disappeared. The scanner stayed on the exact numeric Store-category URL.",
            "GUARD PASSED",
            GREEN,
        ), 5.5),
        (evidence_slide(
            "Exact inventory scan",
            "Every filtered Active Listings page was inspected before any draft edit.",
            evidence_dir / "04-v3745-exact-filter-scan-summary.png",
            "2,563 unique source listings scanned. 2,335 exact .99 candidates found.",
            "SCAN PASSED",
            GREEN,
        ), 5.5),
        (evidence_slide(
            "Stopped at final review",
            "The first real page batch reached eBay's final review with only Store category staged.",
            evidence_dir / "05-v3745-final-review-submit-untouched.png",
            "163 of 163 selected. Store category Abra Cadabra .99. Fees $0.00. Submit (163) visible and untouched.",
            "APPROVAL GATE",
            GOLD,
        ), 7.0),
        (evidence_slide(
            "Read-only recovery completed",
            "The unsaved review was exited. The extension rescanned instead of assuming success or repeating a write.",
            evidence_dir / "06-v3745-recovered-retry-failed-only.png",
            "2,563 verified. 2,335 still qualifying. Batches submitted 0. Retry Failed Only (2,335).",
            "LIVE PASS",
            GREEN,
        ), 7.0),
    ]

    output.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(
        output,
        fps=fps,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=2,
        ffmpeg_log_level="warning",
    ) as writer:
        for frame, seconds in slides:
            append_seconds(writer, frame, seconds, fps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=int, default=10)
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
