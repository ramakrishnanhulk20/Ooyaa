import { describe, test, expect } from 'bun:test';
import {
  createWalletClient,
  createPublicClient,
  custom,
  toFunctionSelector,
} from 'viem';
import { arc } from 'viem/chains';
import { payrollAbi } from '../proof/abi.js';
import { classifyRunError } from './runErrors.js';

const ADDR = '0x1234567890123456789012345678901234567890' as `0x${string}`;
const ACCT = '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9' as `0x${string}`;

const RUN_ABI = [
  { type: 'function', name: 'run', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const;

// Produce an Error whose code property viem reads for wallet RPC errors.
// Throwing a plain object fails the lint rule; attaching code to an Error works.
function rpcError(code: number, message: string): Error {
  const e = new Error(message);
  (e as Error & { code: number }).code = code;
  return e;
}

// Produce an Error whose code and data properties viem reads for eth_call reverts.
function revertError(data: `0x${string}`): Error {
  const e = new Error('execution reverted');
  (e as Error & { code: number; data: string }).code = 3;
  (e as Error & { code: number; data: string }).data = data;
  return e;
}

// WalletClient that rejects every method except eth_chainId with a given RPC error.
function walletClientThrowing(code: number, message: string) {
  return createWalletClient({
    chain: arc,
    transport: custom({
      request({ method }: { method: string }) {
        if (method === 'eth_chainId') return Promise.resolve('0x13b2');
        return Promise.reject(rpcError(code, message));
      },
    }),
  });
}

// PublicClient whose eth_call rejects with a revert carrying the given selector.
function publicClientReverting(selector: `0x${string}`) {
  return createPublicClient({
    chain: arc,
    transport: custom({
      request({ method }: { method: string }) {
        if (method === 'eth_chainId') return Promise.resolve('0x13b2');
        if (method === 'eth_call') return Promise.reject(revertError(selector));
        return Promise.reject(new Error('unhandled: ' + method));
      },
    }),
  });
}

async function writeAndThrow(code: number, message: string): Promise<unknown> {
  const wc = walletClientThrowing(code, message);
  try {
    await wc.writeContract({
      address: ADDR,
      abi: RUN_ABI,
      functionName: 'run',
      gas: 300000n,
      chain: arc,
      account: ACCT,
    });
    return null;
  } catch (err) {
    return err;
  }
}

async function simulateAndThrow(selector: `0x${string}`): Promise<unknown> {
  const pc = publicClientReverting(selector);
  try {
    await pc.simulateContract({
      address: ADDR,
      abi: payrollAbi,
      functionName: 'run',
      account: ACCT,
    });
    return null;
  } catch (err) {
    return err;
  }
}

describe('classifyRunError', () => {
  test('writeContract cancel (code 4001) wrapped in ContractFunctionExecutionError gives cancelled', async () => {
    const err = await writeAndThrow(4001, 'User rejected the request.');
    const r = classifyRunError(err);
    expect(r.kind).toBe('cancelled');
    expect(r.detail).toBe('You cancelled. Nothing was sent.');
  });

  test('writeContract no-gas (code -32000) wrapped in ContractFunctionExecutionError gives no_gas', async () => {
    const err = await writeAndThrow(-32000, 'insufficient funds for gas * price + value');
    const r = classifyRunError(err);
    expect(r.kind).toBe('no_gas');
  });

  test('simulateContract NothingDue revert gives reverted, name NothingDue', async () => {
    const sel = toFunctionSelector('NothingDue()');
    const err = await simulateAndThrow(sel);
    const r = classifyRunError(err);
    expect(r.kind).toBe('reverted');
    expect(r.name).toBe('NothingDue');
  });

  test('simulateContract Underfunded revert gives reverted, name Underfunded', async () => {
    const sel = toFunctionSelector('Underfunded()');
    const err = await simulateAndThrow(sel);
    const r = classifyRunError(err);
    expect(r.kind).toBe('reverted');
    expect(r.name).toBe('Underfunded');
  });

  test('simulateContract InsufficientGasForRun revert gives reverted', async () => {
    const sel = toFunctionSelector('InsufficientGasForRun()');
    const err = await simulateAndThrow(sel);
    const r = classifyRunError(err);
    expect(r.kind).toBe('reverted');
    expect(r.name).toBe('InsufficientGasForRun');
  });

  test('HTTP 429-style transport error gives other', () => {
    const r = classifyRunError(new Error('429: Too Many Requests'));
    expect(r.kind).toBe('other');
  });

  test('detail is capped at 80 characters', () => {
    const r = classifyRunError(new Error('x'.repeat(120)));
    expect(r.detail.length).toBeLessThanOrEqual(80);
  });
});
