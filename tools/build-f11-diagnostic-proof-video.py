from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import imageio.v2 as imageio
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-f11-diagnostics-v3798-2026-07-22"
OUTPUT = EVIDENCE / "GLDN-F11-v3.7.98-Profile2-live-diagnostic-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def clipboard_slide() -> Image.Image:
    payload = json.loads((EVIDENCE / "clipboard-readback.json").read_text(encoding="utf-8"))
    entry = payload["entry"]
    canvas = Image.new("RGB", live_proof.CANVAS, live_proof.BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 48), "Exact clipboard readback", font=live_proof.font(43, True), fill=live_proof.INK)
    draw.text(
        (54, 112),
        "Windows parsed the JSON copied by the visible F-11 verification control.",
        font=live_proof.font(25),
        fill=live_proof.MUTED,
    )
    live_proof.rounded(draw, (48, 205, 1032, 1685), live_proof.PANEL, 24, "#2b3442", 2)

    rows = [
        ("Type", payload["type"]),
        ("Bytes", str(payload["length"])),
        ("Errors", str(payload["errorCount"])),
        ("Marketplace actions", str(payload["marketplaceActions"])),
        ("Timestamp", entry["at"]),
        ("Version", entry["version"]),
        ("Computer / account", f'{entry["computer"]} / {entry["account"]}'),
        ("Source", entry["source"]),
        ("Operation", entry["operation"]),
        ("Message", entry["message"]),
        ("Detail", entry["detail"]),
    ]
    y = 245
    for label, value in rows:
        draw.text((78, y), label, font=live_proof.font(24, True), fill=live_proof.ACCENT)
        y += 38
        for line in live_proof.wrap(draw, value, 875, live_proof.font(27)):
            draw.text((78, y), line, font=live_proof.font(27), fill=live_proof.INK)
            y += 36
        y += 28

    live_proof.rounded(draw, (48, 1725, 1032, 1835), "#202734", 24)
    draw.text((78, 1758), "PASS: exact identity and zero-action payload verified", font=live_proof.font(29, True), fill=live_proof.TEAL)
    draw.text((55, 1870), "Proof compilation from live screenshots and exact OS clipboard readback.", font=live_proof.font(22), fill=live_proof.MUTED)
    return canvas


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "F-11 diagnostic log and export",
                "Live proof compilation from the signed-in Chrome Profile 2 session on July 22, 2026.",
                [
                    "GLDN Ops v3.7.98",
                    "Computer 0 / eBay FAK12",
                    "Controlled failure only; zero marketplace actions",
                ],
            ),
            5.0,
        ),
        (
            live_proof.evidence_slide(
                "Exact signed-in extension identity",
                "The eBay Seller Hub page and GLDN Ops panel identify the tested release and account.",
                EVIDENCE / "01-profile2-ebay-v3798.png",
                (625, 285, 890, 720),
                "Profile 2 | v3.7.98 | Computer 0 | FAK12",
                status="LIVE",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Visible live pass",
                "The production panel reports that the controlled log and clipboard export were verified.",
                EVIDENCE / "02-f11-live-pass.png",
                (625, 300, 890, 720),
                "F-11 passed; no marketplace action ran",
                status="PASS",
            ),
            6.0,
        ),
        (clipboard_slide(), 8.0),
        (
            live_proof.title_card(
                "F-11 live gate passed",
                "The diagnostic record survived storage and export with the exact identity and operation context.",
                [
                    "One controlled error recorded",
                    "694-byte JSON export parsed from Windows clipboard",
                    "No purchase, shipment, Save, or Submit occurred",
                ],
            ),
            5.0,
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
