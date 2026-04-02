const { app, BrowserWindow, shell, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

// Register custom protocol 'app'
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

// Disable hardware acceleration to avoid graphical glitches on some Windows machines
// app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../public/icon.ico'), // Ensure you consider the icon path
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true, // Keep enabled for security
        },
        autoHideMenuBar: true,
    });

    // Determine availability of the static build
    const isDev = !app.isPackaged;

    if (isDev) {
        // In dev mode, we usually run a separate next dev server
        const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../out/index.html')}`;
        mainWindow.loadURL(startUrl);
    } else {
        // Production: Load from custom protocol
        mainWindow.loadURL('app://./index.html');
    }

    // Open DevTools for debugging (temporarily enabled for troubleshooting)
    // mainWindow.webContents.openDevTools();

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // If it's an external protocol (http/https) and not our own domain (if applicable), open in browser
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Handle 'app://' protocol to serve files from 'out' directory
    protocol.handle('app', (request) => {
        const urlParsed = url.parse(request.url);
        // Normalize path: broken out of the URL
        let filePath = urlParsed.pathname;

        // Verify we are not going up directories (security)
        // In this simple app, we just serve from the app bundle resource
        // Depending on packing, 'out' might be in resources/app/out or resources/out
        // When packaged with electron-builder, __dirname is usually inside app.asar/electron
        // So we look for ../out

        // Actually, with asar=true, we need to be careful.
        // Let's try to resolve relative to __dirname (which is inside bundle)
        let safePath = path.join(__dirname, '../out', filePath === '/' ? 'index.html' : filePath);

        // If no extension, try adding .html (for 'trailingSlash: false' builds)
        if (!path.extname(safePath)) {
            // Check if exact file exists, if not, try .html, if not try /index.html
            // Since we are inside asar, fs.existsSync works.
            if (!fs.existsSync(safePath)) {
                if (fs.existsSync(safePath + '.html')) {
                    safePath += '.html';
                } else if (fs.existsSync(path.join(safePath, 'index.html'))) {
                    safePath = path.join(safePath, 'index.html');
                }
            }
        }

        // Final fallback: if 404, usually we might want to serve 404.html or rely on standard error
        // But for net.fetch, we return a Response.

        return net.fetch(url.pathToFileURL(safePath).toString());
    });

    createWindow();

    app.on('activate', function () {
        if (mainWindow === null) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
