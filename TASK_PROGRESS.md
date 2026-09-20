# TASK_PROGRESS.md — ComfyUI Hidden-Link Node

## Current Task

Tasks 1–10 complete and closed out (2026-09-16). Next: not yet specified.

## Completed Tasks

- **Task 1 — Repo scaffold + one-to-one hidden-link proof of concept** (2026-09-14).
  `HiddenLinkSend`/`HiddenLinkReceive` proxy node pair, wildcard `*` typing, link
  hidden by default and drawn dashed on hover, persistent paired-node label, pan+select
  jump button (`canvas.centerOnNode`). Quality check passed after fixing BF-03
  (one-to-one not enforced on the Send side). Git initialized, committed, tagged
  `task-01-completed`.
- **Task 2 — Type-aware color + auto-rename on connect** (2026-09-14). Send's input
  socket recolors to the connected type's native color on connect (looked up via
  `app.canvas.default_connection_color_byType`/`colourGetter`, confirmed against the
  installed ComfyUI frontend bundle), mirrored onto the paired Receive; both nodes'
  slot label and title update to name the type, reverting on disconnect.
- **Task 3 — Short titles, unique auto-names, custom name box, Receive search-dropdown**
  (2026-09-14). Shortened base titles, per-node-id auto-uniqueness, editable "Name"
  text widget on both nodes (custom name fully replaces auto name), Receive gets a
  "Connect to Send" combo widget (ComfyUI's combo already filters-as-you-type).
  BF-05 (dropdown selection didn't work) and BF-06 (stray Receives on paste/load)
  found and fixed during this task.
- **Task 4 — Multi-connection fan-out** (2026-09-14). Removed the one-to-one
  enforcement on Send's output — one Send can now feed any number of Receives.
  Send's jump button became a "Jump to Receive" dropdown listing every paired
  Receive (was a single-target button).
- **Task 5 — Paste keeps its connection, context-aware naming, type-driven node
  color** (2026-09-14). Both Send and Receive now remember their live connection in
  `properties` every frame and reconnect from that memory on `onAdded` if a fresh
  copy/paste didn't restore a real link natively. Auto name for Send with no custom
  name is now `<upstream node title> → <TYPE>`; Receive mirrors it. Titles are
  kind-prefixed ("Send · …" / "Receive · …"). Node header/body color now shifts to
  the connected pipe's color on both nodes (darkened for legibility), with a fixed
  accent square (`boxcolor`) as the color-independent Send-vs-Receive marker (node
  *shape* was tried first per the original plan but proved visually indistinguishable
  in Sid's build — see Notes below). BF-07 (broken color math for shorthand-hex
  fallback types) and BF-08 (workflow load corrupting Task 4's fan-out) found and
  fixed during this task.
- **Task 6 — Multi-slot Send/Receive pair (`HiddenLinkMultiSend`/`HiddenLinkMultiReceive`)
  + Receive slot-picker merge** (2026-09-16). New node pair with auto-expanding
  Reroute-style value slots (`value_1..value_20`, backend-capped), MultiReceive
  mirrors whichever MultiSend it's paired to. Single-slot picker built first as a
  standalone copy (`HiddenLinkReceiveV2`) per Sid's explicit instruction, verified
  working, then merged back into the original `HiddenLinkReceive` and the copy
  retired — `HiddenLinkReceive`'s "Connect to Send" combo now lists both plain Send
  nodes and individual MultiSend slots. BF-09 through BF-18 found and fixed during
  this task (see Bug Fix Log) — subgraph convert/unpack breaking pairing, collapsed
  hover, color/type mirroring bugs, live-follow grid-snap regression, id
  string/number mismatch, standalone MultiReceive not auto-expanding or resolving
  real types.
- **Task 7 — Mix-and-match receiver (`HiddenLinkMixReceive`)** (2026-09-16). New
  standalone node (no pairing/auto-spawn) with auto-expanding slots, each
  independently wired to any source (a plain Send or one specific MultiSend slot)
  via a "Connect to Send" combo that fills the current trailing empty slot. Jump
  display deduplicates by origin node, one clickable button per unique origin,
  slot-number prefix shown only when disambiguating a dedup'd multi-slot row.
  Verified working by Sid after a ComfyUI server restart (new Python class required
  it, not just a browser refresh).
- **Task 8 — Hide direct (non-proxy-routed) links into Receive/MultiReceive/
  MixReceive** (2026-09-16). Any link wired straight into one of these nodes'
  slots from an ordinary node (not through `HiddenLinkSend`/`HiddenLinkMultiSend`)
  now hides by default and reveals dashed on hovering either endpoint, same
  treatment as proxy-pair links — `LGraphCanvas.prototype.renderLink` reads
  `canvas.node_over` directly for this case since an arbitrary source node never
  gets the `_hiddenLinkHover` flag our own node types cache. Follow-up fix same
  task (BF-19): multi-slot socket labels only showed the resolved type; now show
  the origin's own output-slot name (e.g. "positive"/"negative"), falling back to
  type when the origin slot has no name.

- **Task 9 — Output socket label mirrors downstream consumer's slot name**
  (2026-09-16). Send/MultiSend/MultiReceive/MixReceive output sockets now show the
  downstream consumer's input-slot name (e.g. "positive"/"negative" on Apply
  ControlNet) instead of the resolved type, when connected — mirrors BF-19's
  input-side origin-name lookup but forward-looking. Fan-out: first-connected link's
  name wins, no joining/reverting-to-type for multiple links. `downstreamSlotLabel()`
  in `web/hidden_link.js`. Verified working by Sid. Quality check: no findings.
- **Task 10 — Manual receive-recovery button + not-connected styling (+ 5
  follow-up fixes from live testing)** (2026-09-16). Full spec in TASKS.md. Covers:
  manual "+ New Receive"/"+ New MultiReceive" recovery buttons on Send/MultiSend;
  dark-red "Not Connected" / amber "Input Not Connected" / "Output Not Connected"
  styling (prefix-first titles) across the whole node family, including
  pairing-aware connectivity for MultiSend/MultiReceive (matches their own jump/
  connect widgets' "1 connected" state rather than raw per-slot links); a
  generic dashed pairing line between an unconnected-but-paired MultiSend/
  MultiReceive on hover; live-follow drag-detach fixed for real (see Bug Fix Log
  BF-20/BF-21 — two wrong attempts before landing on mousedown + an
  instance-level `onNodeMoved` patch); and paste-connection-memory generalized
  from the original Send/Receive-only mechanism to all five node types via one
  `hiddenLinkSlotMemory` property (BF-22 through BF-24 — two more wrong timing
  attempts, landed on a microtask). Quality check: syntax verified
  (`node --check`), no dead code, no findings.

## Post-Launch Fix List

- Send/Receive "Name" text widget displays the literal text "null" instead of being
  empty when no custom name has been typed yet (spotted 2026-09-14, deferred by Sid
  — "leave it").

## Notes & Decisions Log

- 2026-09-20: All 5 node ids/classes/display names renamed with a `sidee_`
  prefix (NoMessyLinkSend → sidee_no_messy_link_send, etc. — id, Python class,
  and display name all match) at user request, same pattern applied to the
  textblock-merge project's TextBlock node. Breaks any already-saved workflow
  JSON referencing the old class_type strings (those nodes will show as
  missing/red on load) — accepted trade-off, confirmed by user.
- 2026-09-15: Project docs (CLAUDE.md, CLAUDE-WORKFLOW.md, TASKS.md,
  TASK_PROGRESS.md, SESSION_MEMORY.md) set up, modeled on the workflow structure of
  a prior project's CLAUDE.md (People Remover app) at the user's request. Split into
  CLAUDE.md + CLAUDE-WORKFLOW.md to keep each file under 200 lines.
- 2026-09-15: User clarified the extension must not repeat kijai's Set/Get weakness
  (no indication of which node a pair connects to) — added as a confirmed decision
  and as Open Questions #1–3, #5 in TASKS.md.
- 2026-09-16: All five Open Questions resolved via AskUserQuestion — proxy node pair
  architecture, persistent (always-on) label, one-to-one only for MVP (multi-link
  fan-out explicitly deferred to a later task, same concept extended), pan-only jump
  (no zoom change). TASKS.md Task 1 spec rewritten to be build-ready.
- 2026-09-14 (post-close-out, user-requested cosmetic tweak): Send node recolored
  orange (`#804a20`/`#cc7a29`), Receive node recolored blue (`#204060`/`#2966a3`) —
  previously both were the same dark red.
- 2026-09-14: Tasks 2–5 all resolved via AskUserQuestion before building (each
  written into TASKS.md as a formal spec first, per the "never assume" rule) rather
  than built ad hoc, even though the session stayed continuous across all of them
  instead of clearing between tasks as the workflow prescribes — Sid drove rapid
  iterative requests in one sitting, so each was still separately spec'd + approved
  + quality-checked, just not separated into fresh sessions.
- 2026-09-14: Tried LiteGraph node *shape* (`BOX_SHAPE` vs `ROUND_SHAPE`) as the
  Send-vs-Receive differentiator once both nodes' colors became type-driven (Task
  5) — Sid reported no visible difference in his build. Switched to a fixed
  `boxcolor` accent square instead (orange for Send, blue for Receive, independent
  of the type color), which is guaranteed to render since it's the same small
  square already visible on every node. `shape` assignment was left in place
  (harmless) but is not the real differentiator.
- 2026-09-14: Node size complaint (too big) — root cause is simply the number of
  stacked widgets (Name + jump/connect combo, 2 on Send, 3 on Receive), which
  LiteGraph auto-expands to fit; no way to shrink below that without cutting a
  widget. Made nodes resizable (were locked) and trimmed default width 170→145 as
  the only safe lever; told Sid the height floor is fixed unless a widget is
  dropped/merged.
- 2026-09-14: Sid asked about replicating a *collapsed-with-custom-icon* node style
  seen elsewhere (screenshot). Recommended trying LiteGraph's native collapse first
  (already free — `onDrawForeground` already bails out on `flags.collapsed`) before
  building custom collapsed-icon rendering; pushed back on a literal icon (loses
  info a text title carries) in favor of a type-color swatch if pursued later.
  Not built — open thread if Sid comes back to it.
- 2026-09-16: Task 6 built copy-first (`HiddenLinkReceiveV2`) per Sid's explicit
  instruction ("don't touch the original node"), verified live, then merged into
  `HiddenLinkReceive` and the copy deleted from both `nodes.py` and
  `web/hidden_link.js` — no permanent parallel node type left behind.
- 2026-09-16: Standalone multi-source jump display went through several rounds of
  live UX iteration with Sid (bracketed name string → per-origin dedup'd clickable
  rows → conditional slot-number prefix only when disambiguating). Final agreed
  design lives in `gatherUniqueOriginEntries`/`slotJumpLabel`/
  `syncStandaloneJumpWidgets` in `web/hidden_link.js`, shared by standalone
  MultiReceive and MixReceive.
- 2026-09-16: Decided NOT to further overload `HiddenLinkMultiReceive` with mixed
  independent-source slots — split that into a new dedicated node
  (`HiddenLinkMixReceive`, Task 7) so MultiSend/MultiReceive stays a pure
  mirror-pair.
- 2026-09-16: New Python node classes require a full ComfyUI **server restart** to
  appear in node search — a browser hard refresh alone is not enough (backend node
  registration happens only at server startup). Every other fix this session only
  touched JS behavior for already-registered types, so this hadn't come up before.
- 2026-09-16: No live browser/devtools access this session (unlike some earlier
  sessions) — all live testing done by Sid; diagnosis relied on temporary
  `console.log("[HiddenLink debug] ...")` statements added, tested by Sid, then
  removed once root cause was found. Ground truth for LiteGraph internals came from
  reading the installed frontend bundle directly (see BF-04/BF-06 note above for
  the file path) — confirmed `app.canvas.node_over` (correct collapsed-node hit
  test), `app.configuringGraph`/`LGraph.prototype.configure` (fires for load/undo/
  redo/`convertToSubgraph`'s internal reconfigure, NOT for `unpackSubgraph` which
  uses per-node `configure()` instead), and that node ids are **strings** on this
  ComfyUI build — a `Map`-backed `getNodeById` silently fails on a stored numeric id
  surviving a clipboard round-trip.
- 2026-09-16: LiteGraph widgets always render as one block below all socket rows —
  can never be interleaved between input/output rows. This hard constraint directly
  shaped the "group input + clickable jump button" UX iteration for standalone
  multi-source nodes (final design keeps widgets together as their own block, not
  interleaved per-slot as first requested).
- 2026-09-16: Runtime-patched `LGraph.prototype.convertToSubgraph` (auto-include
  hidden-link partner nodes so a boundary link doesn't get spliced through the
  subgraph container) and `LGraph.prototype.unpackSubgraph` (flag to suppress
  auto-spawn during unpack) — consistent with the project's existing convention of
  wrapping LiteGraph prototype methods at runtime (already used for
  `LGraphCanvas.prototype.renderLink`) rather than editing core ComfyUI files.
- 2026-09-16: Sid asked to hide direct (non-Send-routed) links into
  `HiddenLinkMixReceive` slots on hover too, same as the proxy-pair links — not yet
  specced/approved, next up.

## Bug Fix Log

| BF-## | Bug Name | Found | Fixed | Task | Root Cause & Fix |
|-------|----------|-------|-------|------|-------------------|
| BF-01 | Jump button pans to wrong spot | 2026-09-16 | 2026-09-16 | Task 1 | Diagnosed as DPI/backing-store pixel mismatch; fix (`.clientWidth`/`.clientHeight`) had zero effect per Sid's re-test — see BF-02 for the real cause. |
| BF-02 | Jump button pans to wrong spot (real cause) | 2026-09-16 | 2026-09-16 | Task 1 | BF-01's fix didn't stick because manually writing `canvas.ds.offset` was being overridden by this ComfyUI build's own pan/zoom pipeline — confirmed live via browser automation against Sid's running instance (set offset, read it back, got a different value). Fixed by calling the canvas's built-in `centerOnNode(node)` instead of hand-rolled offset math; verified live that it lands the target node exactly on screen center with zoom unchanged. |
| BF-03 | Send output not limited to one link | 2026-09-14 | 2026-09-14 | Task 1 | Root cause: LiteGraph output sockets fan out to multiple inputs by default; nothing restricted `HiddenLinkSend` to one link, violating the one-to-one MVP spec (Receive side was already safe — ComfyUI inputs are single-link by default). Fix: `onConnectionsChange` on the Send node drops every link on that output except the one just made. |
| BF-04 | Send node did not auto-create paired Receive | 2026-09-14 | 2026-09-14 | Task 1 | Root cause: original build required the user to manually add and drag-connect a Receive node. Fix went through 3 iterations before landing: (1) spawn on `onNodeCreated` via `setTimeout` — wrong, node.pos not final yet, every Receive landed at the same spot; (2) spawn on `onAdded` after a position-stability poll (`waitForStablePosition`) — still wrong, confirmed via a screen recording (`F:\Comfy\Vibe_ Coding\Videos_testing\01.mp4`, frames extracted with ffmpeg): pressing Enter in the node-search panel drops the Send node in "drag to place" mode, and it can sit motionless for several frames *before* the user starts dragging it, so the poll falsely declared it settled and spawned Receive at a stale position that then never updated while Send kept moving; (3) final fix — spawn Receive immediately and have it live-follow the Send node's position every frame (in `onDrawForeground`) until Send's position holds still for 5 consecutive frames, or until the user manually drags the Receive away (detected by comparing its position to the last value we synced). Verified working by Sid 2026-09-14. |
| BF-05 | Receive "Connect to Send" dropdown did nothing | 2026-09-14 | 2026-09-14 | Task 3 | Root cause: combo option strings are formatted `"<name> [#14]"`; the selection callback's regex `/#(\d+)\s*$/` requires digits at the literal string end, but the string ends in `]`, so it never matched and the handler returned early with no connection made. Fix: regex changed to `/\[#(\d+)\]$/` to match the bracketed id specifically. |
| BF-06 | Stray disconnected Receive nodes appear on paste and on every workflow load/refresh | 2026-09-14 | 2026-09-14 | Task 3 | Root cause (confirmed by reading the installed ComfyUI frontend bundle's actual `LGraphCanvas._deserializeItems` (paste) and `LGraph.prototype.configure` (load) implementations, not assumed): both add every node to the graph in one synchronous pass first, and only restore/reconnect each node's real saved links in a second pass afterward. The Send node's `onAdded` hook (which auto-spawns a paired Receive if the Send has no output link yet) ran synchronously inside that first pass, before the real link existed, so it always saw "no link" and spawned an extra Receive; when the real link was restored moments later, the one-to-one enforcement dropped the just-spawned stray link, leaving an orphaned Receive on canvas. Also found the existing `this.graph?.configuring` guard (meant to skip this during load) is never actually set anywhere in this LiteGraph build — it had been a dead no-op check since BF-04. Fix: deferred the auto-spawn check by one tick (`setTimeout(0)`) so it runs after both passes finish and sees the real, final link state; removed the dead `configuring` check. |
| BF-07 | Type-driven node color broken for types with no dedicated theme color | 2026-09-14 | 2026-09-14 | Task 5 | Caught during Task 5 build/self-review, before handoff. Root cause: `getTypeColor`'s fallback (`canvas.default_connection_color`, used for any type ComfyUI's theme has no dedicated entry for — e.g. STRING/INT/FLOAT) returns CSS shorthand hex (`#778`, `#7F7`), but `shadeColor`'s bit math assumed always-6-digit hex, silently producing garbage colors for every such type. Fix: expand 3-digit shorthand to 6-digit before parsing. |
| BF-08 | Reloading/opening a workflow collapsed a Send's multiple Receives down to one | 2026-09-14 | 2026-09-14 | Task 5 | Root cause: the Task 5 paste-reconnect fix ran its deferred `reconnectFromMemory`/auto-spawn check on *every* `onAdded`, with no way to tell a real workflow load apart from a paste — but a real load already restores every link correctly on its own and needs neither check; running them anyway on load corrupted Task 4's multi-Receive fan-out down to a single link (exact internal mechanism not fully isolated). Confirmed via the installed ComfyUI frontend bundle that `app.configuringGraph` is set around every `LGraph.prototype.configure` call (load/undo/redo) and is false during paste (`LGraphCanvas._deserializeItems` never calls `configure`). Fix: read `app.configuringGraph` synchronously in `onAdded` and skip both checks entirely when true — same lesson as BF-06, taken further: this logic must never run during a real load, only paste. |
| BF-09 | MultiReceive not auto-spawned when MultiSend added | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: original Send-only auto-pair logic (BF-04 pattern) never extended to MultiSend. Fix: added `spawnPairedMultiReceive` + `onAdded` hook to the MultiSend/MultiReceive registerExtension block, same live-follow/settle pattern as BF-04. |
| BF-10 | MultiReceive slot type/color wrong | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: `syncMultiReceiveSlotColors` read each slot's own (wildcard) link type instead of the paired MultiSend's real slot type. Fix: paired branch now reads type from the MultiSend's matching input slot. |
| BF-11 | Collapsed-node hover broken (link never revealed) | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: manual AABB hit-test used the node's expanded `this.size`, wrong once collapsed. Fix: switched to `app.canvas?.node_over === this` (confirmed correct via the installed frontend bundle), checked before the collapsed early-return, applied to all registerExtension blocks. |
| BF-12 | "Convert to Subgraph" breaks a hidden-link connection | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: a boundary link gets spliced through the subgraph container when only one side of a hidden-link pair is inside the selection. Fix: wrapped `LGraph.prototype.convertToSubgraph` to auto-include partner node(s) via `collectHiddenLinkPartners` before conversion runs. |
| BF-13 | Unpacking a subgraph spawns a stray extra Receive | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: `_unpackSubgraphImpl` restores nodes via per-node `configure()`, never sets `app.configuringGraph`, so the auto-spawn guard in `onAdded` couldn't tell this apart from a genuine new node add. Fix: `insideHiddenLinkUnpack` flag set by a wrap of `LGraph.prototype.unpackSubgraph`, checked in every auto-spawn guard alongside `app.configuringGraph`. |
| BF-14 | Live-follow positioning broke for both Multi and original Send/Receive pairs | 2026-09-16 | 2026-09-16 | Task 6 | First hypothesis (Multi-specific settle threshold too low) was wrong — raising it did nothing and the symptom then also appeared on the untouched original pair (regression, not scope). Root cause (found via debug logging): ComfyUI applies an automatic grid-snap to a freshly-added node's position one frame after creation; the existing exact-pixel-equality "did the user drag this" check misread the snap as a manual drag and stopped following. Fix: removed the frame-count settle timeout, replaced exact equality with `hasDriftedFromSync` (8px tolerance), applied identically to both node families. |
| BF-15 | ReceiveV2 connected to a plain Send showed wrong color (green instead of blue) | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: `getOriginType`'s SEND_TYPE branch fell through to the ReceiveV2↔Send link's own (wildcard) type instead of the Send's real resolved type. Fix: added explicit SEND_TYPE branch calling `getCurrentInputType(origin.node)`. |
| BF-16 | Slot-picker dropdown silently failed to connect after copy/paste | 2026-09-16 | 2026-09-16 | Task 6 | Root cause (confirmed via user's console dump): node ids are strings on this ComfyUI build, but a stored id from before a clipboard round-trip could come back as a number; `Map`-backed `getNodeById` does a strict-type lookup and silently failed. Fix: `findNodeByIdLoose`/`idsMatch` helpers used everywhere a persisted id is resolved/compared; removed `Number()` casts on parsed dropdown ids. |
| BF-17 | Standalone MultiReceive doesn't auto-expand a new empty slot | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: the unpaired branch of `syncMultiReceiveSlots` froze `wantTotal` at the node's current slot count instead of growing it. Fix: shared `growShrinkMultiSlots`/`selfExpandTarget` helpers, with an unpaired-fallback branch matching MultiSend's own self-expand behavior. |
| BF-18 | Standalone MultiReceive shows "*" instead of the real connected type | 2026-09-16 | 2026-09-16 | Task 6 | Root cause: unpaired `syncMultiReceiveSlotColors` never read anything at first; a follow-up fix reading raw `link.type` still showed "*" when the feeding node was itself another hidden-link node (chained wildcard). Fix: `resolveRealType` — recursive resolver walking through any chain of Send/MultiSend nodes to the true non-wildcard type. Also used by Task 7's MixReceive. |
| BF-19 | Multi-slot socket labels showed only the type, not which node/output feeds them | 2026-09-16 | 2026-09-16 | Task 8 | Root cause: `syncMultiSendSlotColors`/`syncMultiReceiveSlotColors` only ever wrote `inp.label = type`. First fix tried "origin title (type)" — Sid clarified he wanted the origin's own output-slot NAME instead (e.g. "positive"/"negative"), not its title or the resolved type. Fix: `resolveRealOrigin` (same recursion as `resolveRealType`, returns the terminal origin node+slot instead of a type string) + `slotSocketLabel` (reads that origin's `outputs[slot].label`/`.name`, falling back to resolved type only if the origin slot has no name of its own). |
| BF-20 | Live-follow stuck through a manual drag on MultiReceive | 2026-09-16 | 2026-09-16 | Task 10 | Two attempts. (1) Patched `LGraphCanvas.prototype.onNodeMoved` to detach on drag-end — zero effect, confirmed via screen recording the node never moved at all. Root cause: this ComfyUI build's canvas class declares `onNodeMoved;` as a bare class field, which sets it as an own `undefined` instance property on every canvas instance, always shadowing a same-named prototype patch. Fix: assign directly to the live `app.canvas` instance instead (`installNodeMovedHook`, lazily installed/idempotent-guarded from each node type's onDrawForeground). (2) That fix alone still looked "stuck for the first drag, works on the second" — `onNodeMoved` only fires on mouse-UP, so during the drag itself the per-frame follow-sync kept snapping the node back every frame until release. Fix: also detach on mouse-DOWN (`onMouseDown` on the Send/Receive and MultiSend/MultiReceive node types), stopping the snap-back the instant the node is grabbed. |
| BF-21 | Hovering an unconnected-but-paired MultiSend/MultiReceive showed no dashed link | 2026-09-16 | 2026-09-16 | Task 10 | Root cause: no real LiteGraph link exists between them until a slot actually carries data (Task 6's intentional mirror-only-when-filled design), so the existing per-link `renderLink` hook had nothing to draw. Fix (scope resolved via AskUserQuestion): a canvas-level overlay (`installMultiPairingOverlayHook`/`drawMultiPairingLines`, assigned directly on the live canvas instance) draws one generic dashed line directly between the two nodes whenever paired and either is hovered, only while no real per-slot link exists yet. |
| BF-22 | Paste lost the connection on standalone MultiReceive/MixReceive slots past the first | 2026-09-16 | 2026-09-16 | Task 10 | Root cause: Task 5's paste-memory was only ever built for the plain Send/Receive pair; extended it to a generic `hiddenLinkSlotMemory` property (`rememberSlotConnections`/`reconnectSlotsFromMemory`) covering every slot on every node type. First version ran the reconnect inside the existing deferred `setTimeout(0)` — but `growShrinkMultiSlots`' every-frame auto-trim ran on the very next render, before that timeout fired, and deleted every trailing slot that still looked unconnected (real links not restored yet), losing every connection past the first. |
| BF-23 | BF-22's fix (synchronous reconnect) restored nothing at all | 2026-09-16 | 2026-09-16 | Task 10 | Root cause, confirmed by reading ComfyUI's paste implementation (`_deserializeItems` in the installed frontend bundle): `graph.add(node)` (which fires `onAdded`) runs BEFORE `node.configure(data)`, the call that actually restores `properties` (including `hiddenLinkSlotMemory`) from the clipboard payload — reading it synchronously in `onAdded` always saw it still empty. Fix: a microtask (`Promise.resolve().then()`) instead of either extreme — runs after the whole paste operation's synchronous script finishes (configure() already ran for every node) but strictly before the next render frame (when the auto-trim runs). |
| BF-24 | Collapsed `HiddenLinkReceive` still lost its connection on copy/paste | 2026-09-16 | 2026-09-16 | Task 10 | Root cause: only the plain Send/Receive block called `rememberSlotConnections(this)` AFTER the `if (this.flags?.collapsed) return;` early-exit, so a collapsed node's slot memory went stale the instant it collapsed. The other two node-type blocks already had the call before the collapsed check (matching the existing hover-flag pattern, which has the same requirement). Fix: moved the call above the collapsed check in the one block that had it wrong. |
