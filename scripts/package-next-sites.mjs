import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exported = path.join(root, '.next-sites');
if (!existsSync(path.join(exported, 'index.html'))) throw new Error('Next.js static export is missing.');
const client = path.join(root, 'dist', 'client');
rmSync(client, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
cpSync(exported, client, { recursive: true });
