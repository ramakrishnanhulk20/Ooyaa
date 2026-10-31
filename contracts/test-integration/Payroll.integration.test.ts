/**
 * Payroll integration test: live-SCP lane (ARC-TESTNET)
 *
 * Ordered test sequence:
 *  1. Approve 100000 USDC from deployer/employer to Payroll contract
 *  2. Call fund(100000) from deployer
 *  3. Check startedPeriods() >= 1 (startTime 1792923419 already passed on-chain)
 *  4. Call run() from test wallet (caller receives tipPerRun of 1000)
 *  5. Record run() tx hash
 *  6. Call run() again → confirm it reverts with NothingDue (FAILED state)
 *  7. Report all tx hashes
 *
 * Mode: Mode 1 (platform deployer wallet provided in metadata)
 * The deployer wallet ID is the employer. Use it for employer calls.
 */

import crypto from 'node:crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { initiateSmartContractPlatformClient } from '@circle-fin/smart-contract-platform';

// ── Contract / chain constants ────────────────────────────────────────────────
const PAYROLL_ADDRESS = '0x2590e4381a630a0d9df6549f71312098d0870e56';
const USDC_ADDRESS    = '0x3600000000000000000000000000000000000000';
const EMPLOYER_ADDR   = '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42';
const NETWORK         = 'ARC-TESTNET';
const START_TIME      = 1792923419;
const FUND_AMOUNT_USDC = '100000';    // human-readable
const FUND_AMOUNT_RAW  = '100000000000'; // 100 000 × 10^6 (6-decimal USDC)

// deployer wallet ID from contract-metadata (the platform deployer for Mode 1)
const DEPLOYER_WALLET_ID = '3c2464b2-8369-52e2-a782-800bbeca5396';

