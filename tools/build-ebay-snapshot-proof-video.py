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
    draw.text((88, 126), "GLDN OPS LIVE TEST VIDEO", font=font(30, True), fill=accent)
    y = 245
    for row in wrap(draw, title, 890, font(62, True)):
        draw.text((88, y), row, font=font(62, True), fill=INK)
        y += 78
    y += 25
    for row in wrap(draw, subtitle, 890, font(33)):
        draw.text((88, y), row, font=font(33), fill=MUTED)
        y += 46
    y = max(760, y + 70)
    for line in lines:
        rounded(draw, (88, y, 992, y + 125), "#202936", 18)
        draw.ellipse((122, y + 42, 154, y + 74), fill=accent)
        for index, row in enumerate(wrap(draw, line, 790, font(29, True))[:2]):
            draw.text((180, y + 28 + index * 37), row, font=font(29, True), fill=INK)
        y += 148
    draw.text((88, 1785), "Signed-in Chrome Profile 2 | GLDN Ops v3.7.24", font=font(26), fill=MUTED)
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
    draw.text((52, 48), heading, font=font(42, True), fill=INK)
    y = 110
    for row in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((52, y), row, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (45, 225, 1035, 1100), PANEL, 24, "#2d3745", 2)
    full, full_pos = contain(source, (64, 244, 1016, 1080))
    canvas.paste(full, full_pos)

    detail = source.crop((190, 100, 1125, 835))
    rounded(draw, (45, 1140, 1035, 1510), PANEL, 24, GOLD, 3)
    detail_image, detail_pos = contain(detail, (65, 1160, 1015, 1490))
    canvas.paste(detail_image, detail_pos)

    rounded(draw, (45, 1548, 1035, 1815), "#202936", 24)
    rounded(draw, (74, 1578, 330, 1642), color, 17)
    draw.text((98, 1593), label, font=font(25, True), fill="#07100d")
    result_y = 1670
    for row in wrap(draw, result, 900, font(29, True))[:3]:
        draw.text((74, result_y), row, font=font(29, True), fill=INK)
        result_y += 38
    draw.text((52, 1862), "Read-only eBay test. No listing, order, or marketplace field changed.", font=font(22), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int):
    slides = [
        (
            title_card(
                "E-06 Seller Hub snapshot",
                "The source cards, GLDN review, Google Sheet row, and sync receipt were checked in one signed-in Profile 2 test.",
                [
                    "Computer 0 | eBay FAK12",
                    "Exact card-scoped values only",
                    "Dashboard, history, and receipt readback passed",
                ],
            ),
            5.0,
        ),
        (
            screenshot_slide(
                "Previous build failed",
                "v3.7.23 read nearby page text, missed feedback and ads, and produced an invalid traffic value.",
                evidence_dir / "01-v3723-live-failure.png",
                "This live failure was preserved and used as the regression case for the repair.",
                "LIVE FAILURE",
                RED,
            ),
            6.0,
        ),
        (
            screenshot_slide(
                "Corrected review",
                "v3.7.24 reads Sales, Feedback, Traffic, and Advertising from their exact Seller Hub cards.",
                evidence_dir / "02-v3724-modal-source-match.png",
                "The review modal matched the visible Seller Hub source before saving the snapshot.",
                "SOURCE MATCH",
                GREEN,
            ),
            7.0,
        ),
        (
            screenshot_slide(
                "Final Profile 2 run",
                "The final reviewed values were synced only after the user approved the E-06 test gate.",
                evidence_dir / "03-v3724-final-reviewed-modal.png",
                "Sales, feedback, traffic, clicks, ad sales, and ROAS all matched eBay exactly.",
                "LIVE PASS",
                GREEN,
            ),
            7.0,
        ),
        (
            title_card(
                "Exact values verified",
                "The final source, modal, and Google Sheet rows agreed.",
                [
                    "Sales: $10.87 | $1,029.39 | $7,134.87 | -9.6% | $21,401.74",
                    "Feedback: 261 positive | 3 neutral | 0 negative",
                    "Traffic: 4,747,733 impressions | 22,811 page views",
                    "Ads: 709 clicks | $721.28 sales | 19.55 ROAS",
                ],
                accent=GREEN,
            ),
            8.0,
        ),
        (
            title_card(
                "Google Sheet readback passed",
                "The final extension sync was read back from the connected shared dashboard.",
                [
                    "eBay Snapshot Dashboard row 2",
                    "eBay Snapshot History row 6",
                    "Sync Receipts row 41",
                    "Apps Script deployment @25",
                ],
                accent=GREEN,
            ),
            7.0,
        ),
        (
            title_card(
                "E-06 complete",
                "The live test is not considered complete without this video, exact readback evidence, and the automated release gate.",
                [
                    "62 of 62 automated contracts passed",
                    "Universal package and parser checks passed",
                    "No eBay marketplace data changed",
                ],
                accent=GREEN,
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
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
