from io import BytesIO
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
NS = "http://www.w3.org/2000/svg"
MASK = (
    "M230 0H794C944 0 1024 80 1024 230V794"
    "C1024 944 944 1024 794 1024H230"
    "C80 1024 0 944 0 794V230C0 80 80 0 230 0Z"
)
CONCEPTS = {
    "portal-rise": {
        "idea": "A generous tunnel arch and a straight road that becomes an upward arrow.",
        "background": ("#391321", "#24101a"),
        "layers": [
            (
                "01-portal",
                "#f0426a",
                "M232 800V470C232 300 347 192 512 192"
                "C677 192 792 300 792 470V800H684V470"
                "C684 360 613 300 512 300C411 300 340 360 340 470V800Z",
            ),
            (
                "02-road",
                "#ffd1dc",
                "M406 832L456 568H374L512 404L650 568H568L618 832Z",
            ),
        ],
        "tray": [
            "M2 16V8C2 4.1 4.8 1.5 9 1.5S16 4.1 16 8V16H13.5V8"
            "C13.5 5.5 11.8 4 9 4S4.5 5.5 4.5 8V16Z",
            "M6.5 16.5L7.5 10H5.5L9 6L12.5 10H10.5L11.5 16.5Z",
        ],
    },
    "rising-tube": {
        "idea": "A diagonal capsule tunnel with a continuous road sweeping upward.",
        "background": ("#3e1528", "#26101c"),
        "layers": [
            (
                "01-tube",
                "#c8143f",
                "M226 485L456 217C511 154 610 150 679 208"
                "C746 265 761 360 707 425L561 623Z",
            ),
            (
                "02-mouth",
                "#f0426a",
                "M180 816V609C180 489 267 402 377 402"
                "C487 402 574 489 574 609V816H474V609"
                "C474 549 432 502 377 502C322 502 280 549 280 609V816Z",
            ),
            (
                "03-road",
                "#ffd1dc",
                "M310 840C330 734 378 668 434 638"
                "C568 572 626 506 673 391L606 356L790 280L813 476L750 435"
                "C690 611 570 702 472 746C414 766 401 793 398 840Z",
            ),
        ],
        "tray": [
            "M2 16V10C2 6.7 4.1 4.5 7 4.5S12 6.7 12 10V11H9.5V10"
            "C9.5 8.1 8.5 7 7 7S4.5 8.1 4.5 10V16Z",
            "M5.5 16C6.1 12.1 8.7 11.7 10.6 9.4"
            "C11.5 8.4 12 7.2 12.4 5.8L10.5 5L15.6 2L16.5 8L14.7 7.1"
            "C13.5 11.5 11.1 12.8 9.5 13.6C8.5 14.1 8.1 14.8 8 16Z",
        ],
    },
    "cutout-gate": {
        "idea": "One rose tunnel silhouette with an upward road cut out of its center.",
        "background": ("#fce4eb", "#edc8d3"),
        "layers": [
            (
                "01-gate",
                "#c8143f",
                "M222 832V478C222 302 340 192 512 192"
                "C684 192 802 302 802 478V832Z"
                "M384 832L450 562H350L512 370L674 562H574L640 832Z",
            ),
        ],
        "tray": [
            "M2 16.5V8.5C2 4.2 4.8 1.5 9 1.5S16 4.2 16 8.5V16.5Z"
            "M5.5 16.5L7.5 10H5L9 5.5L13 10H10.5L12.5 16.5Z",
        ],
    },
    "nested-rise": {
        "idea": "Two deep tunnel arches frame a bold road, on a saturated rose field.",
        "background": ("#d91d4e", "#a91138"),
        "layers": [
            (
                "01-outer-portal",
                "#fa87a0",
                "M168 804V496C168 287 307 152 512 152"
                "C717 152 856 287 856 496V804H760V496"
                "C760 347 661 248 512 248C363 248 264 347 264 496V804Z",
            ),
            (
                "02-inner-portal",
                "#ffc0cf",
                "M336 804V504C336 397 407 328 512 328"
                "C617 328 688 397 688 504V804H600V504"
                "C600 451 565 416 512 416C459 416 424 451 424 504V804Z",
            ),
            (
                "03-road",
                "#ffe8ee",
                "M406 852L464 620H398L512 476L626 620H560L618 852Z",
            ),
        ],
        "tray": [
            "M1.5 16V8C1.5 3.8 4.5 1 9 1S16.5 3.8 16.5 8V16H14V8"
            "C14 5.2 12.1 3.5 9 3.5S4 5.2 4 8V16Z",
            "M6.5 16.5L7.5 10.5H5.5L9 6L12.5 10.5H10.5L11.5 16.5Z",
        ],
    },
}


def svg(body, size=1024):
    return (
        f'<svg xmlns="{NS}" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">\n{body}\n</svg>\n'
    )


def background_body(colors, prefix):
    return (
        f'<defs><linearGradient id="{prefix}" x1="0" y1="0" x2="0.6" y2="1">'
        f'<stop stop-color="{colors[0]}"/>'
        f'<stop offset="1" stop-color="{colors[1]}"/>'
        '</linearGradient></defs>\n'
        f'<rect width="1024" height="1024" fill="url(#{prefix})"/>'
    )


def flat_path(color, path):
    return f'<path fill="{color}" fill-rule="evenodd" d="{path}"/>'


