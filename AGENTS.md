# Agent instructions for this repo

<!-- BEGIN kenshiki-universal v1 · synced from @kenshiki/config (Kenshiki-Labs/ci packages/config/agents.md) · edit it there, not here -->
## Kenshiki rules for every repository

These apply to every coding agent (Claude, Codex, Cursor, Copilot and others) and to the people
directing them. The repository's own rules follow this block. Where the two differ, the stricter one
applies. A repository section may add rules; it never grants an exception to these.

### Authorization

- Do not stage, commit, push, merge, deploy or publish unless the person directing you asked for
  that specific action. Approval for one action does not extend to the next.
- Irreversible operations need explicit confirmation first: `git checkout`/`restore`/`reset`/`clean`
  over changed files, `rm`, force-push, overwriting a file you have not read, dropping a database
  table. Being confident you understood is not permission.
- Never bypass hooks (`--no-verify`).
- Live calls that cost money or reach real people (SMS, carrier lookups, payment, email) need
  authorization for that task.

### Preserve other work

- Read `git status` before editing. Uncommitted changes you did not make belong to someone else:
  leave them alone, never stage them, never revert them.
- Other sessions and other developers work in these repositories at the same time. If a file changed
  on disk since you read it, read it again.

### Branches and worktrees

- Two long-lived branches: `dev`, where work is integrated and pull requests land, and `main`, what is
  released and deployed. No other branch lives longer than its task.
- Every task is one topic branch off `dev`, named `feat/`, `fix/`, `chore/` or `docs/` plus a short
  name. It reaches `dev` by a pull request with green checks, is merged (squash unless the repository's
  own procedure says otherwise), and is deleted on merge.
- `main` moves only by promotion of a `dev` commit whose checks are green: a fast-forward, or a merge
  commit where the repository's promotion procedure says so. Never commit or open a topic pull request
  into `main`, and never squash or rebase `dev` into `main`.
- Work in progress is committed to its topic branch and pushed. The only copy of work is never a stash,
  an unpushed branch or a temporary directory.
- Extra worktrees live at `~/Developer/<repo>.worktrees/<branch>`, never under `/tmp` or a scratch
  directory, and are created and removed with `npx @kenshiki/config work start|clean`. Never remove a
  worktree that holds uncommitted or unpushed work.
- Tags are for releases only, made by the repository's release process.

### Verify before you assert

- Read a file in full before you make a claim about it, edit it, review it or brief another agent on
  it. Search output locates files and proves absence; it is not evidence of what code does.
- Cite `file:line` for claims about code, or say "unverified".
- For any external system (a vendor API, an Apple framework, an RFC, ICAO, AAMVA) read the current
  contract before writing integration code or diagnosing a failure. What you remember is a hypothesis.
  If you cannot reach the document, say so.
- A passing test is not proof the behaviour is right; tests can encode the defect. Check behaviour
  against the contract, the wire payload or the server's enforcement.
- A briefing to another agent is an assertion: read the governing gate or contract before writing it,
  and tell the agent to read files in full, never to "spot-check".

### Gates

- Run the repository's check (`npm run check`, `make check` or what its section names) before
  proposing a commit.
- Executable declarations (guards, contract files, lockfiles, CI checks) outrank your reading of the
  code. If one blocks your change, fix the real cause or raise it. Never edit a declaration to match
  what you just did, never weaken or delete a gate, never suppress a finding to clear it.
- Shared tooling comes from Kenshiki-Labs/ci: CI through its reusable workflows, Biome, ESLint and
  TypeScript settings from `@kenshiki/config`. Do not add a local copy of something it provides.
- Dependencies are pinned exactly. Node is pinned in `.node-version`.

### Secrets and personal data

- Never print, log, commit or paste secrets, tokens, private keys or personal data (phone numbers,
  document images, identity records) into code, diffs, logs or chat.
- Credentials live in ignored local files or the platform's secret store (Worker secrets, GitHub
  secrets, the keychain). Real identity data and sample documents never go into a repository.

### Code

- Propagate errors by default. Catch only to recover or to add context before rethrowing; a catch that
  logs and continues, returns an empty value or rethrows unchanged is not allowed.
- Await, return or hand off every Promise to an owned lifecycle (`ctx.waitUntil`). `void promise` is
  not error handling.
- Fail closed on integrity and authorization checks.

### Scope

- An instruction that says _only_, _don't_ or _one_ narrows the work. A follow-up narrows the earlier
  instruction; it never widens it.
- If you think a case is an exception, ask before acting. Do not leave it out silently and do not
  announce it afterwards.
- Change one thing, show the result, wait. Add the new thing beside the old, move one call site, and
  delete the old one only after the new one is accepted.
- On visual work, produce the screenshot before the second change.
- "Stop" means stop now.

### Decisions and checkpoints

- A decision that is genuinely the owner's goes to them as a question, with your recommendation as the
  first option. Use the client's question tool when it has one; never bury the choice in prose.
- An engineering-correctness fork has one right answer. Work it out, state it and do it; do not offer
  a menu. Asking is never a substitute for working.
- Work expected to run past about 30 minutes or touch more than three files checkpoints at every unit
  that leaves the tree green: a three-line status (done, in progress, next), the gates on the touched
  files, and an offer to commit the work in progress. An offer, not a commit.

### Reporting

- Name the level of evidence: written, compiles, covered by a named test, verified by a named run,
  verified on a device. Do not say "verified" without a run in this session.
- Report only checks you actually ran, with the commit and whether the tree was clean. Separate what
  you measured from what you inferred.
- Report a defect as the file, the line, the cause and the fix. Do not add who wrote it.
- State a correction plainly, once, and carry on.
<!-- END kenshiki-universal -->

This file is read by Codex and other coding agents. Claude Code reads
`CLAUDE.md` in this same directory — **the content is identical**; both
files exist so neither tool misses it. If you're an agent working here,
read `CLAUDE.md` for the full guidance (process-collision hazards around
`plasmo dev`/`plasmo build`, the `src/contents/` auto-registration trap,
the pre-handoff verification checklist, and architecture reminders). Keep
the two files in sync if you update one.
