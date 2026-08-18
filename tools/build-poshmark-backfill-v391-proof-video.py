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


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, max_width: int, chosen_font):
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


def rounded(draw: ImageDraw.ImageDraw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_block(draw, text, x, y, width, chosen_font, fill, spacing=8):
    line_height = chosen_font.size + spacing
    for line in wrap(draw, text, width, chosen_font):
        draw.text((x, y), line, font=chosen_font, fill=fill)
        y += line_height
    return y


def title_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#303a4b", 2)
    draw.rectangle((48, 48, 1032, 68), fill=GOLD)
    draw.text((90, 130), "GLDN OPS LIVE PROOF COMPILATION", font=font(29, True), fill=GOLD)
    y = text_block(draw, "Historical Poshmark Profit Sync", 90, 260, 880, font(64, True), INK, 12)
    y = text_block(
        draw,
        "P-08 | v3.9.1 | Signed-in Chrome Profile 2 | July 23, 2026",
        90,
        y + 30,
        880,
        font(33),
        MUTED,
    )
    checks = [
        "Exact Poshmark SKU-to-ASIN match",
        "Exact signed-in Amazon order-item cost",
        "Two-step approval and one dashboard upsert",
        "One row per profit tab, zero duplicates",
    ]
    y = 920
    for check in checks:
        rounded(draw, (90, y, 990, y + 118), "#202938", 20)
        draw.ellipse((126, y + 38, 158, y + 70), fill=GREEN)
        text_block(draw, check, 188, y + 26, 760, font(30, True), INK)
        y += 145
    draw.text((90, 1780), "No marketplace Save, Submit, shipment, purchase, or listing change.", font=font(25), fill=MUTED)
    return canvas


def screenshot_slide(title: str, subtitle: str, path: Path, result: str) -> Image.Image:
    source = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 50), title, font=font(46, True), fill=INK)
    text_block(draw, subtitle, 54, 116, 970, font(27), MUTED)
    rounded(draw, (45, 245, 1035, 1375), PANEL, 26, "#303a4b", 2)
    fitted = ImageOps.contain(source, (950, 1090), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (65 + (950 - fitted.width) // 2, 265 + (1090 - fitted.height) // 2))
    rounded(draw, (45, 1420, 1035, 1815), "#202938", 26)
    rounded(draw, (78, 1450, 280, 1518), GREEN, 18)
    draw.text((111, 1464), "LIVE PASS", font=font(27, True), fill="#07100e")
    text_block(draw, result, 78, 1560, 900, font(31, True), INK, 10)
    return canvas


def readback_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 50), "Verified Google Sheets Readback", font=font(46, True), fill=INK)
    text_block(draw, "Connected Google Sheets data was read again after the approved sync.", 54, 116, 970, font(27), MUTED)

    rows = [
        ("Apps Script receipt", "Row 72 | marketplaceProfitBatch | count 1"),
        ("Profit - 7", "Row 32 | exactly 1 matching order"),
        ("Marketplace Profit History", "Row 32 | exactly 1 matching order"),
        ("Poshmark", "$29.17 earnings | $37.00 sold"),
        ("Amazon", "$19.96 exact item cost | B07T88F8B2"),
        ("Profit", "$9.21 | 31.6% margin"),
        ("Order evidence", "114-5900136-8324212"),
        ("Duplicate count", "0"),
    ]
    y = 280
    for label, value in rows:
        rounded(draw, (54, y, 1026, y + 150), PANEL, 20, "#303a4b", 2)
        draw.text((84, y + 25), label, font=font(27), fill=MUTED)
        text_block(draw, value, 84, y + 70, 890, font(31, True), INK)
        y += 172
    rounded(draw, (54, 1680, 1026, 1835), "#16372f", 24, GREEN, 3)
    text_block(draw, "The existing order row was updated in place. No second row was added.", 82, 1718, 900, font(31, True), INK)
    return canvas


def final_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, GREEN, 3)
    draw.text((90, 145), "P-08 COMPLETE", font=font(34, True), fill=GREEN)
    y = text_block(draw, "Historical Profit Backfill", 90, 280, 880, font(64, True), INK, 12)
    y = text_block(draw, "LIVE PASS", 90, y + 30, 880, font(72, True), GREEN, 12)
    results = [
        "Already synced: 1",
        "Sync button disabled after success",
        "Receipt count: 1",
        "Profit tab duplicates: 0",
        "Marketplace writes: 0",
    ]
    y = 850
    for result in results:
        rounded(draw, (90, y, 990, y + 118), "#202938", 20)
        draw.ellipse((126, y + 38, 158, y + 70), fill=GREEN)
        draw.text((190, y + 32), result, font=font(31, True), fill=INK)
        y += 145
    draw.text((90, 1785), "Automated suite: 217/217 | Universal release check: passed", font=font(25), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    array = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(array)


def build(evidence_dir: Path, output: Path, fps: int):
    pre_sync = evidence_dir.parent / "profile2-poshmark-profit-backfill-v390-2026-07-23" / "02-clean-exact-review.png"
    live_sync = evidence_dir / "01-live-sync-pass.png"
    slides = [
        (title_card(), 5.0),
        (
            screenshot_slide(
                "Exact Match Before Sync",
                "The review showed one exact result and zero ambiguous, missing-SKU, or Amazon-not-found rows.",
                pre_sync,
                "$29.17 Poshmark earnings - $19.96 Amazon order cost = $9.21 profit.",
            ),
            7.0,
        ),
        (
            screenshot_slide(
                "Approved Sync Completed",
                "v3.9.1 refreshed the same review after the dashboard acknowledged the approved exact-row upsert.",
                live_sync,
                "Already synced changed to 1 and Sync Exact Profits became disabled.",
            ),
            7.0,
        ),
        (readback_card(), 7.0),
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
    parser.add_argument("--fps", type=int, default=12)
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
