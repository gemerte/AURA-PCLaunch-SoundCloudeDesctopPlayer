from PIL import Image, ImageDraw, ImageFilter
import math, os

SS = 4  # supersampling

def grad(size, top, bottom):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img

def cloud_mask(size):
    S = size * SS
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    def ell(cx, cy, r):
        d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=255)
    ell(0.365, 0.56, 0.150)
    ell(0.500, 0.465, 0.205)
    ell(0.640, 0.545, 0.155)
    d.rounded_rectangle([0.24 * S, 0.545 * S, 0.76 * S, 0.725 * S], radius=0.095 * S, fill=255)
    # smooth
    m = m.filter(ImageFilter.GaussianBlur(0.006 * S))
    return m.resize((size, size), Image.LANCZOS)

def rounded_mask(size, rad=0.23):
    S = size * SS
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=rad * S, fill=255)
    return m.resize((size, size), Image.LANCZOS)

def play_mask(size, cx=0.5, cy=0.635, w=0.085, h=0.052):
    S = size * SS
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    pts = [((cx - w) * S, (cy - h) * S), ((cx - w) * S, (cy + h) * S), ((cx + w) * S, cy * S)]
    d.polygon(pts, fill=255)
    return m.resize((size, size), Image.LANCZOS)

def make_icon(size, transparent_bg=False, orange=True):
    base = grad(size, (255, 122, 24), (255, 45, 110))
    # violet glow bottom-left
    glow = Image.new("RGB", (size, size), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-size * 0.3, size * 0.55, size * 0.7, size * 1.5], fill=(120, 60, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.16))
    base = Image.blend(base, Image.blend(base, glow, 0.55), 0.45)
    # top sheen
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.ellipse([-size * 0.2, -size * 0.55, size * 1.2, size * 0.5], fill=(255, 255, 255, 46))
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.05))
    base = Image.alpha_composite(base.convert("RGBA"), sheen)

    mask = rounded_mask(size)
    if transparent_bg:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)

    cl = cloud_mask(size)
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    # cloud with soft shadow
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", (size, size), (0, 0, 0, 140)), (0, int(size * 0.015)), cl)
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.018))
    out = Image.alpha_composite(out, sh)
    out.paste(white, (0, 0), cl)

    pm = play_mask(size)
    accent = (255, 74, 20, 255) if orange else (18, 18, 24, 255)
    tri = Image.new("RGBA", (size, size), accent)
    out.paste(tri, (0, 0), pm)
    return out

os.makedirs("assets", exist_ok=True)
make_icon(512).save("assets/icon.png")
make_icon(256).save("assets/icon-256.png")
make_icon(32, orange=True).save("assets/tray.png")
make_icon(64, orange=True).save("assets/tray-64.png")
print("icons done")
