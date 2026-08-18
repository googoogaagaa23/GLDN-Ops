from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-f10-tasks-schema-v3799-2026-07-22"
OUTPUT = EVIDENCE / "GLDN-F10-v3.7.99-live-tasks-schema-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "F-10 Tasks schema safety",
                "Production read-only audit of the shared Tasks sheet on July 22, 2026.",
                [
                    "Apps Script deployment 33",
                    "Zero spreadsheet writes",
                    "Zero marketplace actions",
                ],
            ),
            5.0,
        ),
        (
            live_proof.title_card(
                "Computer columns matched exactly",
                "Each header appeared once in the fixed Tasks computer block.",
                [
                    "M0 = E | 2 = F | 6 = G",
                    "0 = H | M1 = I | 7 = J",
                    "No missing or duplicate computer headers",
                ],
            ),
            5.5,
        ),
        (
            live_proof.evidence_slide(
                "Live Tasks tab",
                "The signed-in Profile 2 sheet shows the exact headers and label-driven task layout audited by production.",
                EVIDENCE / "01-live-tasks-sheet.png",
                (40, 130, 1325, 990),
                "Metrics 15-19 | Limits 20-22 | Mark Shipped 10 | Move .99 33",
                status="LIVE",
            ),
            7.0,
        ),
        (
            live_proof.title_card(
                "All required task labels were unique",
                "The live report found one row for every automated or monitored Tasks target.",
                [
                    "Daily stale checks 25-27 | Sniping 28",
                    "Subscribe & Save 37 | Sheet 78 x 27",
                    "Audit errors: 0",
                ],
            ),
            5.5,
        ),
        (
            live_proof.title_card(
                "F-10 live gate passed",
                "Row moves remain safe because writes resolve unique labels and fail closed on schema drift.",
                [
                    "Every Tasks write path runs schema preflight",
                    "Missing or duplicate targets stop the write",
                    "Read-only production audit changed nothing",
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
