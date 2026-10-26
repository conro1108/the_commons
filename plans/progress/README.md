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
| B. Inside | `worktree-agent-abdb5b75c87a75ea4` | finished, awaiting merge |
| C. Gary's schedule | `worktree-agent-abdf4488549af27a7` | running |
| D. The letter | `worktree-agent-a2e4e1a742c385faa` | running |
| E. The spirit | `worktree-agent-a723058c2a972b2bb` | finished, awaiting merge |
| F. The library | `worktree-agent-acc722659ac2419b9` | running |

## Merge order (planned)

F → A → C → B → D → E. Each merge: `git merge <branch>`, resolve, `npm run
build && npm test`, apply its `db/alters/*.sql` by hand, push (CI reruns
logic.sql), tick it below.

## Log

- foundation committed and pushed; `db/alters/0-foundation.sql` applied live.
- A launched; told afterwards to keep plans/progress/A-outside.md.
- B, C, D, E, F launched, each keeping plans/progress/<slice>.md on its branch.
- Worktrees live in .claude/worktrees/agent-<id>; branches are worktree-agent-<id>.
- E finished (8 commits). Merge notes: apply db/alters/5-spirit.sql before logic.sql reruns (SQL never run anywhere yet, review carefully); alter grants existing places a month's grace before board_up(). On merge: point net.ts fileChangeOfUse() stub at C's change of use, C clears filings.drift on granting one and can use driftOf() for mixed use; survey() wants .eq("room","out") once B lands; boarded look up close is unclaimed (A's closeup.ts).
- Connor: live data is disposable. So at merge: apply alters without ceremony, and if the schema gets tangled, wipe rows rather than write migrations to preserve them. E's month's grace before board_up() can go (or stay as harmless).
- B finished (8 commits, no new schema; logic.sql gets room_size() and placeable() replacing in_plot in placement policies, SQL unrun). Merge notes: point the SEAM import in interior.ts at F's FITTINGS, adapt fitting() (needs rows/palette, on floor|wall, slots [cx, bottom y], small, flat, lamp, vary), delete src/interior-fittings.ts; swap doorOutside() for A's real door cells; finishOf() material keys should match A's materials; A's closeup.ts can call drawHeld() for held things outdoors.
