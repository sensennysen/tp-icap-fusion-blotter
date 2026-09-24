import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Static check of TASK-019's startup-ordering and healthcheck criteria: no
// Docker needed, just the compose file and .dockerignore at the repo root.
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

interface Service {
  image?: string;
  build?: { context: string; dockerfile: string; args?: Record<string, string> };
  environment?: Record<string, string>;
  ports?: string[];
  depends_on?: Record<string, { condition: string }>;
  healthcheck?: { test: string[]; start_period?: string };
}

const compose = parse(read('../../docker-compose.yml')) as { services: Record<string, Service> };
const { postgres, backend, frontend } = compose.services;

const hostPort = (service: Service) => service.ports?.[0]?.split(':')[0];
const urlPort = (url: string | undefined) => (url ? new URL(url).port : undefined);

describe('docker compose wiring', () => {
  it('postgres runs 16-alpine and is healthchecked with pg_isready', () => {
    expect(postgres.image).toBe('postgres:16-alpine');
    expect(postgres.healthcheck?.test.join(' ')).toContain('pg_isready');
  });

  it('backend waits for a healthy postgres', () => {
    expect(backend.depends_on?.postgres?.condition).toBe('service_healthy');
  });

  it('backend healthcheck passes only on a 200 from /health on its own PORT', () => {
    const script = backend.healthcheck?.test.join(' ') ?? '';
    // Quoted, so '/healthz' (or any other suffix) doesn't match as a prefix.
    expect(script).toContain(`fetch('http://localhost:${backend.environment?.PORT}/health')`);
    expect(script).toContain('r.status===200?0:1');
  });

  it('backend healthcheck has a start period to cover migrate + seed on first boot', () => {
    expect(backend.healthcheck?.start_period).toBeDefined();
  });

  it('frontend does not start until the backend is healthy', () => {
    expect(frontend.depends_on?.backend?.condition).toBe('service_healthy');
  });

  it('both app images build from the repo root with their own Dockerfile', () => {
    expect(backend.build).toMatchObject({ context: '.', dockerfile: 'backend/Dockerfile' });
    expect(frontend.build).toMatchObject({ context: '.', dockerfile: 'frontend/Dockerfile' });
  });

  it('CORS_ORIGIN matches the port the frontend is published on', () => {
    expect(urlPort(backend.environment?.CORS_ORIGIN)).toBe(hostPort(frontend));
  });

  it('the frontend build args point at the published backend port', () => {
    expect(urlPort(frontend.build?.args?.VITE_API_BASE_URL)).toBe(hostPort(backend));
    expect(urlPort(frontend.build?.args?.VITE_WS_URL)).toBe(hostPort(backend));
  });
});

describe('.dockerignore', () => {
  const lines = read('../../.dockerignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  it('keeps host node_modules and .env out of the build context', () => {
    expect(lines).toContain('**/node_modules');
    expect(lines).toContain('.env');
  });

  it('does not exclude anything the Dockerfiles COPY', () => {
    const copied = [
      'database',
      'shared',
      'backend',
      'frontend',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'package.json',
      'tsconfig.base.json',
    ];
    for (const path of copied) expect(lines).not.toContain(path);
  });
});
