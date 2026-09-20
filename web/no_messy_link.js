// No Messy Link extension — hides the link(s) between a NoMessyLinkSend and its
// paired NoMessyLinkReceive node(s) by default, draws each as a dashed line
// only while one of its two endpoints is hovered, names each node after
// whatever it's actually connected to (upstream node + pipe type, or a
// custom name), colors both ends to match that pipe type, and lets each
// pan the canvas to a pair (a dropdown on Send, since one Send may fan out
// to many Receives — Task 4).
//
// Hooks ComfyUI's app.registerExtension for node behavior (the documented
// extension point). LGraphCanvas.prototype.renderLink is wrapped at
// runtime to suppress/re-style one specific link — the standard technique
// used by other ComfyUI link-rendering extensions — never core ComfyUI
// files on disk.

import { app } from "../../scripts/app.js";

const SEND_TYPE = "sidee_no_messy_link_send";
const RECEIVE_TYPE = "sidee_no_messy_link_receive";
const NODE_TYPES = [SEND_TYPE, RECEIVE_TYPE];

// Task 6 — multi-slot pair, registered separately from the pair above.
// MultiSend carries several independent value slots (own type each);
// MultiReceive mirrors all of them. NoMessyLinkReceive (above) can also pick
// one specific MultiSend slot instead of a plain Send — that ability was
// prototyped as a separate copy, NoMessyLinkReceiveV2, then merged into
// NoMessyLinkReceive once verified and retired (see TASKS.md Task 6).
const MULTI_SEND_TYPE = "sidee_no_messy_link_multi_send";
const MULTI_RECEIVE_TYPE = "sidee_no_messy_link_multi_receive";
const MULTI_MAX_SLOTS = 20;

// Task 7 — mix-and-match receiver: auto-expanding slots like MultiSend, but
// each slot picks its own independent source (plain Send or one MultiSend
// slot) instead of mirroring a single MultiSend. Always standalone.
const MIX_RECEIVE_TYPE = "sidee_no_messy_link_mix_receive";

function multiSlotName(i) {
    return `value_${i}`;
}

const SEND_DEFAULT_COLOR = "#804a20";
const SEND_DEFAULT_BGCOLOR = "#cc7a29";
const RECEIVE_DEFAULT_COLOR = "#204060";
const RECEIVE_DEFAULT_BGCOLOR = "#2966a3";

// Task 10: dark-red styling for a node with zero live links on every socket
// it has (single-slot: its one input and one output both empty; multi-slot:
// every slot empty, including the always-trailing auto-expand one — a node
// with one OTHER filled slot still counts as connected).
const NOT_CONNECTED_COLOR = "#4d1010";
const NOT_CONNECTED_BGCOLOR = "#7a1f1f";

// Task 10 follow-up (Sid, 2026-09-16): a node missing just ONE side (e.g. a
// Send with no upstream input but still feeding receivers, or a Receive
// with no downstream consumer) gets its own muted-amber marker, distinct
// from full dark-red "not connected" (both sides empty).
const PARTIAL_COLOR = "#4d3a10";
const PARTIAL_BGCOLOR = "#7a5c1a";

function hasAnyInputLink(node) {
    return (node.inputs || []).some((inp) => inp.link != null);
}

function hasAnyOutputLink(node) {
    return (node.outputs || []).some((out) => out.links && out.links.length > 0);
}

// "full" (both sides have at least one live link), "none" (every socket
// empty), "no-input" (only the output/downstream side is connected),
// "no-output" (only the input/upstream side is connected).
//
// MultiSend/MultiReceive are special-cased (bug reported 2026-09-16): a
// freshly auto-paired MultiSend<->MultiReceive has NO real graph link yet
// between them — syncMultiReceiveSlots only calls node.connect() once the
// MultiSend's own upstream slot actually has data (see its paired branch) —
// so checking raw output/input sockets falsely read "none" even though the
// two are genuinely paired (same info the jumpCombo/connectCombo widgets
// already show as "1 connected"/a picked name). For these two, "connected"
// on the paired side is read the same way those widgets do: MultiSend's
// downstream via getMultiSendDownstream (property-paired MultiReceives
// count even with zero real links yet), MultiReceive's upstream via its own
// pairedMultiSendId property.
function connectivityState(node) {
    if (node.type === MULTI_SEND_TYPE) {
        const hasIn = hasAnyInputLink(node);
        const hasOut = getMultiSendDownstream(node).length > 0;
        if (!hasIn && !hasOut) return "none";
        if (!hasIn) return "no-input";
        if (!hasOut) return "no-output";
        return "full";
    }
    if (node.type === MULTI_RECEIVE_TYPE) {
        const rawPaired = findNodeByIdLoose(node.graph, node.properties?.pairedMultiSendId);
        const hasIn = rawPaired?.type === MULTI_SEND_TYPE || hasAnyInputLink(node);
        const hasOut = hasAnyOutputLink(node);
        if (!hasIn && !hasOut) return "none";
        if (!hasIn) return "no-input";
        if (!hasOut) return "no-output";
        return "full";
    }
    const hasIn = hasAnyInputLink(node);
    const hasOut = hasAnyOutputLink(node);
    if (!hasIn && !hasOut) return "none";
    if (!hasIn) return "no-input";
    if (!hasOut) return "no-output";
    return "full";
}

// Connectivity state as a title PREFIX (Sid, 2026-09-16: moved from a
// trailing "(no input)" suffix to the start of the name so it's the first
// thing visible). Empty string for "full" — no prefix once both sides are
// connected.
function connectivityPrefix(state) {
    if (state === "none") return "Not Connected · ";
    if (state === "no-input") return "Input Not Connected · ";
    if (state === "no-output") return "Output Not Connected · ";
    return "";
}

function isNoMessyLinkNode(node) {
    return !!node && NODE_TYPES.includes(node.type);
}

// Bug fix (reported 2026-09-15): resolving a node id we stashed earlier in
// `properties` (noMessyLinkSlotMemory's originId entries, pairedMultiSendId)
// via graph.getNodeById() silently failed after a copy/paste — confirmed live
// (console dump) that ComfyUI's clipboard JSON round-trip turns a node's id
// into a STRING (e.g. "66"), while the original, never-touched node still
// has a NUMBER id (66). getNodeById() here is backed by a Map, which uses
// strict key equality, so a string lookup against a number-keyed entry (or
// vice versa) returns nothing even though the "same" id is right there.
// Fixes it by falling back to a manual scan comparing ids as strings
// whenever the direct lookup comes up empty. Used everywhere a persisted id
// (not a live link's origin_id/target_id, which are always internally
// consistent) gets resolved back to a node.
function findNodeByIdLoose(graph, id) {
    if (!graph || id == null) return null;
    const direct = graph.getNodeById(id);
    if (direct) return direct;
    return (graph._nodes || []).find((n) => String(n.id) === String(id)) || null;
}

// Same string/number mismatch as findNodeByIdLoose, for the places that
// compare a stashed id against a live node.id directly instead of doing a
// lookup (e.g. filtering graph._nodes for MultiReceives paired to a given
// MultiSend).
function idsMatch(a, b) {
    return a != null && b != null && String(a) === String(b);
}

// Returns every Receive node currently connected to sendNode's output.
// Send fans out to any number of Receives (Task 4) — Receive itself stays
// one-to-one, see getPairedSend below.
function getPairedReceives(sendNode) {
    const graph = sendNode.graph;
    if (!graph) return [];
    const linkIds = sendNode.outputs?.[0]?.links || [];
    return linkIds
        .map((id) => graph.links[id])
        .filter(Boolean)
        .map((link) => graph.getNodeById(link.target_id))
        .filter((n) => n?.type === RECEIVE_TYPE);
}

// Returns the single Send node receiveNode is paired with, or null.
function getPairedSend(receiveNode) {
    const graph = receiveNode.graph;
    if (!graph) return null;
    const linkId = receiveNode.inputs?.[0]?.link;
    if (linkId == null) return null;
    const link = graph.links[linkId];
    return link ? graph.getNodeById(link.origin_id) : null;
}

// The live link feeding sendNode's input, or null if unconnected.
function getUpstreamLink(sendNode) {
    const linkId = sendNode.inputs?.[0]?.link;
    if (linkId == null) return null;
    return sendNode.graph?.links?.[linkId] || null;
}

// The node feeding sendNode's input, or null if unconnected.
function getUpstreamNode(sendNode) {
    const link = getUpstreamLink(sendNode);
    return link ? sendNode.graph.getNodeById(link.origin_id) : null;
}

// The data type currently flowing into sendNode's input, or null if
// unconnected. Read live from the graph rather than cached state, so it
// stays correct across workflow reload / undo-redo without extra bookkeeping.
function getCurrentInputType(sendNode) {
    return getUpstreamLink(sendNode)?.type || null;
}

// The type flowing through this node's side of the pair: for Send, its own
// input; for Receive, whatever it's paired with — a plain Send's input
// (Receive always mirrors Send, per Task 2) or, since the Task 6 merge, one
// specific slot of a MultiSend (see getOriginType — MultiSend's own output
// sockets are wildcard, so the real type has to be read off its matching
// input slot instead).
function getEffectiveType(node) {
    if (node.type === SEND_TYPE) return getCurrentInputType(node);
    if (node.type === RECEIVE_TYPE) return getOriginType(getInputOrigin(node));
    return null;
}

function getCustomName(node) {
    const nameWidget = node.widgets?.find((w) => w.noMessyLinkRole === "name");
    return nameWidget?.value?.trim() || "";
}

