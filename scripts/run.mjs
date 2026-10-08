import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { repoRoot, requireNode20, serviceEnvironment, services } from './local-environment.mjs';

try {
  requireNode20();
  const [name, ...args] = process.argv.slice(2);
  if (!services[name] || args.length === 0) {
    throw new Error('Usage: ./scripts/run.sh <frontend|market-trading|identity-auth|ml-prediction|data-ingestion> <command> [arguments]');
  }
  const service = services[name];
  const child = spawn(service.command, ['run', ...args], {
    cwd: resolve(repoRoot, service.directory),
    env: serviceEnvironment(name),
    stdio: 'inherit',
    detached: true,
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (child.pid) {
        try { process.kill(-child.pid, signal); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    });
  }
  child.on('error', (error) => {
    console.error(`${name}: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
