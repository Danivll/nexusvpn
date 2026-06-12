import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

// Fix black screen in RDP/VM/AMD GPU environments
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('use-gl', 'swiftshader');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('ignore-gpu-blacklist');

let win: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

// ─── Cloudflare WARP ─────────────────────────────────────────────────────────
const IS_LINUX = process.platform === 'linux';
const IS_WIN   = process.platform === 'win32';
const WARP_CLI = IS_LINUX ? '/usr/bin/warp-cli' : 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';

// ─── Auto-install Cloudflare WARP if not present ──────────────────────────────
function getResourcePath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', filename);
  }
  return path.join(app.getAppPath(), 'resources', filename);
}

async function ensureWarpInstalled(): Promise<void> {
  if (fs.existsSync(WARP_CLI)) return; // already installed

  const { dialog: d } = require('electron');

  if (IS_LINUX) {
    // On Linux, show instructions to install via apt
    await d.showMessageBox({
      type: 'info',
      title: 'NexusVPN — Instalar Cloudflare WARP',
      message: 'Cloudflare WARP no está instalado.\n\nAbre una terminal y ejecuta:\n\ncurl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg\necho "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list\nsudo apt update && sudo apt install -y cloudflare-warp\n\nLuego reinicia NexusVPN.',
      buttons: ['OK'],
    });
    return;
  }

  // Windows: auto-install from bundled MSI
  const msiPath = getResourcePath('Cloudflare_WARP_Release-x64.msi');
  if (!fs.existsSync(msiPath)) return;

  const choice = await d.showMessageBox({
    type: 'info',
    title: 'NexusVPN — Instalar Cloudflare WARP',
    message: 'NexusVPN necesita Cloudflare WARP para funcionar.\n\nSe instalará automáticamente ahora. Esto puede tardar unos segundos.',
    buttons: ['Instalar', 'Cancelar'],
    defaultId: 0,
  });

  if (choice.response !== 0) return;

  await new Promise<void>((resolve) => {
    const proc = spawn('msiexec.exe', ['/i', msiPath, '/qn', '/norestart'], {
      windowsHide: true,
    });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve());
  });
}

function findWarpCli(): boolean {
  return fs.existsSync(WARP_CLI);
}

function warpRun(args: string[]): string {
  try {
    const { execSync } = require('node:child_process');
    const cmd = IS_LINUX ? `${WARP_CLI} ${args.join(' ')}` : `"${WARP_CLI}" ${args.join(' ')}`;
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    }).trim();
  } catch (e: any) {
    return e?.stdout?.trim() || e?.message || '';
  }
}

// ─── Send events to renderer ──────────────────────────────────────────────────
function sendVpnEvent(event: string, payload?: unknown) {
  win?.webContents.send('vpn:event', { event, payload });
}

// ─── Server list (Cloudflare WARP locations) ──────────────────────────────────
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
}

function getServers(): VpnServer[] {
  return [
    { id: 'warp-auto', name: 'Automatic', country: 'Automatic', flag: '⚡', ping: 5, ip: '1.1.1.1', protocol: 'WARP/WireGuard', port: 2408, speed: 100, sessions: 0 },
    { id: 'warp-us', name: 'New York', country: 'United States', flag: '🇺🇸', ping: 80, ip: '162.159.193.10', protocol: 'WARP/WireGuard', port: 2408, speed: 80, sessions: 0 },
    { id: 'warp-us-la', name: 'Los Angeles', country: 'United States', flag: '🇺🇸', ping: 75, ip: '162.159.195.10', protocol: 'WARP/WireGuard', port: 2408, speed: 85, sessions: 0 },
    { id: 'warp-br', name: 'São Paulo', country: 'Brazil', flag: '🇧🇷', ping: 45, ip: '162.159.192.10', protocol: 'WARP/WireGuard', port: 2408, speed: 90, sessions: 0 },
    { id: 'warp-mx', name: 'Mexico City', country: 'Mexico', flag: '🇲🇽', ping: 60, ip: '162.159.194.10', protocol: 'WARP/WireGuard', port: 2408, speed: 85, sessions: 0 },
    { id: 'warp-co', name: 'Bogotá', country: 'Colombia', flag: '🇨🇴', ping: 40, ip: '162.159.196.10', protocol: 'WARP/WireGuard', port: 2408, speed: 90, sessions: 0 },
    { id: 'warp-ar', name: 'Buenos Aires', country: 'Argentina', flag: '🇦🇷', ping: 55, ip: '162.159.197.10', protocol: 'WARP/WireGuard', port: 2408, speed: 80, sessions: 0 },
    { id: 'warp-uk', name: 'London', country: 'United Kingdom', flag: '🇬🇧', ping: 130, ip: '162.159.198.10', protocol: 'WARP/WireGuard', port: 2408, speed: 75, sessions: 0 },
    { id: 'warp-de', name: 'Frankfurt', country: 'Germany', flag: '🇩🇪', ping: 140, ip: '162.159.199.10', protocol: 'WARP/WireGuard', port: 2408, speed: 70, sessions: 0 },
    { id: 'warp-es', name: 'Madrid', country: 'Spain', flag: '🇪🇸', ping: 125, ip: '162.159.200.10', protocol: 'WARP/WireGuard', port: 2408, speed: 72, sessions: 0 },
    { id: 'warp-ca', name: 'Toronto', country: 'Canada', flag: '🇨🇦', ping: 90, ip: '162.159.201.10', protocol: 'WARP/WireGuard', port: 2408, speed: 78, sessions: 0 },
  ];
}



