from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-u03-guides-v3794-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-U03-v3.7.94-feature-guide-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def title_card() -> Image.Image:
    canvas = Image.new("RGB", live_proof.CANVAS, live_proof.BG)
    draw = ImageDraw.Draw(canvas)
    live_proof.rounded(draw, (52, 52, 1028, 1868), live_proof.PANEL, 36, "#2b3442", 2)
    draw.rectangle((52, 52, 1028, 72), fill=live_proof.ACCENT)
    draw.text((92, 132), "GLDN OPS U-03 PROOF", font=live_proof.font(30, True), fill=live_proof.ACCENT)
    draw.text((92, 250), "Verified feature guides", font=live_proof.font(62, True), fill=live_proof.INK)
    y = 420
    for line in [
        "20 feature groups from one canonical catalog",
        "Exact steps, approval stops, output, and recovery",
        "Desktop and mobile visual audits passed",
        "Incomplete features are labeled honestly",
    ]:
        live_proof.rounded(draw, (92, y, 988, y + 125), "#202734", 18)
        draw.ellipse((125, y + 45, 157, y + 77), fill=live_proof.TEAL)
        text_y = y + 31
        for wrapped in live_proof.wrap(draw, line, 770, live_proof.font(28, True)):
            draw.text((185, text_y), wrapped, font=live_proof.font(28, True), fill=live_proof.INK)
            text_y += 38
        y += 150
    draw.text((92, 1760), "No marketplace or spreadsheet action was performed.", font=live_proof.font(27), fill=live_proof.MUTED)
    return canvas


def main() -> None:
    slides = [
        (title_card(), 5.0),
        (
            live_proof.evidence_slide(
                "Desktop guide",
                "The generated guide begins with the safety rule, evidence definitions, and a 20-feature status index.",
                EVIDENCE / "guide-desktop-1280.png",
                (55, 0, 1225, 710),
                "20 index entries, 20 feature sections, no overflow, and no duplicate IDs.",
                status="VISUAL PASS",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Mobile guide",
                "The same generated guide remains readable on a phone-width viewport with stacked status and feature controls.",
                EVIDENCE / "guide-mobile-390.png",
                (0, 0, 390, 1050),
                "390px audit passed with no horizontal overflow or clipped status labels.",
                status="MOBILE PASS",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Approval gates are explicit",
                "The Move .99 guide separates exact scan steps from the irreversible Submit boundary.",
                EVIDENCE / "guide-mobile-move99-open.png",
                None,
                "Every eBay Submit requires separate action-time approval for the exact reviewed batch.",
                status="SAFETY PASS",
            ),
            6.0,
        ),
    ]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(
        OUTPUT,
        fps=12,
        codec="libx264",
        quality=8,
        pixelformat="yuv420p",
        macro_block_size=1,
    ) as writer:
        for frame, seconds in slides:
            live_proof.append_seconds(writer, frame, seconds, 12)
    print(OUTPUT)


if __name__ == "__main__":
    main()
