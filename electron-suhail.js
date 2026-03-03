const { app, BrowserWindow, Menu, shell, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

// ─── Offline Mode: Disable Firebase / Cloud Sync ────────────────────────────
process.env.NEXT_PUBLIC_OFFLINE_MODE = 'true';
process.env.NEXT_PUBLIC_DISABLE_FIREBASE = 'true';

// Register custom protocol BEFORE app is ready
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true } }
]);

const isDev = !app.isPackaged;
const APP_NAME = 'Suhail';

let mainWindow;

// ─── Create Window ────────────────────────────────────────────────────────────
function createWindow() {
    const iconPath = path.join(__dirname, 'public', 'suhail-icon.png');
    const iconExists = fs.existsSync(iconPath);

    const winOpts = {
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: `${APP_NAME} - نظام إدارة المخزون`,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0f172a',
        show: false,
    };

    if (iconExists) winOpts.icon = iconPath;

    mainWindow = new BrowserWindow(winOpts);

    // Show window when ready (avoids white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        // Dev mode: Load from local Next.js dev server
        const devUrl = 'http://localhost:3004';
        console.log(`[${APP_NAME}] DEV — Loading: ${devUrl}`);
        mainWindow.loadURL(devUrl).catch((err) => {
            console.error('Failed to load:', err.message);
            mainWindow.loadURL(`data:text/html,<div dir="rtl" style="font-family:sans-serif;padding:40px"><h2>تعذّر الاتصال</h2><p>تأكد أن الـ dev server شغّال على port 3004</p><p>شغّل: <code>npm run dev -- -p 3004</code></p></div>`);
        });
    } else {
        // Production: Load from static export via app:// protocol
        console.log(`[${APP_NAME}] PROD — Loading static build...`);
        mainWindow.loadURL('app://./index.html').catch((err) => {
            console.error('Failed to load static build:', err.message);
        });
    }

    // External links → open in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    buildMenu();
}

// ─── App Menu ────────────────────────────────────────────────────────────────
function buildMenu() {
    const template = [
        {
            label: 'سهيل',
            submenu: [
                { label: `${APP_NAME} — وضع محلي (بدون اتصال بالسحابة)`, enabled: false },
                { type: 'separator' },
                { label: 'تحديث الصفحة', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
                { type: 'separator' },
                { label: 'إغلاق', accelerator: 'Alt+F4', click: () => app.quit() },
            ],
        },
        {
            label: 'عرض',
            submenu: [
                { label: 'تكبير النص', accelerator: 'CmdOrCtrl+=', click: () => { if (mainWindow) mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5); } },
                { label: 'تصغير النص', accelerator: 'CmdOrCtrl+-', click: () => { if (mainWindow) mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5); } },
                { label: 'الحجم الافتراضي', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && mainWindow.webContents.setZoomLevel(0) },
                { type: 'separator' },
                { label: 'ملء الشاشة', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
                { label: 'أدوات المطور', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    // Handle app:// protocol for static build
    protocol.handle('app', (request) => {
        let urlPath = new URL(request.url).pathname;
        if (urlPath === '/') urlPath = '/index.html';
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        if (!path.extname(urlPath) && !urlPath.startsWith('/_next/')) urlPath += '.html';

        const filePath = path.join(__dirname, 'out', urlPath);

        // Fallback to index.html for SPA routing
        if (!fs.existsSync(filePath)) {
            const indexPath = path.join(__dirname, 'out', 'index.html');
            return net.fetch(pathToFileURL(indexPath).toString());
        }

        return net.fetch(pathToFileURL(filePath).toString());
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
