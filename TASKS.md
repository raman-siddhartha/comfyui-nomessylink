# TASKS.md — ComfyUI Hidden-Link Node

## Project Overview

A ComfyUI custom node/extension pair that connects an output to an input without
drawing a visible noodle between them. The connection is hidden by default; hovering
the connector reveals the link (dashed line, per the user's sketch). Unlike kijai's
Set/Get nodes (ComfyUI-KJNodes) — which hide the wire but give no indication of which
node a Set/Get pair is connected to, forcing the user to guess by matching names —
this must always make the connected node identifiable, and let the user jump to it
directly.

## Tech Stack

- **Frontend:** JavaScript extension, loaded via `WEB_DIRECTORY`, registered with
  `app.registerExtension`. Plain ES modules unless a build step is explicitly
  approved later. Hooks LiteGraph's official extension points only — no monkey-patching
  core ComfyUI files.
- **Backend:** Python custom node(s) in `__init__.py` / `nodes.py`, registered via
  `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS`.
- No GPU, no model weights, no inference — this is graph/canvas UI behavior only.

## Confirmed Decisions

- Connection is hidden by default; hovering the connector node reveals the link as a
  dashed line (per user's sketch, 2026-09-15).
- Must NOT work like kijai's Set/Get: those hide the wire but give no way to tell
  which node a given Set/Get pair connects to, so the user has to guess/match names.
  This extension must show, without guessing, which node each side is connected to.
- Each connector must have a button to jump to (pan/select) its connected node on
  the canvas — stated requirement, 2026-09-15.
- Saved workflow JSON must round-trip correctly (see CLAUDE-WORKFLOW.md STEP 5).
- **Architecture:** hidden connections always go through a dedicated small
  proxy/connector node pair (as sketched) — never a direct hide of an arbitrary
  existing link. Resolved 2026-09-16.
- **Indicator:** each connector shows a **persistent label** naming its connected
  node — visible at all times, not just on hover. Resolved 2026-09-16.
- **Fan-out:** MVP (Task 1) was one-to-one only. Superseded by Task 4 (2026-09-14):
  one Send can now feed multiple Receive nodes. Receive itself stays one-to-one (one
  Send per Receive) — see Task 4 spec below.
- **Jump behavior:** the jump button **pans only**, keeping the current zoom level —
  no auto zoom-to-fit. Resolved 2026-09-16.
- **Auto-pairing:** adding a `HiddenLinkSend` node from the node menu auto-creates and
  auto-connects a paired `HiddenLinkReceive` node, placed 220px to its right. Adding a
  bare Receive node does NOT auto-spawn a Send (Send-only, asymmetric). Manual
  drag-to-connect still works as a convenience on top of this (e.g. to delete the
  auto-link and rewire to a different existing node) — it is not disabled. Resolved
  2026-09-14, corrects a gap in the original Task 1 build (BF-04).

## Open Questions

None currently blocking. New ones will be added here as they come up.

Resolve any open question that affects a task **before** writing code for it — see
CLAUDE.md, "The Most Important Rule."

## Task Specs

### Task 1 — Repo scaffold + one-to-one hidden-link proof of concept
Ready to build — all blocking questions resolved 2026-09-16. Covers:
- Repo scaffold: `__init__.py` (registers node mappings + `WEB_DIRECTORY`), `nodes.py`
  (Python node classes), `web/hidden_link.js` (frontend extension).
- One connector node pair (a "sender" and a "receiver"), each accepting/emitting the
  wildcard `*` type so they work with any ComfyUI data type, matching Reroute/Set-Get
  behavior. **Flag to confirm before building, not yet explicitly decided by Sid.**
- The link between a paired sender/receiver is not drawn by default; hovering either
  node reveals it as a dashed line.
- Each node always shows a persistent label with its paired node's title.
- Each node has a button that pans the canvas to its paired node (no zoom change) and
  selects it.
- One-to-one only: a sender can pair with exactly one receiver and vice versa for
  this task.

### Task 2 — Type-aware color + auto-rename on connect
Resolved via AskUserQuestion 2026-09-14. Covers:
- When Send's `value` input gets a link, both Send's input AND output sockets
  recolor to the connected type's native LiteGraph slot color (e.g. CLIP yellow,
  MODEL purple, VAE red) instead of the generic wildcard color.
- Receive node's `value` input AND output sockets mirror the same color (Receive
  always mirrors Send's input side — Receive's own downstream connection does not
  independently drive color).
