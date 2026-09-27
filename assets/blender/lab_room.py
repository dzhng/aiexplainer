"""The room every chapter's machine stands in: a small research lab at night.

Blender units are metres, +Z up; the camera looks from −Y toward +Y (glTF +Z toward −Z), and
the subject stands at the origin on the floor. The room is 18 m wide (x ±9), 16 m deep
(y −11…+5) and 5.2 m tall, so orbiting keeps the camera inside it.

- a tiled concrete floor with seams;
- a back wall of bolted panels over a darker backing, with conduit and a strip light;
- a large window on the back wall, right of centre, showing a dim night skyline (sky card,
  distant dark buildings, lit windows) through glass;
- a workbench with equipment and a stool under a pendant lamp (right), a whiteboard on the
  right wall; shelving, an equipment rack with indicator LEDs and a desk with two dim
  monitors (left); plants, crates, a coiled cable and a floor cable run;
- wall strip lights either side of the window, and ceiling strip lights;
- outside, three rows of buildings at increasing distance (nearer rows darker, farther rows
  hazier), lit windows, and a faint glow along the horizon.

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
screen = common.material("screen", (0.3, 0.45, 0.8), emission=(0.3, 0.45, 0.8), strength=1.0)
indicator = common.material("indicator", (0.2, 1.0, 0.5), emission=(0.2, 1.0, 0.5), strength=2.0)
horizon = common.material("horizon", (0.4, 0.25, 0.3), emission=(0.4, 0.25, 0.3), strength=1.0)
haze = common.material("haze", (0.01, 0.012, 0.03), roughness=1.0)
whiteboard = common.material("whiteboard", (0.6, 0.62, 0.66), roughness=0.35)
ink = common.material("marker", (0.05, 0.08, 0.2), roughness=0.6)
foliage = common.material("foliage", (0.02, 0.06, 0.03), roughness=0.8)
rubber = common.material("rubber", (0.01, 0.01, 0.012), roughness=0.7)

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

# The skyline: three rows of blocks at increasing distance, each wider and shorter-looking,
# with lit windows on a floor grid (a hash picks the few still lit). The far rows are hazier
# (a lighter silhouette), which gives the depth. Deterministic (no random module).
ROWS = [
    # (distance, count, spacing, widths, heights, material, window share)
    (40, 18, 7.5, (3, 6), (4, 14), silhouette, 11),
    (75, 22, 10.0, (5, 9), (8, 24), haze, 5),
    (120, 26, 14.0, (8, 14), (14, 34), haze, 4),
]
buildings = []
far = []
lights = []
for r, (dist, count, pitch, (w0, w1), (h0, h1), mat, share) in enumerate(ROWS):
    for i in range(count):
        seed = i * 31 + r * 97
        bw = w0 + seed % (w1 - w0 + 1)
        bh = h0 + (seed * 7) % (h1 - h0 + 1)
        bx = -pitch * count / 2 + i * pitch + (seed * 13) % 5 - 2 + 2.5
        by = dist + (seed * 11) % 9
        target = buildings if r == 0 else far
        # Tops at bh - 2 m; bases far below the floor, so no block ends in mid-air through the
        # window (the sill hides the ground).
        target.append(common.box("block", (bw, 4, bh + 28), (bx, by, (bh - 2 - 30) / 2), mat))
        # Lit windows: 1.2 m bays, 1.5 m storeys.
        for col in range(int((bw - 0.6) / 1.2)):
            for row in range(int((bh - 1.0) / 1.5)):
                if (seed * 5 + col * 71 + row * 37) % share != 0:
                    continue
                lx = bx - bw / 2 + 0.9 + col * 1.2
                lz = -1.2 + row * 1.5
                lights.append(common.box("lit", (0.7, 0.05, 0.5), (lx, by - 2.03, lz), city))
# A low glow along the horizon, behind every row.
common.join("room.horizon", [common.grid("glow", (260, 10), (2.5, 140, 1.0), horizon, 2, (1.5708, 0, 0))])
common.join("room.skyline.far", far)
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

# An equipment rack against the back wall (left), with rows of indicator LEDs.
RX, RY = -5.4, 4.5
rack = [common.box("rack", (0.8, 0.9, 2.1), (RX, RY, 1.05), housing, bevel=0.01)]
for k in range(7):
    rack.append(common.box("unit", (0.72, 0.02, 0.2), (RX, RY - 0.46, 0.35 + k * 0.26), metal, bevel=0.004))
common.join("room.rack", [common.subdivide(rack[0], 1)] + rack[1:])
leds = []
for k in range(7):
    for j in range(4):
        if (k * 5 + j * 3) % 4 == 3:
            continue
        leds.append(common.box("led", (0.025, 0.012, 0.018), (RX - 0.28 + j * 0.05, RY - 0.475, 0.35 + k * 0.26), indicator))
common.join("room.leds", leds)

# A desk against the back wall (far left) with two dim monitors, and a stool.
DX, DY = -7.4, 4.55
desk = [common.box("desk", (1.8, 0.8, 0.05), (DX, DY - 0.1, 0.76), housing, bevel=0.01)]
for dx in (-0.8, 0.8):
    desk.append(common.box("leg", (0.05, 0.7, 0.74), (DX + dx, DY - 0.1, 0.37), metal))
common.join("room.desk", desk)
monitors = []
for dx in (-0.4, 0.4):
    monitors.append(common.box("monitor", (0.62, 0.05, 0.38), (DX + dx, DY + 0.05, 1.12), housing, bevel=0.01))
    monitors.append(common.box("stand", (0.05, 0.12, 0.25), (DX + dx, DY + 0.1, 0.9), metal))
common.join("room.monitors", monitors)
common.join("room.screens", [
    common.box("screen", (0.56, 0.01, 0.32), (DX + dx, DY + 0.02, 1.12), screen) for dx in (-0.4, 0.4)
])

def stool(name, x, y):
    parts = [common.cylinder("seat", 0.2, 0.05, (x, y, 0.66), housing, vertices=20)]
    for k in range(3):
        import math
        a = k * 2.0944
        parts.append(common.cylinder("leg", 0.018, 0.64, (x + 0.13 * math.cos(a), y + 0.13 * math.sin(a), 0.32), metal, vertices=6))
    parts.append(common.cylinder("ring", 0.15, 0.02, (x, y, 0.25), metal, vertices=16))
    return common.join(name, parts)

stool("room.stool", BX - 0.9, BY - 0.9)
stool("room.stool.desk", DX + 0.3, DY - 0.9)

# A whiteboard on the right wall, with faint marker lines.
WX, WY = 8.93, 2.6
common.join("room.whiteboard", [common.box("board", (0.04, 2.4, 1.2), (WX, WY, 1.75), whiteboard, bevel=0.005)])
marks = []
for k, (dy, dz, length) in enumerate(((-0.8, 2.1, 1.1), (-0.8, 1.95, 0.8), (-0.8, 1.8, 0.95), (0.3, 1.6, 0.7), (0.3, 1.45, 0.5), (-0.5, 1.35, 0.3))):
    marks.append(common.box("mark", (0.006, length, 0.012), (WX - 0.023, WY + dy + length / 2, dz), ink))
marks.append(common.box("box", (0.006, 0.35, 0.22), (WX - 0.023, WY + 0.75, 2.0), ink))
common.join("room.whiteboard.marks", marks)
common.join("room.whiteboard.frame", [common.box("tray", (0.08, 1.2, 0.03), (WX - 0.04, WY, 1.13), metal)])

# Plants in the back corners.
def plant(name, x, y, height):
    import math
    parts = [common.cylinder("pot", 0.22, 0.4, (x, y, 0.2), housing, vertices=16)]
    leaves = []
    for k in range(9):
        a = k * 0.698 + 0.3
        r = 0.12 + (k % 3) * 0.07
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.09, radius2=0.0, depth=height * (0.6 + (k % 4) * 0.12),
            location=(x + r * math.cos(a), y + r * math.sin(a), 0.4 + height * 0.35), rotation=(0.35 * math.sin(a), 0.35 * math.cos(a), 0))
        leaf = bpy.context.active_object
        leaf.data.materials.append(foliage)
        leaves.append(leaf)
    common.join(name + ".pot", parts)
    common.join(name + ".leaves", leaves)

plant("room.plant", -1.7, 4.4, 1.3)
plant("room.plant.b", 8.3, 4.2, 1.0)

# Crates by the rack, and a coiled cable with a run along the floor to the back wall.
crates2 = []
for i, (x, y, z, s_) in enumerate(((-6.0, 3.6, 0.0, 0.55), (-5.95, 3.62, 0.55, 0.42), (-6.55, 3.7, 0.0, 0.4))):
    crates2.append(common.box(f"crate{i}", (s_, s_ * 0.9, s_ * 0.8), (x, y, z + s_ * 0.4), housing, bevel=0.01))
common.join("room.crates.rack", crates2)
bpy.ops.mesh.primitive_torus_add(major_radius=0.32, minor_radius=0.025, major_segments=32, minor_segments=6, location=(3.9, 2.6, 0.03))
coil = bpy.context.active_object
coil.data.materials.append(rubber)
bpy.ops.mesh.primitive_torus_add(major_radius=0.27, minor_radius=0.025, major_segments=32, minor_segments=6, location=(3.92, 2.62, 0.08))
coil2 = bpy.context.active_object
coil2.data.materials.append(rubber)
run = [common.cylinder("run", 0.02, 2.2, (3.9, 3.8, 0.022), rubber, (1.5708, 0, 0), 6)]
run.append(common.cylinder("up", 0.02, 1.0, (3.9, Y1 - 0.06, 0.5), rubber, vertices=6))
common.join("room.cable", [coil, coil2] + run)
# A cable tray along the left wall at head height.
common.join("room.cable.tray", [common.box("tray", (0.2, 12.0, 0.06), (X0 + 0.15, -1.0, 2.9), metal, bevel=0.005)])

# Bake-only lights where the practicals are: warm (the pendant) and cool (strips, window).
warm = [common.light("pendant", "POINT", (BX, BY, 2.55), 150, size=(0.08, 0.08))]
cool = [
    common.light(f"strip{i}", "AREA", (x, Y1 - 0.3, 4.38), 220, (0.5, 0, 0), (n, 0.05))
    for i, (x, n) in enumerate(STRIPS)
]
cool += [common.light(f"tube{i}", "AREA", (0, y, HEIGHT - 0.12), 160, size=(3.0, 0.1)) for i, y in enumerate((2.5, -1.5, -5.5))]
cool += [common.light(f"screen{i}", "AREA", (DX + dx, DY - 0.05, 1.12), 12, (-1.5708, 0, 0), (0.56, 0.32)) for i, dx in enumerate((-0.4, 0.4))]
cool.append(common.light("window", "AREA", ((w["x0"] + w["x1"]) / 2, Y1 - 0.15, (w["z0"] + w["z1"]) / 2), 90, (-1.5708, 0, 0), (w["x1"] - w["x0"], w["z1"] - w["z0"])))
common.bake_room(ao_distance=0.9, channels=[warm, cool], full=[1.5, 2.5])
common.export(args.out, draco=args.draco)
