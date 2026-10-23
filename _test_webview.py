import webview, threading, time

html = """
<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden;font-family:Segoe UI">
<div id="p" style="margin:20px auto;width:560px;height:120px;border-radius:28px;
background:rgba(20,22,30,.82);border:1px solid rgba(255,255,255,.18);color:#fff;
display:flex;align-items:center;justify-content:center;backdrop-filter:blur(20px);font-size:18px">
Transparent test — НЕОНОВЫЙ ДОЖДЬ
</div></body></html>
"""

win = webview.create_window("Test", html=html, width=600, height=160,
                            frameless=True, transparent=True, on_top=True)
threading.Timer(4, lambda: win.destroy()).start()
webview.start(debug=True)
print("OK exit")
