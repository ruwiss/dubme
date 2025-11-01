const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Setup error logging
const logPath = path.join(app.getPath('userData'), 'error.log');
function logError(message, error) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n${error ? error.stack : ''}\n\n`;
  console.error(logMessage);
  try {
    fs.appendFileSync(logPath, logMessage);
  } catch (e) {
    console.error('Cannot write to log file:', e);
  }
}

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection:', reason);
});

try {
  const videoAnalyzer = require('../services/video-analyzer');
  logError('Video analyzer loaded successfully', null);
} catch (error) {
  logError('Failed to load video analyzer:', error);
}

// ytdl-core update kontrolünü kapat
process.env.YTDL_NO_UPDATE = '1';

// Undici timer hatasını düzelt - Electron ortamı için polyfill
const originalSetTimeout = global.setTimeout;
global.setTimeout = function(callback, delay, ...args) {
  const timeout = originalSetTimeout(callback, delay, ...args);
  
  // unref metodunu ekle
  if (!timeout.unref) {
    timeout.unref = function() { return this; };
  }
  if (!timeout.ref) {
    timeout.ref = function() { return this; };
  }
  if (!timeout.hasRef) {
    timeout.hasRef = function() { return true; };
  }
  
  return timeout;
};

let mainWindow;
let segmentEditorWindow;
let segmentEditorData = null;
let selectedSegments = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#1a1a1a',
    frame: true,
    autoHideMenuBar: true
  });

  // Tam ekran başlat
  mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  try {
    logError('App is ready, starting initialization', null);
    
    // Uygulama başlangıcında cache temizle
    cleanupYtdlCache();
    
    // Production'da userData kullan, development'ta appPath
    const isDev = !app.isPackaged;
    const basePath = isDev ? app.getAppPath() : app.getPath('userData');
    logError('Base path: ' + basePath + ' (isDev: ' + isDev + ')', null);
    
    // dubbed klasörünü oluştur
    const dubbedPath = path.join(basePath, 'dubbed');
    if (!fs.existsSync(dubbedPath)) {
      fs.mkdirSync(dubbedPath, { recursive: true });
    }
    
    // merged klasörünü oluştur
    const mergedPath = path.join(basePath, 'merged');
    if (!fs.existsSync(mergedPath)) {
      fs.mkdirSync(mergedPath, { recursive: true });
    }
    
    logError('Creating main window', null);
    createWindow();
    logError('Main window created successfully', null);
    
    // Auto-updater - Sadece production'da
    if (!isDev) {
      setupAutoUpdater();
    }
  } catch (error) {
    logError('Error during app initialization:', error);
    dialog.showErrorBox('Başlatma Hatası', 'Uygulama başlatılamadı: ' + error.message + '\\n\\nLog: ' + logPath);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // ytdl-core cache dosyalarını temizle
  cleanupYtdlCache();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


// Auto-updater setup
function setupAutoUpdater() {
  // Log ayarları
  autoUpdater.logger = {
    info: (msg) => logError('AutoUpdater: ' + msg, null),
    warn: (msg) => logError('AutoUpdater Warning: ' + msg, null),
    error: (msg) => logError('AutoUpdater Error: ' + msg, null)
  };
  
  // Güncelleme kontrolü
  autoUpdater.checkForUpdatesAndNotify();
  
  // Güncelleme mevcut
  autoUpdater.on('update-available', (info) => {
    logError('Güncelleme mevcut: ' + info.version, null);
    mainWindow.webContents.send('update-available', info);
  });
  
  // Güncelleme yok
  autoUpdater.on('update-not-available', (info) => {
    logError('Güncelleme yok', null);
  });
  
  // İndirme ilerleme
  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('download-progress', progress);
  });
  
  // Güncelleme indirildi
  autoUpdater.on('update-downloaded', (info) => {
    logError('Güncelleme indirildi: ' + info.version, null);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Güncelleme Hazır',
      message: 'Yeni versiyon indirildi ve kurulmaya hazır.',
      detail: `Versiyon ${info.version}\n\nUygulama şimdi yeniden başlatacak.`,
      buttons: ['Yeniden Başlat', 'Daha Sonra']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
  
  // Hata
  autoUpdater.on('error', (error) => {
    logError('AutoUpdater hatası:', error);
  });
}

// ytdl-core cache temizleme
function cleanupYtdlCache() {
  try {
    // Sadece development'ta çalıştır (production'da asar içinden okunamaz)
    if (app.isPackaged) return;
    
    // Proje root dizinindeki player-script dosyalarını temizle
    const projectRoot = app.getAppPath();
    const files = fs.readdirSync(projectRoot);
    files.forEach(file => {
      if (file.includes('-player-script.js')) {
        const filePath = path.join(projectRoot, file);
        try {
          fs.unlinkSync(filePath);
          console.log('Temizlendi:', file);
        } catch (err) {
          console.error('Silinemedi:', file, err);
        }
      }
    });
  } catch (err) {
    console.error('Cache temizleme hatası:', err);
  }
}

// IPC Handlers
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-external-url', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('save-settings', async (event, settings) => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return true;
});

ipcMain.handle('load-settings', async () => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');
  
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(data);
  }
  
  return { apiKeys: [], archivedApiKeys: [] };
});

ipcMain.handle('save-file-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath,
    filters: [
      { name: 'Video', extensions: ['mp4'] },
      { name: 'Audio', extensions: ['mp3'] }
    ]
  });
  
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-downloads-path', async () => {
  return app.getPath('downloads');
});

ipcMain.handle('select-audio-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result.response;
});

ipcMain.handle('get-default-folders', async () => {
  const isDev = !app.isPackaged;
  const basePath = isDev ? app.getAppPath() : app.getPath('userData');
  return {
    dubbed: path.join(basePath, 'dubbed'),
    merged: path.join(basePath, 'merged')
  }
});

// Segment Editor IPC Handlers
ipcMain.handle('open-segment-editor', async (event, data) => {
  segmentEditorData = data;
  
  if (segmentEditorWindow) {
    segmentEditorWindow.focus();
    return;
  }
  
  segmentEditorWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true
  });
  
  segmentEditorWindow.maximize();
  segmentEditorWindow.loadFile(path.join(__dirname, '../renderer/segment-editor.html'));
  
  // Always open dev tools for debugging segment editor issues
  segmentEditorWindow.webContents.openDevTools();
  
  segmentEditorWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Segment editor failed to load:', errorCode, errorDescription);
  });
  
  segmentEditorWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Segment Editor [${level}]:`, message);
  });
  
  segmentEditorWindow.on('closed', () => {
    segmentEditorWindow = null;
  });
});

ipcMain.handle('get-segment-editor-data', async () => {
  return segmentEditorData;
});

ipcMain.handle('set-segments', async (event, segments) => {
  selectedSegments = segments;
  return true;
});

ipcMain.handle('get-segments', async () => {
  return selectedSegments;
});

ipcMain.on('close-segment-editor', () => {
  if (segmentEditorWindow) {
    segmentEditorWindow.close();
  }
});

ipcMain.handle('analyze-video', async (event, { videoPath, duration }) => {
  try {
    const result = await videoAnalyzer.analyzeVideo(videoPath, duration);
    return result;
  } catch (error) {
    console.error('Video analysis error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('extract-audio-for-preview', async (event, videoPath) => {
  try {
    console.log('Extracting audio for preview:', videoPath);
    const audioPath = await videoAnalyzer.extractAudio(videoPath);
    console.log('Audio extracted to:', audioPath);
    return audioPath;
  } catch (error) {
    console.error('Audio extraction error:', error);
    return null;
  }
});