def composite_body(name, concept):
    return (
        '<defs>'
        f'<clipPath id="{name}-mask"><path d="{MASK}"/></clipPath>'
        f'<linearGradient id="{name}-wash" x1="0" y1="0" x2="0.15" y2="1">'
        '<stop stop-color="#ffe9ef" stop-opacity="0.08"/>'
        '<stop offset="0.55" stop-color="#ffe9ef" stop-opacity="0"/>'
        '<stop offset="1" stop-color="#ffe9ef" stop-opacity="0"/>'
        '</linearGradient></defs>\n'
        f'<g clip-path="url(#{name}-mask)">'
        + background_body(concept["background"], f"{name}-background")
        + "".join(flat_path(color, path) for _, color, path in concept["layers"])
        + f'<rect width="1024" height="1024" fill="url(#{name}-wash)"/>'
        + '</g>'
    )


def raster(source, size):
    result = subprocess.run(
        ["rsvg-convert", "--width", str(size), "--height", str(size)],
        input=source.encode(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return Image.open(BytesIO(result.stdout)).convert("RGBA")


def write_concepts():
    for name, concept in CONCEPTS.items():
        folder = ROOT / name
        folder.mkdir(exist_ok=True)
        (folder / "background.svg").write_text(
            svg(background_body(concept["background"], "background"))
        )
        for layer, color, path in concept["layers"]:
            (folder / f"{layer}.svg").write_text(svg(flat_path(color, path)))
        tray = svg("\n".join(flat_path("#000", path) for path in concept["tray"]), 18)
        (folder / "tray.svg").write_text(tray)
        icon = raster(svg(composite_body(name, concept)), 1024)
        icon.save(folder / "icon.png")
        for size in (32, 16):
            icon.resize((size, size), Image.Resampling.LANCZOS).save(
                folder / f"preview-{size}.png"
            )
        for size in (18, 16):
            raster(tray, size).save(folder / f"tray-{size}.png")


def contact_sheet():
    canvas = Image.new("RGB", (1440, 920), "#f5e9ed")
    draw = ImageDraw.Draw(canvas)
    font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
    title = ImageFont.truetype(font_path, 42)
    label = ImageFont.truetype(font_path, 25)
    small = ImageFont.truetype(font_path, 18)
    draw.text((64, 42), "Upster / icon concepts", font=title, fill="#341321")
    draw.text(
        (64, 104), "Flat source layers. Soft finish in the PNG only.",
        font=small, fill="#714453"
    )
    for index, name in enumerate(CONCEPTS):
        x = 64 + index * 344
        folder = ROOT / name
        icon = Image.open(folder / "icon.png").convert("RGBA")
        canvas.paste(icon.resize((280, 280), Image.Resampling.LANCZOS), (x, 180),
                     icon.resize((280, 280), Image.Resampling.LANCZOS))
        draw.text((x, 486), name, font=label, fill="#341321")
        draw.text((x, 542), "32 px          16 px", font=small, fill="#714453")
        for size, offset in ((32, 0), (16, 112)):
            im = Image.open(folder / f"preview-{size}.png").convert("RGBA")
            canvas.paste(im, (x + offset, 581), im)
        draw.text((x, 646), "Tray: 18 px   16 px", font=small, fill="#714453")
        for size, offset in ((18, 0), (16, 112)):
            im = Image.open(folder / f"tray-{size}.png").convert("RGBA")
            canvas.paste(im, (x + offset, 684), im)
        draw.rounded_rectangle((x, 733, x + 279, 793), radius=12, fill="#341321")
        for size, offset in ((18, 18), (16, 130)):
            im = Image.open(folder / f"tray-{size}.png").convert("RGBA")
            inverse = Image.new("RGBA", im.size, "#f5e9ed")
            inverse.putalpha(im.getchannel("A"))
            canvas.paste(inverse, (x + offset, 754), inverse)
    draw.text((64, 852), "Tray glyphs are shown at native size on light and dark surfaces.",
              font=small, fill="#714453")
    canvas.save(ROOT / "comparison.png")


def verify():
    shapes = {f"{{{NS}}}path", f"{{{NS}}}g", f"{{{NS}}}svg"}
    for name, concept in CONCEPTS.items():
        folder = ROOT / name
        for layer, _, _ in concept["layers"]:
            source = folder / f"{layer}.svg"
            tree = ET.parse(source)
            assert tree.getroot().attrib["viewBox"] == "0 0 1024 1024"
            assert all(node.tag in shapes for node in tree.iter())
            bounds = raster(source.read_text(), 1024).getbbox()
            assert bounds and min(bounds[:2]) >= 102 and max(bounds[2:]) <= 922
        background = raster((folder / "background.svg").read_text(), 1024)
        assert background.getchannel("A").getextrema() == (255, 255)
        for size, filename in ((1024, "icon.png"), (32, "preview-32.png"),
                               (16, "preview-16.png")):
            im = Image.open(folder / filename)
            assert im.size == (size, size)
            assert im.mode == "RGBA"
        tray_tree = ET.parse(folder / "tray.svg")
        assert tray_tree.getroot().attrib["viewBox"] == "0 0 18 18"
        assert all(node.attrib.get("fill") == "#000"
                   for node in tray_tree.iter() if node.tag == f"{{{NS}}}path")
        print(f"{name}: dimensions, flat layers, safe area, background, tray verified")


if __name__ == "__main__":
    write_concepts()
    contact_sheet()
    verify()
