const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const routesToHide = [
    path.join('app', 'api', 'image-proxy', 'route.ts'),
    path.join('app', 'api', 'upload', 'route.ts'),
];

console.log('--- Electron Build Wrapper (Surgical Mode) ---');

const hiddenFiles = [];

try {
    // 1. Hide individual route.ts files
    for (const relativePath of routesToHide) {
        const fullPath = path.join(process.cwd(), relativePath);
        const hiddenPath = fullPath.replace('route.ts', '_route.ts');

        if (fs.existsSync(fullPath)) {
            console.log(`Hiding ${relativePath}...`);
            try {
                fs.renameSync(fullPath, hiddenPath);
                hiddenFiles.push({ original: fullPath, hidden: hiddenPath });
            } catch (err) {
                console.warn(`Warning: Could not hide ${relativePath}. Error: ${err.message}`);
                if (err.code === 'EPERM') {
                    console.error('Permission Denied. Try closing any programs using this file.');
                }
            }
        }
    }

    // 2. Run the actual build
    console.log('\nStarting next build (Static Export)...');

    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    const result = spawnSync(cmd, ['next', 'build'], {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            IS_ELECTRON: 'true',
            NEXT_DISABLE_ESLINT: '1',
            NEXT_DISABLE_TS_CHECK: '1',
            NODE_OPTIONS: '--max-old-space-size=4096'
        }
    });

    if (result.status !== 0) {
        console.error('\nBuild failed with exit code:', result.status);
    } else {
        console.log('\nBuild completed successfully.');
    }

} catch (error) {
    console.error('\nAn error occurred during the build wrapper:', error);
} finally {
    // 3. ALWAYS restore the route files
    console.log('\nRestoring API routes...');
    for (const file of hiddenFiles) {
        if (fs.existsSync(file.hidden)) {
            try {
                fs.renameSync(file.hidden, file.original);
                console.log(`Restored: ${path.relative(process.cwd(), file.original)}`);
            } catch (err) {
                console.error(`CRITICAL: Failed to restore ${file.original}!`, err);
            }
        }
    }
}
