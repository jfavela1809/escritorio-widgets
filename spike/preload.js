'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spike', {
  ignorar: (v) => ipcRenderer.send('spike:ignorar', !!v),
  raton: (d) => ipcRenderer.send('spike:raton', d),
});
