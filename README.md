# No Messy Link

A ComfyUI custom node pack that lets you connect nodes without drawing a
visible noodle across the graph. The link is hidden by default; hover either
end and it appears as a dashed line for as long as you're hovering. Every
connector always shows, in plain text, which node it's paired with, plus a
one-click button to jump (pan) the canvas straight to it — you never have to
guess which two nodes a hidden pair belongs to.

No GPU/model work here — this is pure graph/canvas UI. Each node is a
transparent passthrough (value in, value out, unchanged); ComfyUI's own
engine still handles execution order and workflow saving normally.

---

## Installation

1. Copy this folder into your ComfyUI `custom_nodes/` directory.
2. Restart the ComfyUI server (new node types only register at startup — a
   browser refresh alone is not enough).
3. The nodes appear under the **utils/no_messy_link** category in the node
   search, named `Sidee: No Messy Link (Send)`, `(Receive)`, `(MultiSend)`,
   `(MultiReceive)`, `(MixReceive)`.

No Python dependencies beyond ComfyUI itself.

---

## Node types

### Sidee: No Messy Link (Send) / (Receive)
One value in, one value out, one hidden link between them.

- Add a **Send** node and a paired **Receive** node is auto-created and
  auto-connected 220px to its right — no manual wiring needed for the common
  case.
- A **Send** can feed *any number* of Receive nodes (fan-out). A **Receive**
  always takes from exactly one Send.
- **Receive** has a "Connect to Send" dropdown listing every Send in the
  graph (plus individual slots of any MultiSend — see below) — pick one to
  rewire.
- **Send** has a "Jump to Receive" dropdown listing every Receive it
  currently feeds; picking one pans the canvas to it (zoom unchanged).
- Both nodes have an editable **Name** text widget. Leave it blank and the
  name auto-generates: `<upstream node title> → <TYPE>` on Send, mirrored on
  Receive. Type it in and that name is used everywhere instead.
- Node title is always prefixed with its kind: `Send · <name>` /
  `Receive · <name>`.
- Once a value is connected, both sockets and both node bodies recolor to
  that data type's native ComfyUI color (e.g. yellow for CLIP, purple for
  MODEL). A small accent square (orange on Send, blue on Receive) stays
  constant regardless of type color, so you can always tell which is which.
- Send also has a **"+ New Receive"** button — spawns and connects a fresh
  Receive at any time (e.g. to recover one you deleted, or add another for
  fan-out), independent of the auto-spawn-on-add behavior.

### Sidee: No Messy Link (MultiSend) / (MultiReceive)
Like Send/Receive, but one node carries **several independent value slots**
(`value_1`, `value_2`, …), each its own hidden link with its own type — not
one value fanned out. Slots auto-expand: connect the last empty slot and a
new empty one appears below it; disconnect it and the trailing empty slot is
removed. Capped at 20 slots.

- Adding a MultiSend auto-spawns a paired MultiReceive, same as the plain
  pair.
- **MultiReceive** always mirrors *every* currently-connected slot of its
  paired MultiSend — no picking, it's an all-or-nothing mirror. Use the
  regular **Receive** node (above) if you only want one specific slot.
- MultiSend has a **"+ New MultiReceive"** recovery button, same purpose as
  Send's.

### Sidee: No Messy Link (MixReceive)
An auto-expanding multi-slot receiver like MultiReceive, but each slot is
wired **independently** — potentially to a different source each (a plain
Send, or one specific slot of any MultiSend). No pairing, no auto-spawn:
always added standalone.

- One "Connect to Send" dropdown fills whichever slot is currently the
  trailing empty one; picking an entry repeatedly fills slots one at a time.
- Jump buttons are deduplicated by origin node — one button per unique
  source feeding this node, labeled with the slot name(s) only when needed
  to tell apart multiple slots from the same origin.

---

## Hidden-link behavior (all node types)

- A link is invisible by default. Hover **either** endpoint (the node on
  either side of the connection) and it draws as a dashed line for as long
  as the hover lasts.
- This also applies to a link wired **directly** into a Receive /
  MultiReceive / MixReceive slot from an ordinary node, bypassing Send
  entirely — it hides and reveals the same way.
- Every socket's label mirrors the name of whatever it's actually connected
  to on the other end (e.g. "positive"/"negative" when feeding an Apply
  ControlNet node) instead of showing a generic type name, so you can read
  intent at a glance without revealing the link.

## Connection-status styling

- **Fully disconnected** (no links on any socket): node turns dark red,
  title prefixed `Not Connected ·`.
