import { rmSync } from 'node:fs';
import { Glob } from 'bun';

for (const path of new Glob('packages/*/dist').scanSync({ onlyFiles: false })) {
  rmSync(path, { recursive: true, force: true });
}