// A node's name, ignoring the "Send · " / "Receive · " kind prefix added at
// title-render time (see the onDrawForeground hook below): whatever is typed in the
// "Name" widget, trimmed — or, when that's empty, an auto name. Send's auto
// name is "<upstream node title> → <TYPE>" once connected (so the name
// itself says what it's wired to, per Sid's 2026-09-14 request), falling
// back to its bare id when not. Receive mirrors whatever name its paired
// Send currently has (custom or auto) — same "Receive mirrors Send" rule as
// Task 2/3, so a pair always shows matching names.
function getBaseName(node) {
    const custom = getCustomName(node);
    if (custom) return custom;
    if (node.type === SEND_TYPE) {
        const upstream = getUpstreamNode(node);
        const type = getCurrentInputType(node);
        if (upstream && type) return `${upstream.title || upstream.type} → ${type}`;
        return `#${node.id}`;
    }
    if (node.type === RECEIVE_TYPE) {
        // Since the Task 6 merge, Receive can pair with either a plain Send
        // (mirrors its name, as always) or one slot of a MultiSend (name
        // becomes "<MultiSend name> · value_N").
        const origin = getInputOrigin(node);
        if (!origin) return `#${node.id}`;
        if (origin.node.type === SEND_TYPE) return getBaseName(origin.node);
        if (origin.node.type === MULTI_SEND_TYPE) {
            return `${getBaseNameMulti(origin.node)} · ${multiSlotName(origin.slot + 1)}`;
        }
        return `#${node.id}`;
    }
    return `#${node.id}`;
}

// Looks up the display color LiteGraph/ComfyUI uses for a given data type
// (e.g. "CLIP" -> yellow, "MODEL" -> purple) — the same lookup the canvas
// itself uses to color a socket once connected. Confirmed against the
// running ComfyUI build's bundled frontend (colourGetter.getConnectedColor,
// backed by app.canvas.default_connection_color_byType) rather than
// assumed from memory.
function getTypeColor(type) {
    const canvas = app.canvas;
    if (!canvas || !type) return null;
    if (canvas.default_connection_color_byType?.[type]) {
        return canvas.default_connection_color_byType[type];
    }
    if (typeof canvas.colourGetter?.getConnectedColor === "function") {
        try {
            return canvas.colourGetter.getConnectedColor(type);
        } catch {
            return null;
        }
    }
    return null;
}

