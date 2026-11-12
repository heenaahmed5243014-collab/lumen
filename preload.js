const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumenStore', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  exportData: (data) => ipcRenderer.invoke('store:export', data),
  importData: () => ipcRenderer.invoke('store:import'),
});
