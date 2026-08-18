from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-t03-metric-boundaries-v3790-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-T03-v3.7.90-live-metric-boundaries-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "T-03 Tasks metric boundaries",
                "Production Apps Script v3.7.90 was deployed and verified against the live TASKS - EBAY & POSH workbook.",
                [
                    "150 automated contracts passed",
                    "Temporary live probe deleted itself",
                    "Zero marketplace actions",
                ],
            ),
            4.5,
        ),
        (
            live_proof.evidence_slide(
                "Live Tasks sheet corrected",
                "The production refresh used the current values in Tasks rows 16-19 and preserved their notes and checkboxes.",
                EVIDENCE / "01-live-tasks-metric-results.png",
                (330, 430, 1170, 585),
                "Late: orange above 1.5%, red at 3%+ | Tracking: orange only below 85% | CHECK labels match the computers",
                status="LIVE PASS",
            ),
            7.0,
        ),
        (
            live_proof.title_card(
                "Production readback matched",
                "The authenticated temporary-sheet probe exercised the same live formatting code and removed its test tab in finally.",
                [
                    "Late 1.50 clear, 1.90 orange, 3.00 red",
                    "Tracking 84.99 orange, 85.00 clear",
                    "Defect and cases red only above 0",
                ],
            ),
            5.5,
        ),
        (
            live_proof.title_card(
                "T-03 live gate passed",
                "Google Sheets metadata confirmed no _GLDN_T03 temporary tabs remained after the probe.",
                [
                    "Tasks values remained unchanged",
                    "Conditional-format rules now match the requested thresholds",
                    "No listing, order, shipment, or purchase action ran",
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
