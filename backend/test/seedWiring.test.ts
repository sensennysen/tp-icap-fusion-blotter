import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static check of the "Docker boot runs the seed before the server listens"
// acceptance criterion: no container needed, just the CMD text and script.
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('seed wiring', () => {
  const dockerfile = read('../Dockerfile');
  const cmd = dockerfile.split('\n').find((line) => line.startsWith('CMD')) ?? '';

  it('Dockerfile CMD runs migrate deploy, then seed, then start, in that order', () => {
    const migrate = cmd.indexOf('prisma migrate deploy');
    const seed = cmd.indexOf('pnpm run seed');
    const start = cmd.indexOf('pnpm start');

    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(seed).toBeGreaterThan(migrate);
    expect(start).toBeGreaterThan(seed);
  });

  it('chains the steps with && so a failed seed stops the server from starting', () => {
    expect(cmd.split('&&')).toHaveLength(3);
  });

  it('the package.json seed script runs src/seed.ts', () => {
    const pkg = JSON.parse(read('../package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.seed).toBe('tsx src/seed.ts');
  });
});
