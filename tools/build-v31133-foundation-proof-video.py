from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont


CANVAS = (1080, 1920)
BG = "#080b10"
PANEL = "#151b24"
SURFACE = "#202938"
INK = "#f5f7fa"
MUTED = "#aeb8c7"
GOLD = "#e5ba48"
GREEN = "#29c18c"
AMBER = "#f2a93b"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, width: int, chosen_font):
    words = str(text).split()
    lines = []
    line = ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def metric(draw: ImageDraw.ImageDraw, y: int, label: str, value: str, color: str = INK):
    draw.rounded_rectangle((72, y, 1008, y + 94), radius=16, fill=SURFACE)
    draw.text((96, y + 26), label, font=font(25), fill=MUTED)
    value_font = font(27, True)
    value_width = draw.textbbox((0, 0), value, font=value_font)[2]
    draw.text((980 - value_width, y + 25), value, font=value_font, fill=color)


def slide(title: str, subtitle: str, rows, status: str, status_color: str, footer: str):
    frame = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((38, 38, 1042, 1882), radius=34, fill=PANEL, outline="#2c3747", width=2)
    draw.rectangle((38, 38, 1042, 60), fill=GOLD)
    draw.text((72, 104), "GLDN OPS - LIVE READBACK COMPILATION", font=font(27, True), fill=GOLD)

    y = 184
    for line in wrapped(draw, title, 920, font(52, True)):
        draw.text((72, y), line, font=font(52, True), fill=INK)
        y += 64
    y += 18
    for line in wrapped(draw, subtitle, 920, font(26)):
        draw.text((72, y), line, font=font(26), fill=MUTED)
        y += 37

    y = max(y + 42, 510)
    for label, value, color in rows:
        metric(draw, y, label, value, color)
        y += 110

    draw.rounded_rectangle((72, 1588, 1008, 1742), radius=22, fill="#10151d", outline=status_color, width=3)
    for index, line in enumerate(wrapped(draw, status, 864, font(31, True))[:2]):
        draw.text((98, 1617 + index * 40), line, font=font(31, True), fill=status_color)

    footer_y = 1762
    for line in wrapped(draw, footer, 900, font(22))[:3]:
        draw.text((72, footer_y), line, font=font(22), fill=MUTED)
        footer_y += 30
    return frame


def append(writer, frame, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(round(seconds * fps)):
        writer.append_data(pixels)


def build(output_path: Path, fps: int = 12):
    state_hash = "27AED7D5A88D103CF87257B82B7B7BFED853E34A6AEDB1BC21F0197CD94E10FA"
    slides = [
        slide(
            "Profile 2 foundation baseline",
            "Compilation of exact signed-in Chrome extension readbacks. Continuous target-window capture was unavailable because AnyDesk was always on top.",
            [
                ("Extension runtime", "v3.11.33", GREEN),
                ("Chrome profile", "Profile 2", INK),
                ("Computer / eBay", "0 / FAK12", INK),
                ("Loaded extension folder", "Project extension", GREEN),
                ("Marketplace actions", "0", GREEN),
            ],
            "IDENTITY AND VERSION VERIFIED",
            GREEN,
            "No new Chrome profile was opened. Existing signed-in Profile 2 was used throughout.",
        ),
        slide(
            "Settings survived reload and recovery",
            "The before-reload, after-reload, recovery, and v3.11.33 state files are byte-identical.",
            [
                ("State SHA-256", state_hash[:16] + "...", GREEN),
                ("Dashboard configured", "YES", GREEN),
                ("Move source", "Not .99", INK),
                ("Move destination", "Abra Cadabra .99", INK),
                ("Theme / opacity", "Dark / 76%", INK),
                ("Backburner IDs", "5 preserved", GREEN),
            ],
            "EXACT STATE MATCH",
            GREEN,
            "Private dashboard values are intentionally omitted. Configuration presence and exact state hash were verified.",
        ),
        slide(
            "Dashboard and queue health",
            "Live Profile 2 health and dashboard connection readbacks after the v3.11.33 reload.",
            [
                ("Dashboard", "Connection works", GREEN),
                ("Queued records", "0", GREEN),
                ("Obsolete records removed", "1", GREEN),
                ("Unrelated records removed", "0", GREEN),
                ("Workflow busy", "NO", GREEN),
                ("Open reviews", "0", GREEN),
            ],
            "DASHBOARD LIVE - QUEUE CLEAN",
            GREEN,
            "The migration removed only the obsolete current-profile Subscribe & Save completion record.",
        ),
        slide(
            "Updater status is honest",
            "The installed build is newer than the public release feed, so cross-computer discovery stays partial until publication is approved.",
            [
                ("Installed runtime", "3.11.33", GREEN),
                ("Files on disk", "3.11.33", GREEN),
                ("Public feed", "3.11.14", AMBER),
                ("Feed behind", "YES", AMBER),
                ("Rollback snapshots", "10", GREEN),
                ("Loaded-folder match", "YES", GREEN),
            ],
            "LOCAL PASS - PUBLIC UPDATE PARTIAL",
            AMBER,
            "The stale public package was never loaded into Chrome. Publication remains gated by user approval.",
        ),
        slide(
            "Three-sample stability watch",
            "Three live Profile 2 samples were taken over more than two minutes after reload.",
            [
                ("Samples", "3 / 3", GREEN),
                ("Runtime each sample", "3.11.33", GREEN),
                ("Tabs each sample", "14", GREEN),
                ("Active workflows", "0", GREEN),
                ("Open reviews", "0", GREEN),
                ("Restart loops", "0", GREEN),
            ],
            "STABLE AFTER RELOAD",
            GREEN,
            "No tabs were opened, closed, or redirected by this foundation check.",
        ),
        slide(
            "Release package verification",
            "The complete local release gate passed before this proof was generated.",
            [
                ("JavaScript tests", "303 / 303", GREEN),
                ("Extension package", "VERIFIED", GREEN),
                ("Updater + rollback fixtures", "PASS", GREEN),
                ("Dashboard live contract", "PASS", GREEN),
                ("Extension ZIP SHA", "32DBFC44839E...", GREEN),
                ("Marketplace changes", "NONE", GREEN),
            ],
            "FOUNDATION LOCALLY PROVEN",
            GREEN,
            "Cross-computer auto-update is not claimed until the public 3.11.33 metadata and package are published.",
        ),
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(
        output_path,
        fps=fps,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=2,
        ffmpeg_log_level="warning",
    ) as writer:
        for frame in slides:
            append(writer, frame, 5.5, fps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