// Darkens (negative amount) or lightens (positive) a hex color by a
// fraction of the 0-255 range, for deriving a node's header shade from its
// body color when recoloring to a connected pipe's color. Accepts both
// "#rrggbb" and CSS shorthand "#rgb" — ComfyUI's own type-color fallback
// (canvas.default_connection_color, used for types with no dedicated
// per-type color, e.g. STRING/INT/FLOAT) is shorthand ("#778", "#7F7").
function shadeColor(hex, amount) {
    let digits = hex.replace("#", "");
    if (digits.length === 3) {
        digits = digits.split("").map((c) => c + c).join("");
    }
    const num = parseInt(digits, 16);
    const delta = Math.round(255 * amount);
    const clamp = (v) => Math.min(255, Math.max(0, v));
    const r = clamp((num >> 16) + delta);
    const g = clamp(((num >> 8) & 0xff) + delta);
    const b = clamp((num & 0xff) + delta);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// --- Task 6 helpers (multi-slot pair + Receive's slot-picker) ----------

// Grows/shrinks a multi-slot node's input+output pair count to exactly
// wantTotal, tolerating gaps (a manually-disconnected middle slot is left
// in place, not collapsed) — only ever trims from the trailing end, and
// only while the trailing slot is actually empty.
function growShrinkMultiSlots(node, wantTotal) {
    if (!node.inputs || node.inputs.length === 0) {
        node.addInput(multiSlotName(1), "*");
        node.addOutput(multiSlotName(1), "*");
    }
    while (node.inputs.length < wantTotal) {
        const i = node.inputs.length + 1;
        node.addInput(multiSlotName(i), "*");
        node.addOutput(multiSlotName(i), "*");
    }
    while (
        node.inputs.length > wantTotal &&
        node.inputs.length > 1 &&
        node.inputs[node.inputs.length - 1].link == null
    ) {
        const lastIdx = node.inputs.length - 1;
        node.removeInput(lastIdx);
        node.removeOutput(lastIdx);
    }
}

// The "one trailing empty slot" target for a node whose own INPUT
// connections should drive its slot count, Reroute-style — used by
// NoMessyLinkMultiSend always, and by NoMessyLinkMultiReceive when it isn't
// currently paired to a MultiSend (see syncMultiReceiveSlots below).
function selfExpandTarget(node) {
    let highestFilled = -1;
    (node.inputs || []).forEach((inp, i) => {
        if (inp.link != null) highestFilled = i;
    });
    return Math.min(MULTI_MAX_SLOTS, highestFilled + 2);
}

// Grows/shrinks a NoMessyLinkMultiSend's slots to always have exactly one
// trailing empty slot (up to MULTI_MAX_SLOTS), Reroute-style, driven by
// which of its own INPUT slots are actually connected.
function syncMultiSendSlots(node) {
    growShrinkMultiSlots(node, selfExpandTarget(node));
}

// Keeps a NoMessyLinkMultiReceive's slot count matching its paired
// MultiSend's slot count exactly (full mirror, including MultiSend's own
// trailing empty slot), and auto-wires/unwires each slot's real link to
// match whether the corresponding MultiSend slot is filled — no manual
// dragging needed, unlike Receive's single-slot "Connect to Send" combo,
// which only sets up one link and leaves it there.
function syncMultiReceiveSlots(node, pairedMultiSend) {
    if (!node.inputs || node.inputs.length === 0) {
        node.addInput(multiSlotName(1), "*");
        node.addOutput(multiSlotName(1), "*");
    }
    if (pairedMultiSend) {
        // Exact mirror: resize unconditionally to match, even if this
        // node's own trailing slot currently holds a real wired link (the
        // wiring loop right below will unwire it) — growShrinkMultiSlots'
        // gap-tolerant, empty-slot-only trim doesn't apply here.
        const wantTotal = pairedMultiSend.inputs.length;
        while (node.inputs.length < wantTotal) {
            const i = node.inputs.length + 1;
            node.addInput(multiSlotName(i), "*");
            node.addOutput(multiSlotName(i), "*");
        }
        while (node.inputs.length > wantTotal && node.inputs.length > 1) {
            const lastIdx = node.inputs.length - 1;
            node.removeInput(lastIdx);
            node.removeOutput(lastIdx);
        }
        for (let idx = 0; idx < node.inputs.length; idx++) {
            const sendFilled = pairedMultiSend.inputs[idx]?.link != null;
            const alreadyWired = node.inputs[idx]?.link != null;
            if (sendFilled && !alreadyWired) {
                pairedMultiSend.connect(idx, node, idx);
            } else if (!sendFilled && alreadyWired) {
                node.disconnectInput(idx);
            }
        }
    } else {
        // Bug fix (reported 2026-09-15): a standalone MultiReceive (not
        // paired to any MultiSend — e.g. wired up directly by hand instead
        // of via "Connect to MultiSend") never grew a new empty trailing
        // slot after connecting one, because the old unpaired branch just
        // kept wantTotal frozen at whatever the current slot count already
        // was. Falls back to the same self-expand-from-own-connections
        // logic MultiSend itself uses, so a bare MultiReceive gets the same
        // Reroute-style auto-expand UX.
        growShrinkMultiSlots(node, selfExpandTarget(node));
    }
}

// Recolors/relabels every slot on a MultiSend from its own live input
// link's type — same idea as the original pair's single-slot color/label
// sync, just looped per slot instead of assuming slot 0. Goes through
// resolveRealType rather than reading link.type directly since that
// upstream connection could itself be another one of our own
// wildcard-socketed no-messy-link nodes (e.g. chained off a plain Send or
// another MultiSend slot), not just a plain external node.
function syncMultiSendSlotColors(node) {
    (node.inputs || []).forEach((inp, i) => {
        const link = inp.link != null ? node.graph?.links?.[inp.link] : null;
        const type = resolveRealType(link, node.graph);
        const color = getTypeColor(type);
        const label = slotSocketLabel(link, node.graph);
        inp.color_on = color;
        inp.label = label;
        if (node.outputs?.[i]) {
            node.outputs[i].color_on = color;
            node.outputs[i].label = downstreamSlotLabel(node, i) || label;
        }
    });
}

// Recolors/relabels every slot on a MultiReceive. When paired to a
// MultiSend, reads the type from the MultiSend's matching slot rather than
// its own input link — its own links to the MultiSend are wired through
// wildcard ("*") sockets (see syncMultiReceiveSlots), so link.type on its
// own side is always "*" even once connected; mirroring the type straight
// off the MultiSend's already-synced slot is the same "Receive mirrors
// Send" rule the original pair uses (getEffectiveType), just per slot.
// When standalone/unpaired (bug fix, reported 2026-09-15: slot labels
// stayed "value_N" forever on a bare MultiReceive wired up directly by
// hand), falls back to reading its own input link's type directly — that
// link IS a real external connection in this case, so its type is genuine.
function syncMultiReceiveSlotColors(node, pairedMultiSend) {
    (node.inputs || []).forEach((inp, i) => {
        let link = null;
        let graph = node.graph;
        if (pairedMultiSend) {
            const sendLinkId = pairedMultiSend.inputs?.[i]?.link;
            link = sendLinkId != null ? pairedMultiSend.graph?.links?.[sendLinkId] : null;
            graph = pairedMultiSend.graph;
        } else if (inp.link != null) {
            link = node.graph?.links?.[inp.link];
        }
        const type = resolveRealType(link, graph);
        const color = getTypeColor(type);
        const label = slotSocketLabel(link, graph);
        inp.color_on = color;
        inp.label = label;
        if (node.outputs?.[i]) {
            node.outputs[i].color_on = color;
            node.outputs[i].label = downstreamSlotLabel(node, i) || label;
        }
    });
}

function getBaseNameMulti(node) {
    return getCustomName(node) || `#${node.id}`;
}

// Every downstream node connected to any slot of a MultiSend: MultiReceive
// nodes paired to it as a whole (via the explicit property set by their
// "Connect to MultiSend" combo — see below), plus Receive nodes wired to
// one specific slot.
function getMultiSendDownstream(multiSendNode) {
    const graph = multiSendNode.graph;
    if (!graph) return [];
    const results = [];
    for (const n of graph._nodes || []) {
        if (n.type === MULTI_RECEIVE_TYPE && idsMatch(n.properties?.pairedMultiSendId, multiSendNode.id)) {
            results.push({ label: `(all slots) → ${n.title}`, target: n });
        }
    }
    (multiSendNode.outputs || []).forEach((out, idx) => {
        for (const linkId of out.links || []) {
            const link = graph.links[linkId];
            if (!link) continue;
            const target = graph.getNodeById(link.target_id);
            if (target?.type === RECEIVE_TYPE || target?.type === MIX_RECEIVE_TYPE) {
                results.push({ label: `${multiSlotName(idx + 1)} → ${target.title}`, target });
            }
        }
    });
    return results;
}

// The node + output-slot index feeding a Receive's single input, regardless
// of whether the origin is a plain NoMessyLinkSend or one slot of a
// NoMessyLinkMultiSend.
function getInputOrigin(node) {
    const linkId = node.inputs?.[0]?.link;
    if (linkId == null) return null;
    const link = node.graph?.links?.[linkId];
    if (!link) return null;
    const originNode = node.graph.getNodeById(link.origin_id);
    if (!originNode) return null;
    return { node: originNode, slot: link.origin_slot, type: link.type };
}

// The real data type flowing into a Receive from its origin — usually just
// origin.type (the live link's own type), EXCEPT when the origin is a
// MultiSend slot: MultiSend's output sockets are declared wildcard ("*",
// see syncMultiSendSlots), so a real link out of one always carries type
// "*" no matter what's actually flowing — the true type only exists
// cosmetically as the socket's label/color_on (same bug already fixed for
// MultiReceive's color sync — see syncMultiReceiveSlotColors). Here it's
// resolved by reading the type flowing INTO that same slot on the
// MultiSend (its upstream is a plain external connection, so that link's
// type is the genuine one).
//
// Bug fix (reported 2026-09-15): the first version of this only unwrapped
// ONE level — reading the upstream link's type directly. That upstream can
// itself originate from another one of our own wildcard-socketed nodes
// (e.g. a standalone MultiReceive fed straight from a NoMessyLinkSend's
// output), whose declared type is ALSO just "*", reproducing the exact
// same bug one hop further back. Recurses through any chain of our own
// no-messy-link nodes until it reaches a link that didn't originate from one.
function resolveRealType(link, graph) {
    if (!link) return null;
    const originNode = graph?.getNodeById(link.origin_id);
    if (originNode?.type === SEND_TYPE) {
        return getCurrentInputType(originNode);
    }
    if (originNode?.type === MULTI_SEND_TYPE) {
        const upstreamLinkId = originNode.inputs?.[link.origin_slot]?.link;
        const upstreamLink = upstreamLinkId != null ? originNode.graph?.links?.[upstreamLinkId] : null;
        return resolveRealType(upstreamLink, graph);
    }
    return link.type || null;
}

// Same recursion as resolveRealType, but returns the terminal ORIGIN NODE
// instead of the type — the actual external node ultimately feeding a
// slot, walking straight through any chain of our own Send/MultiSend
// proxies. Used to label multi-slot sockets with the feeding node's name,
// not just its type (Task 8 follow-up, reported 2026-09-16: a slot fed
// directly by an ordinary node showed only its type, e.g. "CONDITIONING",
// with no indication of which node).
function resolveRealOrigin(link, graph) {
    if (!link) return null;
    const originNode = graph?.getNodeById(link.origin_id);
    if (!originNode) return null;
    if (originNode.type === SEND_TYPE) {
        const upstreamLinkId = originNode.inputs?.[0]?.link;
        const upstreamLink = upstreamLinkId != null ? originNode.graph?.links?.[upstreamLinkId] : null;
        return resolveRealOrigin(upstreamLink, graph) || { node: originNode, slot: 0 };
    }
    if (originNode.type === MULTI_SEND_TYPE) {
        const upstreamLinkId = originNode.inputs?.[link.origin_slot]?.link;
        const upstreamLink = upstreamLinkId != null ? originNode.graph?.links?.[upstreamLinkId] : null;
        return resolveRealOrigin(upstreamLink, graph) || { node: originNode, slot: link.origin_slot };
    }
    return { node: originNode, slot: link.origin_slot };
}

// Socket label text: the ORIGIN's own output slot name (e.g. "positive",
// "negative" — whatever that node itself calls that output), not our type
// or the origin node's title. Falls back to the resolved type when no
// origin/slot name is available.
function slotSocketLabel(link, graph) {
    const origin = resolveRealOrigin(link, graph);
    const originSlot = origin?.node?.outputs?.[origin.slot];
    const slotName = originSlot?.label || originSlot?.name;
    if (slotName) return slotName;
    return resolveRealType(link, graph) || undefined;
}

// Task 9: output socket label shows the DOWNSTREAM consumer's input-slot
// name (e.g. "positive"/"negative" on Apply ControlNet) instead of the
// type/origin name, when the output has a live downstream link — the
// forward-looking counterpart to slotSocketLabel's backward-looking origin
// lookup. Fan-out rule (Sid, 2026-09-16): only the first-connected link's
// target slot name is used; multiple differently-named downstream links are
// not joined/merged, and don't fall back to type just because there's more
// than one.
function downstreamSlotLabel(node, outputIndex) {
    const graph = node.graph;
    const linkIds = node.outputs?.[outputIndex]?.links;
    if (!linkIds || linkIds.length === 0) return null;
    const link = graph?.links?.[linkIds[0]];
    if (!link) return null;
    const targetNode = graph?.getNodeById(link.target_id);
    const targetSlot = targetNode?.inputs?.[link.target_slot];
    return targetSlot?.label || targetSlot?.name || null;
}

function getOriginType(origin) {
    if (!origin) return null;
    if (origin.node.type === SEND_TYPE) {
        return getCurrentInputType(origin.node);
    }
    if (origin.node.type === MULTI_SEND_TYPE) {
        const sendInputLinkId = origin.node.inputs?.[origin.slot]?.link;
        const sendInputLink = sendInputLinkId != null ? origin.node.graph?.links?.[sendInputLinkId] : null;
        return resolveRealType(sendInputLink, origin.node.graph);
    }
    return null;
}

const AUTO_PAIR_OFFSET = 220;

// Bug fix (reported 2026-09-15, both node families): confirmed live via
// debug logging that the very first frame after spawnPairedReceive sets
// receive.pos, the node's actual pos has already shifted a few pixels
// (e.g. [975.42, 229.06] we set vs [980, 230] observed one frame later) —
// ComfyUI/LiteGraph applies its own grid-snap to a freshly added node. An
// earlier exact-equality drift check misread that automatic snap as the
// user dragging the Receive away, disengaging live-follow on frame 1 every
// time; a tolerance-based poll fixed that but reportedly left the Multi
// family's Receive stuck following even through a deliberate drag, only
// releasing once a slot connected (2026-09-16) — no code difference from
// the working plain pair was found to explain that gap. Fixed instead by
// detaching on LiteGraph's own `onNodeMoved` callback (an official,
// documented extension point fired once, right when a drag ends) — see the
// LGraphCanvas.prototype.onNodeMoved wrap near the bottom of this file —
// which sidesteps per-frame position-polling entirely.
function spawnPairedReceive(sendNode) {
    const graph = sendNode.graph;
    if (!graph) return;
    const receive = LiteGraph.createNode(RECEIVE_TYPE);
    if (!receive) return;
    const target = [sendNode.pos[0] + AUTO_PAIR_OFFSET, sendNode.pos[1]];
    receive.pos = target;
    receive._noMessyLinkFollow = true;
    graph.add(receive);
    sendNode.connect(0, receive, 0);
    graph.setDirtyCanvas(true, true);
    return receive;
}

// Same auto-pair-on-add as spawnPairedReceive above, for MultiSend ->
// MultiReceive. Pairing is set via the explicit pairedMultiSendId property
// (same as the "Connect to MultiSend" combo does) rather than a direct
// connect() call, since syncMultiReceiveSlots (run every frame) is what
// actually wires the per-slot links once it sees that property.
function spawnPairedMultiReceive(multiSendNode) {
    const graph = multiSendNode.graph;
    if (!graph) return;
    const receive = LiteGraph.createNode(MULTI_RECEIVE_TYPE);
    if (!receive) return;
    const target = [multiSendNode.pos[0] + AUTO_PAIR_OFFSET, multiSendNode.pos[1]];
    receive.pos = target;
    receive._noMessyLinkFollow = true;
    receive.properties = receive.properties || {};
    receive.properties.pairedMultiSendId = multiSendNode.id;
    graph.add(receive);
    graph.setDirtyCanvas(true, true);
    return receive;
}

// Bug fix (reported 2026-09-16, video evidence `Videos_testing/04.mp4`):
// Task 5's paste/copy connection-memory was only ever built for the plain
// Send/Receive pair (single input slot, hardcoded slot 0 on both ends) —
// MultiSend, standalone MultiReceive, and MixReceive never got it, so any
// real link into one of THEIR slots was silently lost on copy/paste (the
// paired-via-property case, e.g. a MultiReceive mirroring a MultiSend,
// already survives independently since `pairedMultiSendId` is itself a
// persisted property re-synced every frame — this is specifically about
// slots wired to a real, direct link). Replaced the old single-purpose
// pairedOriginId/pairedOriginSlot/pairedSendId properties (which also
// couldn't remember a Receive's origin SLOT — always reconnected to slot 0
// even if it had picked one specific slot of a MultiSend) with one generic
// mechanism that covers every slot on every no-messy-link node type: an array
// of {slot, originId, originSlot} stashed under `properties.
// noMessyLinkSlotMemory`, written every frame a slot has a real link (see
// each type's onDrawForeground) and replayed here for any slot that still
// lacks one — i.e. LiteGraph's own paste/load link-restore pass didn't
// already reconnect it. `properties` is standard node data that LiteGraph
// clones/serializes on its own, so the memory survives the copy even though
// the live link object itself doesn't.
function rememberSlotConnections(node) {
    const graph = node.graph;
    if (!graph) return;
    const mem = [];
    (node.inputs || []).forEach((inp, i) => {
        if (inp.link == null) return;
        const link = graph.links[inp.link];
        if (!link) return;
        mem.push({ slot: i, originId: link.origin_id, originSlot: link.origin_slot });
    });
    if (mem.length) {
        node.properties = node.properties || {};
        node.properties.noMessyLinkSlotMemory = mem;
    }
}

function reconnectSlotsFromMemory(node) {
    const graph = node.graph;
    const mem = node.properties?.noMessyLinkSlotMemory;
    if (!graph || !mem?.length) return;
    for (const entry of mem) {
        if (node.inputs?.[entry.slot]?.link != null) continue;
        const origin = findNodeByIdLoose(graph, entry.originId);
        if (origin) origin.connect(entry.originSlot, node, entry.slot);
    }
}

// Pans the canvas to center the target node, keeping the current zoom
// level, and selects it.
function jumpToNode(node) {
    const canvas = app.canvas;
    if (!canvas || !node) return;
    canvas.selectNode(node);
    // Use the canvas's own centerOnNode — confirmed (2026-09-16, live in
    // Sid's ComfyUI build) to pan correctly without changing zoom. Manually
    // writing canvas.ds.offset was fought by this build's own pan/zoom
    // pipeline: the value we set did not stick, and something else applied
    // a different offset — root cause of BF-01/BF-02, not a DPI issue.
    if (typeof canvas.centerOnNode === "function") {
        canvas.centerOnNode(node);
    }
    canvas.setDirty(true, true);
}

app.registerExtension({
    name: "comfy.NoMessyLink",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.includes(nodeData.name)) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this._noMessyLinkHover = false;
            // Resizable so width (at least) can be pulled in narrower than
            // this default — height has a natural floor from the stacked
            // Name/jump/connect widgets, LiteGraph won't shrink past that
            // regardless of resizable.
            this.resizable = true;
            this.size = [145, 60];
            if (nodeData.name === SEND_TYPE) {
                this.color = SEND_DEFAULT_COLOR;
                this.bgcolor = SEND_DEFAULT_BGCOLOR;
                this.shape = LiteGraph.BOX_SHAPE;
                // Fixed accent square, independent of the type-driven
                // header/body color below — LiteGraph.ROUND_SHAPE vs
                // BOX_SHAPE turned out visually indistinguishable in Sid's
                // build, so boxcolor is the real Send-vs-Receive marker
                // (it never changes, unlike color/bgcolor).
                this.boxcolor = "#ff9640";
            } else {
                this.color = RECEIVE_DEFAULT_COLOR;
                this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
                this.shape = LiteGraph.ROUND_SHAPE;
                this.boxcolor = "#4aa3ff";
            }

            const nameWidget = this.addWidget("text", "Name", "", () => {});
            nameWidget.noMessyLinkRole = "name";

            if (nodeData.name === SEND_TYPE) {
                // Send can fan out to multiple Receives (Task 4), so "jump
                // to paired node" is a dropdown listing all of them rather
                // than a single button. Same built-in filter-as-you-type
                // as the Receive combo below.
                const jumpCombo = this.addWidget("combo", "Jump to Receive", "(not connected)", (value) => {
                    const match = /\[#(\d+)\]$/.exec(value || "");
                    if (!match) return;
                    const target = findNodeByIdLoose(this.graph, match[1]);
                    if (target?.type === RECEIVE_TYPE) jumpToNode(target);
                }, { values: [] });
                jumpCombo.noMessyLinkRole = "jumpCombo";

                // Task 10: manual recovery — spawns a fresh, connected
                // Receive at any time (not conditional on already having
                // none), so deleting the paired Receive by accident isn't a
                // dead end, and it doubles as a quick way to add another fed
                // Receive (Send already fans out, Task 4) without dragging.
                const spawnWidget = this.addWidget("button", "+ New Receive", null, () => {
                    // UX nicety (2026-09-16): jump to the newly spawned
                    // Receive so a click on canvas confirms it worked and is
                    // easy to find. NOT a fix for BF-25 (this button doing
                    // nothing when clicked from ComfyUI's properties side
                    // panel) — that panel doesn't fire click callbacks for
                    // "button"-type widgets at all, confirmed panel-level
                    // limitation, not something reachable from in here. See
                    // BF-25 / Post-Launch Fix List in TASK_PROGRESS.md.
                    // Only done at this manual-button call site, not inside
                    // spawnPairedReceive itself, since that function is also
                    // used by the silent auto-pair-on-add path, which must
                    // stay silent.
                    const receive = spawnPairedReceive(this);
                    if (receive) jumpToNode(receive);
                });
                spawnWidget.noMessyLinkRole = "spawnReceive";
            } else {
                const jumpWidget = this.addWidget("button", "(not connected)", null, () => {
                    const paired = getPairedSend(this);
                    if (paired) jumpToNode(paired);
                });
                jumpWidget.noMessyLinkRole = "jumpButton";

                // Receive-only: pick which Send to pair with by name instead
                // of dragging a wire — handy once a graph has many Send
                // nodes. ComfyUI's combo widget already filters-as-you-type
                // on open, matching node-search behavior, so no custom
                // search UI is needed here. Since the Task 6 merge (folding
                // in the former NoMessyLinkReceiveV2), the value can also
                // encode a specific MultiSend slot as "[#id:slot]" instead
                // of just "[#id]" for a plain Send.
                const connectWidget = this.addWidget("combo", "Connect to Send", "(not connected)", (value) => {
                    const match = /\[#(\d+)(?::(\d+))?\]$/.exec(value || "");
                    if (!match) return;
                    const originNode = findNodeByIdLoose(this.graph, match[1]);
                    if (!originNode) return;
                    const slot = match[2] != null ? Number(match[2]) : 0;
                    if (originNode.type === SEND_TYPE || originNode.type === MULTI_SEND_TYPE) {
                        originNode.connect(slot, this, 0);
                    }
                }, { values: [] });
                connectWidget.noMessyLinkRole = "connectCombo";
            }
        };

        // Added-to-graph handling: auto-spawn and reconnect-from-memory
        // (below) are only for paste/duplicate/manual add — a genuine
        // workflow load or undo/redo already restores everything correctly
        // on its own and needs neither. `app.configuringGraph` (confirmed
        // by reading the installed ComfyUI frontend bundle — it's set
        // around every call to LGraph.prototype.configure, the method
        // behind load/undo/redo) is true for exactly that case and false
        // during paste (LGraphCanvas._deserializeItems never calls
        // configure), so it's read synchronously here, before either check
        // runs, to tell the two apart.
        //
        // Both checks are still deferred one tick (setTimeout 0): paste
        // (confirmed in the same bundle) adds every pasted node to the
        // graph FIRST, in one synchronous pass, and only reconnects their
        // original links in a second pass afterward — checking
        // synchronously in onAdded would always see "no link yet" even for
        // a pasted pair that's about to be relinked a moment later.
        // Deferring lets that same-tick second pass finish first.
        //
        // (Running these unconditionally, without the configuringGraph
        // check, was BF-08: on every workflow load, calling
        // reconnectSlotsFromMemory/spawnPairedReceive here — redundant since
        // load already restores the real links — corrupted a Send's
        // multi-Receive fan-out (Task 4) down to a single link. The exact
        // mechanism wasn't fully isolated, but the fix follows directly
        // from BF-06's same lesson: this logic has no business running
        // during a real load at all, only paste.)
        // Bug fix (reported 2026-09-16, video evidence `Videos_testing/03.mp4`):
        // the onNodeMoved-based detach (see the LGraphCanvas.prototype
        // wrap-installer near the bottom of this file) only fires on mouse
        // UP, right when a drag ends — so during the drag itself, the
        // still-true `_noMessyLinkFollow` kept the per-frame follow-sync
        // snapping the node straight back every frame, making the FIRST
        // drag attempt look completely stuck even though it silently
        // detached the moment the mouse was released (so a SECOND attempt
        // then moved freely). Fixed by also detaching on mouse DOWN — the
        // instant the user grabs the node — so the snap-back stops before
        // the drag even starts, not after it ends.
        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function () {
            this._noMessyLinkFollow = false;
            return onMouseDown?.apply(this, arguments);
        };

        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function () {
            onAdded?.apply(this, arguments);
            // See the insideNoMessyLinkUnpack wrap (bottom of this file, near
            // the convertToSubgraph wrap) for why unpackSubgraph needs its
            // own flag here alongside app.configuringGraph.
            if (app.configuringGraph || insideNoMessyLinkUnpack) return;
            // Bug fix (reported 2026-09-16, video evidence
            // `Videos_testing/05.mp4` then `06.mp4`): two attempts.
            // Originally reconnectSlotsFromMemory ran inside the same
            // setTimeout(0) as the auto-spawn check below, but
            // growShrinkMultiSlots' every-frame auto-trim (next render frame)
            // ran FIRST — a freshly pasted multi-slot node's slots all look
            // temporarily empty until the memory reconnect restores them, so
            // the trim deleted the trailing ones before the deferred
            // reconnect ever ran, losing every connection past the first.
            // Tried calling it synchronously here instead — broke entirely
            // (reconnected NOTHING): confirmed by reading ComfyUI's paste
            // implementation (`_deserializeItems` in the installed frontend
            // bundle) that it calls `graph.add(node)` — firing onAdded —
            // BEFORE `node.configure(data)`, which is what actually restores
            // `properties` (including our own `noMessyLinkSlotMemory`) from
            // the clipboard payload; reading it synchronously here always
            // saw it still empty. Fixed with a MICROTASK
            // (`Promise.resolve().then()`) instead of either extreme: it
            // runs after the current synchronous script finishes — by which
            // point configure() has already run for every pasted node,
            // properties included, since add()+configure() happen
            // synchronously in the same loop — but strictly before the
            // browser's next render/animation frame, which is when
            // growShrinkMultiSlots' trim actually runs. A setTimeout(0)
            // macrotask does not have that same "before next frame"
            // guarantee, which is exactly what caused the original bug.
            Promise.resolve().then(() => {
                if (!this.graph) return;
                reconnectSlotsFromMemory(this);
            });
            setTimeout(() => {
                if (!this.graph) return; // removed again before the timer fired
                if (this.type === SEND_TYPE && !this.outputs?.[0]?.links?.length) {
                    spawnPairedReceive(this);
                }
            }, 0);
        };

        // Every redraw: remember this node's live connection (so a future
        // copy/paste of it can restore that connection, see
        // rememberSlotConnections/reconnectSlotsFromMemory above), then
        // refresh its name/title, its type-driven slot+node color, its
        // paired-node jump widget, the
        // Receive "Connect to Send" combo's option list, and hit-test the
        // mouse against its bounds for hover state (LiteGraph does not
        // fire mouseenter/mouseleave on nodes, so this is checked on each
        // foreground draw instead). Recomputing all of this fresh every
        // frame — rather than only reacting to connect/disconnect events —
        // means it's always correct after a name edit, a workflow reload,
        // or an undo/redo, with no extra state to keep in sync.
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            installNodeMovedHook();
            // Hover uses the canvas's own node_over (confirmed against the
            // installed ComfyUI frontend bundle: set in
            // updateMouseOverNodes via the real per-node hit-test,
            // isOverNodeInput/isOverNodeOutput) instead of a hand-rolled
            // AABB check — a manual box test used this node's expanded
            // this.size, which is wrong once the node is collapsed (a
            // collapsed node's actual hit area is a small title pill), so
            // hovering a collapsed node never registered before this fix.
            // Checked before the collapsed early-return below so hover
            // state stays live even while collapsed.
            this._noMessyLinkHover = app.canvas?.node_over === this;
            // Bug fix (reported 2026-09-16): remembering the live connection
            // must also happen before the collapsed early-return — same
            // reasoning as the hover flag above — otherwise a collapsed
            // node's `noMessyLinkSlotMemory` goes stale the moment it's
            // collapsed (last written the frame before), so copying it while
            // collapsed pastes with no connection. The other two node-type
            // blocks in this file already had this the right way round; only
            // this one didn't.
            rememberSlotConnections(this);
            if (this.flags?.collapsed) return;

            const pairedReceives = this.type === SEND_TYPE ? getPairedReceives(this) : [];
            // Since the Task 6 merge, a Receive's origin can be a plain
            // Send OR one specific slot of a MultiSend — getInputOrigin
            // (originally built for NoMessyLinkReceiveV2) returns both node
            // and slot; pairedSend below is just its node, kept for the
            // spots that only ever needed the node itself.
            const receiveOrigin = this.type === RECEIVE_TYPE ? getInputOrigin(this) : null;
            const pairedSend = receiveOrigin?.node || null;

            const type = getEffectiveType(this);
            const color = getTypeColor(type);
            if (this.inputs?.[0]) {
                this.inputs[0].color_on = color;
                this.inputs[0].label = type || undefined;
            }
            if (this.outputs?.[0]) {
                this.outputs[0].color_on = color;
                this.outputs[0].label = downstreamSlotLabel(this, 0) || type || undefined;
            }

            // Node header/body recolor to the connected pipe's type,
            // mirrored on Receive same as everything else — reverts to the
            // fixed per-kind defaults when disconnected. Both shades are
            // darkened well below the raw type color (some, like VAE's
            // pale red, are too light on their own for white widget text
            // to read against) — boxcolor (set in onNodeCreated above) is
            // what keeps Send and Receive tellable apart once they share
            // the same color here.
            const connState = connectivityState(this);
            if (connState === "none") {
                this.color = NOT_CONNECTED_COLOR;
                this.bgcolor = NOT_CONNECTED_BGCOLOR;
            } else if (connState === "no-input" || connState === "no-output") {
                this.color = PARTIAL_COLOR;
                this.bgcolor = PARTIAL_BGCOLOR;
            } else if (color) {
                this.color = shadeColor(color, -0.55);
                this.bgcolor = shadeColor(color, -0.25);
            } else if (this.type === SEND_TYPE) {
                this.color = SEND_DEFAULT_COLOR;
                this.bgcolor = SEND_DEFAULT_BGCOLOR;
            } else {
                this.color = RECEIVE_DEFAULT_COLOR;
                this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
            }

            const kindPrefix = this.type === SEND_TYPE ? "Send" : "Receive";
            this.title = `${connectivityPrefix(connState)}${kindPrefix} · ${getBaseName(this)}`;

            if (this.type === SEND_TYPE) {
                const jumpCombo = this.widgets?.find((w) => w.noMessyLinkRole === "jumpCombo");
                if (jumpCombo) {
                    jumpCombo.options.values = pairedReceives.map((n) => `${n.title} [#${n.id}]`);
                    jumpCombo.value = pairedReceives.length
                        ? `${pairedReceives.length} connected — pick to jump`
                        : "(not connected)";
                }
            } else {
                const jumpWidget = this.widgets?.find((w) => w.noMessyLinkRole === "jumpButton");
                if (jumpWidget) {
                    jumpWidget.name = pairedSend ? `→ ${pairedSend.title}` : "(not connected)";
                }

                const connectWidget = this.widgets?.find((w) => w.noMessyLinkRole === "connectCombo");
                if (connectWidget) {
                    // Options list both plain Send nodes and, per Task 6's
                    // merge, every currently-connected slot of every
                    // MultiSend, individually — same listing/value format
                    // NoMessyLinkReceiveV2 used before being folded in here.
                    const options = [];
                    for (const n of this.graph?._nodes || []) {
                        if (n.type === SEND_TYPE) {
                            options.push(`${n.title} [#${n.id}]`);
                        } else if (n.type === MULTI_SEND_TYPE) {
                            (n.inputs || []).forEach((inp, i) => {
                                if (inp.link != null) {
                                    const t = n.graph?.links?.[inp.link]?.type || "";
                                    options.push(
                                        `${getBaseNameMulti(n)} · ${multiSlotName(i + 1)}${t ? ` (${t})` : ""} [#${n.id}:${i}]`
                                    );
                                }
                            });
                        }
                    }
                    connectWidget.options.values = options;
                    connectWidget.value = receiveOrigin
                        ? receiveOrigin.node.type === SEND_TYPE
                            ? `${receiveOrigin.node.title} [#${receiveOrigin.node.id}]`
                            : `${getBaseNameMulti(receiveOrigin.node)} · ${multiSlotName(receiveOrigin.slot + 1)}${type ? ` (${type})` : ""} [#${receiveOrigin.node.id}:${receiveOrigin.slot}]`
                        : "(not connected)";
                }
            }

            // Live-follow: while the freshly auto-spawned Receive hasn't
            // been manually moved, keep it glued to this Send at a fixed
            // offset every frame. Detachment is handled by the
            // LGraphCanvas.prototype.onNodeMoved wrap near the bottom of
            // this file (fires once, right when a drag ends) rather than by
            // polling position drift here — see that wrap's comment for why
            // the polling approach was replaced (2026-09-16).
            const following = this.type === SEND_TYPE ? pairedReceives.find((n) => n._noMessyLinkFollow) : null;
            if (following) {
                following.pos[0] = this.pos[0] + AUTO_PAIR_OFFSET;
                following.pos[1] = this.pos[1];
            }
        };

        // Task 4: Send's output is no longer forced one-to-one — a plain
        // LiteGraph output socket already fans out to multiple inputs
        // natively, so there is nothing left to enforce here. Receive stays
        // one-to-one on its input by ComfyUI's normal single-link behavior,
        // unchanged.
    },
});

