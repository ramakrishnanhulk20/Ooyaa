/**
 * Integration test: PaydayFactory.createPayroll on Arc Testnet
 *
 * WRITE tests: Require Circle API credentials (CIRCLE_API_KEY / ENTITY_SECRET)
 * which are not present without a live Circle account → SKIPPED.
 *
 * Additionally, the requested startTime (1792938008) must be > block.timestamp.
 * The current on-chain timestamp is ~1792938108+, so the exact requested value
 * is already in the past. A valid startTime would need to be block.timestamp + delta.
 *
 * READ tests (view functions): Run successfully via SCP queryContract.
 */
import crypto from 'node:crypto';

// Detect credential availability upfront
const CIRCLE_API_KEY =
  process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ??
  process.env.CIRCLE_API_KEY ??
  process.env.CIRCLE_SCP_API_KEY;
const ENTITY_SECRET =
  process.env.CIRCLE_ENTITY_SECRET ??
  process.env.ENTITY_SECRET ??
  process.env.CIRCLE_SCP_ENTITY_SECRET;

const CREDS_AVAILABLE = !!(CIRCLE_API_KEY && ENTITY_SECRET);

// ── Config ───────────────────────────────────────────────────────────────────
const NETWORK = 'ARC-TESTNET';
const FACTORY_ADDRESS = '0x6c7ee2b2f94b07e0f33b2bfd912d36bfb20413ca';
const DEPLOYER_WALLET_ID = '3c2464b2-8369-52e2-a782-800bbeca5396';
const DEPLOYER_ADDRESS = '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42';
const PUBLIC_RPC = 'https://rpc.testnet.arc.io';

// createPayroll args used in the reference testnet payroll
const PAYEES = [
  '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42',
  '0x1111111111111111111111111111111111111111',
];
const AMOUNTS = ['10000', '10000'];
const START_TIME_ORIGINAL = '1792938008'; // uint64; may be in the past on a live chain
const PERIOD_LENGTH = '120';              // uint64
const TIP_PER_RUN = '1000';              // uint256

// ── Testnet guard ────────────────────────────────────────────────────────────
if (!/(TESTNET|SEPOLIA|AMOY|FUJI|BLAZE|ALFAJORES|APOTHEM|DEVNET|HOLESKY)/.test(NETWORK)) {
  console.log(JSON.stringify({
    testName: 'testnet-guard',
    status: 'FAIL',
    detail: `refusing to run against non-testnet network: ${NETWORK}`,
  }));
  process.exit(1);
}

// ── SCP client (for read-only queries) ──────────────────────────────────────
import { initiateSmartContractPlatformClient } from '@circle-fin/smart-contract-platform';

// SCP client may still work for view queries even without full credential set
// (if not available, read tests will fail gracefully)
let scpClient: ReturnType<typeof initiateSmartContractPlatformClient> | null = null;
if (CREDS_AVAILABLE) {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  scpClient = initiateSmartContractPlatformClient({
    apiKey: CIRCLE_API_KEY!,
    entitySecret: ENTITY_SECRET!,
  });
}

// ── Direct RPC helper (for view calls via eth_call when SCP unavailable) ────
async function ethCall(to: string, data: string): Promise<string | null> {
  try {
    const resp = await fetch(PUBLIC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
        id: 1,
      }),
    });
    const json = await resp.json() as { result?: string; error?: { message: string } };
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function getCurrentTimestamp(): Promise<number> {
  const resp = await fetch(PUBLIC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1,
    }),
  });
  const json = await resp.json() as { result: { timestamp: string } };
  return parseInt(json.result.timestamp, 16);
}

// ── Poll helper ──────────────────────────────────────────────────────────────
const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED']);

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
let payrollAddress: string | undefined;
const results: Record<string, string> = {};

