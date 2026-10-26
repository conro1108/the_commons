# Building and enforcement: progress

The orchestrator's log for `plans/building-and-enforcement-slices.md`. If the
work is interrupted, start here: this says what's launched, where it lives,
and what's merged. Each slice keeps its own step-by-step log in
`plans/progress/<slice>.md` **on its own branch**, committed after every step,
so `git show <branch>:plans/progress/<slice>.md` tells you where it got to
even if its agent died.

To resume a slice whose agent is gone: check out its branch (or worktree), read
its progress file, carry on from the first unticked step.

## Slices

| Slice | Branch | Status |
|---|---|---|
| foundation | main @ 5368586 | done, pushed, alter applied |
| A. Outside | `worktree-agent-a7b5ff9fc6bf3cff7` | running |
| B. Inside | | not launched |
| C. Gary's schedule | | not launched |
| D. The letter | | not launched |
| E. The spirit | | not launched |
| F. The library | | not launched |

## Merge order (planned)

F → A → C → B → D → E. Each merge: `git merge <branch>`, resolve, `npm run
build && npm test`, apply its `db/alters/*.sql` by hand, push (CI reruns
logic.sql), tick it below.

## Log

- foundation committed and pushed; `db/alters/0-foundation.sql` applied live.
- A launched.
