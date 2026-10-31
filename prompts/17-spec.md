CREATE YOUR OWN PAYROLL SPEC (turns 17a and 17b). Visual system: prompts/13-design.md. Error handling follows the turn 14 pattern: simulate first, classify by walking the viem cause chain (src/payroll/runErrors.ts), never claim on-chain effects that did not happen.

CONTRACT FACTS (from the NatSpec in contracts/)
- factory.createPayroll(address[] payees, uint256[] amounts, uint64 startTime, uint64 periodLength, uint256 tipPerRun) returns address, and emits PayrollCreated(employer indexed, payroll indexed, index).
- Limits:
  - 1 to 100 payees: distinct, non-zero, never the USDC address 0x3600000000000000000000000000000000000000;
  - each amount from 1 to 1,000,000e6;
  - startTime from block.timestamp to block.timestamp + 365 days;
  - periodLength from 60 s to 366 days;
  - tipPerRun from 0 to 10e6.
  - USDC has 6 decimals here.
- payroll.fund(amount) pulls USDC with transferFrom, so it needs approve first. Reverts ZeroFundAmount.
- payroll.withdraw(amount): employer only, at most freeBalance(). Reverts WithdrawZero and WithdrawExceedsFree.
- payroll.close(): employer only. No new periods are ever owed after it. Periods already started still run. Fund stays allowed. Reverts AlreadyClosed.
- payroll.claim(): pays the caller's claimable (pay held after a failed transfer). Reverts NothingToClaim.

17a. /new: CREATE AND FUND (src/pages/NewPayrollPage.tsx, src/components/create/, src/payroll/createMachine.ts, src/payroll/draft.ts)
1. Layout, desktop:
   - Left, columns 1 to 6:
     - label "NEW PAYROLL";
     - h1 "Create your own payroll." Fraunces clamp(2.5rem, 5vw, 4rem);
     - sub, --ink-2: "Two minutes, a few cents of USDC. Anyone can run payday for you, and you can watch it happen.";
     - then the form.
   - Right, columns 7 to 12, sticky top 96px: the DRAFT. It is the PayrollCard look with the label "DRAFT", a schedule line, up to 3 payslips showing each payee and amount as typed, and "Funded for <n> paydays". It updates on every keystroke, and changed values fade 150 ms.
2. Form (Plex Sans inputs, 44px tall, 8px radius, 1px --rule border, focus border --ink):
   a. Payees. Rows of [address][amount USDC][remove].
      - "Add a payee" text button, at most 100 rows.
      - Each row has a "Use my wallet" link that fills the connected address.
      - Inline errors under each field in --stamp 0.8125rem:
        - "Not an address";
        - "Listed twice";
        - "Cannot be the USDC contract";
        - "Above 0, at most 1,000,000";
        - "At most 6 decimals".
   b. "Pay every": segmented control with 2 minutes (to try it), 1 hour, 1 day, 1 week, 2 weeks, 4 weeks. The default is 2 minutes.
   c. "First payday": In 2 minutes, In 1 hour, or "Pick a time (UTC)" with a datetime-local read as UTC. The default is In 2 minutes. startTime is computed at submit from the latest block timestamp, never from the browser clock.
   d. "Tip for whoever runs it". Default 0.01, 0 to 10. Helper: "Paid to anyone who presses Run payday. It is why strangers run it for you."
   e. "Fund now": paydays to cover, default 5, minimum 1. It shows "<n> paydays: <n x (sum of amounts + tip)> USDC". A "Fund later" checkbox skips funding.
   f. Summary box (--slip, 1px --rule): "You will sign up to 3 times: create the payroll, allow <amount> USDC, fund it. Keep about 0.02 USDC extra on Arc for gas." The primary button reads "Create payroll".
   g. The draft persists in localStorage under "ooyaa:draft:v1", with every access wrapped in try/catch. It is cleared when done.