- On connect: both slot label ("value" → type name, e.g. "CLIP") AND node title
  (e.g. "Hidden Link (Send) — CLIP" / "Hidden Link (Receive) — CLIP") update on
  BOTH nodes.
- On disconnect from Send's input: revert both nodes to wildcard color, "value"
  slot label, and generic "Hidden Link (Send)" / "Hidden Link (Receive)" titles.

### Task 3 — Short titles, unique auto-names, custom name box, Receive search-dropdown
Resolved via AskUserQuestion 2026-09-14. Covers:
- Shorter base title: "HL-Send" / "HL-Receive" (was "Hidden Link (Send)"/"(Receive)").
- Auto-uniqueness via LiteGraph's own node id: default name is `HL-Send #<id>` /
  `HL-Receive #<id>` — no separate counter to maintain, ids are already unique and
  stable once a node is added to the graph.
- Both Send and Receive get an editable "name" text widget. A non-empty custom name
  fully replaces the auto `HL-Send #<id>` name everywhere it's shown (title, and the
  Receive dropdown below) — the numbered id is dropped, not appended.
- Task 2's " — TYPE" suffix still applies on top of whichever name (auto or custom)
  is currently in effect, on both nodes, only while a value is actually connected.
- Receive node gets a "Connect to Send" combo/dropdown widget listing every Send node
  currently in the graph (by its effective name), including ones already paired to
  another Receive — picking one rewires this Receive's input to that Send's output
  (Send stays one-to-one, so any previous pairing on that Send drops). ComfyUI's combo
  widget already has built-in type-to-filter search — matches node-search behavior,
  no custom search UI needed.

### Task 4 — Multi-connection fan-out (one Send, many Receives)
Resolved via AskUserQuestion 2026-09-14 — pulls forward the fan-out item originally
deferred at Task 1. Supersedes the "Fan-out: MVP is one-to-one only" line in
Confirmed Decisions above. Covers:
- Remove the one-to-one enforcement on Send's output — a Send node's output may now
  connect to any number of Receive nodes simultaneously.
- Receive stays one-to-one on its input (unchanged, already ComfyUI's normal
  single-link input behavior) — each Receive still pairs with exactly one Send.
- Receive's "Connect to Send" dropdown (Task 3) picking a Send that already has other
  Receives no longer disconnects them — it just adds this Receive as another one.
- Send's jump button becomes a dropdown ("Jump to Receive") listing every currently
  connected Receive by name; picking one pans/selects it, same pan-only behavior as
  before. Single-Receive case just shows a one-entry list.
- Auto-pair-on-add (Task 1/BF-04) is unchanged: adding a Send still auto-spawns
  exactly one Receive. Additional Receives are added manually (drag or dropdown).
- Type-driven color/label/title (Task 2) and name/auto-numbering (Task 3) are
  unaffected — Send's type still comes from its own single input; each Receive still
  mirrors whichever one Send it's paired with.

### Task 5 — Paste keeps its connection, context-aware naming, type-driven node color
Resolved via AskUserQuestion 2026-09-14. Covers:
- **Paste/duplicate keeps its connection**, both directions: pasting a lone Receive
  re-links to the same Send it was copied from; pasting a lone Send re-links to
  whatever upstream node/slot fed its input. Mechanism: each node remembers its live
  connection in `this.properties` every frame it has one (survives copy since
  `properties` is standard serialized node data); a deferred (one-tick) check on
  `onAdded` reconnects from that memory only if the node still has no real link after
  LiteGraph's own paste/load link-restore pass has finished.
- **Auto name** (no custom name set) for Send: `<upstream node title> → <TYPE>` when
  connected (e.g. "Load Checkpoint → CLIP"), falling back to `#<id>` when not. Receive
  mirrors whatever name its paired Send currently shows (custom or auto) — same
  recursive "Receive mirrors Send" rule as Task 2/3.
- **Title always prefixed with its kind** — "Send · <name>" / "Receive · <name>" —
  so which is which stays legible even once both share the same type color (see
  next point). Applies everywhere a name is shown: node title, and both dropdowns
  (Send's "Jump to Receive", Receive's "Connect to Send") now reuse the same full
  title text, so entries show upstream+type context directly, not just a bare name.
