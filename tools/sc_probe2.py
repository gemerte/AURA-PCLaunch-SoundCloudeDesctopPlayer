import urllib.request, re, json
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    return urllib.request.urlopen(r, timeout=30).read().decode("utf-8", "replace")

h = get("https://soundcloud.com/")
m = re.search(r'window\.__sc_hydration\s*=\s*(\[.*?\]);\s*</script>', h, re.S)
print("hydration group:", bool(m))
if m:
    try:
        data = json.loads(m.group(1))
        print("hydratables:", [d.get("hydratable") for d in data])
        for d in data:
            dd = d.get("data")
            if isinstance(dd, dict):
                print(d.get("hydratable"), list(dd.keys())[:20])
    except Exception as e:
        print("json fail", e)
for js in ["https://a-v2.sndcdn.com/assets/55-4a15ee4f.js", "https://a-v2.sndcdn.com/assets/0-631475bf.js",
           "https://a-v2.sndcdn.com/assets/1-06633502.js", "https://a-v2.sndcdn.com/assets/56-3d5fc94a.js"]:
    try:
        t = get(js)
        print("== ", js, len(t))
        for pat in ["oauth_token", "access_token", "localStorage", "client_id", "authorization"]:
            print("  ", pat, t.count(pat))
        mm = re.search(r'.{60}oauth_token.{80}', t)
        if mm:
            print("   ctx:", mm.group(0)[:180])
    except Exception as e:
        print(js, e)

# public API test
cid = "GytJkwrLebfCWmFfWOuDf7WObQo2BND9"
for u in [f"https://api-v2.soundcloud.com/search/tracks?q=lofi&client_id={cid}&limit=3",
          f"https://api-v2.soundcloud.com/me?client_id={cid}"]:
    try:
        t = get(u)
        print("API OK", u[:70], t[:300])
    except Exception as e:
        print("API FAIL", u[:70], e)
