
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

console.log('================================');
console.log('Electron started!');
console.log('isDev:', isDev);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('================================');

let mainWindow;

function createWindow() {
    console.log('Creating window...');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ساحات المجد - نظام إدارة المخزون',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '.next/index.html')}`;

    console.log('Loading URL:', startUrl);

    mainWindow.loadURL(startUrl).catch(err => {
        console.error('Failed to load URL:', err);
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Arabic RTL Menu
    const menuTemplate = [
        {
            label: 'ملف',
            submenu: [
                {
                    label: 'تحديث',
                    accelerator: 'F5',
                    click: () => mainWindow.reload(),
                },
                { type: 'separator' },
                {
                    label: 'إغلاق',
                    accelerator: 'Alt+F4',
                    click: () => app.quit(),
                },
            ],
        },
        {
            label: 'عرض',
            submenu: [
                {
                    label: 'تكبير',
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => {
                        const currentZoom = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(currentZoom + 1);
                    },
                },
                {
                    label: 'تصغير',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => {
                        const currentZoom = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(currentZoom - 1);
                    },
                },
                {
                    label: 'الحجم الافتراضي',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow.webContents.setZoomLevel(0),
                },
                { type: 'separator' },
                {
                    label: 'ملء الشاشة',
                    accelerator: 'F11',
                    click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
                },
            ],
        },
        {
            label: 'تنقل',
            submenu: [
                {
                    label: 'رجوع',
                    accelerator: 'Alt+Left',
                    click: () => {
                        if (mainWindow.webContents.canGoBack()) {
                            mainWindow.webContents.goBack();
                        }
                    },
                },
                {
                    label: 'تقدم',
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
            label: 'تطوير',
            submenu: [
                {
                    label: 'أدوات المطور',
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

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page loaded successfully!');
    });

    mainWindow.on('closed', () => {
        console.log('Window closed');
        mainWindow = null;
    });

    console.log('Window created successfully!');
}

app.whenReady().then(() => {
    console.log('App is ready!');
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.log('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

console.log('Electron script loaded');
