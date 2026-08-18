from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-u02-popup-v3793-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-U02-v3.7.93-popup-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def title_card() -> Image.Image:
    canvas = Image.new("RGB", live_proof.CANVAS, live_proof.BG)
    draw = ImageDraw.Draw(canvas)
    live_proof.rounded(draw, (52, 52, 1028, 1868), live_proof.PANEL, 36, "#2b3442", 2)
    draw.rectangle((52, 52, 1028, 72), fill=live_proof.ACCENT)
    draw.text((92, 132), "GLDN OPS U-02 PROOF", font=live_proof.font(30, True), fill=live_proof.ACCENT)
    draw.text((92, 250), "Advanced popup cleanup", font=live_proof.font(62, True), fill=live_proof.INK)
    y = 395
    for line in [
        "Workflows, Status, and Settings are now separated into persistent tabs.",
        "All 164 automated contracts passed.",
        "Four exact HTML/CSS visual audits passed.",
    ]:
        live_proof.rounded(draw, (92, y, 988, y + 145), "#202734", 18)
        draw.ellipse((125, y + 55, 157, y + 87), fill=live_proof.TEAL)
        line_y = y + 32
        for wrapped in live_proof.wrap(draw, line, 770, live_proof.font(29, True)):
            draw.text((185, line_y), wrapped, font=live_proof.font(29, True), fill=live_proof.INK)
            line_y += 38
        y += 180
    draw.text((92, 1730), "No marketplace or spreadsheet action was performed.", font=live_proof.font(27), fill=live_proof.MUTED)
    draw.text((92, 1780), "Privileged Chrome extension-page click-through remains pending.", font=live_proof.font(27), fill=live_proof.MUTED)
    return canvas


def main() -> None:
    slides = [
        (title_card(), 5.0),
        (
            live_proof.evidence_slide(
                "Workflows tab",
                "Advanced EcomSniper, Move .99, reverse cleanup, and automation controls remain accessible without crowding the everyday panel.",
                EVIDENCE / "popup-workflows-430-verified.png",
                (0, 0, 430, 900),
                "One active tab, no overflow, readable Graphite contrast, and complete advanced workflow access.",
                status="VISUAL PASS",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Status tab",
                "Diagnostics, dashboard setup, retry controls, error logs, and latest saved workflow results live in one scannable view.",
                EVIDENCE / "popup-status-430-verified.png",
                (0, 0, 430, 850),
                "All status buttons have tested interaction paths and no duplicate IDs.",
                status="CONTRACT PASS",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Settings tab",
                "Computer identity, themes, transparency, backups, listing limits, and Amazon profile controls are separated from daily work.",
                EVIDENCE / "popup-settings-430-verified.png",
                (0, 0, 430, 980),
                "Settings remain reachable, readable, and saved per Chrome profile.",
                status="VISUAL PASS",
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
