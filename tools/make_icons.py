#!/usr/bin/env python3
"""Genera los iconos de Cascada. Sin dependencias: escribe el PNG a mano.

    python3 tools/make_icons.py

Tres barras cayendo sobre una linea de teclas. Los colores salen de
replica/design/tokens.json, igual que el resto de la app.
"""
import json
import os
import struct
import zlib

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKENS = json.load(open(os.path.join(HERE, "replica/design/tokens.json")))["color"]


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


BG = rgb(TOKENS["bg"])
ACCENT = rgb(TOKENS["accent"])
RIGHT = rgb(TOKENS["hand-right"])
LEFT = rgb(TOKENS["hand-left"])
WHITE = rgb("#eef2f8")
BLACK = rgb("#161c27")

# Barras que caen: (x0, x1, y0, y1, color), en fracciones del lado.
BARS = [
    (0.200, 0.315, 0.150, 0.520, ACCENT),
    (0.440, 0.555, 0.095, 0.600, RIGHT),
    (0.680, 0.795, 0.215, 0.440, LEFT),
]
KEYS_TOP, KEYS_BOTTOM = 0.655, 0.880
KEYS_LEFT, KEYS_RIGHT = 0.120, 0.880
BLACK_KEYS = [0.22, 0.36, 0.57, 0.70, 0.83]  # posicion relativa dentro del teclado


def inside_rounded(px, py, x0, y0, x1, y1, radius):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    for cx, cy in ((x0 + radius, y0 + radius), (x1 - radius, y0 + radius),
                   (x0 + radius, y1 - radius), (x1 - radius, y1 - radius)):
        if ((px < x0 + radius and py < y0 + radius) or (px > x1 - radius and py < y0 + radius)
                or (px < x0 + radius and py > y1 - radius) or (px > x1 - radius and py > y1 - radius)):
            if (px - cx) ** 2 + (py - cy) ** 2 > radius ** 2:
                if ((px < x0 + radius) == (cx == x0 + radius)) and ((py < y0 + radius) == (cy == y0 + radius)):
                    return False
    return True


def render(size):
    rows = []
    s = float(size)
    bar_radius = size * 0.028
    for y in range(size):
        row = bytearray()
        py = y + 0.5
        for x in range(size):
            px = x + 0.5
            color = BG
            # teclado
            if KEYS_TOP * s <= py <= KEYS_BOTTOM * s and KEYS_LEFT * s <= px <= KEYS_RIGHT * s:
                color = WHITE
                width = (KEYS_RIGHT - KEYS_LEFT) * s
                rel = (px - KEYS_LEFT * s) / width
                for bk in BLACK_KEYS:
                    if abs(rel - bk) < 0.035 and py <= (KEYS_TOP + (KEYS_BOTTOM - KEYS_TOP) * 0.62) * s:
                        color = BLACK
                # juntas entre blancas
                for j in (0.145, 0.29, 0.435, 0.5, 0.645, 0.79, 0.93):
                    if abs(rel - j) < 0.006:
                        color = tuple(int(c * 0.72) for c in WHITE)
            else:
                for (bx0, bx1, by0, by1, bar_color) in BARS:
                    if inside_rounded(px, py, bx0 * s, by0 * s, bx1 * s, by1 * s, bar_radius):
                        color = bar_color
                        break
            row += bytes(color)
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = render(size)
    raw = b"".join(b"\x00" + row for row in rows)
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def write_svg(path):
    def bar(x0, x1, y0, y1, color):
        return (f'<rect x="{x0*100:.1f}" y="{y0*100:.1f}" width="{(x1-x0)*100:.1f}" '
                f'height="{(y1-y0)*100:.1f}" rx="2.8" fill="{color}"/>')
    hexes = {ACCENT: TOKENS["accent"], RIGHT: TOKENS["hand-right"], LEFT: TOKENS["hand-left"]}
    bars = "".join(bar(a, b, c, d, hexes[e]) for (a, b, c, d, e) in BARS)
    keys = (f'<rect x="{KEYS_LEFT*100:.1f}" y="{KEYS_TOP*100:.1f}" '
            f'width="{(KEYS_RIGHT-KEYS_LEFT)*100:.1f}" height="{(KEYS_BOTTOM-KEYS_TOP)*100:.1f}" '
            f'rx="1.6" fill="#eef2f8"/>')
    width = KEYS_RIGHT - KEYS_LEFT
    blacks = "".join(
        f'<rect x="{(KEYS_LEFT + bk*width)*100 - 2.6:.1f}" y="{KEYS_TOP*100:.1f}" width="5.2" '
        f'height="{(KEYS_BOTTOM-KEYS_TOP)*62:.1f}" rx="1" fill="#161c27"/>' for bk in BLACK_KEYS)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" '
           'aria-label="Cascada">'
           f'<rect width="100" height="100" rx="22" fill="{TOKENS["bg"]}"/>'
           f'{bars}{keys}{blacks}</svg>')
    with open(path, "w") as fh:
        fh.write(svg)


if __name__ == "__main__":
    out = os.path.join(HERE, "assets")
    os.makedirs(out, exist_ok=True)
    write_svg(os.path.join(out, "icon.svg"))
    for size, name in ((180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        written = write_png(os.path.join(out, name), size)
        print(f"{name}: {written} bytes")
    print("icon.svg escrito")
