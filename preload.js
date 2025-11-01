const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isMinimized: () => ipcRenderer.invoke('check-window-minimized'),
});
