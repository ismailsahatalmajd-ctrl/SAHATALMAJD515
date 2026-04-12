const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
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
        title: 'SOHEEL - نظام سهيل لإدارة المخزون',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'electron', 'preload.js'),
        },
    });

    if (isDev) {
        console.log('DEV MODE: Loading local application from http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000').catch(err => {
            console.error('FAILED to load localhost:3000. Is "npm run dev" running?', err);
        });
        mainWindow.webContents.openDevTools();
    } else {
        // Load the live production site to ensure it's always up-to-date
        // This makes the desktop app a reflection of the current website
        const LIVE_URL = 'https://sahatcom.cards';

        console.log(`PRODUCTION MODE: Loading live application from: ${LIVE_URL}`);

        mainWindow.loadURL(LIVE_URL).catch(err => {
            console.error(`CRITICAL: Failed to load ${LIVE_URL}`, err);
        });
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


// ZKTeco Sync IPC Handler
ipcMain.handle('zk-sync', async (event, { ip, port }) => {
    console.log(`Starting ZKTeco sync (Using node-zklib) for IP: ${ip}, Port: ${port}`);
    
    // Validate IP/Hostname
    if (!ip) return { success: false, error: 'يرجى إدخال عنوان الـ IP أو الرابط.' };

    const ZKLib = require('node-zklib');
    const zk = new ZKLib(ip, port || 4370, 10000, 4000);

    try {
        console.log(`Attempting to connect to ${ip}...`);
        
        // Some ZK devices require a few attempts or a specific handshake
        await zk.createSocket();
        
        console.log('Connection established! Waiting for handshake...');
        
        // Give the device a moment to stabilize the socket
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Fetching users list...');
        const users = await zk.getUsers();
        
        console.log('Fetching attendance logs...');
        const attendances = await zk.getAttendances();
        
        console.log(`Synchronization Successful! Users: ${users.data.length}, Logs: ${attendances.data.length}`);
        
        // Important: Always disconnect to free the socket for the next run
        try {
            await zk.disconnect();
        } catch (e) {
            console.warn('Disconnect error (non-fatal):', e);
        }
        
        return {
            success: true,
            data: {
                users: users.data || [],
                attendances: attendances.data || []
            }
        };
    } catch (error) {
        console.error('Final ZKTeco Error:', error);
        
        let errorMessage = 'فشل الاتصال: ';
        const errStr = String(error.message || error.code || '');

        if (errStr.includes('ETIMEDOUT')) {
            errorMessage += 'انتهت المهلة. تأكد أن الجهاز يعمل على IP: ' + ip;
        } else if (errStr.includes('ECONNREFUSED')) {
            errorMessage += 'تم رفض الاتصال. تأكد من فتح المنفذ (Port) 4370.';
        } else if (errStr.includes('EHOSTUNREACH')) {
            errorMessage += 'لا يمكن الوصول للجهاز. تأكد أنه متصل بنفس الشبكة.';
        } else {
            errorMessage += 'الجهاز لا يستجيب. (تأكد من إعدادات الـ IP والكيبل)';
        }

        return {
            success: false,
            error: errorMessage,
            diagnostic: {
                rawError: errStr,
                ip: ip,
                port: port
            }
        };
    }
});

console.log('Electron script loaded');
