import urllib.request, json, urllib.parse

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
CID = "GytJkwrLebfCWmFfWOuDf7WObQo2BND9"

def api(path, **q):
    q["client_id"] = CID
    u = "https://api-v2.soundcloud.com" + path + "?" + urllib.parse.urlencode(q)
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())

for path, q in [
    ("/charts", {"kind": "top", "genre": "soundcloud:genres:all-music", "limit": 5}),
    ("/search/tracks", {"q": "lofi hip hop", "limit": 5}),
    ("/search/playlists", {"q": "lofi", "limit": 3}),
    ("/featured_tracks/top/all-music", {"limit": 5}),
]:
    try:
        d = api(path, **q)
        print("OK", path, "keys:", list(d.keys()))
        coll = d.get("collection") or d.get("tracks") or []
        print("  n=", len(coll))
        if coll:
            it = coll[0]
            print("  sample keys:", list(it.keys())[:25])
            print(json.dumps(it, ensure_ascii=False)[:700])
    except Exception as e:
        print("FAIL", path, e)

# waveform & lrclib
try:
    d = api("/search/tracks", q="lofi", limit=1)
    t = d["collection"][0]
    print("TRACK", t.get("id"), t.get("title"), t.get("permalink_url"), t.get("embeddable_by"), t.get("policy"), t.get("streamable"))
    print("waveform_url", t.get("waveform_url"))
    w = json.loads(urllib.request.urlopen(urllib.request.Request(t["waveform_url"], headers={"User-Agent": UA}), timeout=30).read())
    print("waveform samples", len(w.get("samples", [])), w.get("samples", [])[:10])
except Exception as e:
    print("TRACK FAIL", e)

for artist, title, dur in [("Daft Punk", "Get Lucky", 369), ("Radiohead", "Creep", 238)]:
    try:
        u = "https://lrclib.net/api/get?" + urllib.parse.urlencode({"artist_name": artist, "track_name": title, "duration": dur})
        r = urllib.request.Request(u, headers={"User-Agent": "AURA/1.0 (https://example.local)"})
        d = json.loads(urllib.request.urlopen(r, timeout=20).read())
        print("LRCLIB", artist, "->", list(d.keys()), "synced:", bool(d.get("syncedLyrics")))
        print((d.get("syncedLyrics") or "")[:200])
    except Exception as e:
        print("LRCLIB FAIL", artist, e)
