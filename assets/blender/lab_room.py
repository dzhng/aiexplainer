"""The room every chapter's machine stands in: a small research lab at night.

Blender units are metres, +Z up; the camera looks from −Y toward +Y (glTF +Z toward −Z), and
the subject stands at the origin on the floor. The room is 18 m wide (x ±9), 16 m deep
(y −11…+5) and 5.2 m tall, so orbiting keeps the camera inside it.

- a tiled concrete floor with seams;
- a back wall of bolted panels over a darker backing, with conduit and a strip light;
- a large window on the back wall, right of centre, showing a dim night skyline (sky card,
  distant dark buildings, lit windows) through glass;
- a workbench with equipment under a pendant lamp (right), shelving (left);
- wall strip lights either side of the window, and ceiling strip lights.

The renderer has no shadows and no local lights, so the bake carries them: vertex
colours (glTF COLOR_0) hold ambient occlusion (R) and where the pendant's warm light (G)
and the strips' and window's cool light (B) fall. The look sets their colours and strengths.
Node and material names follow the look's material presets.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

import common  # noqa: E402

args = common.parse_args()
common.empty_scene()

floor = common.material("floor", (0.012, 0.014, 0.022), roughness=0.85)
seam = common.material("seam", (0.004, 0.005, 0.008), roughness=0.9)
silhouette = common.material("silhouette", (0.002, 0.003, 0.006), roughness=1.0)
wall = common.material("wall", (0.02, 0.025, 0.045), metallic=0.3, roughness=0.6)
housing = common.material("steel", (0.012, 0.016, 0.03), metallic=0.4, roughness=0.5)
metal = common.material("trim", (0.4, 0.42, 0.45), metallic=1.0, roughness=0.3)
glass = common.material("glass", (0.2, 0.3, 0.5), roughness=0.05)
sky = common.material("sky", (0.01, 0.015, 0.04), emission=(0.02, 0.03, 0.08), strength=1.0)
city = common.material("city", (0.5, 0.35, 0.1), emission=(1.0, 0.6, 0.25), strength=1.0)
lamp = common.material("lamp", (1.0, 0.7, 0.4), emission=(1.0, 0.7, 0.4), strength=4.0)
practical = common.material("practical", (0.6, 0.7, 1.0), emission=(0.6, 0.7, 1.0), strength=3.0)

X0, X1 = -9.0, 9.0
Y0, Y1 = -11.0, 5.0
HEIGHT = 5.2
WINDOW = {"x0": 0.0, "x1": 5.0, "z0": 1.5, "z1": 4.2}

# Floor: 2 m slabs with 4 cm seams over a dark base.
tiles = []
for i in range(9):
    for j in range(8):
        x = X0 + 1 + 2 * i
        y = Y0 + 1 + 2 * j
        tiles.append(common.grid("tile", (1.96, 1.96), (x, y, 0), floor, cuts=6))
common.join("room.floor", tiles)
common.join("room.gaps", [common.grid("gaps", (X1 - X0, Y1 - Y0), (0, (Y0 + Y1) / 2, -0.03), seam, cuts=4)])

# Back wall: a darker backing with a hole for the window, then bolted panels.
backing = [
    common.grid("b0", (WINDOW["x0"] - X0, HEIGHT), ((X0 + WINDOW["x0"]) / 2, Y1 + 0.05, HEIGHT / 2), housing, 12, (1.5708, 0, 0)),
    common.grid("b1", (X1 - WINDOW["x1"], HEIGHT), ((WINDOW["x1"] + X1) / 2, Y1 + 0.05, HEIGHT / 2), housing, 6, (1.5708, 0, 0)),
    common.grid("b2", (WINDOW["x1"] - WINDOW["x0"], WINDOW["z0"]), ((WINDOW["x0"] + WINDOW["x1"]) / 2, Y1 + 0.05, WINDOW["z0"] / 2), housing, 4, (1.5708, 0, 0)),
    common.grid("b3", (WINDOW["x1"] - WINDOW["x0"], HEIGHT - WINDOW["z1"]), ((WINDOW["x0"] + WINDOW["x1"]) / 2, Y1 + 0.05, (HEIGHT + WINDOW["z1"]) / 2), housing, 4, (1.5708, 0, 0)),
]
common.join("room.backing", backing)

panels = []
bolts = []
for col in range(9):
    x = X0 + 1 + 2 * col
    for z0, z1 in ((0.15, 2.3), (2.45, 4.55)):
        clear = x + 0.9 < WINDOW["x0"] or x - 0.9 > WINDOW["x1"]
        if not clear:
            continue
        zc = (z0 + z1) / 2
        panels.append(common.subdivide(common.box("panel", (1.86, 0.06, z1 - z0), (x, Y1 - 0.03, zc), wall, bevel=0.01), 2))
        for bx in (x - 0.85, x + 0.85):
            for bz in (z0 + 0.07, z1 - 0.07):
                bolts.append(common.cylinder("bolt", 0.022, 0.03, (bx, Y1 - 0.07, bz), metal, (1.5708, 0, 0), 8))
common.join("room.wall", panels)
common.join("room.bolts", bolts)

# Side walls and ceiling: plain panels.
side = []
for x, rot in ((X0, (1.5708, 0, 1.5708)), (X1, (1.5708, 0, -1.5708))):
    for j in range(8):
        y = Y0 + 1 + 2 * j
        side.append(common.grid("side", (1.96, HEIGHT - 0.1), (x, y, HEIGHT / 2), wall, 6, rot))
side.append(common.grid("ceiling", (X1 - X0, Y1 - Y0), (0, (Y0 + Y1) / 2, HEIGHT), housing, 16, (3.14159, 0, 0)))
side.append(common.grid("front", (X1 - X0, HEIGHT), (0, Y0, HEIGHT / 2), housing, 8, (-1.5708, 0, 0)))
common.join("room.walls", side)

# Conduit along the top of the back wall, and a drop to a junction box.
conduit = [
    common.cylinder("c0", 0.05, X1 - X0, (0, Y1 - 0.12, 4.9), metal, (0, 1.5708, 0)),
    common.cylinder("c1", 0.035, X1 - X0, (0, Y1 - 0.12, 4.75), metal, (0, 1.5708, 0)),
    common.cylinder("c2", 0.035, 4.4, (-6.6, Y1 - 0.12, 2.55), metal),
    common.box("junction", (0.35, 0.14, 0.45), (-6.6, Y1 - 0.14, 0.6), metal, bevel=0.02),
]
common.join("room.conduit", conduit)
STRIPS = [(-4.6, 7.8), (7.0, 3.4)]  # centre x and length, either side of the window
common.join("room.strip.housing", [common.box("sh", (n + 0.2, 0.14, 0.1), (x, Y1 - 0.16, 4.45), metal, bevel=0.01) for x, n in STRIPS])
common.join("room.strip", [common.box("strip", (n, 0.03, 0.04), (x, Y1 - 0.24, 4.43), practical) for x, n in STRIPS])

# The window: frame, mullions, glass, and the night outside.
w = WINDOW
frame = [
    common.box("top", (w["x1"] - w["x0"] + 0.2, 0.2, 0.1), ((w["x0"] + w["x1"]) / 2, Y1, w["z1"] + 0.05), metal),
    common.box("sill", (w["x1"] - w["x0"] + 0.3, 0.3, 0.08), ((w["x0"] + w["x1"]) / 2, Y1 - 0.05, w["z0"] - 0.04), metal),
    common.box("left", (0.1, 0.2, w["z1"] - w["z0"]), (w["x0"] - 0.05, Y1, (w["z0"] + w["z1"]) / 2), metal),
    common.box("right", (0.1, 0.2, w["z1"] - w["z0"]), (w["x1"] + 0.05, Y1, (w["z0"] + w["z1"]) / 2), metal),
    common.box("m0", (0.06, 0.12, w["z1"] - w["z0"]), (1.67, Y1, (w["z0"] + w["z1"]) / 2), metal),
    common.box("m1", (0.06, 0.12, w["z1"] - w["z0"]), (3.33, Y1, (w["z0"] + w["z1"]) / 2), metal),
    common.box("m2", (w["x1"] - w["x0"], 0.12, 0.06), ((w["x0"] + w["x1"]) / 2, Y1, 2.9), metal),
]
common.join("room.window.frame", frame)
common.join("room.window.glass", [common.grid("glass", (w["x1"] - w["x0"], w["z1"] - w["z0"]), ((w["x0"] + w["x1"]) / 2, Y1 + 0.02, (w["z0"] + w["z1"]) / 2), glass, 2, (1.5708, 0, 0))])
common.join("room.sky", [common.grid("sky", (220, 90), (2.5, 95, 25), sky, 4, (1.5708, 0, 0))])

# A distant skyline, 45–110 m out so it sits far behind the glass: narrow dark blocks with a
# scattering of lit windows facing the lab. Deterministic (no random module).
buildings = []
lights = []
for i in range(28):
    bx = -72 + i * 5.6 + ((i * 37) % 5) - 2
    by = 45 + (i * 53) % 65
    bw = 3 + (i * 29) % 5
    bh = 3 + (i * 71) % 12
    buildings.append(common.box("block", (bw, 4, bh), (bx, by, bh / 2 - 2.0), silhouette))
    # Windows on a floor grid (1.2 m bays, 1.5 m storeys); a hash picks the few still lit.
    for col in range(int((bw - 0.6) / 1.2)):
        for row in range(int((bh - 1.0) / 1.5)):
            if (i * 131 + col * 71 + row * 37) % 7 != 0:
                continue
            lx = bx - bw / 2 + 0.9 + col * 1.2
            lz = -1.2 + row * 1.5
            lights.append(common.box("lit", (0.7, 0.05, 0.5), (lx, by - 2.03, lz), city))
common.join("room.skyline", buildings)
common.join("room.city", lights)

# The workbench under a pendant lamp, with equipment.
BX, BY = 5.4, 1.6
bench = [common.box("top", (2.6, 0.9, 0.06), (BX, BY, 0.92), housing, bevel=0.01)]
for dx in (-1.2, 1.2):
    for dy in (-0.38, 0.38):
        bench.append(common.box("leg", (0.06, 0.06, 0.9), (BX + dx, BY + dy, 0.45), metal))
bench.append(common.box("shelf", (2.4, 0.8, 0.03), (BX, BY, 0.25), housing))
common.join("room.bench", [common.subdivide(b, 1) for b in bench])
gear = [
    common.box("scope", (0.55, 0.42, 0.34), (BX - 0.6, BY + 0.1, 1.12), housing, bevel=0.02),
    common.box("psu", (0.4, 0.35, 0.18), (BX + 0.35, BY + 0.15, 1.04), housing, bevel=0.015),
    common.box("crate", (0.6, 0.5, 0.4), (BX + 0.6, BY, 0.47), housing, bevel=0.015),
]
common.join("room.equipment", gear)
common.join("room.practical.screen", [common.box("screen", (0.38, 0.01, 0.2), (BX - 0.6, BY - 0.115, 1.14), practical)])
lamp_parts = [
    common.cylinder("cord", 0.008, HEIGHT - 2.95, (BX, BY, (HEIGHT + 2.95) / 2), metal, vertices=6),
]
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.34, radius2=0.07, depth=0.28, location=(BX, BY, 2.8))
shade = bpy.context.active_object
shade.data.materials.append(metal)
lamp_parts.append(shade)
common.join("room.pendant", lamp_parts)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.075, location=(BX, BY, 2.66))
bulb = bpy.context.active_object
bulb.data.materials.append(lamp)
common.join("room.bulb", [bulb])

# Shelving on the left, loaded with boxes.
SX, SY = -3.6, 4.55
shelf = [common.box("upright", (0.05, 0.5, 2.4), (SX + dx, SY, 1.2), metal) for dx in (-1.1, 1.1)]
for z in (0.15, 0.8, 1.45, 2.1):
    shelf.append(common.box("board", (2.25, 0.5, 0.03), (SX, SY, z), housing))
common.join("room.shelf", shelf)
crates = []
for i, (dx, z, s) in enumerate(((-0.6, 0.15, 0.4), (0.2, 0.15, 0.5), (-0.3, 0.8, 0.35), (0.6, 0.8, 0.3), (-0.5, 1.45, 0.45), (0.4, 2.1, 0.3))):
    crates.append(common.box(f"crate{i}", (s, 0.4, s * 0.8), (SX + dx, SY, z + 0.015 + s * 0.4), housing, bevel=0.01))
common.join("room.crates", crates)

# Ceiling strip lights.
ceiling = []
glow = []
for y in (2.5, -1.5, -5.5):
    ceiling.append(common.box("fixture", (3.2, 0.2, 0.08), (0, y, HEIGHT - 0.04), metal, bevel=0.01))
    glow.append(common.box("tube", (3.0, 0.1, 0.02), (0, y, HEIGHT - 0.09), practical))
common.join("room.ceiling.fixtures", ceiling)
common.join("room.practical.ceiling", glow)

# Bake-only lights where the practicals are: warm (the pendant) and cool (strips, window).
warm = [common.light("pendant", "POINT", (BX, BY, 2.55), 150, size=(0.08, 0.08))]
cool = [
    common.light(f"strip{i}", "AREA", (x, Y1 - 0.3, 4.38), 220, (0.5, 0, 0), (n, 0.05))
    for i, (x, n) in enumerate(STRIPS)
]
cool += [common.light(f"tube{i}", "AREA", (0, y, HEIGHT - 0.12), 160, size=(3.0, 0.1)) for i, y in enumerate((2.5, -1.5, -5.5))]
cool.append(common.light("window", "AREA", ((w["x0"] + w["x1"]) / 2, Y1 - 0.15, (w["z0"] + w["z1"]) / 2), 90, (-1.5708, 0, 0), (w["x1"] - w["x0"], w["z1"] - w["z0"])))
common.bake_room(ao_distance=0.9, channels=[warm, cool], full=[1.5, 2.5])
common.export(args.out, draco=args.draco)
