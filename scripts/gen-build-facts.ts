/**
 * Runs `forge test` (excluding fork tests) and `bun test src` to capture
 * pass/fail counts, then counts fork test functions separately.
 * Writes src/generated/build-facts.json so the proof page can display them.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

function runForge(args: string[]): { passed: number; failed: number } {
  const result = spawnSync('forge', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Use stdout alone for JSON parsing; combine for line-scan fallback.
  const stdout = result.stdout ?? '';
  const out = stdout + (result.stderr ?? '');

  // forge test --json emits an object keyed by "path:SuiteName", each with a
  // "test_results" sub-object keyed by test name, each with a "status" field.
  try {
    const parsed = JSON.parse(stdout) as Record<string, {
      test_results?: Record<string, { status?: string }>;
    }>;
    let passed = 0;
    let failed = 0;
    for (const suite of Object.values(parsed)) {
      for (const r of Object.values(suite.test_results ?? {})) {
        if (r.status === 'Success') passed++;
        else if (r.status === 'Failure') failed++;
      }
    }
    if (passed + failed > 0) return { passed, failed };
  } catch {
    // fall through to line scan
  }
  // Line-scan fallback for older forge versions.
  const passMatch = out.match(/(\d+)\s+tests?\s+passed/i);
  const failMatch = out.match(/(\d+)\s+tests?\s+failed/i);
  return {
    passed: passMatch ? parseInt(passMatch[1], 10) : 0,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
  };
}

function runBunTest(): { passed: number; failed: number } {
  const result = spawnSync('bun', ['test', 'src'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const out = (result.stdout ?? '') + (result.stderr ?? '');
  const passMatch = out.match(/(\d+)\s+pass/);
  const failMatch = out.match(/(\d+)\s+fail/);
  return {
    passed: passMatch ? parseInt(passMatch[1], 10) : 0,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
  };
}

function countForkTests(): number {
  try {
    const src = readFileSync('contracts/test/PayrollFork.t.sol', 'utf8');
    // Count public/external function definitions whose name starts with test_.
    const matches = src.match(/\bfunction\s+test_\w+\s*\(/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

// Unit and invariant tests only; fork tests need Arc's Foundry and a live fork.
const foundry = runForge(['test', '--no-match-path', 'contracts/test/PayrollFork.t.sol', '--json']);
const forkTests = countForkTests();
const app = runBunTest();

const facts = {
  foundry: {
    suite: 'unit and invariant',
    passed: foundry.passed,
    failed: foundry.failed,
  },
  fork: {
    tests: forkTests,
    ranHere: false,
  },
  app: {
    passed: app.passed,
    failed: app.failed,
  },
  generatedAt: new Date().toISOString(),
};

writeFileSync('src/generated/build-facts.json', JSON.stringify(facts, null, 2) + '\n', 'utf8');
process.stdout.write(
  `src/generated/build-facts.json written: foundry ${foundry.passed} pass / ${foundry.failed} fail; ` +
  `fork ${forkTests} tests (not run here); app ${app.passed} pass / ${app.failed} fail.\n`,
);
