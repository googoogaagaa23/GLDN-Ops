from __future__ import annotations

import importlib.util
from pathlib import Path

import imageio.v2 as imageio


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "profile2-t06-auto-completion-v3792-2026-07-21"
OUTPUT = EVIDENCE / "GLDN-T06-v3.7.92-live-auto-completion-proof.mp4"

spec = importlib.util.spec_from_file_location("live_proof", ROOT / "tools" / "build-live-proof-video.py")
live_proof = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(live_proof)


def main() -> None:
    slides = [
        (
            live_proof.title_card(
                "T-06 strict task completion",
                "Production Apps Script deployment 31 was tested with the same task-writing function used by the extension.",
                [
                    "160 automated contracts passed",
                    "1 exact completion accepted",
                    "8 unsafe or manual states rejected",
                ],
            ),
            5.0,
        ),
        (
            live_proof.title_card(
                "Only exact Move .99 completion counts",
                "The task can be checked only after Completed status and a final verification scan proves zero remaining and zero failed listings.",
                [
                    "Review-ready and partial batches rejected",
                    "Reverse cleanup rejected",
                    "Bulk, sniping, and second round rejected",
                ],
            ),
            6.0,
        ),
        (
            live_proof.title_card(
                "Computer boundary verified",
                "The hidden live fixture used the production Tasks layout and computer headers.",
                [
                    "Only computer 0 was checked",
                    "Other eBay computers stayed unchecked",
                    "Poshmark-only stayed grey and empty",
                ],
            ),
            5.5,
        ),
        (
            live_proof.title_card(
                "Clean live result",
                "The temporary sheet was deleted in finally. Existing production task rows were not changed during this proof.",
                [
                    "Temporary sheet deleted",
                    "Marketplace actions: 0",
                    "Production deployment: 31",
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
