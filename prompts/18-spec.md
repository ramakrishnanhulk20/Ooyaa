DOCS SPEC (turn 18). Visual system: prompts/13-design.md (light paper theme, Fraunces, IBM Plex Sans and Mono, one red stamp accent, 8px radius).

The reviewer uploads the content into place with this turn:
- content/docs/*.md, each with front matter `title` and `group`;
- ARCHITECTURE.md;
- README.md.
You build the reader and wire it in. Do not rewrite the words of those files. If a fact in them is wrong against the code, list it in your report and leave the text alone.

A. The /docs reader (src/pages/DocsPage.tsx, src/components/docs/)
1. Loading: import.meta.glob('/content/docs/*.md', { query: '?raw', import: 'default', eager: true }). Parse the front matter with a small function of your own (title and group only; no new dependency for this).
   - Group order and labels: start "Start here", concepts "Concepts", guides "Guides", developers "Developers", security "Security", more "More".
   - Page order inside a group follows a `order` list you define in one file, src/components/docs/nav.ts. It holds every page's slug in sidebar order.
2. Rendering:
   - react-markdown with remark-gfm, the only new dependencies besides mermaid.
   - Headings h2 and h3 get ids from their text (lowercase, words joined by hyphens) and a hover link icon.
   - Code blocks: Plex Mono 0.875rem on --slip, 1px --rule, 8px radius, with a copy button.
   - Tables: Plex Sans 0.9375rem, 1px --rule rows, header row in Plex Mono 0.75rem uppercase --ink-3. They scroll inside their own box on narrow screens, never the page.
   - Links: internal /docs links use react-router Link. External links open in a new tab with rel noopener.
3. Mermaid: a client component that renders ```mermaid blocks with mermaid (latest 11.x), theme 'base' with themeVariables in the product colours:
   - primaryColor #FFFFFF;
   - primaryBorderColor #12193F;
   - primaryTextColor #12193F;
   - lineColor #575A64;
   - fontFamily IBM Plex Sans.
   Render after mount, with a unique id per block. If a diagram fails, show the source in a code block with the line "This diagram could not render."
4. Layout, desktop 1024px and up. Three columns inside the page container:
   - Left sidebar, 240px, sticky top 96px:
     - a search input (Plex Sans, 40px tall) that filters pages by title and body text, case-insensitive, showing matching pages with a one-line snippet;
     - the groups as Plex Mono 0.75rem uppercase --ink-3 labels, pages as Plex Sans 0.9375rem --ink-2;
     - the active page in --ink with a 2px --stamp bar on its left.
   - Content: max-width 720px. h1 Fraunces 3rem --ink line-height 1.05; h2 Fraunces 1.75rem; h3 Plex Sans 600 1.125rem; body 1.0625rem line-height 1.7 --ink-2.
   - Right, 200px, sticky: "On this page", the page's h2 and h3, with the one in view highlighted (IntersectionObserver).
   - Footer of the content: "Previous" and "Next" cards, from the nav order.
5. Mobile, under 768px:
   - the sidebar becomes a "Menu" button that opens a full-height sheet with the search and groups;
   - "On this page" becomes a collapsible block under the h1;
   - no element wider than the viewport at 375px.
6. Routes: /docs (overview), /docs/:slug, and an unknown slug shows "No page called <slug>." with a link to /docs.
7. Page title: "<title> | Ooyaa docs".

B. Site-wide.
1. Nav: add "Docs" after "Proof", same style. On mobile, if Create, Proof and Docs do not fit beside Connect, they move into a menu button. Check at 375px.
2. Footer on every page (src/components/Footer.tsx), with a 1px --rule top and padding 48px 0:
   - left, the stamp-ring mark and "Ooyaa";
   - middle, the links Create, Proof, Docs, "For judges" (/docs/judges), "Arc Studio project" (https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f), "Source code" ({{REPO_URL}}; leave the link out while the value is a placeholder);
   - right, Plex Mono --ink-3: "Live on Arc mainnet. Factory 0x18C7...Dc9b", linked to the explorer.
   - Mobile: stacked.
3. The home page: under the hero section, add nothing else this turn.

C. Tests:
- the front matter parser (title, group, a body containing ---);
- the heading id function;
- the search filter (title match, body match, no match);
- the nav order covers every file in content/docs, which also fails if a page is missing from nav.ts.
