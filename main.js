// Electron main process. All data is stored locally as JSON in the OS user-data folder.
const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFile = () => path.join(app.getPath('userData'), 'lumen-data.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1222',
    title: 'Lumen',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  // Allow the microphone for offline speaking practice; deny everything else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
  // Block any network request: the app is fully offline.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = details.url.startsWith('file:') || details.url.startsWith('blob:') ||
      details.url.startsWith('data:') || details.url.startsWith('devtools:');
    cb({ cancel: !ok });
  });

  ipcMain.handle('store:load', () => {
    try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; }
  });
  ipcMain.handle('store:save', (_e, data) => {
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile());
    return true;
  });
  ipcMain.handle('store:export', async (_e, data) => {
    const { filePath } = await dialog.showSaveDialog({ defaultPath: 'lumen-backup.json' });
    if (!filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  });
  ipcMain.handle('store:import', async () => {
    const { filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!filePaths || !filePaths[0]) return null;
    return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
