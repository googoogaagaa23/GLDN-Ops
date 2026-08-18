from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-t04-stale-alerts-v3791-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-T04-v3.7.91-live-stale-alerts-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "T-04 stale task warnings",
                "Production Apps Script v3.7.91 was deployed and verified against the live TASKS - EBAY & POSH workbook.",
                [
                    "156 automated contracts passed",
                    "Temporary live probe deleted itself",
                    "Zero marketplace actions",
                ],
            ),
            4.5,
        ),
        (
            live_proof.evidence_slide(
                "Live Tasks sheet verified",
                "Fresh daily tasks stayed clear while the saved July 2 sniping record produced the correct red reminder.",
                EVIDENCE / "01-live-tasks-stale-results.png",
                (595, 600, 1348, 942),
                "Last Sniped: M1 | NEED TO SNIPE | original timestamp preserved",
                status="LIVE PASS",
            ),
            7.0,
        ),
        (
            live_proof.title_card(
                "Exact boundaries passed",
                "The authenticated temporary-sheet probe exercised the same production functions and removed its test tab.",
                [
                    "Daily: clear at 3 days, warn only above 3",
                    "Sniping: clear at 5 days, warn only above 5",
                    "Checked tasks always remain clear",
                ],
            ),
            5.5,
        ),
        (
            live_proof.title_card(
                "Automatic month-end reminder",
                "Subscribe & Save keeps a live formula and begins showing CHECK one calendar day before month end.",
                [
                    "Formula preserved in Tasks L37",
                    "No stale temporary tabs remained",
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
