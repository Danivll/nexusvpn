import { contextBridge, ipcRenderer } from 'electron';

export interface VpnServer {
  id: string;
  name: string;
  country: string;
  flag: string;
  ping: number;
  ip: string;
  protocol: string;
  port: number;
  speed: number;
  sessions: number;
  ovpnConfig?: string;
}

export interface VpnEvent {
  event: 'connected' | 'disconnected' | 'log';
  payload?: unknown;
}

contextBridge.exposeInMainWorld('electronAPI', {
  /** Server list */
  getServers:      (): Promise<VpnServer[]>                   => ipcRenderer.invoke('vpn:get-servers'),
  refreshServers:  (): Promise<VpnServer[]>                   => ipcRenderer.invoke('vpn:refresh-servers'),

  /** Connection control */
  connect:    (serverId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('vpn:connect', serverId),
  disconnect: (): Promise<{ ok: boolean }>                    => ipcRenderer.invoke('vpn:disconnect'),

  /** Check if OpenVPN is installed */
  checkOpenVPN: (): Promise<{ found: boolean; path: string | null; isAdmin?: boolean }> =>
    ipcRenderer.invoke('vpn:check-openvpn'),

  /** Listen for real-time VPN status events from main process */
  onVpnEvent: (callback: (evt: VpnEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, evt: VpnEvent) => callback(evt);
    ipcRenderer.on('vpn:event', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('vpn:event', handler);
  },
});
