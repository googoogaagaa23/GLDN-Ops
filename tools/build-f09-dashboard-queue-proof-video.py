from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-f09-dashboard-queue-v3799-2026-07-22"
OUTPUT = EVIDENCE / "GLDN-F09-v3.7.99-Profile2-live-queue-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "F-09 dashboard queue recovery",
                "Live proof compilation from signed-in Chrome Profile 2 on July 22, 2026.",
                [
                    "GLDN Ops v3.7.99 | Computer 0 | FAK12",
                    "Controlled timeout and harmless dashboard ping",
                    "Zero marketplace actions and zero dashboard mutations",
                ],
            ),
            5.0,
        ),
        (
            live_proof.evidence_slide(
                "Exact signed-in release identity",
                "The tested eBay Seller Hub page and GLDN Ops panel show the current release and account.",
                EVIDENCE / "01-profile2-ebay-v3799.png",
                (625, 285, 890, 720),
                "Profile 2 | v3.7.99 | Computer 0 | FAK12",
                status="LIVE",
            ),
            5.5,
        ),
        (
            live_proof.evidence_slide(
                "Timeout, de-duplication, and retry passed",
                "The production queue probe displayed its exact counts only after every assertion passed.",
                EVIDENCE / "02-f09-live-queue-pass.png",
                (625, 300, 890, 720),
                "1 queued | 1 after duplicate | 1 retried | 0 remaining",
                status="PASS",
            ),
            7.0,
        ),
        (
            live_proof.evidence_slide(
                "Independent health readback",
                "After the probe, Feature Health Check independently confirmed the queue and dashboard state.",
                EVIDENCE / "03-health-queue-zero.png",
                (625, 300, 890, 720),
                "v3.7.99 | Computer 0 | FAK12 | schema 2/2 | queue 0 | dashboard OK",
                status="PASS",
            ),
            7.0,
        ),
        (
            live_proof.title_card(
                "F-09 live gate passed",
                "The queued ping survived timeout, duplicate enqueue, and same-ID retry without leaving residue.",
                [
                    "One queue entry after both enqueue attempts",
                    "One successful retry and zero remaining",
                    "No marketplace or spreadsheet data changed",
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