- **Node color becomes type-driven for both Send and Receive**: header/body shift to
  the connected pipe's color (mirrored on Receive), reverting to the original
  orange/blue defaults when disconnected. Distinguishing Send from Receive when both
  share a color: kind-prefixed title (above) plus a distinct LiteGraph node shape per
  role (Send stays box-shaped, Receive becomes round-shaped) — a marker that doesn't
  depend on color at all.

### Task 6 — Multi-slot Send/Receive node pair (HL-MultiSend / HL-MultiReceive)
Resolved via AskUserQuestion 2026-09-15. New node types, separate from the existing
HL-Send/HL-Receive pair (Tasks 1–5) — those are NOT modified by this task except for
one copy described below. Covers:
- **`HiddenLinkMultiSend`** ("HL-MultiSend"): one node, multiple DISTINCT value slots
  (not fan-out of one value — each slot is its own independent input, own type, own
  hidden link), e.g. `value_1`, `value_2`, `value_3`... Slots auto-expand like
  ComfyUI's native Reroute/expandable-input pattern: node starts with one empty
  input slot; connecting it reveals another empty slot below; disconnecting the
  last one removes the trailing empty slot. Backend cap: 20 slots max (Python
  `RETURN_TYPES`/`INPUT_TYPES` can't grow per-instance, so `HiddenLinkMultiSend`
  declares up to `value_1..value_20` as optional inputs/outputs; only connected
  ones are wired/shown on the frontend — same passthrough pattern as existing nodes).
  Each connected slot recolors/labels to its own type (Task 2 behavior, per-slot).
- **`HiddenLinkMultiReceive`** ("HL-MultiReceive"): full mirror of whichever
  MultiSend it's paired to — one output per currently-connected MultiSend slot,
  always ALL of them, no picking. Same "Connect to Send" dropdown pattern as the
  existing Receive (Task 3) but listing MultiSend nodes; picking one wires every
  currently-connected slot through. Mirrors slot count/types live as the paired
  MultiSend's slots change.
- **Single-slot picker — build as a COPY of the existing `HiddenLinkReceive`, not an
  edit to it.** New class (e.g. `HiddenLinkReceiveV2`, working title, not yet
  registered as a separate permanent node — see close-out note below), same file
  or new file, existing `HiddenLinkReceive`/`web/hidden_link.js` logic for the
  original untouched. The copy's "Connect to Send" dropdown lists both: existing
  single-value HL-Send nodes (unchanged behavior) AND MultiSend nodes broken out
  per-slot (entry per connected slot, e.g. `"HL-MultiSend #12 · value_2 (CLIP)"`).
  Picking a MultiSend-slot entry wires this Receive's single output to just that
  one slot's value — the "pick a particular connection out of the multi-connection"
  requirement.
- **Close-out condition (non-standard for this task):** once the copy is verified
  working by Sid, merge the new single-slot-picker logic back into the original
  `HiddenLinkReceive` (retiring the copy) as a follow-up sub-task before Task 6 is
  marked fully done — do not leave two parallel Receive node types live in the
  registered node list long-term.
- Fan-out (Task 4, one Send → many Receives) and paste-memory/naming/color (Tasks
  2/3/5) behaviors apply to MultiSend/MultiReceive/the copy wherever analogous
  (each slot is its own Send-like link for coloring/naming purposes).

### Task 7 — Mix-and-match receiver (HiddenLinkMixReceive)
Resolved via AskUserQuestion 2026-09-15, arising from Task 6 close-out testing.
MultiSend/MultiReceive (Task 6) stay exactly as speced — this is a new, separate
node, not a change to that pair. Covers:
- **`HiddenLinkMixReceive`** ("HL-MixReceive"): auto-expanding value slots,
  Reroute-style, exactly like `HiddenLinkMultiSend`'s own self-expand behavior
  (grows a new trailing empty slot as the last one gets connected, backend-capped
  at 20 like the rest of the multi-slot family) — but each slot is independently
  wired, potentially to a DIFFERENT source each (a plain HL-Send, or one specific
  slot of any HL-MultiSend), rather than mirroring one single MultiSend like
  MultiReceive does. No pairing concept — always added standalone, no auto-spawn.
- One "Connect to Send" combo (same option format as the merged `HiddenLinkReceive`
  combo — lists every plain Send and every connected MultiSend slot individually):
  picking an entry wires it into the node's current trailing empty slot, which
  then auto-expands a new one, so repeated picks progressively fill up slots one
  at a time — the "mix and match" behavior.
