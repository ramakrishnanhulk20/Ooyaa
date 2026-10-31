/**
 * Creation block lookup for a payroll made by Ooyaa's factory.
 *
 * One eth_getLogs call with the payroll address as an indexed topic is far
 * faster than a binary-search getCode scan and avoids Blockdaemon's pruning
 * because log queries are served from the full event history.
 *
 * The demo payroll address is a special case: its creation block is a known
 * constant so no network call is needed at all.
 */
import { type Address, type AbiEvent, type PublicClient, getAddress } from "viem";
import { factoryAbi } from "./abi.js";
import { ARC_MAINNET } from "../deployments.js";
import { getLogsChunked } from "./history.js";

// Typed once so viem encodes the payroll argument as an indexed topic filter.
const PAYROLL_CREATED_EVENT = factoryAbi.find(
  e => e.type === "event" && e.name === "PayrollCreated",
) as AbiEvent;

/**
 * Returns the block in which the factory emitted PayrollCreated for the given
 * payroll address, or null when no matching log is found.
 *
 * The scan starts at factoryBlock and ends at toBlock (current head).
 * chunk controls the eth_getLogs window size; pass 100_000n for Blockdaemon,
 * 10_000n for Arc's own node.
 *
 * When payroll is the demo payroll, returns ARC_MAINNET.demoPayrollBlock
 * immediately without any network call.
 */
export async function creationBlockOf(
  client: PublicClient,
  payroll: Address,
  factory: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunk?: bigint,
  onProgress?: (msg: string) => void,
): Promise<bigint | null> {
  // Fast path: the demo payroll's creation block is a known constant.
  if (getAddress(payroll) === getAddress(ARC_MAINNET.demoPayroll)) {
    return ARC_MAINNET.demoPayrollBlock;
  }

  const logs = await getLogsChunked(
    client,
    {
      address: factory,
      event: PAYROLL_CREATED_EVENT,
      args: { payroll },
    },
    fromBlock,
    toBlock,
    onProgress,
    8,
    chunk ?? 10_000n,
  );

  if (logs.length === 0) return null;
  const bn = logs[0].blockNumber;
  return bn ?? null;
}

/**
 * Convenience wrapper using ARC_MAINNET.factory and ARC_MAINNET.factoryBlock.
 */
export async function mainnetCreationBlockOf(
  client: PublicClient,
  payroll: Address,
  toBlock: bigint,
  chunk?: bigint,
  onProgress?: (msg: string) => void,
): Promise<bigint | null> {
  return creationBlockOf(
    client,
    payroll,
    ARC_MAINNET.factory,
    ARC_MAINNET.factoryBlock,
    toBlock,
    chunk,
    onProgress,
  );
}
