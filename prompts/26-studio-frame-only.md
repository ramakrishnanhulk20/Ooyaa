STUDIO PROMPT 26: Studio's tracing and console capture only inside the Studio preview

WHY: src/tracing.ts and src/console-capture.ts run on every page of the public site.
- tracing.ts redefines window.ethereum with Object.defineProperty and wraps provider.request for every visitor's wallet, even though tracing is off by default (it is enabled only by a message from the parent frame).
- console-capture.ts wraps console.* and prints "[studio-trace]" lines.
On the public site, at the top level and not inside Studio's preview iframe, neither does anything useful. A wallet layer that public visitors did not ask for is a risk: another Studio builder reported a MetaMask phishing warning on their Studio app (cause unconfirmed).

CHANGE
1. In src/tracing.ts and src/console-capture.ts, compute once at the top: const IN_STUDIO_PREVIEW = (() => { try { return window.self !== window.top; } catch { return true; } })();
   (A cross-origin parent throws on access, which means we are framed.)
2. When IN_STUDIO_PREVIEW is false, each file does nothing at all:
   - no window.ethereum redefinition, no provider patching, no console wrapping, no fetch or XHR patching, no message listeners, no logs;
   - exported functions such as registerChain stay callable and become harmless no-ops.
   When it is true, behaviour is exactly as today.
3. Keep both files and both imports in src/main.tsx. They are the Arc Studio integration and stay in the repository.
4. Add a short why-comment at the gate.
5. Checks:
   - the dash grep over the repository is clean;
   - bun test src passes;
   - tsc --noEmit is clean;
   - bun run build succeeds;
   - the two contract files are byte-identical.
6. Commit as git user ramakrishnanhulk20 with exactly this message and no trailers: Run Studio tracing only inside the Studio preview
   DO NOT PUSH.

DO NOT: change any other file except AGENTS.md turn notes, deploy anything, send any transaction, create any credential, print any token, or push.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
