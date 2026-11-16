// @nexconn/server-sdk@0.1.2 installed from git ships only .ts sources (its .gitignore lists `dist`,
// so pnpm/npm drop the built output when packing). Build dist/ in place after every install.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let pkgDir;
try { pkgDir = dirname(require.resolve('@nexconn/server-sdk/package.json')); } catch { process.exit(0); }
if (existsSync(join(pkgDir, 'dist', 'index.js')) && existsSync(join(pkgDir, 'dist', 'esm', 'index.js'))) process.exit(0);

const tsc = require.resolve('typescript/bin/tsc');
const typeRoots = join(dirname(require.resolve('@types/node/package.json')), '..');
for (const project of ['tsconfig.json', 'tsconfig.esm.json']) {
  execFileSync(process.execPath, [tsc, '-p', join(pkgDir, project), '--typeRoots', typeRoots], { stdio: 'inherit' });
}
console.log('[nexconn] built @nexconn/server-sdk dist/ in', pkgDir);
