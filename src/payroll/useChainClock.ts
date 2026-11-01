import { useState, useEffect, useRef } from 'react';
import { createPublicClient, http } from 'viem';
import { arc } from 'viem/chains';

/** Reads the latest block timestamp every 15 s, then ticks every second. */
export function useChainClock(): bigint {
  // offset = blockTimestamp * 1000 - Date.now() at last sync
  const offsetRef = useRef<number>(0);
  // Lazy initializer avoids calling Date.now during render: it runs once, not on every re-render.
  const [nowChain, setNowChain] = useState<bigint>(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const client = createPublicClient({
      chain: arc,
      transport: http('https://rpc.mainnet.arc.io'),
    });

    let cancelled = false;

    async function sync() {
      try {
        const block = await client.getBlock({ blockTag: 'latest' });
        if (!cancelled) {
          offsetRef.current = Number(block.timestamp) * 1000 - Date.now();
        }
      } catch {
        // Keep last known offset on failure.
      }
    }

    // Sync immediately, then every 15 s.
    void sync();
    const syncInterval = setInterval(() => { void sync(); }, 15_000);

    // Tick every second.
    const tickInterval = setInterval(() => {
      if (!cancelled) {
        setNowChain(BigInt(Math.floor((Date.now() + offsetRef.current) / 1000)));
      }
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
      clearInterval(tickInterval);
    };
  }, []);

  return nowChain;
}
