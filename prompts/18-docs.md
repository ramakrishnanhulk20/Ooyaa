STUDIO PROMPT 18: the docs inside the app, and a site footer

GOAL: /docs reads like a real product's documentation, in the product's own look: grouped pages in a sidebar, search, an "On this page" list, diagrams that render, and previous and next links. Every page gets a footer with the Arc Studio project link. The words are uploaded with this turn and must not be rewritten. The attached prompts/18-spec.md is the full spec, and prompts/13-design.md still governs every visual.

UPLOADED IN PLACE (keep the words exactly):
- content/docs/*.md (17 pages, each with title and group front matter);
- ARCHITECTURE.md;
- README.md.
The {{LIVE_APP_URL}} and {{REPO_URL}} placeholders stay as they are. They are filled at deploy.

PRESET: max preset (full audit and tests).

FILES
- Create: src/pages/DocsPage.tsx, src/components/docs/ (the reader, nav.ts, the Mermaid component, the search), src/components/Footer.tsx, and tests for the front matter parser, heading ids, search and nav coverage.
- Edit: src/App.tsx (the routes, and the footer on every page), src/components/Nav.tsx (Docs, and the mobile menu if the links do not fit), package.json (react-markdown, remark-gfm, mermaid), README.md and AGENTS.md (only the AGENTS.md turn notes; README.md is uploaded and stays as uploaded).
- Every other file stays unchanged. scripts/prove-it.ts and the contracts must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any credential.
- Do not edit the words of the uploaded docs, ARCHITECTURE.md or README.md. If a fact in them is wrong against the code, list it in your report.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- In your preview: /docs, /docs/architecture (the diagrams render), /docs/judges, and /docs/nonsense.
- Any doc fact that disagrees with the code.
- Confirmation that every file outside the list is unchanged.
