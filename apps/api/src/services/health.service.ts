import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  version: string;
}

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

export interface HealthStatus {
  status: 'ok';
  version: string;
  db: 'not-wired';
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    version,
    db: 'not-wired',
  };
}
