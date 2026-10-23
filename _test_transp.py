import webview, threading, time

bg = webview.create_window("BG", html="""<!doctype html><html><body style="margin:0;height:100vh;
background:#ff00ff"></body></html>""",
    width=900, height=500, frameless=True, background_color="#ff00ff")

top = webview.create_window("TOP", html="""<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<div style="margin:15px auto;width:500px;height:100px;border-radius:24px;background:#ff0000"></div></body></html>""",
    width=530, height=130, frameless=True, transparent=True, on_top=True)

def close():
    print("closing", flush=True)
    top.destroy(); bg.destroy()

threading.Timer(9, close).start()
print("starting", flush=True)
webview.start(debug=False)
print("done", flush=True)
