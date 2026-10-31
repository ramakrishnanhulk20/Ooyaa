OOYAA DESIGN SPEC: tokens, type, nav, hero, demo payroll card, stamp, /lab (turn 13)

Direction: editorial payslip, light, measured off Column (structure: headline left, a live product object right) and Stripe Press (the product's artifact rendered as a real object). The artifact here is the payslip. One accent only: the stamp red.

TOKENS (CSS variables on :root in src/index.css, mirrored in tailwind.config.js theme.extend.colors)
- --paper #F5F5F3 page; --slip #FFFFFF payslip paper
- --ink #12193F headlines and primary text; --ink-2 #575A64 body; --ink-3 #8A8D97 captions and the grey stamp
- --rule #D9D9D4 hairlines and slip borders
- --stamp #D23A24 the PAID stamp and nothing else on this turn
- --paid #1A7F6B status paid; --held #5B6B8C status held for claim
- Radius 8px on buttons and cards, never pills. body background --paper, color --ink-2.

TYPE (self-hosted with @fontsource; never system fonts)
- Display: Fraunces variable with the opsz, SOFT and WONK axes (@fontsource-variable/fraunces full axes file). font-variation-settings "opsz" 144, "SOFT" 0, "WONK" 0; weight 600.
- Alternative display for /lab only: Instrument Serif 400 (@fontsource/instrument-serif).
- Body: IBM Plex Sans 400 and 500. Figures, labels, addresses: IBM Plex Mono 400 and 500.
- Hero h1: clamp(3.5rem, 8vw, 7rem), line-height 0.95, letter-spacing -0.03em, --ink.
- Hero sub: 1.25rem, line-height 1.5, --ink-2, max-width 34ch.
- Labels: Plex Mono 0.75rem, uppercase, letter-spacing 0.08em, --ink-3.
- Slip amount: Fraunces 2.5rem weight 600 --ink. Slip address: Plex Mono 0.9375rem --ink.

NAV (height 72px, 1px --rule bottom border, same container as the hero)
- Left: the stamp-ring mark (22px circle, 2px --ink stroke, inner 1px ring at 70% radius) and "Ooyaa" in Fraunces 1.375rem weight 600 --ink. Links to /.
- Right: the ConnectKit button styled as the secondary button (below). No other links this turn: How it works, Proof and Docs arrive with their pages.

HERO, desktop 1024px and up
- Container max-width 1280px, side padding 48px, 12-column grid, gap 24px, padding-top 96px, padding-bottom 96px.
- Left, columns 1 to 6, vertically centred against the card:
  - Label "USDC PAYROLL ON ARC".
  - h1 "Payday that never misses."
  - Sub "Pay your team in USDC on a fixed day, exactly once. Anyone can press the button."
  - Primary button "Run today's payday", 48px tall, 20px side padding, Plex Sans 500 16px, background --ink, text --paper. It scrolls to the card's run button (Lenis scrollTo, offset -120) and focuses it.
  - 24px below: one Plex Mono 0.8125rem --ink-3 line: "Live on Arc mainnet, factory " + the factory address as 0x18C7...Dc9b, linked to https://explorer.arc.io/address/<factory>.
- Right, columns 7 to 12: the demo payroll card.
- Background: in the right half of the hero only, a perforation-dot field: 1px --ink dots every 14px at 6% opacity (radial-gradient background), masked to fade out toward the left edge.

DEMO PAYROLL CARD (every figure live from Arc mainnet, see 13-spec.md)
- Card: --slip background, 1px --rule border, 8px radius, padding 28px, shadow 0 24px 60px -32px rgba(18,25,63,.28).
- Header row: left label "DEMO PAYROLL"; right, Plex Mono 1rem --ink, by state:
  - due, one waiting: "Payday due"; due, n waiting: "<n> paydays due"
  - nothing due: "Next payday in 12:34" (mm:ss under an hour, "1h 02m" above)
  - underfunded: "Out of funds"; closed: "Closed"
- Second row, Plex Sans 15px --ink-2, two lines:
  - "Funded for <runway> more paydays". Underfunded: "Owes <owed> USDC, holds <balance> USDC".
  - "<payeeCount> payees, <amount> USDC each, every hour". If the amounts differ: "<periodTotal> USDC in total, every hour". The cadence text comes from periodLength: 3600 "every hour", 86400 "every day", 604800 "every week", otherwise "every <n> minutes", "hours" or "days".
- The slip stack, 24px below: one payslip per payee, at most 3 drawn, then "+<n> more payees" in a mono label.
  - Slips offset 10px down and 6px right each, rotated -1.5deg, 0deg, +1.2deg.
  - Each slip: --slip background, 1px --rule border, 8px radius, shadow 0 18px 40px -24px rgba(18,25,63,.25), padding 20px 24px 20px 32px.
  - Left edge perforated: a column of 6px holes every 14px, made with a CSS mask using radial-gradient. This is the site motif.
  - Top row: mono label "PAYSLIP, PERIOD 0001" (4 digits, zero padded) left, "OOYAA" right.
  - Middle: payee address as 0x96E8...aB75 (mono), and the amount "0.01 USDC" (Fraunces).
  - Bottom row, mono 0.8125rem:
    - due: "Due 10:00 UTC, 28 Oct" in --ink-2, with the date only when it is not the chain's current UTC day;
    - paid: "Paid, tx 0x0692...7fec" in --paid, linked to https://explorer.arc.io/tx/<hash>;
    - held: "Held for claim" in --held.
- Run button, 24px below the stack, full card width, primary style, id "run-payday".
  - Label by state:
    - due: "Run payday";
    - nothing due: "Run payday again", secondary style and enabled. Pressing it lets the contract refuse a second run, with no wallet needed (turn 14);
    - underfunded, disabled: "Out of funds";
    - closed, disabled: "Payroll closed";
    - loading, disabled: "Loading payroll...".
  - This turn the button does not send anything. It calls an onRun prop that turn 14 implements.
- Under the button, Plex Sans 14px --ink-3:
  - due: "Earn a 0.01 USDC tip for running it." With n > 1, add " <n-1> more paydays are waiting after this one."
  - nothing due: "Period 0001 is paid. Next payday in 12:34."
  - underfunded: "The employer must top it up before the next run."
- Loading: shaped placeholders (grey bars, 4px radius, --rule at 60%) in every figure's place. Never show "0", and never a figure before it loads.
- RPC error: one line in the card, "Could not reach Arc. Retrying in 15 seconds.", while the last good figures stay.

STAMP (src/components/Stamp.tsx), the signature moment
- PAID: rounded rectangle, 2px double border in --stamp, text --stamp, Plex Mono 600, uppercase, letter-spacing 0.12em, 0.875rem, padding 6px 12px, rotated -12deg, placed over the right half of the slip.
- Motion: scale 1.6 and opacity 0, to scale 1 and opacity 1, over 140ms, cubic-bezier(0.2, 0.9, 0.3, 1.2). Then an ink bleed: text-shadow 0 0 2px --stamp, fading to none over 300ms. The slip dips 2px down and back over 80ms.
- ALREADY PAID: the same shape in --ink-3, rotated +8deg, with the same motion.
- A stack is stamped in order, 90ms apart, through one function stampAll(kind) exposed by the card.

ENTRANCE ON LOAD (text shows at once from static markup, whatever the data does)
- h1 words fade and rise (y 24 to 0, opacity 0 to 1) over 520ms, ease [0.16, 1, 0.3, 1], 60ms apart. The sub follows at +120ms and the button at +200ms.
- Slips enter from y 32, rotating from 0deg to their target, over 600ms, 90ms apart, starting at 300ms.
- Lenis smooth scroll site-wide.
- prefers-reduced-motion: no stagger and no rotation animation, and stamps appear without scaling.

HOVER
- Primary button: background #1E2758 and a 1px lift, over 120ms. Secondary button (1px --ink border, transparent): background rgba(18,25,63,.04).
- A slip lifts 4px over 160ms ease-out.
- Links: the underline draws from the left (background-size 0 to 100%) over 200ms.
- Disabled buttons: --ink at 35% opacity, no hover, cursor not-allowed.

PHONE, below 768px
- Single column, 20px side padding, no horizontal scroll at 375px.
- Order: label, h1, sub, button (full width), mono line, then the card.
- In the card, the slips get half the rotation, the stack is 92% wide, and the countdown sits above the slips.
- Nav: the wordmark, plus the connect button reduced to "Connect".

/lab (dev builds only, see 13-spec.md)
1. Type A/B: "Payday that never misses." set at hero size, A in Fraunces 600 and B in Instrument Serif 400. Each has a mono caption: "A. Fraunces 600, opsz 144" and "B. Instrument Serif 400".
2. One payslip, live from the demo payroll's first payee, drawn three times: due, paid (the latest real payslip tx) and held. The held copy carries a mono caption, "Example state: no payout has ever been held".
3. Buttons: "Stamp PAID", "Stamp ALREADY PAID" and "Reset", playing the stamps on the slips above.
4. Swatches: every token as a 96px square with its name and hex in mono. Stamp red sits beside paid teal, so we can check the two never read as a clash.