// ─── Connect via WARP ─────────────────────────────────────────────────────────
async function connectVpn(_serverId: string): Promise<{ ok: boolean; error?: string }> {
  if (!findWarpCli()) {
    return { ok: false, error: 'Cloudflare WARP not found. Please install it from https://1.1.1.1' };
  }

  sendVpnEvent('log', 'Connecting via Cloudflare WARP...');

  try {
    // 1. Configure mode and disconnect any previous session
    warpRun(['disconnect']);
    await new Promise(r => setTimeout(r, 500));
    
    // 2. Connect
    const connectResult = warpRun(['connect']);
    sendVpnEvent('log', connectResult);

    // 3. Poll status up to 12 seconds
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const status = warpRun(['status']);
      sendVpnEvent('log', status);
      if (status.toLowerCase().includes('connected')) {
        sendVpnEvent('connected');
        return { ok: true };
      }
    }
    
    return { ok: false, error: 'WARP did not connect in time. Try again.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to connect via WARP' };
  }
}

function disconnectVpn(): { ok: boolean } {
  try { warpRun(['disconnect']); } catch (_) {}
  sendVpnEvent('disconnected', 'User disconnected');
  return { ok: true };
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────
ipcMain.handle('vpn:get-servers', () => getServers());
ipcMain.handle('vpn:refresh-servers', () => getServers());
ipcMain.handle('vpn:connect', async (_, serverId: string) => connectVpn(serverId));
ipcMain.handle('vpn:disconnect', () => disconnectVpn());
ipcMain.handle('vpn:check-openvpn', async () => {
  const warpFound = findWarpCli();
  let isAdmin = false;
  try {
    if (IS_LINUX) {
      const uid = require('node:child_process').execSync('id -u', { encoding: 'utf8' }).trim();
      isAdmin = uid === '0';
    } else {
      require('node:child_process').execSync('net session', { stdio: 'ignore' });
      isAdmin = true;
    }
  } catch { /* not admin */ }
  return { found: warpFound, path: warpFound ? WARP_CLI : null, isAdmin };
});

// ─── Wait for Vite dev server before loading ─────────────────────────────────
function waitForVite(url: string, retries = 20): Promise<void> {
  return new Promise((resolve) => {
    const attempt = (n: number) => {
      http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (n > 0) {
          setTimeout(() => attempt(n - 1), 500);
        } else {
          resolve();
        }
      }).on('error', () => {
        if (n > 0) setTimeout(() => attempt(n - 1), 500);
        else resolve();
      });
    };
    attempt(retries);
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC ?? '', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
  });

  const devUrl = VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (!app.isPackaged) {
    waitForVite(devUrl).then(() => {
      win!.loadURL(devUrl).catch((err) => {
        console.error('loadURL failed:', err);
      });
      win!.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    win.loadFile(path.join(process.env.DIST ?? 'dist', 'index.html'));
  }
}

app.on('before-quit', () => {
  try { warpRun(['disconnect']); } catch (_) {}
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); win = null; }
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.whenReady().then(async () => {
  await ensureWarpInstalled();
  createWindow();
});
