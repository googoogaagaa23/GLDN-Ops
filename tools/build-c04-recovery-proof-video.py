from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-c04-recovery-v3789-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-C04-v3.7.89-Profile2-live-recovery-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "C-04 EcomSniper failure recovery",
                "Fresh live proof compilation from signed-in Chrome Profile 2 on July 21, 2026.",
                [
                    "GLDN Ops v3.7.89",
                    "Production timeout-recovery path",
                    "Zero marketplace actions",
                ],
            ),
            4.5,
        ),
        (
            live_proof.evidence_slide(
                "Real eBay and EcomSniper context",
                "The harmless eBay query loaded with EcomSniper's real Extract Sellers control visible at 1,607 total.",
                EVIDENCE / "03-final-page-button-present.png",
                (220, 205, 615, 390),
                "Profile 2 | FAK12 | v3.7.89 | Extract Sellers present | no click performed",
                status="LIVE",
            ),
            6.0,
        ),
        (
            live_proof.evidence_slide(
                "Timeout stopped safely",
                "The guarded probe created an expired checkpoint and called the normal production recovery function.",
                EVIDENCE / "04-final-storage-verified-safe-stop.png",
                (245, 235, 520, 655),
                "Both pending checkpoints cleared, Chrome storage readback verified, marketplace actions: 0",
                status="PASS",
            ),
            7.0,
        ),
        (
            live_proof.title_card(
                "C-04 live gate passed",
                "The failure path stopped before button lookup or click and preserved marketplace state.",
                [
                    "Timeout recovery confirmed",
                    "Storage result confirmed",
                    "No seller, listing, order, or EcomSniper data changed",
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
