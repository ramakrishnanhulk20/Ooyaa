/**
 * wagmi configuration: Arc Mainnet as primary chain, Ethereum Mainnet for ENS only.
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

/* Pre-register chain RPC URLs so trace events show correct chain names immediately */
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

export const config = createConfig({
  chains: [arc, mainnet],
  connectors: [injected()],
  transports: {
    [arc.id]: http('https://rpc.mainnet.arc.io'),
    [mainnet.id]: http(),
  },
})
