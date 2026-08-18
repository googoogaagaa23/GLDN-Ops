from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d12"
PANEL = "#151b23"
PANEL_2 = "#202936"
INK = "#f7f9fc"
MUTED = "#aeb9c8"
GOLD = "#e6ba45"
GREEN = "#2cc68f"
BLUE = "#4f8df7"


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


def paste_panel(canvas: Image.Image, image: Image.Image, box, outline=GOLD):
    draw = ImageDraw.Draw(canvas)
    rounded(draw, box, PANEL, 24, outline, 3)
    x1, y1, x2, y2 = box
    fitted, pos = contain(image, (x1 + 18, y1 + 18, x2 - 18, y2 - 18))
    canvas.paste(fitted, pos)


def header(draw: ImageDraw.ImageDraw, title: str, subtitle: str, accent=GOLD):
    draw.rectangle((0, 0, 1080, 18), fill=accent)
    draw.text((52, 54), title, font=font(46, True), fill=INK)
    y = 120
    for line in wrap(draw, subtitle, 970, font(26))[:3]:
        draw.text((52, y), line, font=font(26), fill=MUTED)
        y += 36


def title_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 72), fill=GOLD)
    draw.text((88, 125), "GLDN OPS LIVE TEST", font=font(31, True), fill=GOLD)
    draw.text((88, 225), "E-08 Move .99", font=font(67, True), fill=INK)
    draw.text((88, 315), "Final eBay review proof", font=font(39, True), fill=INK)
    y = 475
    facts = [
        "Signed-in Chrome Profile 2",
        "Computer 0 | eBay FAK12",
        "Source: Not .99 + Other",
        "Destination: Abra Cadabra .99",
        "Submit remains untouched",
    ]
    for fact in facts:
        rounded(draw, (88, y, 992, y + 126), PANEL_2, 18)
        draw.ellipse((122, y + 45, 154, y + 77), fill=GREEN)
        draw.text((180, y + 38), fact, font=font(29, True), fill=INK)
        y += 148
    draw.text((88, 1785), "GLDN Ops v3.7.29 | July 16, 2026", font=font(26), fill=MUTED)
    draw.text((88, 1827), "Approval gate: final Submit (33)", font=font(26, True), fill=GOLD)
    return canvas


def submitted_title_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 72), fill=GREEN)
    draw.text((88, 125), "GLDN OPS LIVE RESULT", font=font(31, True), fill=GREEN)
    draw.text((88, 225), "E-08 Move .99", font=font(67, True), fill=INK)
    draw.text((88, 315), "Approved submission proof", font=font(39, True), fill=INK)
    y = 475
    facts = [
        "33 of 33 listings selected",
        "All 33 prices end in .99",
        "Category: Abra Cadabra .99",
        "Final Submit explicitly approved",
        "eBay confirmed 33 listings live",
    ]
    for fact in facts:
        rounded(draw, (88, y, 992, y + 126), PANEL_2, 18)
        draw.ellipse((122, y + 45, 154, y + 77), fill=GREEN)
        draw.text((180, y + 38), fact, font=font(29, True), fill=INK)
        y += 148
    draw.text((88, 1785), "GLDN Ops v3.7.29 | July 16, 2026", font=font(26), fill=MUTED)
    draw.text((88, 1827), "Computer 0 | eBay FAK12", font=font(26, True), fill=GREEN)
    return canvas


