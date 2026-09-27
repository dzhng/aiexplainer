"""Shared helpers for the prop scripts. Every prop is built from an empty scene, so no
.blend file is ever the source of truth.

Run a prop script as:
  Blender -b --factory-startup --python assets/blender/<name>.py -- --out <path>.glb
"""

import argparse
import sys

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--draco", action="store_true", help="test fixtures only")
    return parser.parse_args(argv)


def empty_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, base, metallic=0.0, roughness=0.5, emission=(0, 0, 0), strength=0.0):
    """A principled BSDF material. Colours are linear RGB."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed meshes; exports as single-sided
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def box(name, size, location, mat, bevel=0.0, segments=2):
    """A box of `size` (x, y, z) centred at `location`, with an optional bevel modifier."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    return obj


def join(name, objects):
    """Joins `objects` into one mesh object called `name` (modifiers applied first)."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    return obj


def export(out, draco=False):
    """Uncompressed GLB (+Y up, modifiers applied) unless `draco` is set for a test fixture.
    Bevels shade smooth; edges sharper than 30 degrees stay hard (exported as split normals)."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.shade_smooth_by_angle(angle=0.5236)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=False,  # untextured props; UVs only add float jitter between builds
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=draco,
    )
    print(f"exported {out}")
