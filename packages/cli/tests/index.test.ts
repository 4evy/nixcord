import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const cliMocks = vi.hoisted(() => ({
  runCli: vi.fn(() => Promise.resolve()),
  handleCliError: vi.fn(),
}));

vi.mock('../src/cli.js', () => cliMocks);

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

describe('executable entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    restoreEnv();
  });

  afterEach(() => {
    vi.resetModules();
    restoreEnv();
  });

  test('does not execute while imported by tests', async () => {
    process.env.NODE_ENV = 'test';

    await import('../src/index.js');

    expect(cliMocks.runCli).not.toHaveBeenCalled();
  });

  test('executes in production and forwards rejected promises', async () => {
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    const failure = new Error('boom');
    cliMocks.runCli.mockRejectedValueOnce(failure);

    await import('../src/index.js');

    expect(cliMocks.runCli).toHaveBeenCalledTimes(1);
    expect(cliMocks.handleCliError).toHaveBeenCalledWith(failure);
  });
});