// Removes a widget from a node, using the node's own removeWidget if this
// LiteGraph build exposes one, falling back to a manual splice.
function removeWidgetFromNode(node, widget) {
    if (typeof node.removeWidget === "function") {
        node.removeWidget(widget);
    } else {
        const idx = node.widgets?.indexOf(widget);
        if (idx != null && idx >= 0) node.widgets.splice(idx, 1);
    }
}

// Keeps stacked widgets in a fixed visual order — Name, jumpButton, any
// extraJump rows (below), then connectCombo — regardless of the order they
// were actually added in. Needed because extraJump rows get created in
// onDrawForeground, which runs after onNodeCreated already added
// connectCombo, and addWidget always appends to the end; Array.prototype
// .sort is stable (ES2019+), so relative order among same-role widgets
// (e.g. multiple extraJump rows, in slot-connection order) is preserved.
const WIDGET_ROLE_ORDER = ["name", "jumpButton", "extraJump", "connectCombo"];
function ensureWidgetOrder(node) {
    node.widgets?.sort((a, b) => WIDGET_ROLE_ORDER.indexOf(a.noMessyLinkRole) - WIDGET_ROLE_ORDER.indexOf(b.noMessyLinkRole));
}

// Every INPUT slot's real origin node, deduplicated — [{node, slots:
// [slotIndex, ...]}, ...] in first-appearance order. Used by both a
// standalone MultiReceive and NoMessyLinkMixReceive (Task 7) to build their
// per-origin jump buttons.
function gatherUniqueOriginEntries(node) {
    const entryByOriginId = new Map();
    const entries = [];
    (node.inputs || []).forEach((inp, slotIdx) => {
        const link = inp.link != null ? node.graph?.links?.[inp.link] : null;
        const origin = link ? node.graph?.getNodeById(link.origin_id) : null;
        if (!origin) return;
        let entry = entryByOriginId.get(origin.id);
        if (!entry) {
            entry = { node: origin, slots: [] };
            entryByOriginId.set(origin.id, entry);
            entries.push(entry);
        }
        entry.slots.push(slotIdx);
    });
    return entries;
}

