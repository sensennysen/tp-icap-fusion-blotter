import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Static check of TASK-020's pipeline: GitHub Actions can't run locally, so pin
// the workflow's step order and its agreement with package.json and compose.
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string | number>;
}

interface Workflow {
  on: { push?: { branches?: string[] }; pull_request?: unknown };
  env?: Record<string, string>;
  jobs: {
    ci: {
      services: {
        postgres: {
          image: string;
          env: Record<string, string>;
          ports: string[];
          options: string;
        };
      };
      env: Record<string, string>;
      steps: Step[];
    };
  };
}

const workflow = parse(read('../../.github/workflows/ci.yml')) as Workflow;
const rootPackage = JSON.parse(read('../../package.json')) as {
  packageManager: string;
  engines: { node: string };
};
const compose = parse(read('../../docker-compose.yml')) as {
  services: { postgres: { image: string } };
};

const { ci } = workflow.jobs;
const service = ci.services.postgres;
const stepIndex = (run: string) => ci.steps.findIndex((step) => step.run === run);
const action = (name: string) => ci.steps.find((step) => step.uses?.startsWith(`${name}@`));

describe('CI workflow wiring', () => {
  it('runs on pushes to main and on every pull request', () => {
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on).toHaveProperty('pull_request');
  });

  it('disables husky hooks', () => {
    expect(workflow.env?.HUSKY).toBe('0');
  });

  it('runs install → generate → lint → typecheck → migrate → test → build in order', () => {
    const order = [
      'pnpm install --frozen-lockfile',
      'pnpm --filter backend exec prisma generate',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm --filter backend exec prisma migrate deploy',
      'pnpm test',
      'pnpm build',
    ].map(stepIndex);

    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('uses the pnpm version pinned in packageManager', () => {
    expect(`pnpm@${action('pnpm/action-setup')?.with?.version}`).toBe(rootPackage.packageManager);
  });

  it('uses a Node version that satisfies engines.node', () => {
    const minimum = Number(rootPackage.engines.node.replace('>=', ''));
    expect(Number(action('actions/setup-node')?.with?.['node-version'])).toBeGreaterThanOrEqual(
      minimum,
    );
  });

  it('tests against the same Postgres image as docker compose, gated on pg_isready', () => {
    expect(service.image).toBe(compose.services.postgres.image);
    expect(service.options).toContain('--health-cmd "pg_isready');
  });

  it("points DATABASE_URL at the service's own credentials, database and port", () => {
    const url = new URL(ci.env.DATABASE_URL);
    expect(decodeURIComponent(url.username)).toBe(service.env.POSTGRES_USER);
    expect(decodeURIComponent(url.password)).toBe(service.env.POSTGRES_PASSWORD);
    expect(url.pathname.slice(1)).toBe(service.env.POSTGRES_DB);
    expect(url.hostname).toBe('localhost');
    expect(url.port).toBe(service.ports[0]?.split(':')[0]);
  });
});
