'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

async function unwrap(promise) {
  const res = await promise;
  if (res && res.ok === false) {
    const err = new Error(res.error || 'Ошибка');
    err.code = res.code || 'ERROR';
    err.status = res.status || 0;
    throw err;
  }
  return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
}

contextBridge.exposeInMainWorld('aura', {
  isDesktop: true,
  platform: process.platform,
  getConfig: () => unwrap(invoke('config:get')),
  saveSetting: (key, value) => invoke('config:set', { key, value }),
  setOverlayPosition: (pos) => ipcRenderer.send('overlay:position', pos),
  login: () => unwrap(invoke('auth:login')),
  logout: () => invoke('auth:logout'),
  discover: () => unwrap(invoke('sc:discover')),
  search: (q, kind, offset) => unwrap(invoke('sc:search', { q, kind, offset })),
  likes: (offset) => unwrap(invoke('sc:likes', { offset })),
  playlists: () => unwrap(invoke('sc:playlists')),
  playlist: (id) => unwrap(invoke('sc:playlist', { id })),
  resolve: (url) => unwrap(invoke('sc:resolve', { url })),
  like: (id, on) => unwrap(invoke('sc:like', { id, on })),
  waveform: (url) => unwrap(invoke('sc:waveform', { url })),
  lyrics: (track) => unwrap(invoke('sc:lyrics', { track })),
  openExternal: (url) => invoke('app:open', { url }),
  quit: () => invoke('app:quit'),

  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    hide: () => ipcRenderer.send('win:hide'),
    onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(!!v))
  },

  overlay: {
    toggle: (on) => ipcRenderer.send('overlay:toggle', on),
    expand: (v) => ipcRenderer.send('overlay:expand', !!v),
    pin: (v) => ipcRenderer.send('overlay:pin', !!v),
    hide: () => ipcRenderer.send('overlay:hide'),
    setPosition: (pos) => ipcRenderer.send('overlay:position', pos),
    onPosition: (cb) => ipcRenderer.on('overlay:position', (_e, pos) => cb(pos))
  },

  player: {
    publish: (state) => ipcRenderer.send('player:state', state),
    tick: (data) => ipcRenderer.send('player:tick', data),
    cmd: (cmd) => ipcRenderer.send('player:cmd', cmd),
    getState: () => unwrap(invoke('state:get')),
    onCommand: (cb) => ipcRenderer.on('player:cmd', (_e, cmd) => cb(cmd)),
    onState: (cb) => ipcRenderer.on('state:full', (_e, state) => cb(state)),
    onTick: (cb) => ipcRenderer.on('state:tick', (_e, tick) => cb(tick)),
    onExpanded: (cb) => ipcRenderer.on('overlay:expanded', (_e, v) => cb(!!v)),
    onPinned: (cb) => ipcRenderer.on('overlay:pinned', (_e, v) => cb(!!v)),
    onOverlayState: (cb) => ipcRenderer.on('overlay:state', (_e, st) => cb(st)),
    onHover: (cb) => ipcRenderer.on('overlay:hover', (_e, v) => cb(!!v))
  },

  onAuthReady: (cb) => ipcRenderer.on('auth:ready', (_e, user) => cb(user))
});
