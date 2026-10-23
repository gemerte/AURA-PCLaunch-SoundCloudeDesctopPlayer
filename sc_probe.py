import urllib.request, re, json, ssl

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

def get(url, limit=8_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read(limit)
        return data.decode("utf-8", "replace")

try:
    html = get("https://soundcloud.com/")
    print("home len", len(html))
    print("hydration?", "__sc_hydration" in html)
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    print("scripts", len(scripts))
    for s in scripts:
        print(" ", s)
    found = set()
    for s in scripts:
        if not s.startswith("http"):
            s = "https:" + s if s.startswith("//") else "https://soundcloud.com" + s
        try:
            js = get(s)
        except Exception as e:
            print("  fail", s, e); continue
        for m in re.findall(r'client_id["\']?\s*[:=]\s*["\']([0-9a-zA-Z]{32})["\']', js):
            found.add(m)
        for m in re.findall(r'client_id[=/]([0-9a-zA-Z]{32})', js):
            found.add(m)
        if found:
            print("  found in", s)
    print("CLIENT IDS:", found)
    # check hydration on a public track page via charts
    for u in ["https://soundcloud.com/charts/top", "https://soundcloud.com/discover/sets/charts-top:all-music"]:
        try:
            h = get(u)
            print(u, "len", len(h), "hydration?", "__sc_hydration" in h)
            links = re.findall(r'href="(/[a-z0-9_-]+/[a-z0-9_-]+)"', h)[:10]
            print("  links", links[:8])
        except Exception as e:
            print(u, "fail", e)
except Exception as e:
    print("ERROR", e)
