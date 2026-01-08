const { spawn } = require('child_process');
const path = require('path');

console.log('Starting custom vercel-build script...');
console.log('Current directory:', process.cwd());
console.log('Ignored arguments:', process.argv.slice(2));

// Use npx to ensure we find the next executable in node_modules
// "npx" handles .cmd on Windows automatically
const cmd = 'npx';
const args = ['next', 'build', '--webpack'];

console.log(`Running command: ${cmd} ${args.join(' ')}`);

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_DISABLE_ESLINT: '1',
    NEXT_DISABLE_TS_CHECK: '1',
    NODE_OPTIONS: '--max-old-space-size=4096'
  }
});

child.on('error', (err) => {
  console.error('Failed to start build process:', err);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`Build process exited with code ${code}`);
  process.exit(code);
});
