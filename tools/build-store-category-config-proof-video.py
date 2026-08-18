from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d12"
PANEL = "#151b23"
INK = "#f7f9fc"
MUTED = "#aeb9c8"
GOLD = "#e6ba45"
GREEN = "#2cc68f"
RED = "#ef6d78"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def rounded(draw: ImageDraw.ImageDraw, box, fill, radius=22, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw: ImageDraw.ImageDraw, text: str, max_width: int, chosen_font):
    lines: list[str] = []
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
    return fitted, (
        x1 + ((x2 - x1) - fitted.width) // 2,
        y1 + ((y2 - y1) - fitted.height) // 2,
    )


def title_card(title: str, subtitle: str, lines: list[str], accent: str = GOLD) -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 70), fill=accent)
    draw.text((88, 120), "GLDN OPS PROOF COMPILATION", font=font(30, True), fill=accent)
    y = 230
    for row in wrap(draw, title, 890, font(62, True)):
        draw.text((88, y), row, font=font(62, True), fill=INK)
        y += 78
    y += 24
    for row in wrap(draw, subtitle, 890, font(32)):
        draw.text((88, y), row, font=font(32), fill=MUTED)
        y += 44
    y = max(730, y + 55)
    for line in lines:
        rounded(draw, (88, y, 992, y + 128), "#202936", 18)
        draw.ellipse((122, y + 45, 154, y + 77), fill=accent)
        for index, row in enumerate(wrap(draw, line, 790, font(29, True))[:2]):
            draw.text((180, y + 27 + index * 38), row, font=font(29, True), fill=INK)
        y += 150
    draw.text((88, 1780), "Signed-in Chrome Profile 2 | GLDN Ops v3.7.25", font=font(26), fill=MUTED)
    draw.text((88, 1822), "Computer 0 | eBay FAK12 | July 15, 2026", font=font(25), fill=MUTED)
    return canvas


def screenshot_slide(
    heading: str,
    subtitle: str,
    screenshot: Path,
    result: str,
    label: str,
    color: str,
) -> Image.Image:
    source = Image.open(screenshot).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((52, 45), heading, font=font(42, True), fill=INK)
    y = 105
    for row in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((52, y), row, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (45, 220, 1035, 1010), PANEL, 24, "#2d3745", 2)
    full, full_pos = contain(source, (64, 240, 1016, 990))
    canvas.paste(full, full_pos)

    width, height = source.size
    detail = source.crop((max(0, int(width * 0.24)), max(0, int(height * 0.12)), min(width, int(width * 0.75)), min(height, int(height * 0.83))))
    rounded(draw, (45, 1045, 1035, 1505), PANEL, 24, GOLD, 3)
    detail_image, detail_pos = contain(detail, (65, 1065, 1015, 1485))
    canvas.paste(detail_image, detail_pos)

    rounded(draw, (45, 1540, 1035, 1815), "#202936", 24)
    rounded(draw, (74, 1572, 355, 1638), color, 17)
    draw.text((96, 1588), label, font=font(25, True), fill="#07100d")
    result_y = 1666
    for row in wrap(draw, result, 900, font(28, True))[:3]:
        draw.text((74, result_y), row, font=font(28, True), fill=INK)
        result_y += 38
    draw.text((52, 1860), "Settings-only test. No listing workflow, revision, Save, or Submit occurred.", font=font(21), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int):
    slides = [
        (
            title_card(
                "E-07 Store category configuration",
                "Live screenshots and exact browser readback prove account-specific validation, persistence, backup, and restore.",
                [
                    "Exact FAK12 settings loaded in signed-in Profile 2",
                    "Invalid categories and IDs failed closed",
                    "Chrome storage repair passed live after extension reload",
                    "Backup, restore, and reload persistence passed",
                ],
            ),
            6.0,
        ),
        (
            screenshot_slide(
                "Exact FAK12 configuration",
                "The settings-only screen loaded the account's source categories, destination, numeric category IDs, and backburner item ID.",
                evidence_dir / "01-initial-fak12-settings.png",
                "Not .99 + Other -> Abra Cadabra .99 | IDs 44678633011, 1 | skip 318521296686",
                "SOURCE MATCH",
                GREEN,
            ),
            7.0,
        ),
        (
            screenshot_slide(
                "Duplicate source rejected",
                "The live form refused two identical source Store category names before storage or runtime config could change.",
                evidence_dir / "02-duplicate-source-rejected.png",
                "Source Store category Not .99 is duplicated. The save was blocked.",
                "SAFE FAILURE",
                RED,
            ),
            6.0,
        ),
        (
            screenshot_slide(
                "Overlap and malformed IDs rejected",
                "The same live build also blocked a source/destination overlap and the nonnumeric category ID abc.",
                evidence_dir / "04-malformed-category-id-rejected.png",
                "Destination overlap and digits-only validation both failed closed with no marketplace action.",
                "SAFE FAILURE",
                RED,
            ),
            6.0,
        ),
        (
            screenshot_slide(
                "Chrome storage repair passed",
                "The first live save exposed a frozen-object storage mismatch. v3.7.25 was repaired, reloaded, and tested again in the same signed-in tab.",
                evidence_dir / "05-valid-settings-saved-and-verified.png",
                "Saved and verified Store categories for FAK12.",
                "LIVE PASS",
                GREEN,
            ),
            7.0,
        ),
        (
            screenshot_slide(
                "Backup restore passed",
                "A verified category backup was copied, a temporary settings-only value was saved, and the exact FAK12 backup was restored.",
                evidence_dir / "07-category-backup-restored-and-verified.png",
                "Restored and verified Store categories for FAK12.",
                "RESTORE PASS",
                GREEN,
            ),
            7.0,
        ),
        (
            screenshot_slide(
                "Persistence after extension reload",
                "After a full in-extension reload, the Store Category Settings screen reopened with every exact FAK12 value unchanged.",
                evidence_dir / "08-settings-persist-after-extension-reload.png",
                "Source, destination, category IDs, and backburner ID all persisted exactly.",
                "RELOAD PASS",
                GREEN,
            ),
            7.0,
        ),
        (
            title_card(
                "E-07 live pass",
                "The account-specific configuration path is ready for rollout testing on the next eBay profile, subject to that account's own category names and IDs.",
                [
                    "68 of 68 automated contracts passed",
                    "Save, backup, restore, and reload persistence passed live",
                    "No eBay listing or category was moved",
                    "Next gate remains paused for user green light",
                ],
                accent=GREEN,
            ),
            6.0,
        ),
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