// Slot prefix only shown when it's actually needed to disambiguate — i.e.
// when multiple slots share this one origin (deduplicated onto one row).
// A plain single-slot origin just reads "→ title", no clutter.
function slotJumpLabel(entry) {
    if (entry.slots.length <= 1) return `→ ${entry.node.title}`;
    const slotNames = entry.slots.map((i) => multiSlotName(i + 1)).join(",");
    return `${slotNames} → ${entry.node.title}`;
}

// Bug fix / UX change (reported 2026-09-15): a standalone MultiReceive
// (not paired to any MultiSend) has no single node to point a jump button
// at — each connected slot can come from a different source. The static
// jumpButton widget (from onNodeCreated) is reused for the FIRST unique
// origin; one extra "extraJump" button widget is added per ADDITIONAL
// unique origin (deduplicated — multiple slots from the same node get one
// row, not one each), each independently clickable to jump straight to
// that node. Since widgets always render as one block below every socket
// row (LiteGraph can't interleave a widget between sockets), each row's
// label is prefixed with which slot(s) it covers (e.g. "value_1 →
// Send..." / "value_2,3 → MultiSend...") so it stays legible which slot(s)
// each button corresponds to even though it can't sit next to them.
// `entries` is [{node, slots: [slotIndex, ...]}, ...] in first-appearance
// order. Widgets are updated in place rather than removed/recreated every
// frame to avoid needless churn; only the count is adjusted when it changes.
function syncStandaloneJumpWidgets(node, jumpWidget, entries) {
    if (jumpWidget) {
        if (entries.length === 0) {
            jumpWidget.name = "(not connected)";
            jumpWidget.callback = null;
        } else {
            jumpWidget.name = slotJumpLabel(entries[0]);
            jumpWidget.callback = () => jumpToNode(entries[0].node);
        }
    }
    const extras = entries.slice(1);
    let existing = (node.widgets || []).filter((w) => w.noMessyLinkRole === "extraJump");
    while (existing.length < extras.length) {
        const w = node.addWidget("button", "", null, () => {});
        w.noMessyLinkRole = "extraJump";
        existing.push(w);
    }
    while (existing.length > extras.length) {
        removeWidgetFromNode(node, existing.pop());
    }
    existing.forEach((w, i) => {
        w.name = slotJumpLabel(extras[i]);
        w.callback = () => jumpToNode(extras[i].node);
    });
    ensureWidgetOrder(node);
}