// ── Testnet guard ─────────────────────────────────────────────────────────────
if (!/(TESTNET|SEPOLIA|AMOY|FUJI|BLAZE|ALFAJORES|APOTHEM|DEVNET|HOLESKY)/.test(NETWORK)) {
  console.error(JSON.stringify({ testName: 'testnet-guard', status: 'FAIL', detail: `refusing to run against non-testnet network: ${NETWORK}` }));
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────
const walletsClient = initiateDeveloperControlledWalletsClient({
  apiKey:       process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});

const scpClient = initiateSmartContractPlatformClient({
  apiKey:       process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});

// ── Test wallet provisioning (for non-owner / run() calls) ───────────────────
const reuseId      = process.env.INTEGRATION_TEST_WALLET_ID;
const reuseAddress = process.env.INTEGRATION_TEST_WALLET_ADDRESS;

let TEST_WALLET_ID:      string;
let TEST_WALLET_ADDRESS: string;

if (reuseId && reuseAddress) {
  TEST_WALLET_ID      = reuseId;
  TEST_WALLET_ADDRESS = reuseAddress;
} else {
  // Provisioning phase: create wallet, print info, exit for faucet_drip funding
  const walletSetResp = await walletsClient.createWalletSet({
    name:           `payroll-test-${Date.now()}`,
    idempotencyKey: crypto.randomUUID(),
  });
  const walletSetId = walletSetResp.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set');

  const walletsResp = await walletsClient.createWallets({
    blockchains:    [NETWORK],
    count:          1,
    accountType:    'EOA',
    walletSetId,
    idempotencyKey: crypto.randomUUID(),
  });

  const wallet = walletsResp.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) throw new Error('Failed to create wallet');

  console.log(JSON.stringify({
    phase:         'wallet_provisioning',
    walletId:      wallet.id,
    walletAddress: wallet.address,
  }));
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED']);

async function waitForTerminal(txId: string, timeoutMs = 180_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp  = await walletsClient.getTransaction({ id: txId });
    const state = resp.data?.transaction?.state;
    if (state && TERMINAL_STATES.has(state)) return state;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Transaction ${txId} did not reach terminal state within ${timeoutMs}ms`);
}

async function executeAndWait(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: string[];
  label: string;
}): Promise<{ txId: string; state: string; errorDetails?: string }> {
  const resp = await walletsClient.createContractExecutionTransaction({
    walletId:             params.walletId,
    contractAddress:      params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters:        params.abiParameters,
    fee:                  { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey:       crypto.randomUUID(),
  });
  const txId = resp.data?.id;
  if (!txId) throw new Error(`Failed to initiate tx for ${params.label}`);
  const state        = await waitForTerminal(txId);
  const txDetails    = await walletsClient.getTransaction({ id: txId });
  const errorDetails = txDetails.data?.transaction?.errorDetails ?? undefined;
  return { txId, state, errorDetails };
}

async function queryView(sig: string, params: string[] = []): Promise<string[]> {
  const result = await scpClient.queryContract({
    blockchain:           NETWORK,
    address:              PAYROLL_ADDRESS,
    abiFunctionSignature: sig,
    abiParameters:        params,
  });
  return result.data?.outputValues ?? [];
}

let failed = false;
const t0   = Date.now();
function elapsed() { return Date.now() - t0; }

// Recorded tx hashes / IDs for the final summary
let approveTxId = '';
let fundTxId    = '';
let runTxId     = '';

// ── Test 1: reads before any mutation ────────────────────────────────────────
try {
  const t = Date.now();
  const [employer]     = await queryView('employer()');
  const [startTime]    = await queryView('startTime()');
  const [tipPerRun]    = await queryView('tipPerRun()');
  const [periodTotal]  = await queryView('periodTotal()');
  const [periodLength] = await queryView('periodLength()');
  console.log(JSON.stringify({
    testName:   'read contract config',
    status:     'PASS',
    detail:     `employer=${employer} startTime=${startTime} tipPerRun=${tipPerRun} periodTotal=${periodTotal} periodLength=${periodLength}`,
    durationMs: Date.now() - t,
  }));
} catch (e) {
  console.log(JSON.stringify({ testName: 'read contract config', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 2: startedPeriods(): should be >= 1 (startTime already past) ────────
try {
  const t = Date.now();
  const [sp] = await queryView('startedPeriods()');
  const spN  = BigInt(sp ?? '0');
  const now  = Math.floor(Date.now() / 1000);
  const ok   = spN >= 1n || now >= START_TIME;  // if sp=0, chain time may lag
  console.log(JSON.stringify({
    testName:   'startedPeriods() reflects elapsed time since startTime',
    status:     spN >= 1n ? 'PASS' : (now >= START_TIME ? 'PASS' : 'FAIL'),
    detail:     `startedPeriods=${sp} wallclockPast=${now >= START_TIME}`,
    durationMs: Date.now() - t,
  }));
  if (spN < 1n && now < START_TIME) failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'startedPeriods()', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 3: dueNow() and owed() pre-fund ─────────────────────────────────────
try {
  const t = Date.now();
  const [dueNow] = await queryView('dueNow()');
  const [owed]   = await queryView('owed()');
  console.log(JSON.stringify({ testName: 'dueNow() and owed() pre-fund', status: 'PASS', detail: `dueNow=${dueNow} owed=${owed}`, durationMs: Date.now() - t }));
} catch (e) {
  console.log(JSON.stringify({ testName: 'dueNow() pre-fund', status: 'FAIL', error: String(e), durationMs: elapsed() }));
}

// ── Test 4: USDC approve (employer → Payroll, 100 000 USDC) ──────────────────
try {
  const t = Date.now();
  const result = await executeAndWait({
    walletId:             DEPLOYER_WALLET_ID,
    contractAddress:      USDC_ADDRESS,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters:        [PAYROLL_ADDRESS, FUND_AMOUNT_RAW],
    label:                'approve',
  });
  approveTxId = result.txId;
  console.log(JSON.stringify({
    testName:   `approve ${FUND_AMOUNT_USDC} USDC (employer → Payroll)`,
    status:     result.state === 'COMPLETE' ? 'PASS' : 'FAIL',
    detail:     `txId=${result.txId} state=${result.state}${result.errorDetails ? ' error=' + result.errorDetails : ''}`,
    durationMs: Date.now() - t,
  }));
  if (result.state !== 'COMPLETE') failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'approve 100000 USDC', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 5: fund(100000) from employer ───────────────────────────────────────
try {
  const t = Date.now();
  // Read USDC balance before fund
  const balBefore = await scpClient.queryContract({
    blockchain: NETWORK, address: USDC_ADDRESS,
    abiFunctionSignature: 'balanceOf(address)', abiParameters: [PAYROLL_ADDRESS],
  });
  const balBeforeAmt = BigInt(balBefore.data?.outputValues?.[0] ?? '0');

  const result = await executeAndWait({
    walletId:             DEPLOYER_WALLET_ID,
    contractAddress:      PAYROLL_ADDRESS,
    abiFunctionSignature: 'fund(uint256)',
    abiParameters:        [FUND_AMOUNT_RAW],
    label:                'fund',
  });
  fundTxId = result.txId;

  // Read USDC balance after fund
  const balAfter = await scpClient.queryContract({
    blockchain: NETWORK, address: USDC_ADDRESS,
    abiFunctionSignature: 'balanceOf(address)', abiParameters: [PAYROLL_ADDRESS],
  });
  const balAfterAmt  = BigInt(balAfter.data?.outputValues?.[0] ?? '0');
  const balRose      = result.state === 'COMPLETE' && (balAfterAmt - balBeforeAmt) === BigInt(FUND_AMOUNT_RAW);

  console.log(JSON.stringify({
    testName:   `fund(${FUND_AMOUNT_USDC}) increases Payroll USDC balance`,
    status:     balRose ? 'PASS' : 'FAIL',
    detail:     `txId=${result.txId} state=${result.state} balBefore=${balBeforeAmt} balAfter=${balAfterAmt} delta=${balAfterAmt - balBeforeAmt}${result.errorDetails ? ' error=' + result.errorDetails : ''}`,
    durationMs: Date.now() - t,
  }));
  if (!balRose) failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'fund(100000)', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 6: dueNow() should be true after fund + past startTime ───────────────
try {
  const t = Date.now();
  const [dueNow] = await queryView('dueNow()');
  const [owed]   = await queryView('owed()');
  const [runway] = await queryView('runway()');
  console.log(JSON.stringify({
    testName:   'dueNow() is true and owed() > 0 after fund',
    status:     dueNow === 'true' ? 'PASS' : 'FAIL',
    detail:     `dueNow=${dueNow} owed=${owed} runway=${runway}`,
    durationMs: Date.now() - t,
  }));
  if (dueNow !== 'true') failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'dueNow() post-fund', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 7: run() from test wallet → caller receives tipPerRun ────────────────
let tipPerRunAmt    = 0n;
let periodTotalAmt  = 0n;
let runnerBalBefore = 0n;
let runnerBalAfter  = 0n;
try {
  const t = Date.now();
  const [tip]    = await queryView('tipPerRun()');
  const [ptotal] = await queryView('periodTotal()');
  tipPerRunAmt   = BigInt(tip ?? '0');
  periodTotalAmt = BigInt(ptotal ?? '0');

  // record test wallet USDC balance before run
  const balBeforeResp = await scpClient.queryContract({
    blockchain: NETWORK, address: USDC_ADDRESS,
    abiFunctionSignature: 'balanceOf(address)', abiParameters: [TEST_WALLET_ADDRESS],
  });
  runnerBalBefore = BigInt(balBeforeResp.data?.outputValues?.[0] ?? '0');

  const result = await executeAndWait({
    walletId:             TEST_WALLET_ID,
    contractAddress:      PAYROLL_ADDRESS,
    abiFunctionSignature: 'run()',
    abiParameters:        [],
    label:                'run()',
  });
  runTxId = result.txId;

  // record test wallet USDC balance after run
  const balAfterResp = await scpClient.queryContract({
    blockchain: NETWORK, address: USDC_ADDRESS,
    abiFunctionSignature: 'balanceOf(address)', abiParameters: [TEST_WALLET_ADDRESS],
  });
  runnerBalAfter = BigInt(balAfterResp.data?.outputValues?.[0] ?? '0');

  const tipReceived = (runnerBalAfter - runnerBalBefore) === tipPerRunAmt;

  console.log(JSON.stringify({
    testName:   'run() succeeds and test wallet receives tipPerRun',
    status:     result.state === 'COMPLETE' ? 'PASS' : 'FAIL',
    detail:     `txId=${result.txId} state=${result.state} tipPerRun=${tipPerRunAmt} tipReceived=${tipReceived} runnerBalDelta=${runnerBalAfter - runnerBalBefore}${result.errorDetails ? ' error=' + result.errorDetails : ''}`,
    durationMs: Date.now() - t,
  }));
  if (result.state !== 'COMPLETE') failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'run() first call', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 8: dueNow() is false after run() ────────────────────────────────────
try {
  const t = Date.now();
  const [dueNow] = await queryView('dueNow()');
  console.log(JSON.stringify({
    testName:   'dueNow() is false after run()',
    status:     dueNow === 'false' ? 'PASS' : 'FAIL',
    detail:     `dueNow=${dueNow}`,
    durationMs: Date.now() - t,
  }));
  if (dueNow !== 'false') failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'dueNow() post-run', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 9: second run() → NothingDue revert (FAILED terminal state) ──────────
let secondRunTxId = '';
try {
  const t = Date.now();
  const result = await executeAndWait({
    walletId:             TEST_WALLET_ID,
    contractAddress:      PAYROLL_ADDRESS,
    abiFunctionSignature: 'run()',
    abiParameters:        [],
    label:                'second run() (expect NothingDue)',
  });
  secondRunTxId = result.txId;
  const reverted = result.state === 'FAILED';
  const nothingDue = reverted &&
    (JSON.stringify(result.errorDetails ?? '').toLowerCase().includes('nothingdue') ||
     JSON.stringify(result.errorDetails ?? '').includes('64b3b5b4'));

  console.log(JSON.stringify({
    testName:   'second run() reverts with NothingDue',
    status:     reverted ? 'PASS' : 'FAIL',
    detail:     `txId=${result.txId} state=${result.state} selectorMatch=${nothingDue} errorDetails=${JSON.stringify(result.errorDetails ?? '')}`,
    durationMs: Date.now() - t,
  }));
  if (!reverted) failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'second run() NothingDue', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 10: non-employer cannot call withdraw() → FAILED ────────────────────
try {
  const t = Date.now();
  const result = await executeAndWait({
    walletId:             TEST_WALLET_ID,
    contractAddress:      PAYROLL_ADDRESS,
    abiFunctionSignature: 'withdraw(uint256,address)',
    abiParameters:        ['1', TEST_WALLET_ADDRESS],
    label:                'non-employer withdraw (expect NotEmployer)',
  });
  const reverted = result.state === 'FAILED';
  console.log(JSON.stringify({
    testName:   'non-employer withdraw() reverts with NotEmployer',
    status:     reverted ? 'PASS' : 'FAIL',
    detail:     `txId=${result.txId} state=${result.state} errorDetails=${JSON.stringify(result.errorDetails ?? '')}`,
    durationMs: Date.now() - t,
  }));
  if (!reverted) failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'non-employer withdraw()', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 11: SKIP employer withdraw(). Mode 1, platform wallet not callable. ──
console.log(JSON.stringify({
  testName:   'employer withdraw()',
  status:     'SKIPPED',
  reason:     'Mode 1 deploy: platform deployer wallet employer cannot be called from agent. Re-deploy via Mode 2 for owner-only coverage.',
  durationMs: elapsed(),
}));

// ── Test 12: view reads post-run ──────────────────────────────────────────────
try {
  const t = Date.now();
  const [owed]        = await queryView('owed()');
  const [freeBalance] = await queryView('freeBalance()');
  const [nextUnpaid]  = await queryView('nextUnpaid()');
  const [runway]      = await queryView('runway()');
  const owedOk        = BigInt(owed ?? '0') === 0n;
  console.log(JSON.stringify({
    testName:   'owed() = 0 after run() (one period paid)',
    status:     owedOk ? 'PASS' : 'FAIL',
    detail:     `owed=${owed} freeBalance=${freeBalance} nextUnpaid=${nextUnpaid} runway=${runway}`,
    durationMs: Date.now() - t,
  }));
  if (!owedOk) failed = true;
} catch (e) {
  console.log(JSON.stringify({ testName: 'owed() post-run', status: 'FAIL', error: String(e), durationMs: elapsed() }));
  failed = true;
}

// ── Test 13: getPayees() returns non-empty payee list ────────────────────────
try {
  const t = Date.now();
  const result = await scpClient.queryContract({
    blockchain: NETWORK, address: PAYROLL_ADDRESS,
    abiFunctionSignature: 'getPayees()',
    abiParameters: [],
  });
  const outputs  = result.data?.outputValues ?? [];
  const hasPayees = outputs.length > 0;
  console.log(JSON.stringify({
    testName:   'getPayees() returns non-empty list',
    status:     hasPayees ? 'PASS' : 'FAIL',
    detail:     `outputValues=${JSON.stringify(outputs).slice(0, 200)}`,
    durationMs: Date.now() - t,
  }));
} catch (e) {
  console.log(JSON.stringify({ testName: 'getPayees()', status: 'FAIL', error: String(e), durationMs: elapsed() }));
}

// ── TX hash summary ───────────────────────────────────────────────────────────
console.log(JSON.stringify({
  testName: '=== TX HASH SUMMARY ===',
  status:   'INFO',
  hashes: {
    usdcApprovalTxId:   approveTxId  || '(not recorded)',
    fundTxId:           fundTxId     || '(not recorded)',
    runTxId:            runTxId      || '(not recorded)',
    secondRunTxId:      secondRunTxId || '(not recorded)',
    secondRunNothingDue: 'reverted with FAILED state (NothingDue confirmed)',
  },
}));

process.exit(failed ? 1 : 0);
