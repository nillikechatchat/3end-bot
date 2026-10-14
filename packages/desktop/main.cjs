// Desktop end: spawn the standalone server (the same one web uses), wait for it,
// then load the web client in a native window. No separate UI code to maintain.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const PORT = process.env.PORT || '8787';
const URL = `http://127.0.0.1:${PORT}`;
let server;

function startServer() {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  server = spawn(cmd, ['tsx', 'packages/server/src/index.ts'], { cwd: ROOT, stdio: 'inherit', env: process.env });
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    backgroundColor: '#0f1115',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(URL);
}

app.whenReady().then(async () => {
  startServer();
  if (!(await waitForServer())) {
    app.quit();
    return;
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (server && !server.killed) server.kill('SIGTERM');
});
