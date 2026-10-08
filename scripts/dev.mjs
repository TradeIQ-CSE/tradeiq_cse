import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot, requireNode20, serviceEnvironment, services } from './local-environment.mjs';

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') console.error(error.message);
      }
    }
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
          if (error.code !== 'ESRCH') console.error(error.message);
        }
      }
    }
  }, 5000);
}

try {
  requireNode20();
  const environments = {};
  for (const name of ['market-trading', 'identity-auth', 'frontend']) {
    const service = services[name];
    if (!existsSync(resolve(repoRoot, service.directory, 'node_modules'))) {
      throw new Error(`${name}: dependencies are missing. Run ./scripts/install.sh first.`);
    }
    environments[name] = serviceEnvironment(name);
    if (environments[name].NODE_ENV === 'production') {
      throw new Error('Hot reload uses local development settings; NODE_ENV is currently production.');
    }
  }
  for (const [name, keys] of Object.entries({
    'market-trading': ['MARKET_DATA_DATABASE_URL', 'AUTH_JWT_PUBLIC_KEYS', 'REDIS_URL'],
    'identity-auth': ['AUTH_DATABASE_URL', 'AUTH_JWT_PRIVATE_KEY', 'AUTH_EMAIL_ENCRYPTION_KEY'],
  })) {
    for (const key of keys) {
      if (!environments[name][key]) throw new Error(`${name}: ${key} is missing. Configure the root .env.`);
    }
  }
  process.on('SIGINT', () => stop(130));
  process.on('SIGTERM', () => stop(143));
  for (const [name, environment] of Object.entries(environments)) {
    console.log(`Starting ${name} with hot reload`);
    const child = spawn('pnpm', ['run', 'dev'], {
      cwd: resolve(repoRoot, services[name].directory),
      env: environment,
      stdio: 'inherit',
      detached: true,
    });
    children.push(child);
    child.on('error', (error) => {
      console.error(`${name}: ${error.message}`);
      stop(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        console.error(`${name} stopped (${signal ?? code}); stopping the remaining watchers.`);
        stop(code || 1);
      }
    });
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