- **Partially connected** (one side has a link, the other doesn't): node
  turns muted amber, title prefixed `Input Not Connected ·` or
  `Output Not Connected ·` depending on which side is missing.
- Fully connected: normal type-driven coloring as described above.

## Copy/paste and saved workflows

- Cutting/copying and pasting a Send, Receive, MultiSend, MultiReceive, or
  MixReceive re-establishes its original connections automatically — you
  don't need to rewire after a paste.
- Saved workflow JSON round-trips normally: reload a workflow and every
  hidden link, name, and slot is restored exactly as saved.
- Works inside "Convert to Subgraph" / "Unpack Subgraph" without breaking a
  pairing that spans the subgraph boundary.

---

## Known limitation

The "+ New Receive" / "+ New MultiReceive" buttons and the plain jump
buttons (Receive/MultiReceive/MixReceive) only work when clicked **on the
canvas**. ComfyUI's properties side panel does not wire click events for
this widget type at all — this is a panel-level limitation, not specific to
this extension. Dropdown/text widgets work fine from the panel.

---

## Developer notes

For anyone maintaining or extending this pack.

**Architecture.** Everything happens in one frontend extension file,
`web/no_messy_link.js`, registered via `app.registerExtension` against each
node type's `beforeRegisterNodeDef`/prototype. The Python side
(`nodes.py`) is deliberately inert: every node is a pure passthrough using a
wildcard `AnyType` (`"*"` that compares equal to any type string), so it
accepts/emits any ComfyUI data type without per-type Python logic. All
hide/reveal, coloring, naming, and pairing logic lives in JS, hooking
LiteGraph's documented extension points only — no core ComfyUI files are
patched. Two exceptions patch **live instances**, not prototypes/core files:
`app.canvas.onNodeMoved` (drag-end detection) and a canvas-level overlay
hook for drawing the dashed pairing line between an unconnected-but-paired
Multi pair — both are instance-level because this ComfyUI build declares
those canvas callback slots as class fields, which shadow prototype patches.

**Multi-slot self-expand.** MultiSend/MultiReceive/MixReceive all share the
same grow/shrink logic (`growShrinkMultiSlots`): always exactly one trailing
empty slot, added/removed every frame based on live link state. Backend cap
is 20 slots (`MULTI_MAX_SLOTS` in `nodes.py`) since `RETURN_TYPES` can't grow
per-instance in Python — only however many slots are actually in use get
wired/shown on the frontend.

**Type/origin resolution.** Because our own nodes are wildcard-typed, a
naive read of a link's `.type` returns `"*"` whenever the upstream is itself
one of our nodes. `resolveRealType`/`resolveRealOrigin` recurse through any
chain of Send/MultiSend nodes to find the true type/origin — used for
coloring, labeling, and the "Connect to Send" dropdown contents.

**Connection memory (paste survival).** Every node writes its live
slot-to-origin mapping into `properties.hiddenLinkSlotMemory` every frame it
has a real link (before any `collapsed` early-return, so it stays fresh even
collapsed). On `onAdded`, if a slot has no real link yet, it's reconnected
from that memory. This must run in a microtask (`Promise.resolve().then()`),
not synchronously and not via `setTimeout(0)`: ComfyUI's paste path calls
`graph.add(node)` (which fires `onAdded`) *before* `node.configure(data)`
restores `properties`, and the per-frame auto-trim of empty slots
(`growShrinkMultiSlots`) runs on the very next render frame — a microtask is
the only timing that reliably lands after both.

**Bulk graph-operation guards.** Auto-spawn-on-add (for Send/MultiSend) must
not fire during a workflow load, undo/redo, or subgraph unpack — those
already restore links correctly on their own. Checked via
`app.configuringGraph` (covers load/undo/redo) plus a manual
`insideHiddenLinkUnpack` flag (covers `unpackSubgraph`, which restores nodes
via per-node `configure()` and never sets `configuringGraph`). Any new bulk
graph operation ComfyUI adds in the future should be checked against this
same gap before assuming the existing guard covers it.

**Live-follow-then-detach.** A freshly auto-spawned Receive/MultiReceive
tracks its Send's position every frame until the user grabs it — detachment
is triggered on `onMouseDown` (the moment it's grabbed) rather than waiting
for drag-end, and confirmed via an instance-level `onNodeMoved` patch on
`app.canvas` once the drag finishes.

No automated test suite — this is graph/canvas UI verified by manual testing
in a running ComfyUI instance (see the project's `TASK_PROGRESS.md` for the
full history if you have access to it).