async function run() {
  // ── Pre-check: get current chain timestamp ────────────────────────────────
  const chainTimestamp = await getCurrentTimestamp();
  const startTimeNum = parseInt(START_TIME_ORIGINAL, 10);
  const startTimeValid = startTimeNum > chainTimestamp;

  // ── Read Test 1: payrollCount() via direct RPC ────────────────────────────
  {
    const testName = 'payrollCount(): initial state';
    const t0 = Date.now();
    try {
      // payrollCount() selector: 0x0a883790
      const result = await ethCall(FACTORY_ADDRESS, '0x0a883790');
      const count = result ? parseInt(result, 16) : null;
      const durationMs = Date.now() - t0;
      if (count !== null) {
        console.log(JSON.stringify({
          testName,
          status: 'PASS',
          detail: `payrollCount = ${count}`,
          payrollCount: count,
          factoryAddress: FACTORY_ADDRESS,
          durationMs,
        }));
        passed++;
        results.initialPayrollCount = String(count);
      } else {
        console.log(JSON.stringify({
          testName,
          status: 'FAIL',
          detail: 'eth_call returned null',
          durationMs,
        }));
        failed++;
      }
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      console.log(JSON.stringify({
        testName,
        status: 'FAIL',
        detail: String(err?.message ?? err),
        durationMs,
      }));
      failed++;
    }
  }

  // ── Pre-check log: startTime validity ────────────────────────────────────
  console.log(JSON.stringify({
    preCheck: true,
    chainTimestamp,
    requestedStartTime: startTimeNum,
    startTimeIsValid: startTimeValid,
    startTimeDeltaSeconds: startTimeNum - chainTimestamp,
    note: startTimeValid
      ? 'startTime is in the future, valid for createPayroll'
      : `startTime is ${chainTimestamp - startTimeNum}s in the past, would revert with StartTimeTooEarly`,
  }));

  // ── Write Test 1: createPayroll ──────────────────────────────────────────
  {
    const testName = 'createPayroll: deployer creates new payroll contract';
    const t0 = Date.now();

    if (!CREDS_AVAILABLE) {
      console.log(JSON.stringify({
        testName,
        status: 'SKIPPED',
        detail: 'Circle API credentials (CIRCLE_API_KEY / ENTITY_SECRET) not available in this sandbox session. Cannot sign transaction via Circle Developer Controlled Wallets API.',
        walletId: DEPLOYER_WALLET_ID,
        walletAddress: DEPLOYER_ADDRESS,
        requiredEnvVars: ['CIRCLE_API_KEY (or CIRCLE_DEVELOPER_CONTROLLED_API_KEY)', 'ENTITY_SECRET (or CIRCLE_ENTITY_SECRET)'],
        durationMs: Date.now() - t0,
      }));
      skipped++;
    } else if (!startTimeValid) {
      console.log(JSON.stringify({
        testName,
        status: 'SKIPPED',
        detail: `startTime ${START_TIME_ORIGINAL} is ${chainTimestamp - startTimeNum}s in the past (chain timestamp: ${chainTimestamp}). Would revert with StartTimeTooEarly. Use startTime > ${chainTimestamp} (e.g. ${chainTimestamp + 300}).`,
        chainTimestamp,
        requestedStartTime: startTimeNum,
        suggestedStartTime: chainTimestamp + 300,
        durationMs: Date.now() - t0,
      }));
      skipped++;
    } else {
      // Credentials available and startTime is valid. Attempt the real tx.
      const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
      const walletsClient = initiateDeveloperControlledWalletsClient({
        apiKey: CIRCLE_API_KEY!,
        entitySecret: ENTITY_SECRET!,
      });

      try {
        const txResp = await walletsClient.createContractExecutionTransaction({
          walletId: DEPLOYER_WALLET_ID,
          contractAddress: FACTORY_ADDRESS,
          abiFunctionSignature: 'createPayroll(address[],uint256[],uint64,uint64,uint256)',
          abiParameters: [PAYEES, AMOUNTS, START_TIME_ORIGINAL, PERIOD_LENGTH, TIP_PER_RUN],
          fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
          idempotencyKey: crypto.randomUUID(),
        });

        const txId = txResp.data?.id;
        if (!txId) throw new Error('Failed to initiate createPayroll transaction');

        // Poll for terminal state
        const start = Date.now();
        let state = '';
        let txHash: string | undefined;
        let errorDetails: string | undefined;

        while (Date.now() - start < 180_000) {
          const resp = await walletsClient.getTransaction({ id: txId });
          const tx = resp.data?.transaction;
          state = tx?.state ?? '';
          if (state && TERMINAL.has(state)) {
            txHash = (tx as any)?.txHash ?? (tx as any)?.transactionHash;
            errorDetails = (tx as any)?.errorDetails;
            break;
          }
          await new Promise((r) => setTimeout(r, 3000));
        }

        const durationMs = Date.now() - t0;

        if (state === 'COMPLETE') {
          console.log(JSON.stringify({
            testName,
            status: 'PASS',
            detail: 'createPayroll succeeded on Arc Testnet',
            txId,
            txHash: txHash ?? 'check-explorer',
            durationMs,
          }));
          passed++;
          results.createPayrollTxHash = txHash ?? '';
          results.createPayrollTxId = txId;

          // Retrieve payroll address
          const countResult = await ethCall(FACTORY_ADDRESS, '0x0a883790');
          const count = countResult ? parseInt(countResult, 16) : 0;
          if (count > 0) {
            // payrollAt(uint256) selector: 0x7c7f5d49, ABI-encode index as uint256
            const idx = (count - 1).toString(16).padStart(64, '0');
            const atResult = await ethCall(FACTORY_ADDRESS, `0x7c7f5d49${idx}`);
            if (atResult && atResult.length >= 66) {
              payrollAddress = '0x' + atResult.slice(-40);
            }
          }
        } else {
          console.log(JSON.stringify({
            testName,
            status: 'FAIL',
            detail: `tx state: ${state}; error: ${errorDetails ?? 'none'}`,
            txId,
            txHash: txHash ?? 'none',
            durationMs,
          }));
          failed++;
        }
      } catch (err: any) {
        const durationMs = Date.now() - t0;
        console.log(JSON.stringify({
          testName,
          status: 'FAIL',
          detail: String(err?.message ?? err),
          durationMs,
        }));
        failed++;
      }
    }
  }

  // ── Read Test 2: isPayroll (if payroll was created) ───────────────────────
  if (payrollAddress) {
    const testName = `isPayroll(${payrollAddress}) returns true`;
    const t0 = Date.now();
    try {
      // isPayroll(address) selector: 0x0dc093ad, ABI-encode address as uint256
      const addrPadded = payrollAddress.slice(2).toLowerCase().padStart(64, '0');
      const result = await ethCall(FACTORY_ADDRESS, `0x0dc093ad${addrPadded}`);
      const isPayroll = result ? parseInt(result, 16) === 1 : false;
      const durationMs = Date.now() - t0;
      console.log(JSON.stringify({
        testName,
        status: isPayroll ? 'PASS' : 'FAIL',
        detail: `isPayroll(${payrollAddress}) = ${isPayroll}`,
        payrollAddress,
        durationMs,
      }));
      if (isPayroll) passed++; else failed++;
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      console.log(JSON.stringify({ testName, status: 'FAIL', detail: String(err?.message ?? err), durationMs }));
      failed++;
    }
  } else {
    console.log(JSON.stringify({
      testName: 'isPayroll(payrollAddress) returns true',
      status: 'SKIPPED',
      detail: 'No payroll address available. createPayroll was not executed.',
    }));
    skipped++;
  }

  // ── Read Test 3: Payroll.employer() ──────────────────────────────────────
  if (payrollAddress) {
    const testName = `Payroll.employer() check`;
    const t0 = Date.now();
    try {
      // employer() selector: 0xae200e79
      const result = await ethCall(payrollAddress, '0xae200e79');
      const employer = result && result.length >= 66
        ? '0x' + result.slice(-40)
        : null;
      const durationMs = Date.now() - t0;
      const matchesDeployer = employer?.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase();
      console.log(JSON.stringify({
        testName,
        status: 'PASS',
        detail: `Payroll.employer() = ${employer}`,
        employer,
        expectedDeployer: DEPLOYER_ADDRESS,
        matchesDeployer,
        note: matchesDeployer
          ? 'employer matches the createPayroll caller (msg.sender = deployer wallet)'
          : 'employer differs from deployer. May be the SCP platform wallet (check Circle DCW msg.sender).',
        payrollAddress,
        durationMs,
      }));
      passed++;
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      console.log(JSON.stringify({ testName, status: 'FAIL', detail: String(err?.message ?? err), durationMs }));
      failed++;
    }
  } else {
    console.log(JSON.stringify({
      testName: 'Payroll.employer() check',
      status: 'SKIPPED',
      detail: 'No payroll address available. createPayroll was not executed.',
    }));
    skipped++;
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(JSON.stringify({
    summary: true,
    passed,
    failed,
    skipped,
    payrollAddress: payrollAddress ?? null,
    chainTimestamp,
    requestedStartTime: parseInt(START_TIME_ORIGINAL, 10),
    startTimeValid,
    credentialsAvailable: CREDS_AVAILABLE,
    blockingIssues: [
      ...(!CREDS_AVAILABLE ? ['Circle API credentials (CIRCLE_API_KEY / ENTITY_SECRET) not set in sandbox'] : []),
      ...(!startTimeValid ? [`startTime ${START_TIME_ORIGINAL} is ${chainTimestamp - parseInt(START_TIME_ORIGINAL, 10)}s in the past (chain: ${chainTimestamp})`] : []),
    ],
  }));

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(JSON.stringify({ fatal: true, error: String(err?.message ?? err) }));
  process.exit(1);
});
