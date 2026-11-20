import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACT = path.join(
  ROOT,
  'contracts/artifacts/contracts/JustTLDRegistry.sol/JustTLDRegistry.json',
);
const OUT = path.join(ROOT, 'packages/shared/src/generated/registry.ts');

if (!fs.existsSync(ARTIFACT)) {
  console.error('Артефакт не найден. Сначала: npm run compile -w @justtld/contracts');
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `/* AUTO-GENERATED from contract artifact — не редактируйте вручную. */\n/* eslint-disable */\nexport const REGISTRY_ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`,
);
console.log(`ABI → ${path.relative(ROOT, OUT)} (${artifact.abi.length} items)`);
