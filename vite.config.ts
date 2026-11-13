import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const srcDir = path.resolve(rootDir, 'assets');
      const destDir = path.resolve(rootDir, 'dist', 'assets');
      if (!fs.existsSync(srcDir)) return;
      fs.mkdirSync(destDir, {recursive: true});
      fs.cpSync(srcDir, destDir, {recursive: true});
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [copyStaticAssetsPlugin()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
