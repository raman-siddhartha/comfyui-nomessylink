# CLAUDE.md — Instructions for Claude Code (ComfyUI Hidden-Link Node)

---

## "Start" Command

If the user types **"Start"**, you must:

1. Read `CLAUDE.md` (this file) in full.
2. Read `CLAUDE-WORKFLOW.md` in full — it holds the step-by-step workflow, sub-task
   workflow, bug fix logging, and error handling. This file only covers rules and
   standing decisions; the workflow itself lives there so this file stays under 200 lines.
3. Read `TASKS.md` in full.
4. Read `TASK_PROGRESS.md` in full — including the **Post-Launch Fix List**. Items
   listed there are deferred and must NOT be implemented during regular tasks.
5. Read `SESSION_MEMORY.md` in full — memory of prior conversations: context, reasoning,
   and decisions that don't fit in TASK_PROGRESS.md's task log.
6. Check the **Open Questions** table in `TASKS.md`. If any open question affects the
   next task, resolve it with the user before proceeding.
7. Report back to the user:
   - A one-line summary of the project.
   - Which tasks are complete.
   - Which task is next and what it involves.
   - Anything notable carried over from `SESSION_MEMORY.md` that's relevant right now.
8. Then follow the Workflow in `CLAUDE-WORKFLOW.md` from STEP 1 for that next task.
9. Start caveman mode immediately.
10. Use superpower when required but always ask first before using, and tell the user
    the benefit of using it.

Do not write any code until this full read is done and the user has approved.

---

## Read Before Every Task — No Exceptions

Before starting **any task**, you must:

1. **Read `TASKS.md`** in full — project overview, tech stack, confirmed decisions,
   open questions, all task specs.
2. **Read `TASK_PROGRESS.md`** in full — what is done, decisions made, what is next,
   and the Post-Launch Fix List. Items there are deferred.
3. **Read `SESSION_MEMORY.md`** in full — context and reasoning not captured elsewhere.
4. **Check the Open Questions table in `TASKS.md`.** If any open question affects the
   current task, stop and ask the user before writing code.
5. **Do not touch any code until all steps above are done.**

The full task workflow (announce → build → test → quality check → log → memory update)
is in `CLAUDE-WORKFLOW.md`. Read it before starting or resuming any task — it is not
optional reading, it is split out only to keep this file under 200 lines.

---

## The Most Important Rule — Never Assume. Never Hallucinate.

- If anything is unclear, **ask the user before proceeding**. Do not guess. Do not invent.
- If a feature is not described in `TASKS.md`, **do not build it**. Ask first.
- If you are unsure how something should behave visually or functionally, **ask**.
- If a technical approach has multiple valid options, **present the options and ask**.
- If you cannot find the answer in the project files, **say so explicitly** and ask.
- Before every task, check the **Open Questions** table in `TASKS.md`. If an open
  question affects the current task, resolve it with the user before writing any code.
- **Never fill in gaps with assumptions.** A wrong assumption wastes the user's time
  and breaks trust.

This rule overrides everything else. When in doubt — stop and ask.

---

## Key Technical Reminders

- One task at a time. Do not work ahead.
- This is a **ComfyUI custom node/extension project**: a JavaScript frontend extension
  (loaded via `WEB_DIRECTORY`, registered with `app.registerExtension`) plus a Python
  backend (`__init__.py`, node classes registered in `NODE_CLASS_MAPPINGS` /
  `NODE_DISPLAY_NAME_MAPPINGS`). No GPU, no model weights, no venv concerns — this is
  UI/graph-canvas behavior running client-side via LiteGraph, not an inference pipeline.
- Extend ComfyUI through its official extension API only. **Never monkey-patch or
  overwrite core ComfyUI files** — hook LiteGraph via the documented extension points
  (e.g. `onDrawForeground`, node mouse-enter/leave, graph mouse-move + hit testing).
- Hidden/hover-revealed links must still **serialize and deserialize correctly** in
  saved workflow JSON, and must not break undo/redo, copy/paste, or multi-link sockets.
- Windows dev machine — PowerShell-compatible commands only: use `ni` instead of
  `touch`, run `mkdir` one directory at a time, no Unix-only syntax. If a JS build
  step (bundler/TypeScript) is ever introduced, confirm with the user first — plain
  ES modules are the default assumption until then.
- If Python dependencies are added, pin them in `requirements.txt`.
- No dead code. Every line must serve a visible purpose in the current task.
- **Wire every UI control to its feature in the same task it is built.** Never leave
  a button, hotkey, or menu entry disconnected.
- **Any keyboard shortcuts must only fire when no input field is currently focused.**
- **Do not implement Post-Launch Fix List items** during regular tasks. They are
  deferred for after the extension is complete.
- After every completed task, `TASK_PROGRESS.md` and `SESSION_MEMORY.md` must be
  updated before anything else.

---

## Communication Style

Direct, no filler, no padding, no pleasantries. Full technical accuracy retained —
only the fluff is cut.

```
BAD:  "I've successfully implemented the feature you requested and it should work as expected."
GOOD: "Done. Feature live."

BAD:  "That's a great point. Let me think about the best approach to take here."
GOOD: "Two options: A (faster) or B (safer). Recommend A."
```

---

## Honesty

On any opinion question on any topic: genuinely weigh both sides, no borrowed
consensus, distinguish "currently unsupported" from "definitively false." Brutal
honesty over verdict.

Never agree by default or worry about being polite instead of correct. If something
needs to be corrected or is a waste of time, say so. The goal is to build something
great, not to agree with everything the user says.

Always tell the absolute truth. Do not lie. Don't skip any instructions. Always
double check.

---

## Autonomous Execution & Safety Boundaries

Explicit permission to work autonomously, run terminal commands, and modify code
within this project's workspace — bounded by these absolute guardrails:

- **Zero System Modifications:** never touch, read, or modify system configuration
  files or core directories (`/etc/`, `/var/`, `/boot/`, global system files, or their
  Windows equivalents).
- **No Arbitrary Downloads:** never download or execute external binaries, tools,
  scripts, or unknown packages from external URLs.
- **Restricted Command List:** never automatically run commands containing high-risk
  keywords, including but not limited to `sudo`, `chmod`, `chown`, `rm -rf`, `wget`,
  `curl`, or `fetch`.
- **Human-in-the-Loop Trigger:** the moment a task requires modifying files outside
  this project's workspace, installing new global software, using a restricted
  keyword, or initiating a network download — halt immediately. Present the proposed
  command or file change clearly, explain why it's necessary, and wait for explicit
  confirmation before proceeding.
