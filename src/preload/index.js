"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    winget: {
        getInstalledApps: () => electron_1.ipcRenderer.invoke('winget:getInstalledApps'),
        getAvailableUpdates: () => electron_1.ipcRenderer.invoke('winget:getAvailableUpdates'),
        upgradePackage: (id) => electron_1.ipcRenderer.invoke('winget:upgradePackage', id),
        upgradeAll: () => electron_1.ipcRenderer.invoke('winget:upgradeAll'),
    },
    dialog: {
        showError: (title, content) => electron_1.ipcRenderer.invoke('dialog:showError', title, content),
    },
});
//# sourceMappingURL=index.js.map