---
turn: 29b
title: UX audit part 2 (polish)
---

Items fixed:

1. --ink-3 changed from #8A8D97 to #666975 (5.01:1 on --paper, WCAG AA).
2. Global :focus-visible rule (2px solid --ink, offset 3px).
3. Hero h1 word spans now include a literal space so copy-paste and screen readers read "Payday that never misses."
4. Tap targets: nav mobile Connect and menu button raised to 44px; slip drawer close raised to 44px; filter chips, Add a payee, hero text links, Fund later label, and ledger tx links all get min-height 44px via CSS class at <768px.
5. #root gets padding-bottom 72px at >=768px so the fixed Arc Studio badge never covers the last content row.
6. Payslip entrance no longer animates opacity (was 0->1 causing overlap at 1.5s); only y and rotate animate.
7. Clickable rows in both EveryPayslip and LedgerTable: role=button, tabIndex=0, Enter/Space opens drawer, chevron shows on hover and focus-within. WHEN column always includes the date (no "today-only" shortcut).
8. Docs: Footer removed from DocsPage (App.tsx already provides it). Front matter title shown as Fraunces h1 on all viewports, not just mobile. Mermaid flowchart useMaxWidth: true to fit the column.
9. ProofPage: two mono lines below the h1 reserved at first paint (minHeight 1.3em) to eliminate CLS on load. ProofSheet progress shows "Check N of 8 -- ...".
10. og:* and twitter:* meta tags added to index.html.
11-12. formatUsdc double-USDC fixed in PayrollCard (underfunded line, waiting status, refused-underfunded) and CreateForm (fund paydays label).
13. /p address line now reads "Employer 0x..., contract 0x..." with comma separator.
