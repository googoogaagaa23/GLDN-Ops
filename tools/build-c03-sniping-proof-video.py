from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d12"
PANEL = "#151b24"
INK = "#f5f7fa"
MUTED = "#abb6c5"
ACCENT = "#f0c84b"
PASS = "#28c38b"
PARTIAL = "#f0a43b"


def font(size: int, bold: bool = False):
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, width: int, selected_font):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=selected_font)[2] <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def rounded(draw: ImageDraw.ImageDraw, box, fill, radius=24, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def contain(image: Image.Image, box):
    x1, y1, x2, y2 = box
    fitted = ImageOps.contain(image, (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    x = x1 + ((x2 - x1) - fitted.width) // 2
    y = y1 + ((y2 - y1) - fitted.height) // 2
    return fitted, (x, y)


def title_card():
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 36, "#303948")
    draw.rectangle((48, 48, 1032, 72), fill=ACCENT)
    draw.text((92, 130), "GLDN OPS RECORDED PROOF", font=font(29, True), fill=ACCENT)
    y = 260
    for line in wrap(draw, "C-03 Sniping Workflow", 880, font(66, True)):
        draw.text((92, y), line, font=font(66, True), fill=INK)
        y += 82
    y += 36
    for line in wrap(draw, "Fresh live screenshot compilation from signed-in Chrome Profile 2", 880, font(34)):
        draw.text((92, y), line, font=font(34), fill=MUTED)
        y += 48
    facts = [
        "GLDN Ops v3.7.88",
        "Amazon ASIN B0DS5X5WQ2 at $9.99",
        "Recorded July 21, 2026",
        "No listing was created, edited, or submitted",
    ]
    y = 820
    for fact in facts:
        rounded(draw, (92, y, 988, y + 112), "#202834", 18)
        draw.ellipse((124, y + 38, 156, y + 70), fill=PASS)
        draw.text((184, y + 28), fact, font=font(29, True), fill=INK)
        y += 138
    draw.text((92, 1790), "Compilation used because another extension's private page cannot be recorded through browser control.", font=font(22), fill=MUTED)
    return canvas


def evidence_slide(title: str, subtitle: str, source_path: Path, result: str, detail_mode: str = "panel", status: str = "PASS"):
    source = Image.open(source_path).convert("RGB")
    width, height = source.size
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 45), title, font=font(43, True), fill=INK)
    y = 108
    for line in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((54, y), line, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (48, 230, 1032, 860), PANEL, 24, "#303948")
    full, full_position = contain(source, (66, 248, 1014, 842))
    canvas.paste(full, full_position)

    if detail_mode == "overlay":
        detail = source.crop((int(width * 0.15), int(height * 0.03), int(width * 0.84), int(height * 0.91)))
    else:
        detail = source.crop((int(width * 0.72), int(height * 0.38), width, height))
    rounded(draw, (48, 900, 1032, 1505), PANEL, 24, ACCENT, 3)
    detail_fit, detail_position = contain(detail, (68, 920, 1012, 1485))
    canvas.paste(detail_fit, detail_position)

    rounded(draw, (48, 1545, 1032, 1815), "#202834", 24)
    color = PASS if status == "PASS" else PARTIAL
    rounded(draw, (76, 1575, 300, 1642), color, 18)
    draw.text((102, 1591), status, font=font(25, True), fill="#091014")
    result_y = 1670
    for line in wrap(draw, result, 900, font(29, True))[:3]:
        draw.text((76, result_y), line, font=font(29, True), fill=INK)
        result_y += 39
    draw.text((55, 1860), "No purchase, listing Save, shipment, or submission was performed.", font=font(23), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    array = np.asarray(frame)
    for _ in range(round(seconds * fps)):
        writer.append_data(array)


def build(evidence_dir: Path, output: Path, fps: int):
    slides = [
        (title_card(), 5.0),
        (evidence_slide(
            "Exact Amazon anchor",
            "The rerun began on the signed-in Amazon product page with the GLDN version visible.",
            evidence_dir / "01-amazon-anchor.png",
            "ASIN B0DS5X5WQ2 | Amazon price $9.99 | GLDN Ops v3.7.88",
        ), 6.0),
        (evidence_slide(
            "Background eBay scan launched",
            "GLDN opened the generated search in the same Profile 2 Chrome window without replacing the Amazon anchor.",
            evidence_dir / "02-background-scan-launched.png",
            "Launch returned success: background tab 515868204 in owner window 515868157.",
        ), 6.0),
        (evidence_slide(
            "Seller candidates returned",
            "The stable eBay scan returned candidates to the exact Amazon tab for manual identity review.",
            evidence_dir / "03-seller-candidates.png",
            "Seven current candidates met the 70% markup gate. No candidate was auto-approved.",
            "overlay",
        ), 7.0),
        (evidence_slide(
            "Exact seller verified",
            "The title, product image, and six-pack green variant were checked before the local seller save became available.",
            evidence_dir / "04-exact-seller-verified.png",
            "dentamech | eBay item 336550343811 | $17.99 | 80.1% markup | estimated profit $4.86",
            "overlay",
        ), 7.0),
        (evidence_slide(
            "EcomSniper handoff reached",
            "Save Verified Seller stored only the reviewed seller and opened EcomSniper Competitor Scanner.",
            evidence_dir / "05-seller-saved-handoff.png",
            "GLDN segment passed. Product Hunter and Save Read-Only Review remain unverified.",
            "overlay",
            "PARTIAL",
        ), 7.0),
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(output, fps=fps, codec="libx264", quality=7, pixelformat="yuv420p", macro_block_size=2) as writer:
        for slide, seconds in slides:
            append_seconds(writer, slide, seconds, fps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=int, default=12)
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
