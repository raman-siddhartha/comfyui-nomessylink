# CLAUDE-WORKFLOW.md — Task Workflow (referenced by CLAUDE.md)

Read this in full as part of the "Start" command and before starting or resuming
any task. This file holds the mechanics; CLAUDE.md holds the standing rules.

---

## Workflow — Follow Every Step, Every Task

```
STEP 1 → Announce what task you are about to start.
         Show the task number, task name, and a brief summary of what will be built.
         Ask the user for explicit approval before writing a single line of code.
         Do not start until they say yes.

STEP 2 → Build the task exactly as specified in TASKS.md.
         Do not add features not listed. Do not skip features that are listed.

STEP 3 → Tell the user the task build is complete.
         Ask them to load the extension in ComfyUI and test it manually.

STEP 4 → Wait for the user to confirm it is working.
         Accepted signals: "looks good", "approved", "yes", "done", or equivalent.
         Do not proceed until one of these is received.

STEP 5 → Perform a thorough quality check. Mandatory after every task, no exceptions.
         Check:
         - All code written this task for correctness, edge cases, and clarity.
         - That no dead code was introduced.
         - That all deliverables listed in TASKS.md for this task are present.
         - For unhandled errors/exceptions in both the JS extension and any Python node.
         - That the extension degrades safely if the node/graph state is unexpected
           (e.g. a link removed mid-hover, a node deleted while its partner remains).
         - That saved workflow JSON round-trips correctly (save → reload → still works).
         - That every UI control introduced or used this task is wired to its feature.
         - That any keyboard shortcuts fire only when no input field is focused.

         When a finding is made:
         - CRITICAL (breaks functionality, corrupts a saved workflow, or blocks the
           user): fix it immediately before moving on.
         - MINOR (cosmetic, edge case, low probability): do NOT fix now. Add it to the
           Post-Launch Fix List in TASK_PROGRESS.md and continue. Never block task
           completion for minor findings.

STEP 6 → Report quality check findings clearly: what was checked, what passed, any
         critical issues found and fixed, any minor items added to the Post-Launch
         Fix List. Ask the user for approval to move on.

STEP 7 → Update TASK_PROGRESS.md and create a backup:
         - Mark the completed task done with date and a 2–3 line summary.
         - Update "Current Task" to the next task.
         - Log any decisions made this task in the Notes & Decisions Log.
         - Commit to git: "Task [##] complete: [task name]", tag task-[##]-completed.
           (If git is not initialized yet, initialize it in Task 1.)

STEP 8 → Update SESSION_MEMORY.md: what was built and why (the reasoning behind
         non-obvious choices), decisions/tradeoffs/preferences stated in conversation
         not already captured in TASKS.md or TASK_PROGRESS.md, anything the user
         corrected this session that future sessions shouldn't re-ask about, and open
         threads. Keep it tight — a few bullets, not a transcript. Overwrite stale
         entries for the same topic rather than letting the file grow indefinitely.

STEP 9 → Remind the user: "This task is fully complete and all documents are
         updated, including SESSION_MEMORY.md. Please clear the conversation before
         starting the next task to keep context clean."

STEP 10 → Do not begin the next task in the same conversation. Wait for the user to
          start a fresh session and type "Start".
```

---

## Bug Fix Logging — Required for Every Fix

Every bug fix — caught during quality check, active development, or reported by the
user — must be logged in the **Bug Fix Log** in `TASK_PROGRESS.md` immediately after
the fix is applied.

```
| BF-## | [Bug Name — 3–5 words] | [YYYY-MM-DD found] | [YYYY-MM-DD fixed] | [Task/sub-task] | [One sentence root cause. One sentence fix.] |
```

Log after fixing any CRITICAL quality-check finding, any user-reported bug, or any
bug found during active development. Never defer this entry — log before moving to
the next sub-task.

---

## Error Handling During Build

If an error occurs during Step 2 (building) or Step 5 (quality check), follow this
every time without exception:

```
ERROR STEP 1 → Stop immediately. No silent fix. No continuing to build.
ERROR STEP 2 → Diagnose: exact error/behaviour, root cause, which file/line triggered it.
ERROR STEP 3 → Propose a fix: what it is, why it addresses the root cause; if multiple
               valid approaches exist, list trade-offs and recommend one with a reason.
ERROR STEP 4 → Ask for approval: "Error found: [description]. Proposed fix: [fix].
               Reason: [why]. Approve this fix?" Do not touch code until yes.
ERROR STEP 5 → Apply the approved fix only. Nothing else.
ERROR STEP 6 → Verify the fix resolved the error — re-run the affected path or ask
               the user to re-test the specific area that failed.
ERROR STEP 7 → If it worked → resume the task from where it was interrupted.
               If not → return to ERROR STEP 2 with the new information. Do not
               guess or try random changes. Report what was tried, why it failed,
               and propose the next specific approach for approval.
ERROR STEP 8 → If no viable fix after two attempts → stop completely. Report the
               error, both attempts, and why they failed. Ask the user for guidance.
```

---

## Sub-Task Workflow (for tasks with structured sub-parts)

```
SUB-STEP 1 → Announce the sub-task: label, what it covers, brief summary. Ask for
             approval before writing code.
SUB-STEP 2 → Build exactly what the sub-task specifies.
SUB-STEP 3 → Tell the user the sub-task is complete. Ask them to test it.
SUB-STEP 4 → Wait for explicit confirmation before proceeding.
SUB-STEP 5 → Quality check the sub-task's code (same standard as main STEP 5).
SUB-STEP 6 → Report findings. Ask for approval to move to the next sub-task.
SUB-STEP 7 → Log the completed sub-task in TASK_PROGRESS.md under the parent task:
               "Sub-task [label]: [what was built] — complete [date]"
             or, if user-requested:
               "Sub-task [label] (user-requested [date requested]): [what was built] — complete [date]"
             Commit to git: "Task [##][letter] complete: [sub-task name]".
SUB-STEP 8 → Move to the next sub-task. Return to SUB-STEP 1. Do NOT remind to clear
             the conversation between sub-tasks — stay in the same conversation until
             ALL sub-tasks of the main task are done.
```

### After ALL sub-tasks of a main task are complete

```
MAIN STEP 7 → Update TASK_PROGRESS.md: mark the main task complete with all
              sub-task labels listed. Commit to git and tag task-[##]-completed.
MAIN STEP 8 → Update SESSION_MEMORY.md per STEP 8 of the main workflow above.
MAIN STEP 9 → Remind the user: "All sub-tasks complete. Documents updated,
              including SESSION_MEMORY.md. Clear conversation before next task."
MAIN STEP 10 → Do not begin the next main task in this conversation. Wait for the
               user to start a fresh session and type "Start".
```

Sub-tasks are not shortcuts. Every sub-task follows the full workflow above without
exception.
