BUILD SPEC (turn 13: foundation, hero, live demo card, /lab)

FACTS
- Arc Mainnet is viem's `arc` (id 5042) in viem/chains. RPC https://rpc.mainnet.arc.io. Explorer https://explorer.arc.io. USDC is 0x3600000000000000000000000000000000000000 with 6 decimals through the ERC-20 interface. Multicall3 is deployed at 0xcA11bde05977b3631167028862bE2a173976CA11.
- Demo payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A, created in block 28272851 by the factory in src/deployments.ts. Its payees are 3 at 10000 each, the tip is 10000, periodLength is 3600, and startTime is 1793178000. Period 0 was paid in tx 0x0692c42dd090bf022e41b9bb57d130ec6c1402615e0abb10d6ba9f1674c07fec. Right now, many periods are due and waiting.
- eth_getLogs allows at most 10,000 blocks per call. Blocks are about 0.5 s apart.
- Use src/proof/abi.ts (payrollAbi, factoryAbi, erc20Abi) for every contract call. It is generated from contracts/out; never type an ABI by hand.

PACKAGES: add react-router-dom, lenis, @fontsource-variable/fraunces, @fontsource/instrument-serif, @fontsource/ibm-plex-sans and @fontsource/ibm-plex-mono. Framer Motion is already installed: use it for the entrance and the stamp.

FILES
- Edit:
  - src/config.ts: chains [arc, mainnet]. Ethereum mainnet stays only for ConnectKit's ENS. Transports: http('https://rpc.mainnet.arc.io') for arc, http() for mainnet. Connectors: [injected()]. registerChain for arc. Its header comment uses a colon, not a dash.
  - src/main.tsx: wrap App in BrowserRouter and import src/fonts.ts. Keep tracing, console-capture, the providers and the Studio watermark exactly as they are.
  - src/App.tsx: Routes: "/" HomePage. "/lab" LabPage, registered only when import.meta.env.DEV is true. "*" NotFound: one line, "Nothing here.", plus a link home.
  - src/index.css: tokens, base styles, the perforation mask, the link underline and the dot field.
  - tailwind.config.js: colors and fontFamily (display, serifAlt, sans, mono) from the tokens.
  - index.html:
    - title "Ooyaa: payday that never misses";
    - meta description "USDC payroll on Arc. Each payee is paid exactly once per period, and anyone can run payday for a small tip.";
    - favicon /favicon.svg;
    - every em dash in it replaced by a colon.
  - src/deployments.ts: add demoPayroll and demoPayrollBlock (28272851n) to ARC_MAINNET.
  - AGENTS.md: your turn notes.
- Create:
  - src/fonts.ts;
  - src/pages/HomePage.tsx, src/pages/LabPage.tsx, src/pages/NotFound.tsx;
  - src/components/Nav.tsx, Hero.tsx, DemoPayrollCard.tsx, Payslip.tsx, Stamp.tsx, StampRing.tsx;
  - src/payroll/usePayrollState.ts, useChainClock.ts, lastPaidRun.ts, cardState.ts, format.ts, cardState.test.ts, format.test.ts;
  - public/favicon.svg (the stamp ring in --ink on transparent);
  - vercel.json: {"rewrites":[{"source":"/(.*)","destination":"/"}]}.

DATA (read-only this turn; no wallet needed for anything on the page)
- usePayrollState(address):
  - one useReadContracts (multicall) on arc for getState(), getPayees(), dueNow() and nextPayday();
  - refetch every 15 s, and right after the countdown reaches zero;
  - it returns the raw values, isLoading, and the error with the last good data kept.
- useChainClock(): reads the latest block timestamp every 15 s. It keeps offset = blockTimestamp * 1000 - Date.now() and returns nowChain (seconds), ticking every second from Date.now() + offset. The countdown uses nowChain, never the plain browser clock.
- lastPaidRun(client, payroll, period): the tx and the payslips of an already-paid period, found without scanning history.
  - Binary-search the first block, between demoPayrollBlock and latest, where nextUnpaid() read at that block is greater than period.
  - Then getLogs for that one block: the PaydayRun event with args { period }, and the PayslipIssued events with args { period }.
  - It returns { txHash, blockNumber, payslips: [{ payee, amount }] }. Cache it with react-query, keyed by payroll and period.
- cardState.ts, pure, used by the card:
  - deriveCardState({ state, payees, dueNow, nextPayday, nowChain }) returns one of:
    - { kind: 'loading' };
    - { kind: 'due', period, waiting, dueAt };
    - { kind: 'idle', lastPaidPeriod, nextAt };
    - { kind: 'underfunded', owed, balance };
    - { kind: 'closed' }.
  - Rules:
    - underfunded when balance < totalDeferred + periodTotal + tipPerRun and dueNow is true;
    - waiting = startedPeriods - nextUnpaid;
    - due period = nextUnpaid, dueAt = startTime + period * periodLength;
    - idle shows period nextUnpaid - 1 as paid, or no slips when nextUnpaid is 0.
- format.ts, pure:
  - shortAddress(a) gives 0x1234...abcd;
  - formatUsdc(units) uses formatUnits(units, 6) with no trailing zeros, plus " USDC";
  - countdown(seconds) gives "12:34" under an hour and "1h 02m" from an hour;
  - periodLabel(n) gives "PAYSLIP, PERIOD 0001";
  - cadence(periodLength) gives the text in 13-design.md;
  - utcTime(ts, nowChain) gives "10:00 UTC", or "10:00 UTC, 28 Oct" on another UTC day.

/lab: LabPage uses the same Payslip and Stamp components as the hero. Nothing on it is linked from the site.

TESTS (bun test)
- format.test.ts: every function above, including countdown at 0, 59, 3599 and 3600 seconds, formatUsdc of 10000 ("0.01 USDC") and 1460000 ("1.46 USDC"), and periodLabel(1).
- cardState.test.ts:
  - loading;
  - due with one waiting;
  - due with 19 waiting;
  - idle after period 0;
  - underfunded (balance 30000, periodTotal 30000, tip 10000, dueNow true);
  - closed;
  - nextUnpaid 0 with nothing started.

CHECKS BEFORE YOU REPORT
- bun test, bun run check and bun run build all pass.
- At 375px, the home page has no horizontal scroll (document.documentElement.scrollWidth equals 375).
- The card shows live figures from Arc Mainnet in your preview, if your sandbox can reach the RPC. Say plainly if it cannot.
