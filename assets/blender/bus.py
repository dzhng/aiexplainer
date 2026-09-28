"""Chapter 11's bus: a double-decker whose seats fill as the batch grows, with a roof rack
that carries the weight crates on every trip. Blender units are metres, +Z up; the bus runs
along X and its window side faces −Y (glTF +Z, toward the default camera).

Named nodes: bus.body, bus.trim, bus.frame, bus.glass, bus.wheels, bus.hubs, bus.rack, bus.seat.0 …
bus.seat.15 (lower deck
0–7 from the rear, upper deck 8–15). The scene seats a rider on each seat's cushion, reading
the cushion from the seat node's bounds (its lowest `CUSHION` metres). Materials are named
after look presets, so the renderer binds them by name.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import common  # noqa: E402

args = common.parse_args()
common.empty_scene()

paint = common.material("steel", (0.012, 0.016, 0.03), metallic=0.4, roughness=0.5)
metal = common.material("metal", (0.05, 0.06, 0.13), metallic=0.9, roughness=0.3)
trim = common.material("trim", (0.4, 0.42, 0.45), metallic=1.0, roughness=0.3)
steel = paint  # the tyres share the body's dark steel
glass = common.material("glass", (0.2, 0.3, 0.5), roughness=0.05)

LEN, WID = 3.8, 1.2
FRONT = -WID / 2  # the window side, on −Y
WHEEL_R = 0.26
BOTTOM = 0.2
ROOF = 2.07
# Deck bands: the solid skirt, belt and roof, with a window band above each deck's cushions.
SKIRT_TOP = 0.55
BELT = (1.12, 1.38)
ROOF_BASE = 1.95
END = 0.09  # the end caps' thickness
SEATS_PER_DECK = 8
INNER = LEN - 2 * END - 0.2
PITCH = INNER / SEATS_PER_DECK
SEAT_W, SEAT_D = 0.3, 0.34
CUSHION = 0.06
DECK_CUSHION = {0: SKIRT_TOP - 0.05, 1: BELT[1] - 0.05}  # cushion bottoms, just below each band

# Body: skirt, belt and roof; end caps. Both long sides are windows above the skirt and
# belt, so the seats read from either side.
body = [
    common.box("skirt", (LEN, WID, SKIRT_TOP - BOTTOM), (0, 0, (BOTTOM + SKIRT_TOP) / 2), paint, bevel=0.03, segments=3),
    common.box("belt", (LEN, WID, BELT[1] - BELT[0]), (0, 0, sum(BELT) / 2), paint, bevel=0.02),
    common.box("roof", (LEN, WID, ROOF - ROOF_BASE), (0, 0, (ROOF_BASE + ROOF) / 2), paint, bevel=0.04, segments=3),
]
for side in (-1, 1):
    body.append(
        common.box("cap", (END, WID, ROOF - BOTTOM), (side * (LEN / 2 - END / 2), 0, (BOTTOM + ROOF) / 2), paint, bevel=0.03, segments=3)
    )
common.join("bus.body", body)

# Trim: a bright line under each window band, the windscreen frame and
# the lamps on the front cap (+X), so the long box reads as a bus. Each stands 2 mm proud.
lines = []
for z in (SKIRT_TOP - 0.02, BELT[1] - 0.02):
    for y in (FRONT - 0.011, -FRONT + 0.011):
        lines.append(common.box("line", (LEN - 0.12, 0.02, 0.025), (0, y, z), trim, bevel=0.006))
NOSE = LEN / 2 + 0.011
for z0, z1 in [(SKIRT_TOP, BELT[0]), (BELT[1], ROOF_BASE)]:
    for y in (-(WID / 2 - 0.08), WID / 2 - 0.08):
        lines.append(common.box("frame", (0.02, 0.03, z1 - z0), (NOSE, y, (z0 + z1) / 2), trim))
    for z in (z0, z1):
        lines.append(common.box("frame", (0.02, WID - 0.16, 0.03), (NOSE, 0, z), trim))
for y in (-(WID / 2 - 0.2), WID / 2 - 0.2):
    lines.append(common.box("lamp", (0.03, 0.16, 0.08), (NOSE + 0.005, y, BOTTOM + 0.2), trim, bevel=0.01))
    lines.append(common.box("taillamp", (0.03, 0.12, 0.16), (-NOSE - 0.005, y, BOTTOM + 0.24), trim, bevel=0.01))
lines.append(common.box("rearwindow", (0.02, WID - 0.3, ROOF_BASE - BELT[1] - 0.12), (-NOSE, 0, (BELT[1] + ROOF_BASE) / 2), trim))
lines.append(common.box("grille", (0.02, 0.5, 0.1), (NOSE, 0, BOTTOM + 0.2), trim))
common.join("bus.trim", lines)

# Window pillars between the seats, on both decks and both sides, painted like the body.
pillars = []
for z0, z1 in [(SKIRT_TOP, BELT[0]), (BELT[1], ROOF_BASE)]:
    for i in range(SEATS_PER_DECK + 1):
        x = -INNER / 2 + i * PITCH
        for y in (FRONT + 0.02, -FRONT - 0.02):
            pillars.append(common.box("pillar", (0.028, 0.05, z1 - z0), (x, y, (z0 + z1) / 2), paint, bevel=0.006))
common.join("bus.frame", pillars)

# Glass: a pane over each deck's window band, and the windscreen on the front cap (+X).
panes = []
for z0, z1 in [(SKIRT_TOP, BELT[0]), (BELT[1], ROOF_BASE)]:
    for y in (FRONT + 0.03, -FRONT - 0.03):
        panes.append(common.box("pane", (INNER + 0.1, 0.02, z1 - z0), (0, y, (z0 + z1) / 2), glass))
for z0, z1 in [(SKIRT_TOP, BELT[0]), (BELT[1], ROOF_BASE)]:
    panes.append(common.box("screen", (0.02, WID - 0.2, z1 - z0 - 0.08), (LEN / 2 + 0.005, 0, (z0 + z1) / 2), glass))
common.join("bus.glass", panes)

# Wheels: four tyres with hubs, axles along Y.
wheels, hubs = [], []
for x in (-LEN / 2 + 0.7, LEN / 2 - 0.75):
    for side in (-1, 1):
        y = side * (WID / 2 - 0.08)
        wheels.append(common.cylinder("tyre", WHEEL_R, 0.2, (x, y, WHEEL_R), steel, rotation=(math.pi / 2, 0, 0), vertices=24))
        hubs.append(common.cylinder("hub", WHEEL_R * 0.5, 0.22, (x, y, WHEEL_R), trim, rotation=(math.pi / 2, 0, 0), vertices=16))
common.join("bus.wheels", wheels)
common.join("bus.hubs", hubs)  # one material per node: the scene splits the prop by node

# Roof rack: two rails on posts, with cross bars, where the weight crates ride.
RACK_Z = ROOF + 0.1
rack = []
for side in (-1, 1):
    y = side * (WID / 2 - 0.12)
    rack.append(common.box("rail", (LEN - 0.3, 0.035, 0.035), (0, y, RACK_Z), metal, bevel=0.008))
    for x in (-LEN / 2 + 0.25, 0, LEN / 2 - 0.25):
        rack.append(common.box("post", (0.035, 0.035, RACK_Z - ROOF), (x, y, (ROOF + RACK_Z) / 2), metal))
for x in (-LEN / 2 + 0.25, -0.6, 0.6, LEN / 2 - 0.25):
    rack.append(common.box("bar", (0.04, WID - 0.24, 0.025), (x, 0, RACK_Z - 0.01), metal))
common.join("bus.rack", rack)

# Seats: a cushion and a backrest, facing the windows, eight per deck, rear to front.
for deck in (0, 1):
    for i in range(SEATS_PER_DECK):
        x = -INNER / 2 + (i + 0.5) * PITCH
        z = DECK_CUSHION[deck]
        y = 0.05
        cushion = common.box("cushion", (SEAT_W, SEAT_D, CUSHION), (x, y, z + CUSHION / 2), metal, bevel=0.012)
        back = common.box("backrest", (SEAT_W, 0.05, 0.36), (x, y + SEAT_D / 2 - 0.025, z + CUSHION + 0.18), metal, bevel=0.012)
        common.join(f"bus.seat.{deck * SEATS_PER_DECK + i}", [cushion, back])

common.export(args.out, draco=args.draco)
