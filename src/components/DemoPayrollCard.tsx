/**
 * DemoPayrollCard: thin wrapper that fixes PayrollCard to the demo payroll.
 * The hero uses this so its props and handle stay unchanged.
 */
import { forwardRef } from 'react';
import { ARC_MAINNET } from '../deployments.js';
import { PayrollCard } from './PayrollCard.js';
import type { PayrollCardHandle } from './PayrollCard.js';

export type DemoPayrollCardHandle = PayrollCardHandle;

type Props = { id?: string };

export const DemoPayrollCard = forwardRef<DemoPayrollCardHandle, Props>(
  function DemoPayrollCard({ id }, ref) {
    return (
      <PayrollCard
        ref={ref}
        payroll={ARC_MAINNET.demoPayroll}
        fromBlock={ARC_MAINNET.demoPayrollBlock}
        label="DEMO PAYROLL"
        id={id}
      />
    );
  },
);
