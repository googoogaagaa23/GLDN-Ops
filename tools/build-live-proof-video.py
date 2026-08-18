from __future__ import annotations

import argparse
import textwrap
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#0a0d12"
PANEL = "#151a22"
INK = "#f4f7fb"
MUTED = "#aab4c3"
ACCENT = "#f1c84b"
TEAL = "#20b8a6"
RED = "#f16c6c"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def rounded(draw: ImageDraw.ImageDraw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw: ImageDraw.ImageDraw, text: str, max_width: int, chosen_font):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def contain(image: Image.Image, box):
    x1, y1, x2, y2 = box
    fitted = ImageOps.contain(image, (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    x = x1 + ((x2 - x1) - fitted.width) // 2
    y = y1 + ((y2 - y1) - fitted.height) // 2
    return fitted, (x, y)


def load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def title_card(title: str, subtitle: str, result_lines: list[str]) -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (52, 52, 1028, 1868), PANEL, 36, "#2b3442", 2)
    draw.rectangle((52, 52, 1028, 72), fill=ACCENT)
    draw.text((92, 132), "GLDN OPS LIVE PROOF", font=font(30, True), fill=ACCENT)
    y = 245
    for line in wrap(draw, title, 880, font(64, True)):
        draw.text((92, y), line, font=font(64, True), fill=INK)
        y += 80
    y += 30
    for line in wrap(draw, subtitle, 880, font(34)):
        draw.text((92, y), line, font=font(34), fill=MUTED)
        y += 47
    y = max(y + 80, 820)
    for line in result_lines:
        rounded(draw, (92, y, 988, y + 115), "#202734", 18)
        draw.ellipse((125, y + 36, 157, y + 68), fill=TEAL)
        for index, wrapped in enumerate(wrap(draw, line, 770, font(30, True))):
            draw.text((185, y + 27 + index * 36), wrapped, font=font(30, True), fill=INK)
        y += 140
    draw.text((92, 1780), "Recorded in signed-in Chrome Profile 2", font=font(27), fill=MUTED)
    return canvas


def evidence_slide(
    title: str,
    subtitle: str,
    source_path: Path,
    detail_crop: tuple[int, int, int, int] | None,
    result: str,
    status: str = "LIVE PASS",
    status_color: str = TEAL,
    redactions: list[tuple[int, int, int, int]] | None = None,
) -> Image.Image:
    source = load_image(source_path)
    if redactions:
        source_draw = ImageDraw.Draw(source)
        for box in redactions:
            source_draw.rounded_rectangle(box, radius=10, fill="#202734")
            source_draw.text((box[0] + 14, box[1] + 12), "Private details hidden", font=font(18, True), fill=MUTED)
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)

    draw.text((54, 48), title, font=font(43, True), fill=INK)
    y = 112
    for line in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((54, y), line, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (48, 230, 1032, 865), PANEL, 24, "#2b3442", 2)
    full, full_pos = contain(source, (65, 247, 1015, 848))
    canvas.paste(full, full_pos)

    rounded(draw, (48, 905, 1032, 1510), PANEL, 24, ACCENT, 3)
    if detail_crop:
        detail = source.crop(detail_crop)
    else:
        detail = source
    detail_img, detail_pos = contain(detail, (68, 925, 1012, 1490))
    canvas.paste(detail_img, detail_pos)

    rounded(draw, (48, 1550, 1032, 1810), "#202734", 24)
    rounded(draw, (76, 1580, 260, 1644), status_color, 18)
    draw.text((102, 1594), status, font=font(25, True), fill="#091014")
    result_y = 1670
    for line in wrap(draw, result, 900, font(30, True))[:3]:
        draw.text((76, result_y), line, font=font(30, True), fill=INK)
        result_y += 39
    draw.text((55, 1860), "No purchase, listing Save, shipment, or submission was performed.", font=font(23), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    array = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(array)


def build_video(evidence_dir: Path, output: Path, fps: int = 12):
    frames = evidence_dir / "frames"
    slides = [
        (
            title_card(
                "Panel controls and eBay profit proof",
                "Version 3.7.23 was tested live against the exact Amazon order, eBay order, and Google Sheet row.",
                [
                    "Minimized panel docks to the right edge",
                    "Themes, 75% transparency, movement, and resizing persist",
                    "Profit row refreshed without another eBay Save",
                ],
            ),
            5.0,
        ),
        (
            evidence_slide(
                "Panel settings now work",
                "The three-dot control opens settings. Theme and transparency are saved per Chrome profile.",
                frames / "01-panel-controls-0060.jpg",
                (0, 120, 520, 840),
                "Graphite theme selected. Transparency restored to the requested 75% default.",
                redactions=[(205, 445, 485, 580)],
            ),
            6.0,
        ),
        (
            evidence_slide(
                "Minimized means out of the way",
                "The live panel was minimized after being moved. The compact launcher sits flush against the right edge.",
                frames / "01-panel-controls-0150.jpg",
                (1260, 250, 1438, 500),
                "Right-edge docking verified with less than one pixel of relative gap.",
                redactions=[(205, 445, 485, 580)],
            ),
            5.5,
        ),
        (
            evidence_slide(
                "Resizable layout persists",
                "The panel was resized to approximately 358 x 585 and remained at that size after a normal page reload.",
                evidence_dir / "10-ebay-profit-refreshed.jpg",
                (190, 120, 620, 770),
                "Move, size, mode, theme, and transparency are included in saved panel settings.",
            ),
            5.5,
        ),
        (
            evidence_slide(
                "Amazon source verified",
                "The extension read the exact signed-in Amazon order-details card before anything was copied.",
                frames / "03-amazon-evidence-0007.jpg",
                (420, 175, 980, 700),
                "Amazon order cost $7.17 | ETA 6/30 | F9132 | ASIN B09Z61G77L | order 113-2518790-9385867",
                redactions=[(275, 220, 525, 330)],
            ),
            7.0,
        ),
        (
            evidence_slide(
                "Amazon evidence copied",
                "The live status line confirms the values captured from the order-details card.",
                frames / "04-amazon-copy-0006.jpg",
                (1160, 560, 1438, 840),
                "Panel status: Copied: 7.17 - F9132 - 6/30",
                redactions=[(275, 220, 525, 330)],
            ),
            5.0,
        ),
        (
            evidence_slide(
                "eBay note matched",
                "The exact eBay order produced the same saved note and exposed Refresh Profit Row, not a new Save action.",
                frames / "05-ebay-profit-preview-0032.jpg",
                (405, 135, 1010, 710),
                "eBay earnings $5.68 | Amazon order cost $7.17 | confidence 83% | note 5.68 - 7.17 - F9132 - 6/30",
            ),
            7.0,
        ),
        (
            evidence_slide(
                "Profit row refreshed",
                "The modal closed and the existing note stayed unchanged. No eBay Save button was used.",
                evidence_dir / "10-ebay-profit-refreshed.jpg",
                (190, 120, 620, 860),
                "Panel status: Matching saved note - profit row refreshed",
            ),
            6.0,
        ),
        (
            evidence_slide(
                "Profit - 0 row created",
                "The live Google Sheet shows the exact order, marketplace earnings, supplier total, and supplier profile.",
                evidence_dir / "07-profit-sheet-left.jpg",
                (35, 135, 1440, 245),
                "Computer 0 | FAK12 | order 18-14818-27804 | eBay earnings $5.68 | Amazon order cost $7.17 | F9132",
            ),
            6.5,
        ),
        (
            evidence_slide(
                "Profit calculation verified",
                "The center columns show the stored ETA, profit, margin, and SKU on the same row.",
                evidence_dir / "09-profit-sheet-profit.jpg",
                (250, 130, 1400, 250),
                "Profit -$1.49 | margin -26.2% | ETA 6/30 | SKU QjA5WjYxRzc3TA==",
            ),
            6.5,
        ),
        (
            evidence_slide(
                "Supplier evidence retained",
                "The right-side columns preserve the Amazon ASIN, order number, match source, URL, and evidence payload.",
                evidence_dir / "08-profit-sheet-right.jpg",
                (35, 130, 1645, 250),
                "ASIN B09Z61G77L | Amazon order 113-2518790-9385867 | source amazon-order-details-card",
            ),
            6.5,
        ),
        (
            title_card(
                "Live test complete",
                "The panel UX changes and exact E-05 profit workflow passed in signed-in Chrome Profile 2.",
                [
                    "One matching row in Profit - 0",
                    "One matching row in Marketplace Profit History",
                    "No duplicate row and no additional eBay Save",
                ],
            ),
            5.0,
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
    build_video(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
