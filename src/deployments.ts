import type { Address } from "viem";

export const USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const satisfies Address;

export const ARC_MAINNET = {
  chainId: 5042,
  factory: "0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b" as Address,
  factoryDeployBlock: 28261674n,
  // factoryBlock is the canonical name referenced by prove.ts log-source path.
  factoryBlock: 28261674n,
  demoPayroll: "0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A" as Address,
  demoPayrollBlock: 28272851n,
  explorer: "https://explorer.arc.io",
} as const;

export const ARC_TESTNET = {
  chainId: 5042002,
  factory: "0xb32feb10b48d753dee8938435ebe1c303ce6955b" as Address,
  referencePayroll: "0x1b31ea6ce9c6ad70444c476166eb219026e6c1d3" as Address,
  explorer: "https://explorer.testnet.arc.io",
} as const;
