from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d12"
PANEL = "#151b24"
INK = "#f4f7fb"
MUTED = "#aeb8c7"
GOLD = "#d6aa3c"
GREEN = "#25b88a"
RED = "#ef5b5b"

ROWS = [
    ("12 Glitter Paint Pens for Glass Marking", "$20.00"),
    ("Clipboard with Storage, Heavy Duty", "$20.80"),
    ("925 Sterling Silver Charms Bracelet", "$24.80"),
    ("Sandalwood Wide Tooth Hair Comb", "$16.00"),
    ("Pottery Tools Kit with BatMate", "$16.00"),
    ("65 Pcs Velvet Hair Scrunchies", "$16.00"),
    ("Solana Yoga Mat Thick 1/2in", "$32.00"),
    ("Valentines Heart Pillows", "$24.80"),
    ("14K Gold Herringbone Snake Chain", "$21.60"),
    ("Pasta Bowls, 30oz Salad Bowls", "$32.80"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, width: int, chosen_font):
    lines = []
    current = ""
    for word in text.split():
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def text_block(draw, text, x, y, width, chosen_font, fill, spacing=8):
    for line in wrap(draw, text, width, chosen_font):
        draw.text((x, y), line, font=chosen_font, fill=fill)
        y += chosen_font.size + spacing
    return y


def rounded(draw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def title_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#303a4b", 2)
    draw.rectangle((48, 48, 1032, 68), fill=GOLD)
    draw.text((90, 130), "GLDN OPS LIVE TEST", font=font(30, True), fill=GOLD)
    y = text_block(draw, "Pilot 10 Poshmark Profit Match", 90, 270, 880, font(62, True), INK, 12)
    text_block(draw, "v3.9.1 | Signed-in Chrome Profile 2 | F9132", 90, y + 28, 880, font(33), MUTED)
    rounded(draw, (90, 820, 990, 1135), "#351c22", 26, RED, 3)
    draw.text((130, 870), "LIVE RESULT: FAILED", font=font(42, True), fill=RED)
    draw.text((130, 965), "Poshmark earnings: 10/10", font=font(34, True), fill=INK)
    draw.text((130, 1030), "Exact Amazon bought prices: 0/10", font=font(34, True), fill=INK)
    text_block(
        draw,
        "No spreadsheet rows were synced. No Amazon price was guessed or replaced with a markup or product-page price.",
        90,
        1310,
        880,
        font(30),
        MUTED,
        10,
    )
    return canvas


def table_card(start: int, end: int) -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 48), f"Results {start + 1}-{end}", font=font(48, True), fill=INK)
    draw.text((54, 115), "Exact live values from the Pilot 10 review", font=font(28), fill=MUTED)
    y = 210
    for index in range(start, end):
        title, earnings = ROWS[index]
        rounded(draw, (48, y, 1032, y + 292), PANEL, 24, "#303a4b", 2)
        draw.text((78, y + 24), f"{index + 1:02d}", font=font(27, True), fill=GOLD)
        text_block(draw, title, 145, y + 24, 820, font(30, True), INK, 8)
        draw.text((78, y + 150), "Poshmark earnings", font=font(24), fill=MUTED)
        draw.text((340, y + 142), earnings, font=font(34, True), fill=GREEN)
        draw.text((78, y + 214), "Amazon bought price", font=font(24), fill=MUTED)
        draw.text((340, y + 206), "NOT FOUND", font=font(34, True), fill=RED)
        y += 320
    return canvas


def screenshot_card(title: str, subtitle: str, path: Path, result: str) -> Image.Image:
    source = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 48), title, font=font(46, True), fill=INK)
    text_block(draw, subtitle, 54, 112, 970, font(27), MUTED)
    rounded(draw, (45, 245, 1035, 1385), PANEL, 26, "#303a4b", 2)
    fitted = ImageOps.contain(source, (950, 1100), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (65 + (950 - fitted.width) // 2, 265 + (1100 - fitted.height) // 2))
    rounded(draw, (45, 1430, 1035, 1815), "#351c22", 26, RED, 3)
    text_block(draw, result, 78, 1490, 900, font(32, True), INK, 10)
    return canvas


def final_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, RED, 3)
    draw.text((90, 145), "PILOT 10 COMPLETE", font=font(34, True), fill=GOLD)
    y = text_block(draw, "Exact Amazon Cost Match", 90, 300, 880, font(62, True), INK, 12)
    text_block(draw, "FAILED 0/10", 90, y + 28, 880, font(72, True), RED, 12)
    checks = [
        "10 Poshmark sale details captured",
        "10 EcomSniper SKUs decoded",
        "10 Amazon order-history searches completed",
        "0 exact purchased order items found",
        "0 spreadsheet writes",
    ]
    y = 890
    for check in checks:
        rounded(draw, (90, y, 990, y + 118), "#202938", 20)
        draw.ellipse((126, y + 38, 158, y + 70), fill=GREEN)
        draw.text((190, y + 32), check, font=font(30, True), fill=INK)
        y += 145
    text_block(
        draw,
        "The workflow correctly refused to invent Amazon costs. These rows need the correct purchasing account or exact order evidence.",
        90,
        1650,
        880,
        font(28),
        MUTED,
        9,
    )
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    array = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(array)


def build(evidence_dir: Path, output: Path, fps: int):
    first_results = table_card(0, 5)
    second_results = table_card(5, 10)
    first_results.save(evidence_dir / "07-pilot10-results-01-05.png")
    second_results.save(evidence_dir / "08-pilot10-results-06-10.png")
    slides = [
        (title_card(), 5.0),
        (first_results, 9.0),
        (second_results, 9.0),
        (
            screenshot_card(
                "Live GLDN Review",
                "The completed review reported 10 indexed, 10 captured, 0 exact, and 10 Amazon not found.",
                evidence_dir / "01-pilot10-review-top.png",
                "No spreadsheet changes were made from this review.",
            ),
            7.0,
        ),
        (
            screenshot_card(
                "Signed-in Amazon Verification",
                "The decoded ASIN was searched directly in Profile 2 order history.",
                evidence_dir / "06-amazon-no-order-result.png",
                "Amazon returned: No results found. No bought price exists in this account for that ASIN.",
            ),
            7.0,
        ),
        (final_card(), 6.0),
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
    parser.add_argument("--fps", type=int, default=12)
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
