const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ZKLib = require('node-zkteco'); // Ensure you run: npm install node-zkteco

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set the URL for the fingerprint module
  mainWindow.loadURL('http://localhost:3000/fingerprint');
}

// ZKTeco Sync IPC Handler
ipcMain.handle('zkSync', async (event, { ip, port }) => {
  console.log(`[Bridge] Attemping to connect to ZKTeco device at ${ip}:${port}...`);
  const zk = new ZKLib(ip, Number(port), 10000, 4000);
  
  try {
    await zk.createSocket();
    console.log('[Bridge] Connected successfully.');
    
    const users = await zk.getUsers();
    const attendances = await zk.getAttendances();
    
    await zk.disconnect();
    console.log('[Bridge] Disconnected.');
    
    return { 
      success: true, 
      data: { 
        users: users.data, 
        attendances: attendances.data 
      } 
    };
  } catch (error) {
    console.error('[Bridge] Connection or Sync Error:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
