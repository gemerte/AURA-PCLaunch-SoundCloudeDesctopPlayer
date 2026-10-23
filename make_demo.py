import urllib.request, urllib.parse, json, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
CID = "GytJkwrLebfCWmFfWOuDf7WObQo2BND9"

def api(path, **q):
    q["client_id"] = CID
    u = "https://api-v2.soundcloud.com" + path + "?" + urllib.parse.urlencode(q)
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())

def art(u, size="t500x500"):
    return (u or "").replace("-large", "-" + size).replace("-t500x500", "-" + size)

def track(t):
    if not t or t.get("kind") not in (None, "track") or not t.get("id"):
        return None
    if t.get("streamable") is False or t.get("policy") == "BLOCK" or t.get("embeddable_by") == "none":
        return None
    user = t.get("user") or {}
    return {
        "id": str(t["id"]), "kind": "track",
        "title": t.get("title") or "Без названия",
        "artist": user.get("username") or "SoundCloud",
        "artistId": str(user.get("id")) if user.get("id") else None,
        "avatar": art(user.get("avatar_url"), "t200x200"),
        "artwork": art(t.get("artwork_url") or user.get("avatar_url")),
        "duration": t.get("full_duration") or t.get("duration") or 0,
        "url": t.get("permalink_url"),
        "uri": t.get("uri"),
        "waveform": t.get("waveform_url"),
        "genre": t.get("genre") or "",
        "plays": t.get("playback_count") or 0,
        "likes": t.get("likes_count") or 0,
        "created": t.get("created_at") or t.get("display_date") or "",
        "description": (t.get("description") or "")[:400],
        "streamable": True, "embeddable": True,
        "secret": t.get("secret_token"),
        "user": {"id": str(user.get("id")) if user.get("id") else None,
                 "name": user.get("username") or "", "avatar": art(user.get("avatar_url"), "t200x200"),
                 "url": user.get("permalink_url") or ""},
    }

queries = ["lofi hip hop", "phonk", "deep house", "indie", "r&b", "ambient", "jazz", "rock",
           "electronic", "rap", "chill", "soul"]
seen, tracks = set(), []
for q in queries:
    try:
        d = api("/search/tracks", q=q, limit=6)
        for raw in d.get("collection", []):
            t = track(raw)
            if t and t["id"] not in seen and t.get("artwork"):
                seen.add(t["id"]); tracks.append(t)
    except Exception as e:
        print("search fail", q, e)
    if len(tracks) >= 24:
        break

# playlists
pls = []
for q in ["lofi mix", "deep house mix", "chill playlist", "phonk playlist", "jazz playlist", "indie mix"]:
    try:
        d = api("/search/playlists", q=q, limit=3)
        for raw in d.get("collection", []):
            if raw.get("id") and raw.get("artwork_url") and raw.get("track_count", 0) >= 5:
                full = api(f"/playlists/{raw['id']}")
                pl = {
                    "id": str(raw["id"]), "kind": "playlist",
                    "title": raw.get("title") or "Плейлист",
                    "artist": (raw.get("user") or {}).get("username") or "SoundCloud",
                    "artwork": art(raw.get("artwork_url")),
                    "trackCount": raw.get("track_count") or len(full.get("tracks") or []),
                    "duration": raw.get("duration") or 0,
                    "url": raw.get("permalink_url"),
                    "tracks": [x for x in (track(t) for t in (full.get("tracks") or [])) if x],
                }
                if len(pl["tracks"]) >= 4:
                    pls.append(pl)
                break
    except Exception as e:
        print("playlist fail", q, e)
    if len(pls) >= 6:
        break

print("tracks", len(tracks), "playlists", len(pls))
for p in pls:
    print(" playlist", p["id"], p["title"], p["trackCount"], "loaded", len(p["tracks"]), "dur", p["duration"])

demo = {"tracks": tracks, "playlists": pls}
with open("js/demo-data.js", "w", encoding="utf-8") as f:
    f.write("window.AURA_DEMO = " + json.dumps(demo, ensure_ascii=False, indent=1) + ";\n")
print("wrote js/demo-data.js")
