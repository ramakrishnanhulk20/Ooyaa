STUDIO PROMPT 23b: push the existing commit

GOAL: The owner has authenticated the GitHub CLI in this workspace (`~/.local/bin/gh auth status` shows ramakrishnanhulk20) and created the empty public repository github.com/ramakrishnanhulk20/ooyaa. Push the commit you already made (c1ac5a4, "Ooyaa: USDC payroll on Arc, built in Arc Studio"). Change no files.

STEPS
1. export PATH="$HOME/.local/bin:$PATH". Run `gh auth status` and report the account line.
2. `git status --porcelain` must be empty and `git log -1 --format='%H %s'` must show c1ac5a4 with that message. If the tree is not clean, or HEAD is a different commit, stop and report. Do not commit anything new.
3. `git ls-files | wc -l` must be 223. Also confirm git ls-files lists none of: .env, context/, .compass/, console.jsonl, cache/, out/, node_modules/, dist/.
4. If no remote called origin exists, add it: `git remote add origin https://github.com/ramakrishnanhulk20/ooyaa.git`.
5. `git push -u origin main`. Never use --force. If the remote has commits you do not have, stop and report.
6. `git ls-remote origin main` must show the same hash as HEAD.

DO NOT
- Do not edit, add or delete any file. Do not create any credential.
- Do not print the token. Do not run `gh auth token` or anything else that echoes it.
- Do not deploy anything to any chain.

REPORT BACK
- The gh account line.
- The git status and log output.
- The ls-files count, and the exclusion check.
- The push output (no token), and the ls-remote hash.
