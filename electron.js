const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
let ZKLib = null;
try {
    ZKLib = require('zklib-js');
} catch (e) {
    console.warn('zklib-js not available:', e.message);
}

// Register the 'app' protocol
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true } }
]);

// Force dev mode when running locally (always use localhost:3000)
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.ELECTRON_DEV === 'true';
const LOCAL_URL = 'http://localhost:3000';

console.log('================================');
console.log('Electron started!');
console.log('isDev:', isDev);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('================================');

let mainWindow;

const bi = (ar, en) => `${ar} / ${en}`;

// Handle ZK Sync Request
// Channel name must match electron/preload.js (ipcRenderer.invoke('zk-sync', ...))
ipcMain.handle('zk-sync', async (event, { ip, port }) => {
    console.log(`[IPC] Received zk-sync request for ${ip}:${port}`);
    const zkInstance = new ZKLib(ip, port, 10000, 4000);
    
    try {
        console.log(`[ZK] Attempting to connect to ${ip}...`);
        await zkInstance.createSocket();
        
        console.log('[ZK] Connected! Fetching data...');
        const attendances = await zkInstance.getAttendances();
        const users = await zkInstance.getUsers();
        
        console.log(`[ZK] Success: Fetched ${attendances?.data?.length || 0} logs and ${users?.data?.length || 0} users.`);
        
        await zkInstance.disconnect();
        
        return {
            success: true,
            data: {
                attendances: attendances?.data || [],
                users: users?.data || []
            }
        };
    } catch (error) {
        console.error('[ZK] Connection Error:', error);
        return {
            success: false,
            error: error.message || 'فشل الاتصال بجهاز البصمة. تأكد من أن المنفذ مفتوح والجهاز متصل.'
        };
    }
});

async function createWindow() {
    console.log('Creating window...');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ساحة المجد - نظام إدارة المخزون',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'electron', 'preload.js'),
        },
    });

    // Clear all cached data (service workers, cache storage) to ensure fresh load
    try {
        const ses = mainWindow.webContents.session;
        await ses.clearCache();
        await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
        console.log('Cache and service workers cleared!');
    } catch (e) {
        console.error('Failed to clear cache:', e.message);
    }

    // Load local dev server (localhost:3000)
    console.log(`>>> Loading app from: ${LOCAL_URL} <<<`);
    mainWindow.loadURL(LOCAL_URL).catch(err => {
        console.error(`Failed to load ${LOCAL_URL}:`, err.message);
        mainWindow.loadURL(`data:text/html,<html dir="rtl"><body style="font-family:Arial;padding:40px;background:#1a1a2e;color:#e94560"><h1>⚠️ خطأ في الاتصال</h1><p style="color:#fff">تأكد من تشغيل السيرفر أولاً:<br><code style="background:#0f3460;padding:10px;border-radius:5px;display:block;margin:10px 0">npm run dev</code></p></body></html>`);
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Arabic RTL Menu
    const menuTemplate = [
        {
            label: bi('ملف', 'File'),
            submenu: [
                {
                    label: bi('تحديث', 'Reload'),
                    accelerator: 'F5',
                    click: () => mainWindow.reload(),
                },
                { type: 'separator' },
                {
                    label: bi('إغلاق', 'Close'),
                    accelerator: 'Alt+F4',
                    click: () => app.quit(),
                },
            ],
        },
        {
            label: bi('عرض', 'View'),
            submenu: [
                {
                    label: bi('تكبير', 'Zoom In'),
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => {
                        const currentZoom = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(currentZoom + 1);
                    },
                },
                {
                    label: bi('تصغير', 'Zoom Out'),
                    accelerator: 'CmdOrCtrl+-',
                    click: () => {
                        const currentZoom = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(currentZoom - 1);
                    },
                },
                {
                    label: bi('الحجم الافتراضي', 'Reset Zoom'),
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow.webContents.setZoomLevel(0),
                },
                { type: 'separator' },
                {
                    label: bi('ملء الشاشة', 'Full Screen'),
                    accelerator: 'F11',
                    click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
                },
            ],
        },
        {
            label: bi('تنقل', 'Navigate'),
            submenu: [
                {
                    label: bi('رجوع', 'Back'),
                    accelerator: 'Alt+Left',
                    click: () => {
                        if (mainWindow.webContents.canGoBack()) {
                            mainWindow.webContents.goBack();
                        }
                    },
                },
                {
                    label: bi('تقدم', 'Forward'),
                    accelerator: 'Alt+Right',
                    click: () => {
                        if (mainWindow.webContents.canGoForward()) {
                            mainWindow.webContents.goForward();
                        }
                    },
                },
            ],
        },
    ];

    if (isDev) {
        menuTemplate.push({
            label: bi('تطوير', 'Developer'),
            submenu: [
                {
                    label: bi('أدوات المطور', 'Developer Tools'),
                    accelerator: 'F12',
                    click: () => mainWindow.webContents.toggleDevTools(),
                },
            ],
        });
    }

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Load failed:', errorCode, errorDescription);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    console.log('App is ready!');

    protocol.handle('app', (request) => {
        let url = new URL(request.url).pathname;
        if (url === '/') url = '/index.html';
        if (url.endsWith('/')) url += 'index.html';
        if (!path.extname(url) && !url.startsWith('/_next/') && !url.includes('.')) {
            url += '.html';
        }

        const filePath = path.join(__dirname, 'out', url);

        try {
            return net.fetch(pathToFileURL(filePath).toString());
        } catch (e) {
            console.error('Protocol handle error:', e);
            return new Response('Internal Server Error', { status: 500 });
        }
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


