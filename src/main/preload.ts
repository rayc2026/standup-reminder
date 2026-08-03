import { contextBridge, ipcRenderer } from "electron";
import type { PublicState, ReminderApi, Settings, UserAction } from "../shared/types";

const api: ReminderApi = {
  getState: () => ipcRenderer.invoke("reminder:get-state") as Promise<PublicState>,
  getCodexConfig: () => ipcRenderer.invoke("reminder:get-codex-config") as Promise<string>,
  updateSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke("reminder:update-settings", patch) as Promise<PublicState>,
  perform: (action: UserAction) =>
    ipcRenderer.invoke("reminder:perform", action) as Promise<PublicState>,
  onState: (callback: (state: PublicState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PublicState) => callback(state);
    ipcRenderer.on("reminder:state", listener);
    return () => ipcRenderer.removeListener("reminder:state", listener);
  },
};

contextBridge.exposeInMainWorld("reminder", api);
