const esbuild = require('esbuild');
const { existsSync } = require('fs');
const { resolve, join } = require('path');

const watch = process.argv.includes('--watch');

/**
 * Plugin to handle TypeScript ESM-style .js extension imports.
 * TypeScript convention: `import { x } from './foo.js'` resolves to `./foo.ts`.
 * esbuild doesn't do this by default.
 */
const tsExtensionPlugin = {
  name: 'ts-extension-resolve',
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.path.startsWith('.')) return;
      const tsPath = resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
      if (existsSync(tsPath)) {
        return { path: tsPath };
      }
    });
  },
};

const serverSrc = join(__dirname, '..', 'ssh-server', 'src', 'index.ts');

// Build the VS Code extension
const extensionBuild = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !watch,
};

// Bundle the SSH MCP server with ALL dependencies inlined so the
// extension is fully self-contained when installed as a VSIX.
// Output as .cjs so Node treats it as CommonJS regardless of package.json.
const serverBuild = {
  entryPoints: [serverSrc],
  bundle: true,
  outfile: 'dist/server/index.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  minify: false,
  plugins: [tsExtensionPlugin],
  // Native addons can't be bundled — ssh2 has try/catch fallbacks for these
  external: ['cpu-features'],
  logLevel: 'warning',
};

if (watch) {
  Promise.all([
    esbuild.context(extensionBuild),
    esbuild.context(serverBuild),
  ]).then(([extCtx, srvCtx]) => {
    extCtx.watch();
    srvCtx.watch();
    console.log('Watching for changes...');
  });
} else {
  Promise.all([
    esbuild.build(extensionBuild),
    esbuild.build(serverBuild),
  ]).then(() => {
    console.log('Build complete');
  }).catch((err) => {
    console.error('Build failed:', err.message || err);
    process.exit(1);
  });
}
