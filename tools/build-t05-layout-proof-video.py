from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-t05-layout-audit-v3791-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-T05-v3.7.91-live-layout-audit-proof.mp4"
SOURCE = ROOT / "evidence" / "profile2-t04-stale-alerts-v3791-2026-07-21" / "01-live-tasks-stale-results.png"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "T-05 Tasks layout audit",
                "The live Tasks workbook was inspected read-only. No rows, formulas, checkboxes, or marketplace data were changed.",
                [
                    "One operational Tasks tab preserved",
                    "Computer headers: M0, 2, 6, 0, M1, 7",
                    "Automation uses label-based row lookup",
                ],
            ),
            5.0,
        ),
        (
            live_proof.evidence_slide(
                "One label needs review",
                "The row is in the requested location directly below Snipe Items, but its text does not match the user's requested name.",
                SOURCE,
                (40, 560, 1348, 810),
                "Requested: 2nd Round of Placing Orders | Current: 2nd Round Checks of All Above",
                status="PENDING REVIEW",
            ),
            8.0,
        ),
        (
            live_proof.title_card(
                "T-05 left unchanged",
                "The mismatch was documented instead of silently editing the production workbook while review was unavailable.",
                [
                    "Sheet writes: 0",
                    "Marketplace actions: 0",
                    "Next: approve the one text rename",
                ],
            ),
            5.0,
        ),
    ]

    EVIDENCE.mkdir(parents=True, exist_ok=True)
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