// Task 6 — NoMessyLinkMultiSend / NoMessyLinkMultiReceive. Registered
// separately from the pair above, which this does not modify at all.
app.registerExtension({
    name: "comfy.NoMessyLinkMulti",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== MULTI_SEND_TYPE && nodeData.name !== MULTI_RECEIVE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this._noMessyLinkHover = false;
            this.resizable = true;
            this.size = [170, 80];
            // ComfyUI auto-creates a socket for every slot declared in
            // INPUT_TYPES/RETURN_TYPES (up to MULTI_MAX_SLOTS) — trim down
            // to just the first, empty one; syncMultiSendSlots/
            // syncMultiReceiveSlots (run every frame below) grow/shrink it
            // from there.
            while (this.inputs && this.inputs.length > 1) this.removeInput(this.inputs.length - 1);
            while (this.outputs && this.outputs.length > 1) this.removeOutput(this.outputs.length - 1);

            const nameWidget = this.addWidget("text", "Name", "", () => {});
            nameWidget.noMessyLinkRole = "name";

            if (nodeData.name === MULTI_SEND_TYPE) {
                this.color = SEND_DEFAULT_COLOR;
                this.bgcolor = SEND_DEFAULT_BGCOLOR;
                this.shape = LiteGraph.BOX_SHAPE;
                this.boxcolor = "#ff9640";
                const jumpCombo = this.addWidget("combo", "Jump to Receive", "(not connected)", (value) => {
                    const match = /\[#(\d+)\]$/.exec(value || "");
                    if (!match) return;
                    const target = findNodeByIdLoose(this.graph, match[1]);
                    if (target) jumpToNode(target);
                }, { values: [] });
                jumpCombo.noMessyLinkRole = "jumpCombo";

                // Task 10: same manual recovery button as the plain Send,
                // spawning MultiSend's own kind of paired node instead.
                const spawnWidget = this.addWidget("button", "+ New MultiReceive", null, () => {
                    // Same UX nicety as the plain Send's "+ New Receive"
                    // button above — jump to the newly spawned MultiReceive
                    // on canvas click. Does not fix BF-25 (dead from the
                    // properties side panel) — see the comment there.
                    const receive = spawnPairedMultiReceive(this);
                    if (receive) jumpToNode(receive);
                });
                spawnWidget.noMessyLinkRole = "spawnReceive";
            } else {
                this.color = RECEIVE_DEFAULT_COLOR;
                this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
                this.shape = LiteGraph.ROUND_SHAPE;
                this.boxcolor = "#4aa3ff";
                const jumpWidget = this.addWidget("button", "(not connected)", null, () => {
                    const paired = findNodeByIdLoose(this.graph, this.properties?.pairedMultiSendId);
                    if (paired) jumpToNode(paired);
                });
                jumpWidget.noMessyLinkRole = "jumpButton";
                const connectWidget = this.addWidget("combo", "Connect to MultiSend", "(not connected)", (value) => {
                    const match = /\[#(\d+)\]$/.exec(value || "");
                    if (!match) return;
                    this.properties = this.properties || {};
                    // Stored as whatever the regex captured (a string) —
                    // findNodeByIdLoose/idsMatch normalize on read, but no
                    // reason to force a Number() cast that just re-creates
                    // the string/number mismatch bug at the write side.
                    this.properties.pairedMultiSendId = match[1];
                }, { values: [] });
                connectWidget.noMessyLinkRole = "connectCombo";
            }
        };

        // Detach live-follow on mouse-down too, not just onNodeMoved's
        // mouse-up — see the identical wrap and comment in the original
        // Send/Receive block above.
        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function () {
            this._noMessyLinkFollow = false;
            return onMouseDown?.apply(this, arguments);
        };

        // Auto-pair-on-add for MultiSend -> MultiReceive, same fix (BF-04)
        // and same guard (BF-06/BF-08: skip entirely during a real workflow
        // load/undo/redo via app.configuringGraph, defer one tick so a
        // paste's own link/property restore pass finishes first) as the
        // original Send/Receive pair. MultiReceive itself auto-spawns
        // nothing on its own add — Send-only, same asymmetry as before.
        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function () {
            onAdded?.apply(this, arguments);
            // See the insideNoMessyLinkUnpack wrap (bottom of this file, near
            // the convertToSubgraph wrap) for why unpackSubgraph needs its
            // own flag here alongside app.configuringGraph.
            if (app.configuringGraph || insideNoMessyLinkUnpack) return;
            // Paste-connection-memory (bug fix, see
            // rememberSlotConnections/reconnectSlotsFromMemory) — both
            // MultiSend (its own real upstream inputs) and MultiReceive
            // (its real per-slot inputs, standalone or paired) get this. Run
            // as a MICROTASK, not synchronously and not a setTimeout(0)
            // macrotask — see the identical fix/comment in the original
            // Send/Receive block's onAdded above for why both extremes broke.
            Promise.resolve().then(() => {
                if (!this.graph) return;
                reconnectSlotsFromMemory(this);
            });
            setTimeout(() => {
                if (!this.graph) return;
                // The auto-spawn stays MultiSend-only, same asymmetry as the
                // original Send/Receive pair, and still deferred since it
                // needs LiteGraph's own real-link-restore pass to have
                // finished first (BF-06/BF-08).
                if (nodeData.name === MULTI_SEND_TYPE && getMultiSendDownstream(this).length === 0) {
                    spawnPairedMultiReceive(this);
                }
            }, 0);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            installNodeMovedHook();
            // See the original Send/Receive block's onDrawForeground for
            // why node_over is used instead of a manual box test (collapsed
            // hover fix).
            this._noMessyLinkHover = app.canvas?.node_over === this;
            installMultiPairingOverlayHook();
            rememberSlotConnections(this);
            if (this.flags?.collapsed) return;

            if (this.type === MULTI_SEND_TYPE) {
                syncMultiSendSlots(this);
                syncMultiSendSlotColors(this);
            } else {
                const rawPaired = findNodeByIdLoose(this.graph, this.properties?.pairedMultiSendId);
                const paired = rawPaired?.type === MULTI_SEND_TYPE ? rawPaired : null;
                syncMultiReceiveSlots(this, paired);
                syncMultiReceiveSlotColors(this, paired);
            }

            // Task 10 (+ follow-up): whole family gets dark-red "not
            // connected" when every slot (input AND output, not just the
            // trailing auto-expand one) is empty, or a muted-amber partial
            // marker when only one side has any live link at all.
            const connState = connectivityState(this);
            if (connState === "none") {
                this.color = NOT_CONNECTED_COLOR;
                this.bgcolor = NOT_CONNECTED_BGCOLOR;
            } else if (connState === "no-input" || connState === "no-output") {
                this.color = PARTIAL_COLOR;
                this.bgcolor = PARTIAL_BGCOLOR;
            } else if (this.type === MULTI_SEND_TYPE) {
                this.color = SEND_DEFAULT_COLOR;
                this.bgcolor = SEND_DEFAULT_BGCOLOR;
            } else {
                this.color = RECEIVE_DEFAULT_COLOR;
                this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
            }

            const kindLabel = this.type === MULTI_SEND_TYPE ? "MultiSend" : "MultiReceive";
            this.title = `${connectivityPrefix(connState)}${kindLabel} · ${getBaseNameMulti(this)}`;

            if (this.type === MULTI_SEND_TYPE) {
                const jumpCombo = this.widgets?.find((w) => w.noMessyLinkRole === "jumpCombo");
                if (jumpCombo) {
                    const downstream = getMultiSendDownstream(this);
                    jumpCombo.options.values = downstream.map((d) => `${d.label} [#${d.target.id}]`);
                    jumpCombo.value = downstream.length
                        ? `${downstream.length} connected — pick to jump`
                        : "(not connected)";
                }
            } else {
                const paired = findNodeByIdLoose(this.graph, this.properties?.pairedMultiSendId);
                const jumpWidget = this.widgets?.find((w) => w.noMessyLinkRole === "jumpButton");
                if (paired) {
                    // Paired to a MultiSend: single target, single button —
                    // drop any leftover per-origin rows from an earlier
                    // standalone state.
                    if (jumpWidget) {
                        jumpWidget.name = `→ ${paired.title}`;
                        jumpWidget.callback = () => jumpToNode(paired);
                    }
                    const leftover = (this.widgets || []).filter((w) => w.noMessyLinkRole === "extraJump");
                    if (leftover.length) {
                        leftover.forEach((w) => removeWidgetFromNode(this, w));
                    }
                } else {
                    // Standalone/unpaired: no single node to point one
                    // button at — each slot can come from a different
                    // source. One button per unique origin instead, each
                    // labeled with the slot(s) it covers (see
                    // syncStandaloneJumpWidgets).
                    syncStandaloneJumpWidgets(this, jumpWidget, gatherUniqueOriginEntries(this));
                }

                const connectWidget = this.widgets?.find((w) => w.noMessyLinkRole === "connectCombo");
                if (connectWidget) {
                    const multiSends = (this.graph?._nodes || []).filter((n) => n.type === MULTI_SEND_TYPE);
                    connectWidget.options.values = multiSends.map((n) => `${n.title} [#${n.id}]`);
                    connectWidget.value = paired ? `${paired.title} [#${paired.id}]` : "(not connected)";
                }
            }

            // Live-follow: same mechanism as the original Send/Receive
            // pair's onDrawForeground — a freshly auto-spawned MultiReceive
            // glues to this MultiSend at a fixed offset. Detachment is
            // handled by the LGraphCanvas.prototype.onNodeMoved wrap near
            // the bottom of this file, not by polling position drift here.
            if (this.type === MULTI_SEND_TYPE) {
                const downstream = getMultiSendDownstream(this);
                const following = downstream.map((d) => d.target).find((n) => n._noMessyLinkFollow);
                if (following) {
                    following.pos[0] = this.pos[0] + AUTO_PAIR_OFFSET;
                    following.pos[1] = this.pos[1];
                }
            }
        };
    },
});

