'use strict';

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, shell, session, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./src/store');
const sc = require('./src/sc');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const COLLAPSED = { width: 520, height: 110 };
const EXPANDED = { width: 840, height: 620 };
const TOP_GAP = 10;
const BOTTOM_GAP = 14;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
  app.userAgentFallback = UA;

  let mainWin = null;
  let overlayWin = null;
  let tray = null;
  let loginWin = null;
  let loginPromise = null;
  let isQuitting = false;
  let overlayExpanded = false;
  let overlayPinned = false;
  let overlayEnabled = true;
  let lastFull = null;
  let lastTick = { position: 0, duration: 0, playing: false };
  let trayUpdateTimer = null;
  let balloonShown = false;

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const trayIconPath = path.join(__dirname, 'assets', 'tray.png');

  function primaryArea() {
    return screen.getPrimaryDisplay().workArea;
  }

  let overlayPosition = store.get('overlayPosition', 'bottom-center');

  function overlayBounds(expanded) {
    const a = primaryArea();
    const size = expanded ? EXPANDED : COLLAPSED;
    const x = Math.round(a.x + (a.width - size.width) / 2);
    if (overlayPosition === 'bottom-center') {
      return {
        x,
        y: a.y + a.height - size.height - BOTTOM_GAP,
        width: size.width,
        height: size.height
      };
    }
    return {
      x,
      y: a.y + TOP_GAP,
      width: size.width,
      height: size.height
    };
  }

  function positionOverlay() {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    overlayWin.setBounds(overlayBounds(overlayExpanded));
  }

  function setOverlayPosition(pos) {
    overlayPosition = String(pos) === 'bottom-center' ? 'bottom-center' : 'top-center';
    store.set('overlayPosition', overlayPosition);
    positionOverlay();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('overlay:position', overlayPosition);
    }
    updateTray();
  }

  function broadcastOverlayState() {
    const state = { enabled: overlayEnabled, pinned: overlayPinned };
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('overlay:state', state);
    updateTray();
  }

  function setOverlayExpanded(expanded) {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    if (overlayExpanded === expanded) return;
    overlayExpanded = expanded;
    overlayWin.setBounds(overlayBounds(expanded));
    overlayWin.webContents.send('overlay:expanded', expanded);
    if (expanded) {
      overlayWin.setIgnoreMouseEvents(false);
    } else if (!overlayPinned) {
      overlayWin.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  let overlayWatch = null;
  let overlayHover = false;

  function startOverlayWatch() {
    if (overlayWatch) return;
    overlayWatch = setInterval(() => {
      if (!overlayWin || overlayWin.isDestroyed() || !overlayEnabled) return;
      if (!overlayWin.isVisible()) return;
      let inside = false;
      try {
        const b = overlayWin.getBounds();
        const p = screen.getCursorScreenPoint();
        inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      } catch {
        return;
      }
      if (inside !== overlayHover) {
        overlayHover = inside;
        try {
          overlayWin.webContents.send('overlay:hover', inside);
        } catch {
          /* ignore */
        }
      }
      if (inside) {
        if (!overlayExpanded) setOverlayExpanded(true);
        overlayWin.setIgnoreMouseEvents(false);
      } else {
        if (overlayExpanded && !overlayPinned) setOverlayExpanded(false);
        if (!overlayPinned) overlayWin.setIgnoreMouseEvents(true, { forward: true });
      }
    }, 90);
  }

  function createMainWindow() {
    mainWin = new BrowserWindow({
      width: 1340,
      height: 880,
      minWidth: 1100,
      minHeight: 700,
      show: false,
      frame: false,
      title: 'AURA — SoundCloud',
      backgroundColor: '#08080a',
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });
    Menu.setApplicationMenu(null);
    mainWin.loadFile('index.html');

    mainWin.once('ready-to-show', () => {
      mainWin.show();
      mainWin.focus();
    });

    mainWin.on('close', (e) => {
      if (isQuitting) return;
      e.preventDefault();
      mainWin.hide();
      if (tray && !balloonShown && tray.displayBalloon) {
        balloonShown = true;
        try {
          tray.displayBalloon({
            title: 'AURA продолжает играть',
            content: 'Приложение свёрнуто в трей. Мини-плеер остаётся на экране.',
            iconType: 'info'
          });
        } catch {
          /* ignore */
        }
      }
    });

    mainWin.on('maximize', () => mainWin.webContents.send('win:maximized', true));
    mainWin.on('unmaximize', () => mainWin.webContents.send('win:maximized', false));

    mainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\/([a-z0-9-]+\.)?soundcloud\.com\//i.test(url)) {
        return { action: 'allow' };
      }
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  function createOverlay() {
    const b = overlayBounds(false);
    overlayWin = new BrowserWindow({
      ...b,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: true,
      backgroundColor: '#00000000',
      title: 'AURA мини-плеер',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });
    overlayWin.setAlwaysOnTop(true, 'floating');
    overlayWin.setMenuBarVisibility(false);
    overlayWin.loadFile('overlay.html');
    overlayWin.once('ready-to-show', () => {
      if (overlayPinned) setOverlayExpanded(true);
      overlayWin.webContents.send('overlay:pinned', overlayPinned);
      overlayWin.webContents.send('overlay:state', { enabled: overlayEnabled, pinned: overlayPinned });
      if (overlayEnabled) overlayWin.showInactive();
      if (!overlayPinned) overlayWin.setIgnoreMouseEvents(true, { forward: true });
      broadcastOverlayState();
      startOverlayWatch();
    });
    overlayWin.on('closed', () => {
      overlayWin = null;
    });
    overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  function createTray() {
    try {
      const img = nativeImage.createFromPath(trayIconPath);
      tray = new Tray(img);
    } catch (e) {
      console.error('tray failed', e);
      return;
    }
    tray.setToolTip('AURA — SoundCloud');
    tray.on('click', () => showMain());
    updateTray();
  }

  function updateTray() {
    if (!tray) return;
    clearTimeout(trayUpdateTimer);
    trayUpdateTimer = setTimeout(buildTrayMenu, 120);
  }

  function buildTrayMenu() {
    if (!tray) return;
    const t = lastFull && lastFull.track;
    const playing = !!(lastFull && lastFull.playing);
    const template = [
      { label: t ? truncate(`${t.title} — ${t.artist}`, 60) : 'AURA — SoundCloud', enabled: false },
      { type: 'separator' },
      { label: playing ? 'Пауза' : 'Играть', click: () => sendCommand({ type: 'toggle' }) },
      { label: 'Следующий трек', click: () => sendCommand({ type: 'next' }) },
      { label: 'Предыдущий трек', click: () => sendCommand({ type: 'prev' }) },
      { type: 'separator' },
      { label: 'Открыть AURA', click: showMain },
      {
        label: 'Мини-плеер на экране',
        type: 'checkbox',
        checked: overlayEnabled,
        click: (item) => setOverlayEnabled(!!item.checked)
      },
      {
        label: 'Закрепить мини-плеер',
        type: 'checkbox',
        checked: overlayPinned,
        click: (item) => setPinned(!!item.checked)
      },
      {
        label: 'Положение мини-плеера',
        submenu: [
          {
            label: 'Сверху по центру',
            type: 'radio',
            checked: overlayPosition === 'top-center',
            click: () => setOverlayPosition('top-center')
          },
          {
            label: 'Снизу по центру',
            type: 'radio',
            checked: overlayPosition === 'bottom-center',
            click: () => setOverlayPosition('bottom-center')
          }
        ]
      },
      { type: 'separator' },
      { label: 'Выход', click: () => quitApp() }
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function showMain() {
    if (!mainWin || mainWin.isDestroyed()) {
      createMainWindow();
      return;
    }
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }

  function setOverlayEnabled(on) {
    overlayEnabled = !!on;
    store.set('overlayEnabled', overlayEnabled);
    if (overlayWin && !overlayWin.isDestroyed()) {
      if (overlayEnabled) {
        overlayWin.showInactive();
        if (overlayPinned) setOverlayExpanded(true);
        else setOverlayExpanded(false);
      } else {
        setOverlayExpanded(false);
        overlayWin.hide();
      }
      overlayWin.webContents.send('overlay:state', { enabled: overlayEnabled, pinned: overlayPinned });
    }
    broadcastOverlayState();
  }

  function setPinned(pinned) {
    overlayPinned = !!pinned;
    store.set('overlayPinned', overlayPinned);
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('overlay:pinned', overlayPinned);
      overlayWin.webContents.send('overlay:state', { enabled: overlayEnabled, pinned: overlayPinned });
      if (overlayPinned) {
        setOverlayExpanded(true);
        overlayWin.showInactive();
      }
    }
    broadcastOverlayState();
  }

  function sendCommand(cmd) {
    if (!cmd) return;
    if (cmd.type === 'open' || cmd.type === 'show-main') {
      showMain();
      return;
    }
    if (cmd.type === 'overlay-toggle') {
      setOverlayEnabled(!overlayEnabled);
      return;
    }
    if (cmd.type === 'overlay-expand') {
      setOverlayExpanded(!!cmd.value);
      return;
    }
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('player:cmd', cmd);
  }

  function quitApp() {
    isQuitting = true;
    store.flush();
    app.quit();
  }

  /* ---------------- auth ---------------- */

  async function login() {
    if (sc.isLoggedIn() && sc.getUser()) return sc.getUser();
    if (loginPromise) return loginPromise;
    loginPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = (result, error) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        loginPromise = null;
        if (loginWin && !loginWin.isDestroyed()) {
          loginWin.removeAllListeners('closed');
          loginWin.close();
        }
        loginWin = null;
        if (error) reject(error);
        else resolve(result);
      };

      loginWin = new BrowserWindow({
        width: 540,
        height: 780,
        minWidth: 420,
        minHeight: 560,
        parent: mainWin && !mainWin.isDestroyed() ? mainWin : undefined,
        modal: false,
        show: true,
        title: 'Вход в SoundCloud',
        backgroundColor: '#111111',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: undefined
        }
      });
      loginWin.loadURL('https://soundcloud.com/signin');
      loginWin.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));

      // SoundCloud's sign-in page (and the Google account flow inside it) checks
      // for a "real" Chrome environment. Mimic the standard browser globals so
      // the "browser not secure" screen is not shown.
      const shim = `(function () {
        try {
          if (!window.chrome) window.chrome = {};
          if (!window.chrome.runtime) window.chrome.runtime = {};
          if (!window.chrome.app) window.chrome.app = { isInstalled: false };
          if (!window.chrome.csi) window.chrome.csi = function () { return {}; };
          if (!window.chrome.loadTimes) window.chrome.loadTimes = function () { return {}; };
          try {
            Object.defineProperty(navigator, 'webdriver', { get: function () { return false; } });
          } catch (e) {}
          try {
            Object.defineProperty(navigator, 'languages', { get: function () { return ['ru-RU', 'ru', 'en-US', 'en']; } });
          } catch (e) {}
          try {
            Object.defineProperty(navigator, 'plugins', { get: function () { return [1, 2, 3, 4, 5]; } });
          } catch (e) {}
        } catch (e) {}
      })();`;

      loginWin.webContents.on('dom-ready', () => {
        loginWin.webContents.executeJavaScript(shim, true).catch(() => {});
      });

      const tryToken = async () => {
        if (settled || !loginWin || loginWin.isDestroyed()) return;
        let value = null;
        try {
          const cookies = await session.defaultSession.cookies.get({});
          for (const c of cookies) {
            const name = c.name || '';
            if ((name === 'oauth_token' || name === 'oauth_token_s' || name === 'sc-oauth-token') && c.value) {
              value = c.value;
              break;
            }
          }
          if (!value) {
            const scCookies = await session.defaultSession.cookies.get({ name: 'oauth_token' });
            const c = scCookies.find((x) => (x.domain || '').includes('soundcloud.com')) || scCookies[0];
            if (c && c.value) value = c.value;
          }
        } catch {
          /* ignore */
        }
        if (!value) {
          try {
            value = await loginWin.webContents.executeJavaScript(
              "(function(){try{var v=window.localStorage.getItem('oauth_token')||window.localStorage.getItem('sc_oauth_token')||window.localStorage.getItem('oauthToken')||''; if(v)return v; if(window.__scAuth&&window.__scAuth.token)return window.__scAuth.token; return '';}catch(e){return ''}})()",
              true
            );
          } catch {
            value = null;
          }
        }
        if (!value || String(value).trim().length < 5) return;
        let tok = value;
        try {
          tok = decodeURIComponent(value);
        } catch {
          /* ignore */
        }
        try {
          const user = await sc.loginWithToken(tok);
          finish(user);
        } catch {
          /* token may be temporary, keep polling */
        }
      };

      timer = setInterval(tryToken, 1200);
      loginWin.on('closed', () => {
        if (!settled) {
          settled = true;
          clearInterval(timer);
          loginPromise = null;
          resolve(null);
        }
      });
      loginWin.webContents.on('did-finish-load', () => {
        setTimeout(tryToken, 600);
      });
    });
    return loginPromise;
  }

  async function logout() {
    sc.clearAuth();
    try {
      const list = await session.defaultSession.cookies.get({ name: 'oauth_token' });
      for (const c of list) {
        const domain = (c.domain || '').replace(/^\./, '');
        if (!domain.includes('soundcloud.com')) continue;
        await session.defaultSession.cookies.remove('https://' + domain + (c.path || '/'), 'oauth_token').catch(() => {});
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  /* ---------------- ipc ---------------- */

  function safe(channel, fn) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        const data = await fn(payload, event);
        return { ok: true, data };
      } catch (err) {
        const code = err.code || (err.status === 401 ? 'AUTH' : 'ERROR');
        return { ok: false, error: err.message || String(err), code, status: err.status || 0 };
      }
    });
  }

  function registerIpc() {
    safe('config:get', async () => ({
      user: sc.getUser(),
      loggedIn: sc.isLoggedIn(),
      volume: store.get('volume', 0.65),
      overlayEnabled,
      overlayPinned,
      overlayPosition,
      shortcuts: shortcutState(),
      version: app.getVersion(),
      platform: process.platform
    }));

    ipcMain.handle('config:set', async (e, { key, value }) => {
      if (['volume', 'overlayEnabled', 'overlayPinned', 'overlayPosition'].includes(key)) store.set(key, value);
      if (key === 'overlayEnabled') setOverlayEnabled(!!value);
      if (key === 'overlayPinned') setPinned(!!value);
      if (key === 'overlayPosition') {
        setOverlayPosition(value);
      }
      return true;
    });

    safe('auth:login', () => login());
    ipcMain.handle('auth:logout', async () => {
      await logout();
      return { ok: true };
    });

    safe('sc:discover', () => sc.discover());
    safe('sc:search', ({ q, kind, offset }) => sc.search(q, kind, offset));
    safe('sc:likes', ({ offset }) => sc.likes(offset));
    safe('sc:playlists', () => sc.myPlaylists());
    safe('sc:playlist', ({ id }) => sc.playlist(id));
    safe('sc:resolve', ({ url }) => sc.resolve(url));
    safe('sc:like', ({ id, on }) => sc.like(id, on));
    safe('sc:waveform', ({ url }) => sc.waveform(url));
    safe('sc:lyrics', ({ track }) => sc.lyrics(track));

    ipcMain.handle('app:open', async (e, { url }) => {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        await shell.openExternal(u.toString());
        return true;
      } catch {
        return false;
      }
    });

    ipcMain.handle('app:quit', () => {
      quitApp();
      return true;
    });

    ipcMain.on('win:minimize', () => mainWin && mainWin.minimize());
    ipcMain.on('win:maximize', () => {
      if (!mainWin) return;
      if (mainWin.isMaximized()) mainWin.unmaximize();
      else mainWin.maximize();
    });
    ipcMain.on('win:close', () => mainWin && mainWin.close());
    ipcMain.on('win:hide', () => mainWin && mainWin.hide());

    ipcMain.on('overlay:toggle', (e, on) => setOverlayEnabled(on === undefined ? !overlayEnabled : !!on));
    ipcMain.on('overlay:expand', (e, v) => setOverlayExpanded(!!v));
    ipcMain.on('overlay:pin', (e, v) => setPinned(!!v));
    ipcMain.on('overlay:hide', () => setOverlayEnabled(false));
    ipcMain.on('overlay:position', (e, pos) => {
      setOverlayPosition(pos);
    });

    ipcMain.on('player:state', (e, state) => {
      if (!state || typeof state !== 'object') return;
      lastFull = state;
      if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('state:full', state);
      if (state.volume !== undefined) store.set('volume', state.volume);
      updateTray();
    });

    ipcMain.on('player:tick', (e, tick) => {
      if (!tick) return;
      lastTick = tick;
      if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('state:tick', tick);
    });

    ipcMain.on('player:cmd', (e, cmd) => sendCommand(cmd));

    safe('state:get', async () => ({
      full: lastFull,
      tick: lastTick,
      expanded: overlayExpanded,
      pinned: overlayPinned,
      enabled: overlayEnabled
    }));
  }

  /* ---------------- shortcuts ---------------- */

  function shortcutState() {
    const accels = {
      toggle: 'CommandOrControl+Alt+Space',
      overlay: 'CommandOrControl+Alt+M',
      next: 'CommandOrControl+Alt+N',
      prev: 'CommandOrControl+Alt+P'
    };
    const out = {};
    for (const [k, accel] of Object.entries(accels)) {
      try {
        out[k] = globalShortcut.isRegistered(accel);
      } catch {
        out[k] = false;
      }
    }
    return out;
  }

  function registerShortcuts() {
    const reg = (accel, fn) => {
      try {
        if (!globalShortcut.register(accel, fn)) console.warn('[AURA] сочетание занято:', accel);
      } catch (e) {
        console.warn('[AURA] не удалось зарегистрировать', accel, e.message);
      }
    };
    reg('CommandOrControl+Alt+Space', () => sendCommand({ type: 'toggle' }));
    reg('CommandOrControl+Alt+M', () => setOverlayEnabled(!overlayEnabled));
    reg('CommandOrControl+Alt+N', () => sendCommand({ type: 'next' }));
    reg('CommandOrControl+Alt+P', () => sendCommand({ type: 'prev' }));
    globalShortcut.register('MediaPlayPause', () => sendCommand({ type: 'toggle' }));
    globalShortcut.register('MediaNextTrack', () => sendCommand({ type: 'next' }));
    globalShortcut.register('MediaPreviousTrack', () => sendCommand({ type: 'prev' }));
  }

  app.on('second-instance', () => showMain());

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.aura.soundcloud');
    try {
      session.defaultSession.setUserAgent(UA);
    } catch {
      /* ignore */
    }
    store.init(app.getPath('userData'));
    overlayEnabled = store.get('overlayEnabled', true);
    overlayPinned = store.get('overlayPinned', false);
    sc.init();
    registerIpc();
    registerShortcuts();
    createMainWindow();
    createOverlay();
    createTray();
    sc.loadAuth()
      .then((user) => {
        if (user && mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('auth:ready', user);
        }
      })
      .catch(() => {});
    screen.on('display-metrics-changed', positionOverlay);
    screen.on('display-added', positionOverlay);
    screen.on('display-removed', positionOverlay);
  });

  app.on('window-all-closed', (e) => {
    // tray application: keep running
  });

  app.on('before-quit', () => {
    isQuitting = true;
    store.flush();
    globalShortcut.unregisterAll();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
