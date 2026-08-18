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
BLUE = "#58b8e8"


def font(size: int, bold: bool = False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def rounded(draw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw, text: str, max_width: int, chosen_font):
    lines = []
    current = ""
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
    pos = (x1 + (x2 - x1 - fitted.width) // 2, y1 + (y2 - y1 - fitted.height) // 2)
    return fitted, pos


def base_card(kicker: str, title: str, subtitle: str):
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#303945", 2)
    draw.rectangle((48, 48, 1032, 70), fill=GOLD)
    draw.text((86, 112), kicker, font=font(28, True), fill=GOLD)
    y = 178
    for line in wrap(draw, title, 900, font(53, True)):
        draw.text((86, y), line, font=font(53, True), fill=INK)
        y += 66
    draw.text((86, y + 12), subtitle, font=font(27), fill=MUTED)
    return canvas, draw, y + 80


def title_card():
    canvas, draw, y = base_card(
        "GLDN OPS LIVE PROOF",
        "E-09 Reverse Category Cleanup",
        "Signed-in Chrome Profile 2 | Computer 0 | FAK12",
    )
    rounded(draw, (86, y + 80, 994, y + 430), "#202630", 22)
    draw.text((120, y + 122), "Abra Cadabra .99", font=font(40, True), fill=BLUE)
    draw.text((120, y + 206), "to", font=font(30), fill=MUTED)
    draw.text((120, y + 270), "Not .99", font=font(40, True), fill=GREEN)
    results = [
        "Initial scan: 5,596 listings, 63 candidates",
        "Approved submissions: 4 + 43 + 15 = 62",
        "Final rescan: 5,533 listings, 0 mismatches",
    ]
    y2 = 1000
    for result in results:
        rounded(draw, (86, y2, 994, y2 + 128), "#202630", 18)
        draw.ellipse((118, y2 + 47, 148, y2 + 77), fill=GREEN)
        draw.text((176, y2 + 38), result, font=font(27, True), fill=INK)
        y2 += 154
    draw.text((86, 1782), "No unapproved marketplace action was performed.", font=font(25), fill=MUTED)
    return canvas


def evidence_slide(kicker: str, title: str, subtitle: str, image_path: Path, result: str):
    canvas, draw, image_top = base_card(kicker, title, subtitle)
    image_box = (82, max(410, image_top), 998, 1435)
    rounded(draw, image_box, "#0e1218", 18, "#3c4654", 2)
    source = Image.open(image_path).convert("RGB")
    fitted, pos = contain(source, (100, image_box[1] + 20, 980, image_box[3] - 20))
    canvas.paste(fitted, pos)
    rounded(draw, (82, 1480, 998, 1745), "#132c24", 20, GREEN, 2)
    y = 1522
    for line in wrap(draw, result, 820, font(29, True)):
        draw.text((126, y), line, font=font(29, True), fill="#c8f7df")
        y += 42
    draw.text((82, 1800), image_path.name, font=font(22), fill=MUTED)
    return canvas


def approved_batches_card():
    canvas, draw, y = base_card(
        "APPROVAL-GATED WRITES",
        "Three explicitly approved submissions",
        "The extension did not submit a batch without action-time approval.",
    )
    batches = [("Batch 1", "4"), ("Batch 2", "43"), ("Batch 3", "15")]
    y = max(y + 70, 620)
    for label, count in batches:
        rounded(draw, (86, y, 994, y + 180), "#202630", 22)
        draw.text((126, y + 58), label, font=font(34, True), fill=MUTED)
        draw.text((820, y + 44), count, font=font(58, True), fill=GREEN)
        y += 218
    rounded(draw, (86, y + 20, 994, y + 210), "#132c24", 22, GREEN, 2)
    draw.text((126, y + 66), "Total explicitly submitted: 62", font=font(38, True), fill="#c8f7df")
    note = "The initial scan found 63 candidates. The proof claims only the 62 listings confirmed in the approved batch history."
    y2 = y + 300
    for line in wrap(draw, note, 860, font(27)):
        draw.text((100, y2), line, font=font(27), fill=MUTED)
        y2 += 39
    return canvas


def final_card():
    canvas, draw, y = base_card(
        "E-09 RESULT",
        "Reverse cleanup: LIVE PASS",
        "Exact source-category rescan after the approved submissions",
    )
    rounded(draw, (86, y + 90, 994, y + 420), "#132c24", 24, GREEN, 3)
    draw.text((126, y + 132), "5,533", font=font(86, True), fill=INK)
    draw.text((126, y + 238), "source listings inspected", font=font(31), fill=MUTED)
    rounded(draw, (86, y + 470, 994, y + 800), "#132c24", 24, GREEN, 3)
    draw.text((126, y + 512), "0", font=font(86, True), fill=GREEN)
    draw.text((126, y + 618), "non-.99 mismatches remaining", font=font(31), fill=MUTED)
    draw.text((86, 1778), "No other listing field was changed.", font=font(28, True), fill=INK)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame, dtype=np.uint8)
    for _ in range(round(seconds * fps)):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int):
    slides = [
        (title_card(), 5.0),
        (
            evidence_slide(
                "INITIAL LIVE SCAN",
                "Complete filtered inventory scan",
                "Before any reverse-category changes",
                evidence_dir / "01-initial-scan-5596-63.png",
                "Verified 5,596 unique listings and 63 non-.99 candidates.",
            ),
            7.0,
        ),
        (
            evidence_slide(
                "INITIAL AUDIT",
                "Candidate set validation",
                "The audit contained no .99 prices, duplicate IDs, or route errors.",
                evidence_dir / "02-initial-audit-63-unique.png",
                "63 unique candidates; 0 invalid prices; 0 wrong-category routes.",
            ),
            6.0,
        ),
        (approved_batches_card(), 6.0),
        (
            evidence_slide(
                "FINAL READ-ONLY RESCAN",
                "No non-.99 listings remained",
                "Exact source category: Abra Cadabra .99",
                evidence_dir / "03-final-rescan-5533-zero.png",
                "5,533 listings inspected; 0 remaining non-.99 mismatches.",
            ),
            8.0,
        ),
        (final_card(), 5.0),
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
