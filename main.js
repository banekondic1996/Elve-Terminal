const { app,ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const win = null;
function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    menu: null
    
  }); 
  win.removeMenu();
  win.loadFile('index.html');
  win.webContents.audioMuted = true;
  win.on('minimize', () => {
    console.log('Window minimized → unmuting audio');
    win.webContents.audioMuted = false;
  });

  win.on('restore', () => {
    console.log('Window restored → muting audio');
    win.webContents.audioMuted = true;
  });
  win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
ipcMain.on('open-new-window', () => {
  const newWin = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  newWin.loadFile('index.html');
  newWin.removeMenu();
});
//ipcMain.handle('check-window-minimized', () => win.isMinimized());