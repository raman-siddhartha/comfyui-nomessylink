# SESSION_MEMORY.md — ComfyUI Hidden-Link Node

- Origin: Sid sketched a node design where a connection between two nodes is hidden
  by default and only shown (dashed line) on hover, to declutter noodle-heavy
  ComfyUI graphs.
- Researched existing options first: ComfyUI's native "Hidden" Link Render Mode
  (global, always-hidden, not per-link/hover), kijai's Set/Get nodes from
  ComfyUI-KJNodes (closest visual match — no wire drawn — but no way to tell which
  node a pair connects to without guessing by name), and LinkSpotlight (does the
  opposite: dims unrelated links on selection, doesn't hide by default). Two open
  GitHub feature requests (Comfy-Org/ComfyUI #101, #3089) ask for similar hide/show
  behavior and remain unimplemented — confirms nothing off-the-shelf matches this
  spec.
- Decision: build it as a custom extension rather than adopt an existing one.
- Explicit requirement from Sid (2026-09-15): must not have kijai's weakness — the
  user should never have to guess which node a connector is paired with. The
  connector must show its connected node and include a button to jump to it.
- Project docs set up 2026-09-15 in `F:\Comfy\Vibe_ Coding\comfyui-hidden-links`,
  following the workflow structure Sid uses on his other projects (strict
  approve-per-task loop, mandatory quality check, error-handling protocol, bug fix
  log, session memory). Split across CLAUDE.md + CLAUDE-WORKFLOW.md to respect the
  200-line-per-file cap Sid asked for.
- 2026-09-16: All five spec questions resolved with Sid — always a proxy node pair
  (never direct link hiding), persistent always-visible label of the paired node,
  MVP is one-to-one only (Sid explicitly wants the same concept later grown into
  multi-connection lists on one connector — keep that in mind as the natural next
  task, don't build it yet), jump button pans only, no zoom change.
- Task 1 built and approved (wildcard `*` typing confirmed). Jump button had a
  bug (BF-01/BF-02): first fix (DPI/clientWidth) was wrong and had zero effect.
  Debugged for real by using the built-in browser to drive Sid's actual running
  ComfyUI Desktop instance directly (http://127.0.0.1:8000) — found that
  manually setting `canvas.ds.offset` gets silently overridden by this build's
  pan/zoom pipeline, and that this ComfyUI version exposes a built-in
  `canvas.centerOnNode(node)` method that does it correctly. Verified live
  (exact pixel match on screen center, zoom unchanged) before handing back.
- Live-browser access works for this project: built-in browser reaches
  Sid's ComfyUI Desktop at 127.0.0.1:8000 (site access granted). Useful for
  future debugging — don't re-ask for the URL, it's saved here.
- 2026-09-14: Task 1 fully closed out. Quality check found one CRITICAL gap (BF-03):
  Send-side output wasn't limited to one link (LiteGraph outputs fan out by default;
  Receive side was already safe since ComfyUI inputs are single-link natively). Fixed
  via `onConnectionsChange` on the Send node, dropping extra links immediately. Git
  repo initialized this session (was still missing), first commit made, tagged
  `task-01-completed`.
- Task 2+ not yet specified — needs breakdown + approval with Sid before any code.
  Known future direction (not started): multi-connection fan-out per connector,
  visual distinguishing between multiple hidden pairs, ComfyUI-Manager packaging.
- 2026-09-14 (BF-04, post-close-out): Sid corrected the design — adding a Send node
  must auto-create+connect a paired Receive node (220px offset, placed relative to
  wherever the Send lands, not a fixed spot). Resolved via AskUserQuestion:
  Send-only auto-spawn (bare Receive stays unconnected), offset placement relative
  to the Send, manual drag-reconnect still allowed on top.
  Took 3 attempts to get right — logged in full in TASK_PROGRESS.md's Bug Fix Log
  (BF-04). Key lesson: this session had no live browser/devtools access to Sid's
  running ComfyUI (unlike an earlier session that apparently did — don't assume
  that capability is available without checking first). Ground truth came from two
  things instead: (1) Sid running a diagnostic snippet in his own browser devtools
  (ComfyUI Desktop hides devtools by default — open the same localhost URL in a
  normal browser tab to get devtools), and (2) a screen recording Sid provided
  (read via ffmpeg frame extraction, since Read can't open video files directly).
  Root cause was that node placement isn't instant for every add-node flow —
  pressing Enter in the node-search panel drops the node in a "drag to place"
  mode that can sit still for a few frames before the user starts moving it, which
  broke a position-stability-polling approach. Fix: don't try to detect "placement
  done" at all — spawn the Receive immediately and have it live-follow the Send
  node's position every frame until Send's position actually settles.
- If asked to inspect a local ComfyUI/LiteGraph source to verify frontend internals
  before proposing a fix, check the filesystem first rather than reasoning from
  memory of LiteGraph's typical behavior — got two fix attempts wrong this session
  guessing at ComfyUI frontend timing internals instead of verifying.
- 2026-09-14: Found where to actually read ComfyUI frontend internals from on this
  machine when a fix needs verifying against real behavior (not memory): Sid's pip
  install's bundled frontend at
  `C:\Users\raman\Documents\ComfyUI\.venv\Lib\site-packages\comfyui_frontend_package\static\assets\`
  — the minified `settingStore-*.js` chunk there has held everything needed so far
  (slot color lookup, combo widget filter behavior, paste's `_deserializeItems`,
  `LGraph.prototype.configure`, `app.configuringGraph`). Search it with a short
  Python one-liner (`grep`/Read choke on long minified lines) rather than guessing.
  This confirmed real APIs multiple times this session where my first instinct was
  wrong (e.g. `graph.configuring` doesn't exist in this build at all — a check
  BF-04 relied on had been a silent no-op since it was written).
- 2026-09-14: Tasks 2 through 5 built this session (type-color, naming/dropdowns,
  fan-out, paste-memory) — see TASK_PROGRESS.md for specifics and the full BF-05
  through BF-08 bug log. Recurring pattern worth remembering: several of Sid's bug
  reports this session ("dropdown does nothing," "stray Receives," "fan-out breaks
  on reload") all traced back to the same family of issue — code assuming a node's
  links/state are already restored at the moment a hook fires, when ComfyUI/
  LiteGraph's own load and paste code paths add nodes and restore their links in
  two separate passes. Any new hook touching `onAdded`/connection state on these
  nodes should be checked against that pattern first.
- 2026-09-14: Open/deferred items for next session — (1) Send/Receive "Name" widget
  displays literal "null" text instead of empty (Post-Launch Fix List, Sid said
  leave it for now); (2) Sid asked about a collapsed-with-icon compact node style;
  recommended trying LiteGraph's native collapse (already free) before building
  anything custom — not started, open thread if raised again; (3) Task 6+ not yet
  specified.
- 2026-09-16: Task 6 (MultiSend/MultiReceive pair + Receive slot-picker) and Task 7
  (MixReceive) built, iterated, and confirmed working by Sid. Full bug list is
  BF-09..BF-18 in TASK_PROGRESS.md — worth remembering the two recurring root-cause
  families: (a) "wildcard chain" bugs — anything reading a link's raw `.type` on one
  of our own nodes gets `*` if the upstream is itself another Send/MultiSend; must
  recurse through `resolveRealType` instead. (b) "bulk graph-op guard" bugs —
  `onAdded`'s auto-spawn guard only checked `app.configuringGraph`, which covers
  load/undo/redo/convertToSubgraph but NOT `unpackSubgraph` (per-node `configure()`,
  no flag set) — needed a second manual flag (`insideHiddenLinkUnpack`). Any future
  bulk graph operation added by ComfyUI should be suspected of the same gap before
  assuming the existing guard covers it.
- 2026-09-16: Sid's copy-then-merge instruction pattern ("don't touch the original
  node, copy it, edit the copy, merge back once verified") worked well for Task 6 —
  worth defaulting to this approach again for any future edit to an already-shipped,
  working node type, rather than editing it in place and risking a regression Sid
  has to catch live.
- 2026-09-16: Confirmed (again) no live browser/devtools access this session —
  every bug this session was diagnosed via Sid's screenshots/console output plus
  temporary `console.log("[HiddenLink debug] ...")` statements, removed once root
  cause was confirmed. Don't assume browser access is available without checking —
  it varies by session (see BF-04 note above, which found the same thing).
- 2026-09-16: New request from Sid (not yet specced) — links feeding a
  `HiddenLinkMixReceive` slot directly (i.e. not routed through a `HiddenLinkSend`/
  `HiddenLinkMultiSend`, e.g. wiring a normal node's output straight into a
  MixReceive slot) currently stay fully visible at all times; Sid wants those hidden
  by default too, revealed on hover, same as proxy-pair links. Needs a spec/approval
  pass before building — see TASKS.md Task 8.
- 2026-09-16: Task 8 built — direct (non-proxy) links into `HiddenLinkReceive`,
  `HiddenLinkMultiReceive`, and `HiddenLinkMixReceive` now hide by default and
  reveal dashed on hovering either endpoint (`LGraphCanvas.prototype.renderLink`,
  using `canvas.node_over` directly since an arbitrary source node never gets the
  cached `_hiddenLinkHover` flag our own node types set). Follow-up fix same
  session: multi-slot socket labels (MultiSend/MultiReceive/MixReceive) were
  showing only the resolved type (e.g. "CONDITIONING"), then briefly "origin title
  (type)" — Sid's actual ask was simpler: show the ORIGIN's own output-slot name
  (e.g. "positive"/"negative"), nothing else. Landed as `slotSocketLabel`/
  `resolveRealOrigin` in `web/hidden_link.js`, falling back to resolved type only
  when the origin slot has no name.
- 2026-09-16 (design discussion, not yet acted on): Sid asked whether `HiddenLinkSend`
  is still needed now that Receive/MultiReceive/MixReceive hide direct links too
  (Task 8) — the original reason Send existed (only Send-routed links could hide)
  no longer holds. Assessment given: Send is no longer required for hiding, but
  still earns its keep as the *source-side* UI — a plain node has no jump-to-
  receiver list or persistent marker, so Send remains worth keeping specifically
  for one-source-feeding-many-receivers fan-out cases (reverse lookup from the
  source), while a source feeding 1-2 receivers can just wire directly and rely on
  the receive-side jump button alone. No decision to remove/deprecate Send was
  made — flagged for Sid's future explanation-script write-up on why both node
  families exist side by side.
- 2026-09-16: Task 9 built and confirmed — output sockets (Send/MultiSend/
  MultiReceive/MixReceive) show the downstream consumer's input-slot name (e.g.
  "positive" on Apply ControlNet) when connected, first-link-wins on fan-out.
  `downstreamSlotLabel()` in `web/hidden_link.js`.
- 2026-09-16: Task 10 built and confirmed working after a long live-testing
  iteration loop (6 videos in `Videos_testing/`, BF-20 through BF-24 in
  TASK_PROGRESS.md). Recovery buttons + not-connected/partial styling landed
  cleanly; the real difficulty was the paste-connection-memory generalization
  and the live-follow drag-detach, both of which took multiple wrong attempts
  before landing. Key lessons for any future timing-sensitive hook on these
  node types:
  - **A canvas-level callback can be a bare class field, not a prototype
    method** — this ComfyUI build declares `onNodeMoved` (and likely other
    `LGraphCanvas` callbacks) as `onNodeMoved;` in the class body, which
    becomes an own `undefined` instance property at construction, silently
    shadowing any `LGraphCanvas.prototype.X = ...` patch. Always assign
    directly to the live `app.canvas`/`app.graph` instance for canvas-level
    hooks, never the prototype — confirmed by reading the installed frontend
    bundle, not assumed. (Node-level callbacks like `onDrawForeground`/
    `onAdded`/`onMouseDown` on OUR OWN registered node types are fine as
    prototype patches — proven working throughout this whole project — this
    class-field gotcha is specific to ComfyUI/LiteGraph's own built-in canvas
    class.)
  - **Paste ordering: `graph.add(node)` (fires `onAdded`) runs BEFORE
    `node.configure(data)`** (confirmed via the same frontend bundle read),
    so anything reading `node.properties` synchronously inside `onAdded`
    during a paste will always see pre-restore (empty/default) values. A
    microtask (`Promise.resolve().then()`) is the fix — it runs after the
    whole paste operation's synchronous script finishes (configure() has run
    for every node by then) but strictly before the next render frame. A
    `setTimeout(0)` macrotask does NOT reliably win that race against the
    next render frame's own side effects (e.g. this project's own
    `growShrinkMultiSlots` auto-trim), which was the root cause of one full
    wrong-fix cycle here.
  - Any new per-frame "auto-trim empty slots" logic (growShrinkMultiSlots
    pattern) must be assumed to race ahead of ANY deferred reconnect
    mechanism, since it runs on the very next render frame — plan the timing
    (microtask before first render) up front rather than discovering the race
    via a bug report.
  - The `if (this.flags?.collapsed) return;` early-exit in each node type's
    `onDrawForeground` must come AFTER any per-frame state-recording line
    (hover flag, slot-connection memory, etc.) that needs to stay live while
    collapsed — this bit twice now (BF-11 for hover, BF-24 for paste-memory),
    both times because one of the three near-identical registerExtension
    blocks had the two lines in the wrong order relative to the other two.
    Worth a deliberate check any time a new "record state every frame" line
    is added to only one of these blocks.
  - No live browser/devtools access this session either — every bug (BF-20
    through BF-24) was diagnosed from screen recordings Sid provided in
    `F:\Comfy\Vibe_ Coding\Videos_testing\` (extracted to frames via ffmpeg,
    same technique as BF-04) plus reading the installed ComfyUI frontend
    bundle directly for ground truth on LiteGraph/canvas internals, never
    guessed from memory.
- 2026-09-16: Task 10 requested, not yet specced — (1) a manual button on Send-type
  nodes to spawn a fresh MultiReceive, for recovery if the auto-paired one gets
  deleted (unclear yet: applies to HL-Send + HL-MultiSend both, or MultiSend only;
  spawns Receive matching Send's own kind, or always MultiReceive as literally
  worded); (2) unconnected Send/Receive nodes should turn dark red + show "not
  connected" (unclear: plain pair only or whole family incl. Multi/Mix; what counts
  as "unconnected" for a multi-slot node with some but not all slots filled). Both
  need AskUserQuestion before building, per project rule.
