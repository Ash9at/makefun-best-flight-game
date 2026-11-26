// Skyward Post — hand-in program (Node 22, standard library only).
//
// The game itself is the static site under game/: plain files a desktop
// browser opens offline. This program copies game/ and screenshots/ into
// the output directory and writes dossier.json there with the vendored
// make.fun library, so the dossier is exactly the bytes the scorer
// rebuilds from the same files. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean slate so two runs hand in identical bytes.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(outDir, name), { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The gate's own caps: they shape the dossier text and refuse anything
// the scorer itself would refuse (screenshot count and size, game file
// count, total bytes and path length).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Skyward Post handed in: dossier.json ${dossier.length} bytes -> ${outDir}`);
