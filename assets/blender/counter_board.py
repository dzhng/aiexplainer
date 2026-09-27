"""Chapter 0's autocomplete counter board: a tally board standing on two posts, with a
header plate, ten count-bar slots with tick marks, and a word-card rail. Blender units are
metres, +Z up, and the face looks toward −Y (glTF +Z, toward the default camera).

Named nodes: board.housing, board.stand, board.slot.0 … board.slot.9, board.rail.
Materials are named after look presets, so the renderer can bind them by name.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import common  # noqa: E402

args = common.parse_args()
common.empty_scene()

housing = common.material("housing", (0.02, 0.03, 0.06), metallic=0.6, roughness=0.45)
metal = common.material("metal", (0.05, 0.06, 0.13), metallic=0.9, roughness=0.3)

PANEL_W, PANEL_D, PANEL_H = 3.4, 0.12, 1.7
PANEL_BOTTOM = 0.5
PANEL_Z = PANEL_BOTTOM + PANEL_H / 2
FRONT = -PANEL_D / 2  # the panel face, on −Y

SLOTS = 10
SLOT_PITCH = 0.3
SLOT_W, SLOT_D, SLOT_H = 0.2, 0.07, 1.0
SLOT_BOTTOM = 0.86
WALL = 0.018
TICKS = 5

# Housing: the panel, a raised bezel, a header plate for the board's title, and tick marks
# beside every slot so each channel reads as a gauge.
housing_parts = [
    common.box("panel", (PANEL_W, PANEL_D, PANEL_H), (0, 0, PANEL_Z), housing, bevel=0.03, segments=3)
]
for name, size, loc in [
    ("top", (PANEL_W, 0.04, 0.07), (0, FRONT - 0.02, PANEL_BOTTOM + PANEL_H - 0.035)),
    ("bottom", (PANEL_W, 0.04, 0.07), (0, FRONT - 0.02, PANEL_BOTTOM + 0.035)),
    ("left", (0.07, 0.04, PANEL_H), (-PANEL_W / 2 + 0.035, FRONT - 0.02, PANEL_Z)),
    ("right", (0.07, 0.04, PANEL_H), (PANEL_W / 2 - 0.035, FRONT - 0.02, PANEL_Z)),
    ("header", (PANEL_W * 0.62, 0.035, 0.2), (0, FRONT - 0.0175, SLOT_BOTTOM + SLOT_H + 0.2)),
]:
    housing_parts.append(common.box(f"bezel.{name}", size, loc, housing, bevel=0.01))
for i in range(SLOTS):
    x = (i - (SLOTS - 1) / 2) * SLOT_PITCH - SLOT_W / 2 - 0.028
    for k in range(TICKS + 1):
        z = SLOT_BOTTOM + WALL + k * (SLOT_H - WALL) / TICKS
        width = 0.035 if k % TICKS == 0 else 0.022
        housing_parts.append(common.box(f"tick.{i}.{k}", (width, 0.012, 0.01), (x, FRONT - 0.006, z), housing))
common.join("board.housing", housing_parts)

# Stand: two posts with feet, tied by a low crossbar behind the panel.
POST = 0.11
POST_H = PANEL_BOTTOM + PANEL_H + 0.08
stand_parts = [
    common.box("crossbar", (PANEL_W, 0.06, 0.08), (0, 0.1, 0.3), metal, bevel=0.015),
]
for side in (-1, 1):
    x = side * (PANEL_W / 2 + POST / 2)
    stand_parts.append(common.box("post", (POST, POST, POST_H), (x, 0, POST_H / 2), metal, bevel=0.02, segments=3))
    stand_parts.append(common.box("foot", (0.2, 0.75, 0.07), (x, 0.02, 0.035), metal, bevel=0.02, segments=3))
common.join("board.stand", stand_parts)

# Ten count-bar slots: open-fronted channels standing proud of the panel face.
for i in range(SLOTS):
    x = (i - (SLOTS - 1) / 2) * SLOT_PITCH
    y = FRONT - SLOT_D / 2
    z = SLOT_BOTTOM + SLOT_H / 2
    back = common.box("back", (SLOT_W, WALL, SLOT_H), (x, FRONT - WALL / 2, z), metal)
    left = common.box("left", (WALL, SLOT_D, SLOT_H), (x - SLOT_W / 2 + WALL / 2, y, z), metal, bevel=0.006)
    right = common.box("right", (WALL, SLOT_D, SLOT_H), (x + SLOT_W / 2 - WALL / 2, y, z), metal, bevel=0.006)
    floor = common.box("floor", (SLOT_W, SLOT_D, WALL), (x, y, SLOT_BOTTOM + WALL / 2), metal, bevel=0.006)
    common.join(f"board.slot.{i}", [back, left, right, floor])

# Word-card rail: a shelf with a front lip and end stops, below the slots.
RAIL_Z = 0.68
RAIL_W = PANEL_W - 0.4
rail_parts = [
    common.box("shelf", (RAIL_W, 0.16, 0.035), (0, FRONT - 0.08, RAIL_Z), metal, bevel=0.01),
    common.box("lip", (RAIL_W, 0.02, 0.07), (0, FRONT - 0.15, RAIL_Z + 0.035), metal, bevel=0.008),
]
for side in (-1, 1):
    rail_parts.append(
        common.box("stop", (0.03, 0.16, 0.12), (side * (RAIL_W / 2 - 0.015), FRONT - 0.08, RAIL_Z + 0.06), metal, bevel=0.008)
    )
common.join("board.rail", rail_parts)

common.export(args.out, draco=args.draco)
