"""An asymmetric test prop that proves the Blender → glTF axis mapping once.

Coloured markers sit one unit out on Blender +X (red), +Y (green) and +Z (blue); the +Z
marker also emits (strength 4) to prove emissive export. A test reads the GLB and checks
where each marker lands in glTF space.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import common  # noqa: E402

args = common.parse_args()
common.empty_scene()

grey = common.material("metal", (0.3, 0.3, 0.32), roughness=0.6)
red = common.material("axisX", (0.8, 0.05, 0.05))
green = common.material("axisY", (0.05, 0.6, 0.05))
blue = common.material("axisZ", (0.05, 0.1, 0.8), emission=(0.05, 0.1, 0.8), strength=4.0)

common.box("probe.core", (0.3, 0.3, 0.3), (0, 0, 0), grey)
common.box("marker.+X", (0.2, 0.2, 0.2), (1, 0, 0), red)
common.box("marker.+Y", (0.2, 0.2, 0.2), (0, 1, 0), green)
common.box("marker.+Z", (0.2, 0.2, 0.2), (0, 0, 1), blue)

common.export(args.out, draco=args.draco)
