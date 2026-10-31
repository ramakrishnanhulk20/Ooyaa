STUDIO PROMPT 24: add the live site link

GOAL: The app is live at https://ooyaa.vercel.app. README.md and ARCHITECTURE.md are uploaded in place with that link filled in. Commit them and push.

STEPS
1. Keep the two uploaded files exactly as uploaded. Change no other file.
2. Check: `git config user.name` must print ramakrishnanhulk20. If it does not, stop and report.
3. `git status --porcelain` must list only README.md and ARCHITECTURE.md.
4. Commit with exactly this message, with no trailers of any kind: Add the live app link
5. export PATH="$HOME/.local/bin:$PATH"; then `git push origin main`. This is a normal push, never --force. If it is refused, stop and report.

DO NOT: change any other file, create any credential, print any token, or deploy anything to a chain.

REPORT BACK: git status before the commit, the commit hash and message, and the push output.
