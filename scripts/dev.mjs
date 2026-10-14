// Runs the standalone server and the Vite dev server together.
// The server owns the API and serves the built web client; Vite gives HMR in dev.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const children = [];
function run(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited with ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('server', npx, ['tsx', 'watch', 'packages/server/src/index.ts']);
run('web', npx, ['vite', '--config', 'packages/web/vite.config.ts']);
