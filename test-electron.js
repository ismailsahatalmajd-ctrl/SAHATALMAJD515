const { app } = require('electron');
console.log('Electron is working!');
app.whenReady().then(() => {
    console.log('App ready, quitting...');
    app.quit();
});
