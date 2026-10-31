/**
 * DemoPayrollCard: thin wrapper that fixes PayrollCard to the demo payroll.
 * The hero uses this so its props and handle stay unchanged.
 */
import { forwardRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ARC_MAINNET } from '../deployments.js';
import { PayrollCard } from './PayrollCard.js';
import type { PayrollCardHandle } from './PayrollCard.js';

export type DemoPayrollCardHandle = PayrollCardHandle;

type Props = { id?: string };

export const DemoPayrollCard = forwardRef<DemoPayrollCardHandle, Props>(
  function DemoPayrollCard({ id }, ref) {
    const navigate = useNavigate();

    // Clicking a paid slip navigates to the payroll page with the slip pre-opened.
    const handleSlipClick = useCallback((periodIndex: bigint, txHash: `0x${string}`) => {
      void periodIndex;
      void navigate(`/p/${ARC_MAINNET.demoPayroll}?slip=${txHash}-0`);
    }, [navigate]);

    return (
      <PayrollCard
        ref={ref}
        payroll={ARC_MAINNET.demoPayroll}
        fromBlock={ARC_MAINNET.demoPayrollBlock}
        label="DEMO PAYROLL"
        id={id}
        onSlipClick={handleSlipClick}
      />
    );
  },
);
