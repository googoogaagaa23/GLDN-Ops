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


def base(kicker: str, title: str, subtitle: str):
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (52, 52, 1028, 1868), PANEL, 36, "#2b3442", 2)
    draw.rectangle((52, 52, 1028, 72), fill=GOLD)
    draw.text((92, 122), kicker, font=font(28, True), fill=GOLD)
    y = 205
    for line in wrap(draw, title, 880, font(58, True)):
        draw.text((92, y), line, font=font(58, True), fill=INK)
        y += 72
    y += 18
    for line in wrap(draw, subtitle, 880, font(30)):
        draw.text((92, y), line, font=font(30), fill=MUTED)
        y += 42
    return canvas, draw, y


def title_card():
    canvas, draw, y = base(
        "GLDN OPS LIVE PROOF",
        "C-01 EcomSniper automation",
        "Signed-in Chrome Profile 2 | Computer 0 | FAK12 | v3.7.46",
    )
    y = max(y + 90, 760)
    for text, color in [
        ("Automatic semantic Extract Sellers click", BLUE),
        ("No Windows local click helper", GREEN),
        ("No debugger or management permission", GREEN),
        ("No marketplace action submitted", GREEN),
    ]:
        rounded(draw, (92, y, 988, y + 116), "#202734", 18)
        draw.ellipse((126, y + 39, 158, y + 71), fill=color)
        draw.text((184, y + 32), text, font=font(28, True), fill=INK)
        y += 140
    return canvas


def screenshot_slide(kicker: str, title: str, subtitle: str, path: Path, caption: str, crop=None):
    canvas, draw, y = base(kicker, title, subtitle)
    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(crop)
    box = (82, max(y + 55, 520), 998, 1540)
    fitted = ImageOps.contain(image, (box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS)
    x = box[0] + (box[2] - box[0] - fitted.width) // 2
    py = box[1] + (box[3] - box[1] - fitted.height) // 2
    rounded(draw, (box[0] - 10, box[1] - 10, box[2] + 10, box[3] + 10), "#080a0e", 24, "#3a4656", 2)
    canvas.paste(fitted, (x, py))
    caption_y = 1608
    for line in wrap(draw, caption, 880, font(29, True)):
        draw.text((92, caption_y), line, font=font(29, True), fill=INK)
        caption_y += 42
    return canvas


def count_card():
    canvas, draw, y = base(
        "LIVE COUNT CONFIRMATION",
        "EcomSniper changed its own count",
        "GLDN Ops waited for this mutation before the workflow advanced.",
    )
    y = max(y + 110, 740)
    rounded(draw, (92, y, 988, y + 260), "#202734", 24, BLUE, 3)
    draw.text((132, y + 46), "892 total", font=font(70, True), fill=INK)
    draw.text((132, y + 150), "before the automatic click", font=font(29), fill=MUTED)
    draw.text((485, y + 82), "->", font=font(72, True), fill=GOLD)
    y += 320
    rounded(draw, (92, y, 988, y + 300), "#132c24", 24, GREEN, 3)
    draw.text((132, y + 44), "+54 new", font=font(70, True), fill=GREEN)
    draw.text((132, y + 134), "946 total", font=font(64, True), fill=INK)
    draw.text((132, y + 224), "confirmed by EcomSniper", font=font(29), fill=MUTED)
    return canvas


def final_card():
    canvas, draw, y = base(
        "C-01 RESULT",
        "LIVE PASS",
        "Helper-free seller extraction and the EcomSniper handoff completed in signed-in Profile 2.",
    )
    y = max(y + 100, 760)
    rounded(draw, (92, y, 988, y + 330), "#132c24", 24, GREEN, 3)
    draw.text((132, y + 52), "1,607", font=font(94, True), fill=GREEN)
    draw.text((132, y + 172), "competitors in scanner", font=font(36, True), fill=INK)
    draw.text((132, y + 236), "after the automatic handoff", font=font(29), fill=MUTED)
    draw.text((92, 1718), "C-02 remains partial until Product Hunter, export,", font=font(27, True), fill=INK)
    draw.text((92, 1760), "and listed-count verification pass as one batch.", font=font(27, True), fill=INK)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame, dtype=np.uint8)
    for _ in range(round(seconds * fps)):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int):
    frames = evidence_dir / "frames"
    slides = [
        (title_card(), 5.0),
        (
            screenshot_slide(
                "MODE CHECK",
                "Automatic, no helper",
                "The shipped popup reports semantic click mode.",
                frames / "01-automatic-mode.jpg",
                "Extract Sellers is targeted by visible label and confirmed by EcomSniper.",
                (930, 80, 1420, 760),
            ),
            7.0,
        ),
        (count_card(), 7.0),
        (
            screenshot_slide(
                "FINAL HANDOFF",
                "Competitor Scanner opened",
                "The run completed without a local helper or manual Extract Sellers click.",
                frames / "05-competitor-scanner.jpg",
                "Final live readback: Competitor Count 1,607.",
                (0, 140, 1260, 850),
            ),
            8.0,
        ),
        (
            screenshot_slide(
                "COMBINED READBACK",
                "Automatic mode + scanner result",
                "Both controls are visible in the signed-in Profile 2 session.",
                frames / "06-automatic-mode-scanner.jpg",
                "GLDN Ops v3.7.46 remained in Automatic mode at the completed handoff.",
                (700, 70, 1420, 810),
            ),
            7.0,
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
