const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pinway', {
  call: async (action, payload) => {
    const result = await ipcRenderer.invoke('pinway', action, payload);
    if (result.error) throw Error(result.error);
    return result.data;
  },
  subscribe: fn => ipcRenderer.on('event', (_event, type, payload) => fn(type, payload))
});