// Task 7 — NoMessyLinkMixReceive: auto-expanding slots like MultiSend, but
// each slot is independently wired to its own source (plain Send, or one
// specific MultiSend slot) rather than mirroring a single MultiSend.
// Always standalone (no pairing concept, no auto-spawn). Heavily reuses
// the multi-slot infrastructure built for Task 6 — growShrinkMultiSlots/
// selfExpandTarget (self-expand), syncMultiSendSlotColors (per-slot real
// type via resolveRealType), gatherUniqueOriginEntries/
// syncStandaloneJumpWidgets (deduplicated per-origin jump buttons).
app.registerExtension({
    name: "comfy.NoMessyLinkMixReceive",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== MIX_RECEIVE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this._noMessyLinkHover = false;
            this.resizable = true;
            this.size = [170, 80];
            this.color = RECEIVE_DEFAULT_COLOR;
            this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
            this.shape = LiteGraph.ROUND_SHAPE;
            this.boxcolor = "#4aa3ff";
            while (this.inputs && this.inputs.length > 1) this.removeInput(this.inputs.length - 1);
            while (this.outputs && this.outputs.length > 1) this.removeOutput(this.outputs.length - 1);

            const nameWidget = this.addWidget("text", "Name", "", () => {});
            nameWidget.noMessyLinkRole = "name";

            const jumpWidget = this.addWidget("button", "(not connected)", null, () => {});
            jumpWidget.noMessyLinkRole = "jumpButton";

            // Picking an entry wires it into the current trailing empty
            // slot (always the last one, per growShrinkMultiSlots'
            // invariant) rather than slot 0 — repeated picks progressively
            // fill up slots one at a time, the "mix and match" behavior.
            // Same option format as the merged NoMessyLinkReceive combo:
            // plain Sends, and every connected MultiSend slot individually.
            const connectWidget = this.addWidget("combo", "Connect to Send", "(not connected)", (value) => {
                const match = /\[#(\d+)(?::(\d+))?\]$/.exec(value || "");
                if (!match) return;
                const originNode = findNodeByIdLoose(this.graph, match[1]);
                if (!originNode) return;
                const originSlot = match[2] != null ? Number(match[2]) : 0;
                if (originNode.type !== SEND_TYPE && originNode.type !== MULTI_SEND_TYPE) return;
                const targetSlot = Math.max(0, this.inputs.length - 1);
                originNode.connect(originSlot, this, targetSlot);
            }, { values: [] });
            connectWidget.noMessyLinkRole = "connectCombo";
        };

        // Bug fix (reported 2026-09-16, video evidence Videos_testing/04.mp4):
        // MixReceive never had a paste-connection-memory hook at all — see
        // rememberSlotConnections/reconnectSlotsFromMemory. Run as a
        // MICROTASK, not synchronously and not a setTimeout(0) macrotask —
        // see the identical fix/comment in the original Send/Receive block's
        // onAdded for why both extremes broke. Same configuringGraph/
        // insideNoMessyLinkUnpack guard as the other types (skip entirely
        // during a real workflow load/undo/redo/unpack).
        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function () {
            onAdded?.apply(this, arguments);
            if (app.configuringGraph || insideNoMessyLinkUnpack) return;
            Promise.resolve().then(() => {
                if (!this.graph) return;
                reconnectSlotsFromMemory(this);
            });
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            installNodeMovedHook();
            rememberSlotConnections(this);
            // See the original Send/Receive block's onDrawForeground for
            // why node_over is used instead of a manual box test (collapsed
            // hover fix).
            this._noMessyLinkHover = app.canvas?.node_over === this;
            if (this.flags?.collapsed) return;

            growShrinkMultiSlots(this, selfExpandTarget(this));
            syncMultiSendSlotColors(this);

            // Task 10 (+ follow-up): same dark-red/amber-partial styling as
            // the rest of the family — MixReceive is always standalone/
            // receive-like, so its only non-flagged state is the fixed
            // RECEIVE_DEFAULT color.
            const connState = connectivityState(this);
            if (connState === "none") {
                this.color = NOT_CONNECTED_COLOR;
                this.bgcolor = NOT_CONNECTED_BGCOLOR;
            } else if (connState === "no-input" || connState === "no-output") {
                this.color = PARTIAL_COLOR;
                this.bgcolor = PARTIAL_BGCOLOR;
            } else {
                this.color = RECEIVE_DEFAULT_COLOR;
                this.bgcolor = RECEIVE_DEFAULT_BGCOLOR;
            }

            this.title = `${connectivityPrefix(connState)}MixReceive · ${getBaseNameMulti(this)}`;

            const jumpWidget = this.widgets?.find((w) => w.noMessyLinkRole === "jumpButton");
            syncStandaloneJumpWidgets(this, jumpWidget, gatherUniqueOriginEntries(this));

            const connectWidget = this.widgets?.find((w) => w.noMessyLinkRole === "connectCombo");
            if (connectWidget) {
                const options = [];
                for (const n of this.graph?._nodes || []) {
                    if (n.type === SEND_TYPE) {
                        options.push(`${n.title} [#${n.id}]`);
                    } else if (n.type === MULTI_SEND_TYPE) {
                        (n.inputs || []).forEach((inp, i) => {
                            if (inp.link != null) {
                                const t = n.graph?.links?.[inp.link]?.type || "";
                                options.push(
                                    `${getBaseNameMulti(n)} · ${multiSlotName(i + 1)}${t ? ` (${t})` : ""} [#${n.id}:${i}]`
                                );
                            }
                        });
                    }
                }
                connectWidget.options.values = options;
                connectWidget.value = options.length ? "Pick to connect next slot" : "(not connected)";
            }
        };
    },
});

// Bug fix (reported 2026-09-16, two rounds):
//
// Round 1 diagnosis: the live-follow glue (spawnPairedReceive/
// spawnPairedMultiReceive, see there) used to detach only via a per-frame
// position-drift poll, which left a MultiReceive stuck re-snapping to its
// MultiSend through a deliberate manual drag. First fix attempt patched
// `LGraphCanvas.prototype.onNodeMoved` to detach on drag-end instead of
// polling — had ZERO effect (confirmed via a screen recording, Sid
// 2026-09-16: the node never moved at all, for the entire drag).
//
// Root cause: confirmed by reading the installed ComfyUI frontend bundle
// (`settingStore-*.js`) directly — this canvas class declares
// `onNodeMoved;` as a bare class field in its body (alongside onClear,
// onSelectionChange, etc.), which under standard JS class-field semantics
// initializes it as `undefined` on every INSTANCE at construction time.
// An own instance property always shadows a same-named prototype property,
// so patching `LGraphCanvas.prototype.onNodeMoved` is invisible to any real
// instance — `this.onNodeMoved?.(...)` (called internally by the canvas's
// own `_processDraggedItems`, right after a drag ends) always resolves to
// the instance's own `undefined` field first and short-circuits.
//
// Fix: assign directly to the live canvas INSTANCE (`app.canvas`) instead
// of the prototype. Installed lazily (idempotent, guarded by
// `_noMessyLinkNodeMovedInstalled`) from every node type's own
// onDrawForeground rather than a one-shot `setup()` call, since app.canvas
// is not guaranteed to exist yet the moment any single extension's setup()
// runs — onDrawForeground only starts running once a node actually exists
// on a live canvas, so app.canvas is always available by then.
function installNodeMovedHook() {
    const canvas = app.canvas;
    if (!canvas || canvas._noMessyLinkNodeMovedInstalled) return;
    canvas._noMessyLinkNodeMovedInstalled = true;
    const existing = canvas.onNodeMoved;
    canvas.onNodeMoved = function (node) {
        if (node?._noMessyLinkFollow) {
            node._noMessyLinkFollow = false;
        }
        return existing?.apply(this, arguments);
    };
}

