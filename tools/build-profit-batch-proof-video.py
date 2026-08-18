from __future__ import annotations

import argparse
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


CANVAS = (1080, 1920)
BG = "#090d12"
PANEL = "#151b23"
INK = "#f7f9fc"
MUTED = "#aeb9c8"
GOLD = "#e6ba45"
GREEN = "#2cc68f"
RED = "#ef6d78"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def rounded(draw: ImageDraw.ImageDraw, box, fill, radius=22, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw: ImageDraw.ImageDraw, text: str, max_width: int, chosen_font):
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=chosen_font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def contain(image: Image.Image, box):
    x1, y1, x2, y2 = box
    fitted = ImageOps.contain(image, (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    return fitted, (
        x1 + ((x2 - x1) - fitted.width) // 2,
        y1 + ((y2 - y1) - fitted.height) // 2,
    )


def title_card(title: str, subtitle: str, lines: list[str], accent: str = GOLD) -> Image.Image:
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (48, 48, 1032, 1872), PANEL, 34, "#2d3745", 2)
    draw.rectangle((48, 48, 1032, 70), fill=accent)
    draw.text((88, 126), "GLDN OPS LIVE PROOF", font=font(30, True), fill=accent)
    y = 245
    for row in wrap(draw, title, 890, font(62, True)):
        draw.text((88, y), row, font=font(62, True), fill=INK)
        y += 78
    y += 25
    for row in wrap(draw, subtitle, 890, font(33)):
        draw.text((88, y), row, font=font(33), fill=MUTED)
        y += 46
    y = max(760, y + 70)
    for line in lines:
        rounded(draw, (88, y, 992, y + 125), "#202936", 18)
        draw.ellipse((122, y + 42, 154, y + 74), fill=accent)
        for index, row in enumerate(wrap(draw, line, 790, font(29, True))[:2]):
            draw.text((180, y + 28 + index * 37), row, font=font(29, True), fill=INK)
        y += 148
    draw.text((88, 1785), "Signed-in Chrome Profile 2 | GLDN Ops v3.7.23", font=font(26), fill=MUTED)
    return canvas


def proof_slide(
    heading: str,
    subtitle: str,
    screenshot_path: Path,
    crop: tuple[int, int, int, int],
    result: str,
    label: str,
    color: str = GREEN,
) -> Image.Image:
    source = load(screenshot_path)
    canvas = Image.new("RGB", CANVAS, BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((52, 48), heading, font=font(42, True), fill=INK)
    y = 110
    for row in wrap(draw, subtitle, 970, font(25))[:3]:
        draw.text((52, y), row, font=font(25), fill=MUTED)
        y += 34

    rounded(draw, (45, 225, 1035, 865), PANEL, 24, "#2d3745", 2)
    full, full_pos = contain(source, (64, 244, 1016, 846))
    canvas.paste(full, full_pos)

    rounded(draw, (45, 905, 1035, 1510), PANEL, 24, GOLD, 3)
    detail, detail_pos = contain(source.crop(crop), (65, 925, 1015, 1490))
    canvas.paste(detail, detail_pos)

    rounded(draw, (45, 1548, 1035, 1815), "#202936", 24)
    rounded(draw, (74, 1578, 300, 1642), color, 17)
    draw.text((98, 1593), label, font=font(25, True), fill="#07100d")
    result_y = 1670
    for row in wrap(draw, result, 900, font(29, True))[:3]:
        draw.text((74, result_y), row, font=font(29, True), fill=INK)
        result_y += 38
    draw.text((52, 1862), "No eBay Save, note edit, listing change, purchase, or submission.", font=font(22), fill=MUTED)
    return canvas


def append_seconds(writer, frame: Image.Image, seconds: float, fps: int):
    pixels = np.asarray(frame)
    for _ in range(max(1, round(seconds * fps))):
        writer.append_data(pixels)


def build(evidence_dir: Path, output: Path, fps: int):
    tests = [
        {
            "number": "Test 1",
            "ebay": "11-14822-07580",
            "amazon": "113-2067732-0272225",
            "asin": "B002MKFRQI",
            "values": "eBay earnings $55.49 - Amazon order cost $39.99 = $15.50 profit (27.9%)",
            "amazon_image": "01-amazon-review-order-113-2067732-0272225.png",
            "ebay_image": "02-ebay-review-order-11-14822-07580.png",
            "done_image": "03-ebay-refreshed-order-11-14822-07580.png",
        },
        {
            "number": "Test 2",
            "ebay": "26-14785-03928",
            "amazon": "113-6096105-3783466",
            "asin": "B0C6D8FL35",
            "values": "eBay earnings $33.24 - Amazon order cost $25.99 = $7.25 profit (21.8%)",
            "amazon_image": "04-amazon-review-order-113-6096105-3783466.png",
            "ebay_image": "05-ebay-review-order-26-14785-03928.png",
            "done_image": "06-ebay-refreshed-order-26-14785-03928.png",
        },
        {
            "number": "Test 3",
            "ebay": "08-14838-47714",
            "amazon": "113-8761623-3960255",
            "asin": "B08R5QPHS6",
            "values": "eBay earnings $13.03 - Amazon order cost $6.29 = $6.74 profit (51.7%)",
            "amazon_image": "07-amazon-review-order-113-8761623-3960255.png",
            "ebay_image": "08-ebay-review-order-08-14838-47714.png",
            "done_image": "09-ebay-refreshed-order-08-14838-47714.png",
        },
    ]

    slides: list[tuple[Image.Image, float]] = [
        (
            title_card(
                "Three more exact profit tests",
                "Every successful row used the signed-in Amazon order details, the matching eBay saved note, and refresh-only dashboard sync.",
                [
                    "3 exact matches passed end to end",
                    "4 unsafe candidates were rejected without changes",
                    "Each pass appears once in both profit sheets",
                ],
            ),
            5.5,
        )
    ]

    for test in tests:
        slides.extend(
            [
                (
                    proof_slide(
                        f"{test['number']} | Amazon source",
                        f"Exact ASIN {test['asin']} and Amazon order {test['amazon']} were verified before copy.",
                        evidence_dir / test["amazon_image"],
                        (430, 145, 1050, 760),
                        f"Amazon total and delivery date match eBay order {test['ebay']}.",
                        "EXACT SOURCE",
                    ),
                    5.5,
                ),
                (
                    proof_slide(
                        f"{test['number']} | eBay review",
                        "The existing saved note matched the copied Amazon evidence. Only Refresh Profit Row was offered.",
                        evidence_dir / test["ebay_image"],
                        (420, 110, 1080, 765),
                        test["values"],
                        "REFRESH ONLY",
                    ),
                    5.5,
                ),
                (
                    proof_slide(
                        f"{test['number']} | completed",
                        "The modal closed and GLDN Ops confirmed that the matching saved note refreshed the profit row.",
                        evidence_dir / test["done_image"],
                        (185, 95, 660, 760),
                        f"eBay {test['ebay']} synced without editing the marketplace note.",
                        "LIVE PASS",
                    ),
                    5.0,
                ),
            ]
        )

    slides.extend(
        [
            (
                title_card(
                    "Guardrails rejected bad data",
                    "Candidates were skipped whenever Amazon evidence or the saved eBay note was not an exact refresh-only match.",
                    [
                        "2 delivery-date mismatches rejected",
                        "1 ASIN with no exact Amazon order rejected",
                        "1 legacy note needing an edit rejected",
                    ],
                    accent=RED,
                ),
                6.0,
            ),
            (
                title_card(
                    "Google Sheet readback passed",
                    "The live sheet returned exactly one matching row per order in Marketplace Profit History and Profit - 0.",
                    [
                        "Rows 34 / 3: $15.50 profit, 27.9%",
                        "Rows 35 / 4: $7.25 profit, 21.8%",
                        "Rows 36 / 5: $6.74 profit, 51.7%",
                    ],
                ),
                7.0,
            ),
            (
                title_card(
                    "Batch proof complete",
                    "All three new tests passed in the same signed-in Profile 2 session. Unsafe records remained untouched.",
                    [
                        "3 browser passes",
                        "6 exact sheet rows",
                        "0 eBay note or listing changes",
                    ],
                    accent=GREEN,
                ),
                5.5,
            ),
        ]
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(
        output,
        fps=fps,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=2,
        ffmpeg_log_level="warning",
    ) as writer:
        for frame, seconds in slides:
            append_seconds(writer, frame, seconds, fps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=int, default=12)
    args = parser.parse_args()
    build(args.evidence_dir, args.output, args.fps)


if __name__ == "__main__":
    main()