3. Flow (createMachine.ts, a pure reducer like runMachine; steps create, approve, fund, done):
   - No wallet: open ConnectKit and never continue by itself. Wrong chain: "Switch to Arc".
   - Validate with validateDraft(draft, chainNow). Any error stops the flow before any signature.
   - Step "create":
     - simulate factory.createPayroll from the wallet. A revert maps its errorName to the field message (table below), and the summary line reads "Nothing was signed".
     - Then writeContract, pending with the tx link, the receipt, and the new payroll from the PayrollCreated log of this factory in this receipt.
   - Step "approve": skipped when allowance(wallet, payroll) is at least the amount. Approve exactly the amount, never unlimited.
   - Step "fund": simulate, write, receipt.
   - A step list shows under the button: "1 Create payroll, 2 Allow USDC, 3 Fund". Each step shows waiting, signing, pending (tx link), done (check) or failed (reason and "Try again", which resumes at that step).
   - Done: navigate to /p/<new>?created=1. That page shows a toast: "Payroll created. First payday <UTC>."
   - Leaving after create but before fund is fine. /p/<new> shows the payroll unfunded, and 17b adds Fund there.
4. errorName to message:
   - EmptyPayeeList: "Add at least one payee."
   - TooManyPayees: "At most 100 payees."
   - ZeroPayee: "A payee address is empty."
   - DuplicatePayee: "<short address> is listed twice."
   - PayeeIsUsdc: "A payee cannot be the USDC contract."
   - ZeroAmount: "Every amount must be above 0."
   - AmountTooLarge: "At most 1,000,000 USDC per payee."
   - StartTimeTooEarly: "The first payday must be in the future. Pick a later time."
   - StartTimeTooLate: "The first payday must be within 365 days."
   - PeriodLengthTooShort or PeriodLengthTooLong: "Pick a pay period from 1 minute to 366 days."
   - TipTooLarge: "The tip can be at most 10 USDC."
   - ZeroFundAmount: "Fund more than 0."
   - Anything else: "The contract refused: <errorName>. Nothing was sent."
5. Entry points:
   - Nav: add "Create" before "Proof", same style.
   - Hero: under the "Live on Arc mainnet" line, a text link "Or create your own payroll in two minutes". Plex Sans 500 0.9375rem --ink, underline drawing on hover.
6. Mobile: the draft moves below the form as a collapsed "Preview" disclosure. No element wider than the viewport at 375px.
7. Tests:
   - validateDraft: one test per rule, including the 6-decimal limit and USDC as payee.
   - fund amount math.
   - createMachine: every transition, including approve skipped and failure then resume.
   - The errorName map.
   - PayrollCreated parsing, which ignores a PayrollCreated from another address.

17b. EMPLOYER AND PAYEE ACTIONS ON /p/:address (src/components/payroll/EmployerPanel.tsx, ClaimButton.tsx)
1. When the connected wallet is the employer, a panel under the header: "You run this payroll."
   - Figures: BALANCE, OWED, FREE TO WITHDRAW (from the contract: balance, owed(), freeBalance()).
   - Fund more: amount input plus "covers <n> more paydays", then approve if needed, then fund. Same step list and errors as 17a.
   - Withdraw: amount input with "Max", which is freeBalance(). WithdrawExceedsFree reads "You can withdraw at most <free> USDC without leaving a due payday unpaid."
   - Close: a text button "Close this payroll", opening a confirm block: "No new paydays will start after you close. Paydays already due stay payable, and you can still fund them. This cannot be undone." Type "close" to enable the red-outlined button.
   - After any success, refetch the state, and show a toast with the tx link.
2. When the connected wallet has claimable above 0: a "Claim <amount> USDC" button in the Your payslips band (16b), calling claim(). NothingToClaim reads "Nothing to claim."
3. "Your payrolls" on /new, above the form, when the connected wallet has created any: factory.payrollsCreatedBy(wallet, 0, 20), as short addresses linked to /p/<address>.
4. Tests: the panel's visibility rules (employer, payee, stranger), withdraw max and its error copy, and the close confirm gate.
