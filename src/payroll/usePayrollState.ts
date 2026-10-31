import { useReadContracts } from 'wagmi';
import { arc } from 'viem/chains';
import type { Address } from 'viem';
import { payrollAbi } from '../proof/abi.js';
import type { PayrollContractState } from './cardState.js';

export type PayrollStateResult = {
  state: PayrollContractState | undefined;
  payees: readonly Address[] | undefined;
  amounts: readonly bigint[] | undefined;
  dueNow: boolean | undefined;
  nextPayday: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
};

/** Reads the demo payroll state via multicall on Arc Mainnet, refetching every 15 s. */
export function usePayrollState(address: Address): PayrollStateResult {
  const contract = { address, abi: payrollAbi, chainId: arc.id } as const;

  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { ...contract, functionName: 'getState' },
      { ...contract, functionName: 'getPayees' },
      { ...contract, functionName: 'dueNow' },
      { ...contract, functionName: 'nextPayday' },
    ],
    query: {
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  });

  if (!data) {
    return {
      state: undefined,
      payees: undefined,
      amounts: undefined,
      dueNow: undefined,
      nextPayday: undefined,
      isLoading,
      isError,
    };
  }

  const [stateRes, payeesRes, dueNowRes, nextPaydayRes] = data;

  let state: PayrollContractState | undefined;
  if (stateRes.status === 'success' && stateRes.result) {
    // getState() returns a struct; viem decodes it as a plain object with named fields.
    const r = stateRes.result;
    state = r;
  }

  // getPayees() returns [addrs, amts] as a tuple.
  type GetPayeesResult = readonly [readonly Address[], readonly bigint[]];
  const payees = payeesRes.status === 'success'
    ? (payeesRes.result as GetPayeesResult)[0]
    : undefined;
  const amounts = payeesRes.status === 'success'
    ? (payeesRes.result as GetPayeesResult)[1]
    : undefined;

  const dueNow = dueNowRes.status === 'success'
    ? (dueNowRes.result)
    : undefined;

  const nextPayday = nextPaydayRes.status === 'success'
    ? (nextPaydayRes.result)
    : undefined;

  return { state, payees, amounts, dueNow, nextPayday, isLoading, isError };
}
