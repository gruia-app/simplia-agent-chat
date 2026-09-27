import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const demo = fileURLToPath(new URL('..', import.meta.url));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
run('pnpm', ['--filter', '@simplia/agent-chat-react', 'build'], root);
run('pnpm', ['build'], demo);
run('pnpm', ['exec', 'playwright', 'test', '-c', 'qa/playwright.config.ts'], demo);
