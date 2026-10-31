STUDIO PROMPT 15: the proof page

GOAL: A judge opens /proof and watches Arc mainnet prove Ooyaa in their own browser. The same eight checks as `bun run prove` fill in one by one, and the sheet is stamped VERIFIED when all pass. Below it: the USDC totals, every wallet that pressed Run payday (ours and outside, kept apart), every USDC movement with its transaction link and a CSV download, and the Arc Studio facts. The attached prompts/15-spec.md is the full spec, and prompts/13-design.md still governs every visual.

PRESET: max preset (full audit and tests).

FILES
- Create:
  - src/pages/ProofPage.tsx;
  - src/components/proof/ (as many components as the page needs);
  - src/proof/clients.ts, src/proof/rows.ts, src/proof/rows.test.ts, src/proof/useProofReport.ts;
  - scripts/gen-runtime.ts, scripts/gen-build-facts.ts;
  - src/generated/runtime.ts and src/generated/build-facts.json, both written by running those scripts.
- Edit:
  - src/proof/prove.ts (the onCheck option only);
  - src/App.tsx (the /proof route);
  - src/components/Nav.tsx (the Proof link);
  - src/components/Stamp.tsx (the 'verified' kind only);
  - src/pages/LabPage.tsx (the proof sheet block);
  - package.json (two scripts);
  - README.md and AGENTS.md.
- Every other file stays unchanged, including src/payroll and the card.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data: no hardcoded figures, addresses lists or sample rows on /proof. /lab examples are labelled EXAMPLE STATE.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit, leaving out the known compass-deploy template error. bun run build: the last line.
- The contents of src/generated/build-facts.json.
- In your preview, if it reaches Arc Mainnet: the proof sheet's final summary line and the totals band figures.
- Confirmation that every file outside the list is unchanged.
