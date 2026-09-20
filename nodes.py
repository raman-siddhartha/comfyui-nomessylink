"""Python node classes for the No Messy Link connector pair.

Both nodes are plain passthrough nodes (same behavior as ComfyUI's built-in
Reroute node) — value in, value out, unchanged. The "hidden until hover" link
behavior and the jump-to-paired-node button are implemented entirely on the
frontend, in web/no_messy_link.js. Keeping this side a pure passthrough means
ComfyUI's own graph engine handles execution order and workflow-JSON
serialization automatically — no custom variable-store plumbing needed.
"""


class AnyType(str):
    """A wildcard type that compares equal to any other type string, so the
    Send/Receive sockets accept and emit any ComfyUI data type (IMAGE,
    LATENT, MODEL, CONDITIONING, etc.) — the same trick ComfyUI's own
    Reroute node and community Set/Get nodes use."""

    def __eq__(self, _other):
        return True

    def __ne__(self, _other):
        return False


any_type = AnyType("*")


class SideeNoMessyLinkSend:
    """Feeds a value into a hidden connection. Pair with a
    SideeNoMessyLinkReceive node; the link between them is drawn only while
    one of the pair is hovered on the canvas (see web/no_messy_link.js)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": (any_type,)}}

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "passthrough"
    CATEGORY = "utils/no_messy_link"

    def passthrough(self, value):
        return (value,)


class SideeNoMessyLinkReceive:
    """Outputs the value fed into the paired SideeNoMessyLinkSend node. See
    SideeNoMessyLinkSend for the pairing behavior."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": (any_type,)}}

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "passthrough"
    CATEGORY = "utils/no_messy_link"

    def passthrough(self, value):
        return (value,)


# Task 6 — multi-slot Send/Receive pair. Each node carries up to
# MULTI_MAX_SLOTS independent value slots (value_1..value_N), each its own
# hidden link with its own type — not a fan-out of one value. Python's
# RETURN_TYPES/INPUT_TYPES can't grow per-instance, so a static cap is
# declared here; the frontend (web/no_messy_link.js) only shows/wires however
# many slots are actually in use, growing/shrinking the visible sockets
# Reroute-style. All declared slots are "optional" so unconnected ones are
# simply omitted from **kwargs at execution time.
MULTI_MAX_SLOTS = 20


def _multi_slot_name(i):
    return f"value_{i}"


class SideeNoMessyLinkMultiSend:
    """Feeds up to MULTI_MAX_SLOTS distinct values into hidden connections,
    one per slot. Pair with SideeNoMessyLinkMultiReceive (mirrors every
    connected slot) or SideeNoMessyLinkReceive (picks one slot — see
    web/no_messy_link.js)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {_multi_slot_name(i): (any_type,) for i in range(1, MULTI_MAX_SLOTS + 1)}}

    RETURN_TYPES = tuple(any_type for _ in range(MULTI_MAX_SLOTS))
    RETURN_NAMES = tuple(_multi_slot_name(i) for i in range(1, MULTI_MAX_SLOTS + 1))
    FUNCTION = "passthrough"
    CATEGORY = "utils/no_messy_link"

    def passthrough(self, **kwargs):
        return tuple(kwargs.get(_multi_slot_name(i)) for i in range(1, MULTI_MAX_SLOTS + 1))


class SideeNoMessyLinkMultiReceive:
    """Mirrors every currently-connected slot of its paired
    SideeNoMessyLinkMultiSend. See SideeNoMessyLinkMultiSend for slot
    behavior."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {_multi_slot_name(i): (any_type,) for i in range(1, MULTI_MAX_SLOTS + 1)}}

    RETURN_TYPES = tuple(any_type for _ in range(MULTI_MAX_SLOTS))
    RETURN_NAMES = tuple(_multi_slot_name(i) for i in range(1, MULTI_MAX_SLOTS + 1))
    FUNCTION = "passthrough"
    CATEGORY = "utils/no_messy_link"

    def passthrough(self, **kwargs):
        return tuple(kwargs.get(_multi_slot_name(i)) for i in range(1, MULTI_MAX_SLOTS + 1))


class SideeNoMessyLinkMixReceive:
    """Task 7 — auto-expanding value slots like SideeNoMessyLinkMultiReceive,
    but each slot is wired independently (potentially to a different source
    each — a plain SideeNoMessyLinkSend or one specific
    SideeNoMessyLinkMultiSend slot) instead of mirroring one single
    MultiSend. Always added standalone, no pairing/auto-spawn. See
    web/no_messy_link.js for the slot behavior."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {_multi_slot_name(i): (any_type,) for i in range(1, MULTI_MAX_SLOTS + 1)}}

    RETURN_TYPES = tuple(any_type for _ in range(MULTI_MAX_SLOTS))
    RETURN_NAMES = tuple(_multi_slot_name(i) for i in range(1, MULTI_MAX_SLOTS + 1))
    FUNCTION = "passthrough"
    CATEGORY = "utils/no_messy_link"

    def passthrough(self, **kwargs):
        return tuple(kwargs.get(_multi_slot_name(i)) for i in range(1, MULTI_MAX_SLOTS + 1))


NODE_CLASS_MAPPINGS = {
    "sidee_no_messy_link_send": SideeNoMessyLinkSend,
    "sidee_no_messy_link_receive": SideeNoMessyLinkReceive,
    "sidee_no_messy_link_multi_send": SideeNoMessyLinkMultiSend,
    "sidee_no_messy_link_multi_receive": SideeNoMessyLinkMultiReceive,
    "sidee_no_messy_link_mix_receive": SideeNoMessyLinkMixReceive,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "sidee_no_messy_link_send": "Sidee: No Messy Link (Send)",
    "sidee_no_messy_link_receive": "Sidee: No Messy Link (Receive)",
    "sidee_no_messy_link_multi_send": "Sidee: No Messy Link (MultiSend)",
    "sidee_no_messy_link_multi_receive": "Sidee: No Messy Link (MultiReceive)",
    "sidee_no_messy_link_mix_receive": "Sidee: No Messy Link (MixReceive)",
}