def price_slide(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    header(
        draw,
        "Exact .99 prices verified",
        "The live bulk editor shows the admitted listings with their original titles, SKUs, quantities, and Buy It Now prices.",
        BLUE,
    )
    paste_panel(canvas, source, (45, 235, 1035, 870), BLUE)
    detail = source.crop((315, 430, 1510, 1085))
    paste_panel(canvas, detail, (45, 905, 1035, 1515), BLUE)
    rounded(draw, (45, 1555, 1035, 1810), PANEL_2, 24)
    rounded(draw, (75, 1586, 360, 1650), GREEN, 17)
    draw.text((102, 1601), "33 / 33 EXACT", font=font(24, True), fill="#07100d")
    draw.text((75, 1682), "All 33 displayed prices end in .99.", font=font(31, True), fill=INK)
    draw.text((75, 1730), "No title or price mismatches were found.", font=font(27), fill=MUTED)
    draw.text((52, 1860), "Evidence frame: live signed-in eBay bulk editor", font=font(22), fill=MUTED)
    return canvas


def category_slide(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    header(
        draw,
        "Store category applied",
        "The final review shows 33 of 33 selected and the primary Store category set to Abra Cadabra .99.",
        GOLD,
    )
    paste_panel(canvas, source, (45, 235, 1035, 875), GOLD)
    detail = source.crop((500, 390, 1670, 1135))
    paste_panel(canvas, detail, (45, 910, 1035, 1515), GOLD)
    rounded(draw, (45, 1555, 1035, 1810), PANEL_2, 24)
    rounded(draw, (75, 1586, 410, 1650), GREEN, 17)
    draw.text((101, 1601), "CATEGORY MATCH", font=font(24, True), fill="#07100d")
    draw.text((75, 1682), "Abra Cadabra .99 on all 33 rows", font=font(31, True), fill=INK)
    draw.text((75, 1730), "Submit (33) is visible and was not clicked.", font=font(27), fill=MUTED)
    draw.text((52, 1860), "Approval is required before any listing revision is submitted.", font=font(22), fill=MUTED)
    return canvas


def summary_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 72), fill=GREEN)
    draw.text((88, 125), "E-08 VERIFICATION RESULT", font=font(31, True), fill=GREEN)
    draw.text((88, 225), "Ready for approval", font=font(58, True), fill=INK)
    draw.text((88, 315), "No listing changes submitted", font=font(34, True), fill=GOLD)
    rows = [
        ("Filtered listings inspected", "2,234"),
        ("Exact .99 matches found", "2,064"),
        ("Current eBay review batch", "33"),
        ("Selected and category matched", "33 / 33"),
        ("Title or price mismatches", "0"),
        ("Backburner item included", "No"),
        ("Deferred omitted item", "318589264914"),
    ]
    y = 470
    for label, value in rows:
        rounded(draw, (88, y, 992, y + 126), PANEL_2, 18)
        draw.text((120, y + 27), label, font=font(25), fill=MUTED)
        draw.text((120, y + 67), value, font=font(30, True), fill=INK)
        y += 145
    rounded(draw, (88, 1540, 992, 1718), "#173328", 22, GREEN, 3)
    draw.text((120, 1583), "STOPPED AT FINAL REVIEW", font=font(31, True), fill=GREEN)
    draw.text((120, 1633), "Submit (33) awaits explicit approval.", font=font(28, True), fill=INK)
    draw.text((88, 1810), "Evidence and row-level audit saved locally.", font=font(24), fill=MUTED)
    return canvas


def success_slide(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    header(
        draw,
        "eBay submission confirmed",
        "The final eBay confirmation reports that all 33 approved listings are now live with $0.00 estimated fees.",
        GREEN,
    )
    paste_panel(canvas, source, (45, 235, 1035, 915), GREEN)
    detail = source.crop((450, 430, 1235, 835))
    paste_panel(canvas, detail, (45, 950, 1035, 1495), GREEN)
    rounded(draw, (45, 1540, 1035, 1810), "#173328", 24, GREEN, 3)
    draw.text((75, 1585), "33 LISTINGS ARE NOW LIVE", font=font(33, True), fill=GREEN)
    draw.text((75, 1655), "Total estimated fees: $0.00", font=font(31, True), fill=INK)
    draw.text((75, 1715), "No partial-failure warning was shown.", font=font(27), fill=MUTED)
    draw.text((52, 1860), "Evidence frame: signed-in eBay confirmation", font=font(22), fill=MUTED)
    return canvas


def submitted_summary_card() -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 72), fill=GREEN)
    draw.text((88, 125), "E-08 LIVE RESULT", font=font(31, True), fill=GREEN)
    draw.text((88, 225), "Live pass", font=font(64, True), fill=INK)
    draw.text((88, 315), "Approved category change completed", font=font(34, True), fill=GREEN)
    rows = [
        ("Selected listings", "33 / 33"),
        ("Exact .99 prices", "33 / 33"),
        ("Destination category", "Abra Cadabra .99"),
        ("Listings confirmed live", "33"),
        ("Estimated fees", "$0.00"),
        ("Backburner item included", "No"),
        ("Deferred omitted item", "318589264914"),
    ]
    y = 470
    for label, value in rows:
        rounded(draw, (88, y, 992, y + 126), PANEL_2, 18)
        draw.text((120, y + 27), label, font=font(25), fill=MUTED)
        draw.text((120, y + 67), value, font=font(30, True), fill=INK)
        y += 145
    rounded(draw, (88, 1540, 992, 1718), "#173328", 22, GREEN, 3)
    draw.text((120, 1583), "EBAY CONFIRMED SUCCESS", font=font(31, True), fill=GREEN)
    draw.text((120, 1633), "33 listings are now live.", font=font(28, True), fill=INK)
    draw.text((88, 1810), "Result evidence and row-level audit saved locally.", font=font(24), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int, submitted: bool = False):
    if submitted:
        slides = [
            (submitted_title_card(), 5.0),
            (price_slide(evidence_dir / "11-v3729-exact99-prices.png"), 6.0),
            (category_slide(evidence_dir / "10-v3729-final-review-visible.png"), 6.0),
            (success_slide(evidence_dir / "12-v3729-submit-success.png"), 7.0),
            (submitted_summary_card(), 6.0),
        ]
    else:
        slides = [
            (title_card(), 5.0),
            (price_slide(evidence_dir / "11-v3729-exact99-prices.png"), 7.0),
            (category_slide(evidence_dir / "10-v3729-final-review-visible.png"), 7.0),
            (summary_card(), 7.0),
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
    parser.add_argument("--submitted", action="store_true")
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps, args.submitted)


if __name__ == "__main__":
    main()