// Bug fix (reported 2026-09-16): hovering a paired MultiSend/MultiReceive
// showed no dashed link at all when the MultiSend's own upstream input has
// no data yet — unlike the plain Send/Receive pair, MultiSend<->MultiReceive
// has no REAL LiteGraph link to hand LGraphCanvas.prototype.renderLink until
// a slot actually carries data (syncMultiReceiveSlots only wires per-slot
// once the corresponding MultiSend input is filled — intentional Task 6
// design, not touched here). Resolved via AskUserQuestion 2026-09-16: draw
// one generic dashed line directly between the two nodes whenever they're
// paired (via pairedMultiSendId) and either is hovered, same visual style
// as a real link — but only while there's no real per-slot link between
// them yet (once one exists, the existing per-slot rendering already shows
// it, so this generic line would be redundant clutter).
//
// Implemented as a canvas-level overlay (`onDrawForeground` on the CANVAS,
// not a node) rather than trying to synthesize a fake LiteGraph link object
// for the existing per-link renderLink hook — same instance-field shadowing
// concern as installNodeMovedHook above applies here too (assigned directly
// on the live canvas instance, guarded so it only installs once).
function hasAnyRealLinkBetween(sendNode, receiveNode) {
    return (sendNode.outputs || []).some((out) =>
        (out.links || []).some((linkId) => {
            const link = sendNode.graph?.links?.[linkId];
            return link && link.target_id === receiveNode.id;
        })
    );
}

function drawMultiPairingLines(canvas, ctx) {
    const graph = canvas.graph;
    if (!graph) return;
    for (const receiveNode of graph._nodes || []) {
        if (receiveNode.type !== MULTI_RECEIVE_TYPE) continue;
        const sendNode = findNodeByIdLoose(graph, receiveNode.properties?.pairedMultiSendId);
        if (sendNode?.type !== MULTI_SEND_TYPE) continue;
        if (hasAnyRealLinkBetween(sendNode, receiveNode)) continue;
        const hovered = sendNode._noMessyLinkHover || receiveNode._noMessyLinkHover;
        if (!hovered) continue;
        const a = sendNode.getConnectionPos?.(false, 0);
        const b = receiveNode.getConnectionPos?.(true, 0);
        if (!a || !b) continue;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#AAA";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.restore();
    }
}

function installMultiPairingOverlayHook() {
    const canvas = app.canvas;
    if (!canvas || canvas._noMessyLinkOverlayInstalled) return;
    canvas._noMessyLinkOverlayInstalled = true;
    const existing = canvas.onDrawForeground;
    canvas.onDrawForeground = function (ctx, visible_area) {
        existing?.call(this, ctx, visible_area);
        drawMultiPairingLines(this, ctx);
    };
}

// Suppress the default rendering of a link whose two endpoints are a
// paired NoMessyLinkSend -> NoMessyLinkReceive, unless either endpoint is
// currently hovered — in which case draw it as a dashed line instead of
// the normal noodle style.
const origRenderLink = LGraphCanvas.prototype.renderLink;
LGraphCanvas.prototype.renderLink = function (ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
    if (link) {
        const graph = this.graph;
        const originNode = graph?.getNodeById(link.origin_id);
        const targetNode = graph?.getNodeById(link.target_id);
        if (originNode?.type === SEND_TYPE && targetNode?.type === RECEIVE_TYPE) {
            const hovered = originNode._noMessyLinkHover || targetNode._noMessyLinkHover;
            if (!hovered) {
                return;
            }
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = color || "#AAA";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Task 6 — same hide/dash-on-hover treatment for the multi-slot
        // family's link pairs: MultiSend->MultiReceive (per slot) and
        // MultiSend->Receive (one picked slot, since the Task 6 merge).
        // Kept as a second, separate check rather than folded into the
        // block above, which is left exactly as it was for the plain
        // Send->Receive pair.
        const originIsSendLike = originNode?.type === SEND_TYPE || originNode?.type === MULTI_SEND_TYPE;
        const targetIsReceiveLike =
            targetNode?.type === RECEIVE_TYPE ||
            targetNode?.type === MULTI_RECEIVE_TYPE ||
            targetNode?.type === MIX_RECEIVE_TYPE;
        if (originIsSendLike && targetIsReceiveLike) {
            const hovered = originNode._noMessyLinkHover || targetNode._noMessyLinkHover;
            if (!hovered) {
                return;
            }
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = color || "#AAA";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Task 8 — a link wired straight into a NoMessyLinkReceive,
        // NoMessyLinkMultiReceive, or NoMessyLinkMixReceive slot from an
        // ordinary node (not a NoMessyLinkSend/NoMessyLinkMultiSend) gets the
        // same hide/dash-on-hover treatment. Origin can be any node type
        // here, so it never got a cached `_noMessyLinkHover` flag (only our
        // own node types set that, inside their own onDrawForeground) —
        // use `this.node_over` (this === the canvas) directly instead.
        if (targetIsReceiveLike) {
            const hovered = this.node_over === originNode || this.node_over === targetNode;
            if (!hovered) {
                return;
            }
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = color || "#AAA";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            ctx.restore();
            return;
        }
    }
    return origRenderLink.apply(this, arguments);
};

// Bug fix (reported 2026-09-15, all node types): ComfyUI's "Convert to
// Subgraph" splits the selection's boundary links through the new subgraph
// container node instead of leaving them direct. If only one side of a
// no-messy-link pair was in the selection, the direct Send<->Receive (or
// MultiSend<->MultiReceive) link stops existing at all — it becomes
// Container<->the-node-left-outside — so every pairing lookup in this file
// (getPairedSend, getPairedReceives, getInputOrigin, the
// pairedMultiSendId-driven mirror) reads "(not connected)" even though data
// may still reach the other side through the container's proxy socket.
// Fix: wrap LGraph.prototype.convertToSubgraph (same runtime-patch
// technique as the renderLink wrap above, never a core file edit) to
// auto-add each no-messy-link node's direct paired partner(s) into the
// selection before conversion runs, so a pair can never end up split across
// the boundary in the first place. Only the immediate partner(s) are added
// (e.g. a MultiSend pulls in every Receive/MultiReceive currently wired to
// it, not further hops) — enough to keep any one pair intact.
function collectNoMessyLinkPartners(node) {
    const partners = [];
    if (node.type === SEND_TYPE) {
        partners.push(...getPairedReceives(node));
    } else if (node.type === RECEIVE_TYPE) {
        // getPairedSend just resolves the origin node id — works whether
        // that origin is a plain Send or (since the Task 6 merge) a
        // MultiSend, no branching needed.
        const send = getPairedSend(node);
        if (send) partners.push(send);
    } else if (node.type === MULTI_SEND_TYPE) {
        getMultiSendDownstream(node).forEach((d) => partners.push(d.target));
    } else if (node.type === MULTI_RECEIVE_TYPE) {
        const send = findNodeByIdLoose(node.graph, node.properties?.pairedMultiSendId);
        if (send?.type === MULTI_SEND_TYPE) partners.push(send);
    } else if (node.type === MIX_RECEIVE_TYPE) {
        gatherUniqueOriginEntries(node).forEach((e) => partners.push(e.node));
    }
    return partners;
}

const origConvertToSubgraph = LGraph.prototype.convertToSubgraph;
LGraph.prototype.convertToSubgraph = function (selectedItems) {
    if (selectedItems && typeof selectedItems.add === "function") {
        for (const item of [...selectedItems]) {
            if (!item || typeof item.type !== "string") continue;
            for (const partner of collectNoMessyLinkPartners(item)) {
                selectedItems.add(partner);
            }
        }
    }
    return origConvertToSubgraph.call(this, selectedItems);
};

// Bug fix (reported 2026-09-15): unpacking a subgraph (exploding it back
// into individual nodes) created a stray extra Receive/MultiReceive
// alongside the real, correctly-restored one. Root cause, confirmed by
// reading _unpackSubgraphImpl in the installed ComfyUI frontend bundle:
// unpack calls per-node `t.configure(e)` for each unpacked node, never
// `graph.configure()` — so unlike a real load or a subgraph CONVERSION
// (both wrapped by app.configuringGraph via a patch on
// LGraph.prototype.configure), app.configuringGraph never becomes true
// during unpack, even though unpack does its own correct, synchronous
// internal-link restoration afterward. That leaves our onAdded auto-spawn
// hooks (below) unguarded for this specific bulk-add case — same family of
// bug as BF-06/BF-08, a new trigger for it. Fix: wrap
// LGraph.prototype.unpackSubgraph the same way as convertToSubgraph above,
// with our own flag, and check that flag alongside app.configuringGraph.
let insideNoMessyLinkUnpack = false;
const origUnpackSubgraph = LGraph.prototype.unpackSubgraph;
LGraph.prototype.unpackSubgraph = function (...args) {
    insideNoMessyLinkUnpack = true;
    try {
        return origUnpackSubgraph.apply(this, args);
    } finally {
        insideNoMessyLinkUnpack = false;
    }
};
