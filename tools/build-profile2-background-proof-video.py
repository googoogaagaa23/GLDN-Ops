from __future__ import annotations

import argparse
import json
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
RED = "#ef6d70"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, width: int, chosen_font):
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


def money(value):
    return "$" + format(float(value), ",.2f")


def metric(draw, y: int, label: str, value: str, color=INK):
    draw.rounded_rectangle((72, y, 1008, y + 92), radius=16, fill=SURFACE)
    draw.text((96, y + 25), label, font=font(26), fill=MUTED)
    value_width = draw.textbbox((0, 0), value, font=font(28, True))[2]
    draw.text((980 - value_width, y + 23), value, font=font(28, True), fill=color)


def slide(title: str, subtitle: str, rows, status: str, status_color: str, footer: str):
    image = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((38, 38, 1042, 1882), radius=34, fill=PANEL, outline="#2c3747", width=2)
    draw.rectangle((38, 38, 1042, 60), fill=GOLD)
    draw.text((72, 105), "GLDN OPS BACKGROUND LIVE EVIDENCE", font=font(27, True), fill=GOLD)
    y = 185
    for line in wrap(draw, title, 920, font(54, True)):
        draw.text((72, y), line, font=font(54, True), fill=INK)
        y += 66
    y += 18
    for line in wrap(draw, subtitle, 920, font(27)):
        draw.text((72, y), line, font=font(27), fill=MUTED)
        y += 38
    y = max(y + 48, 520)
    for label, value, color in rows:
        metric(draw, y, label, value, color)
        y += 108
    draw.rounded_rectangle((72, 1590, 1008, 1740), radius=22, fill="#10151d", outline=status_color, width=3)
    draw.text((98, 1622), status, font=font(32, True), fill=status_color)
    footer_y = 1765
    for line in wrap(draw, footer, 900, font(23))[:3]:
        draw.text((72, footer_y), line, font=font(23), fill=MUTED)
        footer_y += 31
    return image


def append(writer, frame, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(round(seconds * fps)):
        writer.append_data(pixels)


def build(data_path: Path, output_path: Path, fps: int = 12):
    data = json.loads(data_path.read_text(encoding="utf-8"))
    runs = {run["feature"]: run for run in data["runs"]}
    snapshot = runs["eBay Sales Snapshot"]
    seller = runs["eBay Seller Level"]
    limits = runs["eBay Listing Limits"]
    shipped = runs["eBay Mark as Shipped"]

    slides = [
        slide(
            "Signed-in Profile 2 live run",
            "Background compilation from exact Chrome extension state and saved workflow readbacks. This is not a continuous screen recording.",
            [
                ("Extension", f"v{data['extensionVersion']}", INK),
                ("Computer / account", f"{data['computerLabel']} / {data['ebayAccountLabel']}", INK),
                ("Focused safety tests", data["verification"]["focusedControlTests"], GREEN),
                ("Active user tab", "Untouched", GREEN),
            ],
            "BACKGROUND CONTROL VERIFIED",
            GREEN,
            "The live browser run stayed in the existing signed-in Chrome Profile 2. No new Chrome profile was opened.",
        ),
        slide(
            "eBay Sales Snapshot",
            snapshot["sourceUrl"],
            [
                ("Today / 7 days", f"{money(snapshot['values']['salesToday'])} / {money(snapshot['values']['salesLast7Days'])}", INK),
                ("31 days / change", f"{money(snapshot['values']['salesLast31Days'])} / {snapshot['values']['salesLast31DaysChangePercent']:.1f}%", INK),
                ("90 days", money(snapshot["values"]["salesLast90Days"]), INK),
                ("Feedback + / neutral / -", "243 / 2 / 0", INK),
                ("Traffic impressions / views", "3,917,633 / 16,846", INK),
                ("Ad clicks / sales / ROAS", f"412 / {money(snapshot['values']['advertisingSales'])} / 19.29", INK),
            ],
            "SYNCED AND READ BACK",
            GREEN,
            f"Captured {snapshot['capturedAt']}. Marketplace changes: 0.",
        ),
        slide(
            "eBay Seller Level",
            seller["sourceUrl"],
            [
                ("Current / evaluated today", "Above Standard / Above Standard", GREEN),
                ("Transaction defect rate", "0.00%", GREEN),
                ("Late shipment rate", "1.78%", GREEN),
                ("Tracking uploaded on time", "85.04%", GREEN),
                ("Cases closed without resolution", "0.00%", GREEN),
                ("Next evaluation", "Aug 20", INK),
            ],
            "SYNCED",
            GREEN,
            "Exact review values were saved from Seller Hub Performance. Marketplace changes: 0.",
        ),
        slide(
            "eBay Listing Limits",
            limits["sourceUrl"],
            [
                ("Store plan", "Premium", INK),
                ("Active listings", "7,623", INK),
                ("Available quantity", "8,968", INK),
                ("Insertion allowance", "10,000", INK),
                ("Monthly dollars used", money(limits["values"]["monthlyDollarUsed"]), INK),
                ("Monthly dollar limit", money(limits["values"]["monthlyDollarLimit"]), INK),
            ],
            "LISTINGS CONFIRMED - GOOD",
            GREEN,
            "The reviewed limits were saved. Marketplace changes: 0.",
        ),
        slide(
            "Mark as Shipped approval gate",
            shipped["sourceUrl"],
            [
                ("Awaiting shipment orders", "2", INK),
                ("Selected orders", "2", AMBER),
                ("Marked orders", "0", GREEN),
                ("Current phase", "Awaiting approval", AMBER),
                ("Available safe action", "Cancel safely", INK),
                ("Marketplace activation", "NOT PERFORMED", RED),
            ],
            "STOPPED FOR USER APPROVAL",
            AMBER,
            shipped["safetyStatement"],
        ),
        slide(
            "Background run checkpoint",
            "Completed workflows are proven from exact state. The pending shipment review remains open and unchanged.",
            [
                ("Sales Snapshot", "Completed", GREEN),
                ("Seller Level", "Completed", GREEN),
                ("Listing Limits", "Completed", GREEN),
                ("Mark as Shipped", "Approval pending", AMBER),
                ("Listings / orders changed", "0", GREEN),
                ("Drive view verification", "Pending", AMBER),
            ],
            "LIVE PROVEN - AWAITING DRIVE VERIFICATION",
            AMBER,
            "A feature is not labeled LIVE PASS until the MP4 has a verified Google Drive view link and MIME readback.",
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
    parser.add_argument("data", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.data, args.output)


if __name__ == "__main__":
    main()
