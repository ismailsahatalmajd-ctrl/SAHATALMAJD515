const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openExternal: (url) => shell.openExternal(url),
    platform: process.platform,
    zkSync: (params) => ipcRenderer.invoke('zk-sync', params),
});
