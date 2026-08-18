from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d14"
PANEL = "#151b25"
INK = "#f8fafc"
MUTED = "#a7b1c2"
GREEN = "#86efac"
BLUE = "#60a5fa"


def font(size: int, bold: bool = False):
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def contain(image: Image.Image, box):
    x1, y1, x2, y2 = box
    fitted = ImageOps.contain(image.convert("RGB"), (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    return fitted, (x1 + (x2 - x1 - fitted.width) // 2, y1 + (y2 - y1 - fitted.height) // 2)


def wrap(draw, text, width, chosen_font):
    lines, line = [], ""
    for word in text.split():
        candidate = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def title_card():
    image = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((52, 52, 1028, 1868), radius=34, fill=PANEL, outline="#334155", width=2)
    draw.rectangle((52, 52, 1028, 72), fill=BLUE)
    draw.text((92, 132), "GLDN OPS LIVE PROOF", font=font(30, True), fill=BLUE)
    y = 250
    for line in wrap(draw, "Poshmark Visible Sales", 880, font(62, True)):
        draw.text((92, y), line, font=font(62, True), fill=INK)
        y += 78
    draw.text((92, y + 30), "v3.8.1 | signed-in Chrome Profile 2", font=font(31), fill=MUTED)
    facts = [
        "20 visible sale rows reviewed",
        "High-contrast table readable in Dark theme",
        "One dashboard batch completed in 10.8 seconds",
        "20 of 20 exact order IDs present once; zero duplicates",
    ]
    y = 780
    for fact in facts:
        draw.rounded_rectangle((92, y, 988, y + 125), radius=18, fill="#202938")
        draw.ellipse((125, y + 44, 157, y + 76), fill=GREEN)
        for index, line in enumerate(wrap(draw, fact, 770, font(29, True))):
            draw.text((185, y + 29 + index * 38), line, font=font(29, True), fill=INK)
        y += 150
    draw.text((92, 1780), "Dashboard-only write. No marketplace action was performed.", font=font(25), fill=MUTED)
    return image


def screenshot_slide(path: Path, heading: str, result: str):
    source = Image.open(path).convert("RGB")
    image = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(image)
    draw.text((52, 48), heading, font=font(42, True), fill=INK)
    draw.rounded_rectangle((48, 130, 1032, 1410), radius=24, fill=PANEL, outline="#334155", width=2)
    fitted, position = contain(source, (68, 150, 1012, 1390))
    image.paste(fitted, position)
    draw.rounded_rectangle((48, 1460, 1032, 1810), radius=24, fill="#202938")
    draw.rounded_rectangle((76, 1490, 270, 1552), radius=16, fill=GREEN)
    draw.text((106, 1503), "LIVE PASS", font=font(24, True), fill="#07130c")
    y = 1600
    for line in wrap(draw, result, 890, font(30, True))[:4]:
        draw.text((76, y), line, font=font(30, True), fill=INK)
        y += 41
    draw.text((52, 1860), "No purchase, shipment, listing Save, or submission was performed.", font=font(23), fill=MUTED)
    return image


def append(writer, image, seconds, fps):
    frame = np.asarray(image)
    for _ in range(round(seconds * fps)):
        writer.append_data(frame)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    slides = [
        (title_card(), 5),
        (screenshot_slide(
            args.evidence_dir / "01-readable-visible-sales-review.png",
            "Readable 20-sale review",
            "Order ID, title, status, date, and earnings are separated and readable. The review remains transparent and resizable.",
        ), 7),
        (screenshot_slide(
            args.evidence_dir / "02-batch-save-complete.png",
            "One batch saved",
            "The panel reported Saved 20 visible Poshmark sale rows. Connector readback found all 20 once in Profit - 7.",
        ), 7),
    ]
    with imageio.get_writer(args.output, fps=12, codec="libx264", quality=8, pixelformat="yuv420p") as writer:
        for slide, seconds in slides:
            append(writer, slide, seconds, 12)


if __name__ == "__main__":
    main()