- Jump display: one button per unique connected origin (deduplicated — multiple
  slots from the same node collapse to one row), each independently clickable.
  Label is plain "→ <origin title>" normally; only prefixed with the slot name(s)
  ("value_2,3 → <origin title>") when needed to disambiguate a dedup'd multi-slot
  row — no prefix clutter for the common single-slot case.
- Type/color/label per slot resolved the same way already built for Task 6's
  standalone-MultiReceive fix (recurses through any chain of our own
  wildcard-socketed nodes to find the real type).

### Task 8 — Hide direct (non-proxy-routed) links into MixReceive
Raised by Sid 2026-09-16, resolved via AskUserQuestion 2026-09-16. A link wired
straight from an ordinary node's output into a `HiddenLinkMixReceive` slot
(bypassing `HiddenLinkSend`/`HiddenLinkMultiSend` entirely) currently stays visible
at all times, unlike proxy-pair links which hide by default and reveal on hover.
Covers:
- Any link landing directly on a `HiddenLinkMixReceive` input slot (source is NOT a
  `HiddenLinkSend`/`HiddenLinkMultiSend`) is hidden by default, drawn dashed on
  hover — same treatment as existing proxy-pair links.
- Reveal triggers on hovering **either endpoint**: the plain source node OR the
  MixReceive node, matching existing pair behavior.
- MixReceive's dedup'd jump-button list (Task 7) now also includes direct sources —
  a plain node feeding a slot directly gets its own clickable jump row alongside
  Send/MultiSend-origin rows, same dedup-by-origin and slot-prefix-only-when-needed
  rules.
- Only affects `HiddenLinkMixReceive`'s own input side. Does not touch
  MultiSend/MultiReceive/Send/Receive (they already only ever connect through the
  hidden-link proxy pattern by construction) or MixReceive's own output side.

