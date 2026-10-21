// Internal testing only: original game assets are private-use only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const env = { ...process.env };
const studioJdk = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
if (!env.JAVA_HOME && existsSync(studioJdk)) env.JAVA_HOME = studioJdk;
const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
const local = join(android, 'local.properties');
if (!existsSync(local) && existsSync(sdk)) writeFileSync(local, `sdk.dir=${sdk}\n`);
assert.ok(existsSync(join(android, 'key.properties')), 'Release signing requires android/key.properties');

const run = (cmd, args, cwd = root) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd, env });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${cmd} ${args.join(' ')} failed`);
};
if (!process.argv.includes('--no-build')) {
  run('npx', ['tsc', '--noEmit']);
  env.RICH4_NO_ASSETS = '1';
  run('npx', ['vite', 'build']);
  env.RICH4_WEBP = '1';
  run('node', ['scripts/bundle-assets.mjs']);
}
run('npx', ['cap', 'sync', 'android']);

const assets = join(android, 'app/src/main/assets/public/assets');
const packs = { art_assets: ['hd', 'orig'], world_assets: ['maps', 'audio', 'ground'] };
// Check every input before moving anything; preserve Capacitor's public/assets paths.
for (const dirs of Object.values(packs)) {
  for (const dir of dirs) assert.ok(statSync(join(assets, dir)).isDirectory(), `Missing assets: ${dir}`);
}
const moved = [];
try {
  for (const [pack, dirs] of Object.entries(packs)) {
    const packAssets = join(android, pack, 'src/main/assets');
    rmSync(packAssets, { recursive: true, force: true });
    const destination = join(packAssets, 'public/assets');
    mkdirSync(destination, { recursive: true });
    for (const dir of dirs) {
      const source = join(assets, dir);
      const target = join(destination, dir);
      renameSync(source, target);
      moved.push([source, target]);
      assert.ok(!existsSync(source) && statSync(target).isDirectory());
    }
  }
  run('./gradlew', ['bundleRelease', '-Prich4AssetPacks'], android);
} finally {
  // Leave standalone APK builds with all assets, even if Gradle fails.
  for (const [source, target] of moved.reverse()) renameSync(target, source);
}
console.log(`AAB: ${join(android, 'app/build/outputs/bundle/release/app-release.aab')}`);
