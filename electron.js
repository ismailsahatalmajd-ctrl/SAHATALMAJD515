const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Register the 'app' protocol
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true } }
]);

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

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // Load using our custom protocol
        mainWindow.loadURL('app://localhost/').catch(err => {
            console.error('CRITICAL: Failed to load app://localhost/', err);
        });

        // Always open DevTools in this phase to help debug
        mainWindow.webContents.openDevTools();
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
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

    // Handle the custom 'app' protocol
    protocol.handle('app', (request) => {
        let url = new URL(request.url).pathname;
        if (url === '/') url = '/index.html';

        // Add index.html if it's a directory-like path
        if (url.endsWith('/')) url += 'index.html';

        // If it doesn't have an extension and isn't a special Next.js asset path, append .html
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
    console.log('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

console.log('Electron script loaded');