### Task 9 — Output socket label mirrors downstream consumer's slot name
Raised by Sid 2026-09-16, resolved via AskUserQuestion 2026-09-16. Output side
mirror of BF-19 (which named input sockets after the origin's output-slot name);
this task does the same for the output side.
- Any hidden-link output socket (Send, MultiSend, MultiReceive per-slot, MixReceive
  per-slot) that has a downstream link shows the **downstream node's input-slot
  name** as its label (e.g. "positive"/"negative" when feeding Apply ControlNet),
  instead of the resolved type name.
- **Fan-out rule:** if the output feeds more than one downstream link, label uses
  the **first-connected link's** slot name only — no joining/listing multiple names,
  no reverting to type.
- Falls back to the resolved type name (existing behavior) when: no downstream
  link connected, or the downstream slot has no name of its own.
- Does not touch input-side labeling (BF-19, unchanged).

### Task 10 — Manual receive-recovery button + dark-red "not connected" styling
Raised by Sid 2026-09-16, resolved via AskUserQuestion 2026-09-16. Two independent
pieces:
- **Recovery button:** `HiddenLinkSend` gets a button that spawns a fresh, connected
  `HiddenLinkReceive` (same mechanism as the existing auto-pair-on-add, reusable for
  manual recovery if the paired Receive was deleted). `HiddenLinkMultiSend` gets the
  equivalent button spawning a fresh `HiddenLinkMultiReceive`, paired via
  `pairedMultiSendId` same as its own auto-spawn. Each Send-type spawns its own kind
  — not cross-wired. Available at all times (not conditional on "no receive
  currently connected"), so it also works as a way to add an *additional* Receive
  to a Send that already has one or more (Send fans out, Task 4) without dragging.
- **Dark-red "not connected" styling:** applies to the whole family — HL-Send,
  HL-Receive, HL-MultiSend, HL-MultiReceive, HL-MixReceive. A node counts as
  "not connected" when it has **zero live links on every socket it has** (for
  multi-slot nodes: all slots empty, not just the trailing auto-expand one).  When
  in that state: node color/bgcolor forced to a dark red (distinct from the
  existing type-driven/default orange-blue colors), and title (or an
  always-visible label) reads "not connected" — reuses/extends the same visual
  slot the existing per-node "(not connected)" widget text already uses for
  consistency, adjusted so it fires on true zero-connection state.
  MultiSend/MixReceive's normal "one always-trailing empty slot" is not itself
  "not connected" as long as at least one OTHER slot has a live link.
- **Follow-up (Sid, 2026-09-16, resolved via AskUserQuestion): partial-disconnect
  marker.** Applies to the whole family (extended from plain Send/Receive to
  Multi/Mix too). A node with exactly ONE side empty (any input link present but
  zero output links, or vice versa — "side" = input side vs output side, summed
  across all slots for multi-slot nodes) gets a distinct muted-amber color
  (separate from both the normal default/type color AND the full dark-red "not
  connected"), plus a title suffix: Send-like nodes (`HiddenLinkSend`,
  `HiddenLinkMultiSend`) show "(no input)" when missing upstream or "(no
  receiver)" when missing every downstream link; Receive-like nodes
  (`HiddenLinkReceive`, `HiddenLinkMultiReceive`, `HiddenLinkMixReceive`) show
  "(no input)" when missing their origin or "(no output)" when missing every
  downstream consumer. Full both-sides-empty state is unchanged (dark red,
  title "not connected", no suffix).
- **Follow-up 2 (Sid, 2026-09-16, resolved via AskUserQuestion):** three more fixes
  from live testing of the above:
  1. **MultiSend/MultiReceive connectivity bug:** a freshly auto-paired MultiSend
     showed full dark-red "not connected" even though its jump combo already listed
     "1 connected" — because the real graph link between MultiSend and MultiReceive
     doesn't exist until the MultiSend's own upstream slot has data (see
     `syncMultiReceiveSlots`'s paired branch), so a raw-socket connectivity check
     read "none" while the pairing (`pairedMultiSendId`) was genuine. Fixed:
     MultiSend/MultiReceive's connectivity state is now read the same
     pairing-aware way their own jump/connect widgets already do (
     `getMultiSendDownstream` / `pairedMultiSendId`), not raw output/input link
     arrays — matches the plain pair's "(no input)"/"(no receiver)" behavior.
  2. **Title format:** the not-connected/partial marker moves from a trailing
     suffix to a **prefix at the start of the title** — "Not Connected · Kind ·
     name" / "Input Not Connected · Kind · name" / "Output Not Connected · Kind ·
     name" — instead of "Kind · name (no input)" etc.
  3. **Stuck live-follow bug:** a freshly auto-spawned Receive/MultiReceive stayed
     glued to its Send/MultiSend's position through a deliberate manual drag,
     only releasing once a real slot connected. Root cause not fully isolated (no
     code difference found between the plain pair, which worked, and the Multi
     family, which didn't) — fixed by replacing the per-frame position-drift poll
     entirely with `LGraphCanvas.prototype.onNodeMoved` (an official callback
     fired once, right when a drag ends) to detach `_hiddenLinkFollow`
     immediately, for both node families.

- **Follow-up 3 (Sid, 2026-09-16, video evidence + resolved via AskUserQuestion):**
  two more fixes:
  1. **onNodeMoved prototype patch had zero effect** (confirmed via screen recording
     `Videos_testing/02.mp4` — the stuck node never moved at all through an entire
     drag attempt). Root cause, confirmed by reading the installed ComfyUI frontend
     bundle: this canvas class declares `onNodeMoved;` as a bare class field, which
     initializes it as an own `undefined` instance property on every canvas
     instance — that always shadows a same-named prototype property, so
     `LGraphCanvas.prototype.onNodeMoved = ...` was invisible to any real instance.
     Fixed by assigning directly to the live `app.canvas` instance instead (lazily,
     idempotent-guarded, installed from each node type's own onDrawForeground since
     app.canvas is guaranteed to exist by then).
  2. **Hover reveal missing between an unconnected MultiSend/MultiReceive pair:**
     no real LiteGraph link exists between them until a slot actually carries data
     (Task 6's intentional mirror-only-when-filled design), so there was nothing
     for the existing per-link renderLink hook to draw. Resolved via
     AskUserQuestion: draw one generic dashed line directly between the two nodes
     (canvas-level overlay hook, `installMultiPairingOverlayHook`/
     `drawMultiPairingLines`) whenever they're paired and either is hovered, only
     while no real per-slot link exists yet (avoids duplicating the existing
     per-slot dashed rendering once one connects). Does not touch the plain
     Send/Receive pair's rendering, which already works.

- **Follow-up 4 (Sid, 2026-09-16, video evidence `Videos_testing/03.mp4`):**
  onNodeMoved only fires on mouse-UP (drag end), so during the drag itself
  `_hiddenLinkFollow` was still true and the per-frame follow-sync kept snapping
  the node straight back every frame — looked completely stuck for the whole
  first drag attempt, silently detaching only the instant the mouse was
  released (so a second attempt then moved freely, matching what Sid saw). Fixed
  by also detaching on mouse-DOWN (`onMouseDown` on both the plain Receive and
  MultiReceive node types) — the snap-back now stops the moment the node is
  grabbed, not after the drag ends.

- **Follow-up 5 (Sid, 2026-09-16, video evidence `Videos_testing/04.mp4`, resolved
  via AskUserQuestion — fix every affected node uniformly):** paste/copy
  connection-memory (Task 5) was only ever built for the plain HL-Send/HL-Receive
  pair. `HiddenLinkMultiSend`'s own upstream inputs, a standalone
  `HiddenLinkMultiReceive`'s real per-slot links, and `HiddenLinkMixReceive`
  (which had no paste-memory hook at all) all lost their connections on
  copy/paste. Replaced the old single-purpose `pairedOriginId`/
  `pairedOriginSlot`/`pairedSendId` properties (which also couldn't remember a
  Receive's origin SLOT — always reconnected to slot 0 even after picking one
  specific MultiSend slot) with one generic mechanism covering every slot on
  every hidden-link node type: `properties.hiddenLinkSlotMemory`, an array of
  `{slot, originId, originSlot}` written every frame a slot has a real link
  (`rememberSlotConnections`) and replayed on add for any slot still missing one
  (`reconnectSlotsFromMemory`). The paired-via-property case (e.g. a
  MultiReceive mirroring a MultiSend) already survived independently since
  `pairedMultiSendId` is itself a persisted property re-synced every frame —
  this specifically fixes slots wired to a real, direct link.

- **Follow-up 6 (Sid, 2026-09-16, video evidence `Videos_testing/05.mp4`):** the
  Follow-up 5 fix above still lost every MixReceive slot past the first on
  paste. Root cause: `reconnectSlotsFromMemory` ran inside the same deferred
  `setTimeout(0)` as the auto-spawn check, but `growShrinkMultiSlots`' own
  every-frame auto-trim runs on the very next render — which happens before
  that timeout fires — and a freshly pasted multi-slot node's slots all look
  temporarily empty (their real links haven't been restored yet), so the trim
  deleted every trailing slot down to just one before the deferred reconnect
  ever got a chance to run. Fixed by calling `reconnectSlotsFromMemory`
  synchronously inside `onAdded` instead (for all of Send/Receive, MultiSend/
  MultiReceive, and MixReceive) — unlike the auto-spawn check, it doesn't need
  to wait for LiteGraph's own link-restore pass, since the origin node it
  reconnects to is never part of the copied selection in the first place (that
  is exactly why it's needed) and already exists in the graph.

- **Follow-up 7 (Sid, 2026-09-16, video evidence `Videos_testing/06.mp4`):** the
  synchronous fix above broke completely (reconnected NOTHING). Root cause,
  confirmed by reading ComfyUI's paste implementation (`_deserializeItems` in
  the installed frontend bundle): `graph.add(node)` — which fires our `onAdded`
  — runs BEFORE `node.configure(data)`, the call that actually restores
  `properties` (including `hiddenLinkSlotMemory`) from the clipboard payload.
  Reading it synchronously in `onAdded` always saw it still empty. Fixed with a
  microtask (`Promise.resolve().then()`) instead of either extreme: it runs
  after the whole paste operation's synchronous script finishes (by which
  point every pasted node has been added AND configured, since those happen
  synchronously in the same loop), but strictly before the browser's next
  render/animation frame — which is when `growShrinkMultiSlots`' auto-trim
  actually runs. A `setTimeout(0)` macrotask does not have that same
  "before next frame" guarantee, which is exactly what caused Follow-up 6's
  bug in the first place.

- **Follow-up 8 (Sid, 2026-09-16, video evidence `Videos_testing/06.mp4`):**
  MultiReceive/MixReceive/Send/MultiSend all confirmed fixed; a plain
  `HiddenLinkReceive` still lost its connection on copy/paste — but only while
  collapsed (uncollapsing first, then copying, worked fine even if re-collapsed
  after). Root cause: only the plain Send/Receive block called
  `rememberSlotConnections(this)` AFTER the `if (this.flags?.collapsed)
  return;` early-exit, so a collapsed node's `hiddenLinkSlotMemory` went stale
  the instant it collapsed (last written the frame before) — the other two
  node-type blocks already had this the right way round (matching the
  existing hover-flag pattern, which has the same "must run before the
  collapsed return" requirement and was already correct). Fixed by moving the
  call above the collapsed check, same order as everywhere else.
