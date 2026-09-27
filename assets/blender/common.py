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


def grid(name, size, location, mat, cuts=8, rotation=(0.0, 0.0, 0.0)):
    """A flat plane of `size` (x, y), subdivided `cuts` times each way so baked AO has
    vertices to land on."""
    bpy.ops.mesh.primitive_grid_add(
        x_subdivisions=cuts, y_subdivisions=cuts, size=1, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0.0, 0.0, 0.0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return obj


def subdivide(obj, cuts):
    """Evenly subdivides every face, so a box's large faces carry baked AO."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def light(name, kind, location, energy, rotation=(0.0, 0.0, 0.0), size=(0.1, 0.1)):
    """A bake-only light (lights are never exported)."""
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size, data.size_y = size
    else:
        data.shadow_soft_size = size[0]
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bake_room(ao_distance, channels, full, samples=64):
    """Bakes into each mesh's vertex colours (point domain, so light varies smoothly across
    faces instead of in per-face blocks), exported as glTF COLOR_0, what a renderer
    without shadows or local lights cannot compute:
      R = ambient occlusion from all geometry within `ao_distance`;
      G, B = diffuse light (direct plus bounce, surface colour excluded) from the lights in
        `channels[0]` and `channels[1]`, as a fraction of `full[i]` (clamped to 1).
    The renderer tints G and B by the look (warm and cool practicals), so the prop carries
    only where the light falls, not its colour or strength. Mesh emission is off while
    baking: only the bake lights light the room."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    # One thread: a multithreaded bake sums samples in a varying order, so the glb would
    # differ byte-for-byte between builds.
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    if scene.world is None:
        scene.world = bpy.data.worlds.new("world")
    scene.world.light_settings.distance = ao_distance
    meshes = [o for o in scene.objects if o.type == "MESH"]

    def bake(kind, name, **options):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            attr = obj.data.color_attributes.new(name, "FLOAT_COLOR", "POINT")
            obj.data.color_attributes.active_color = attr
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.bake(type=kind, target="VERTEX_COLORS", **options)

    lights = [l for group in channels for l in group]
    for l in lights:
        l.hide_render = True
    bake("AO", "ao")

    strengths = {}
    for mat in bpy.data.materials:
        socket = mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
        strengths[mat.name] = socket.default_value
        socket.default_value = 0.0
    for i, group in enumerate(channels):
        for l in lights:
            l.hide_render = l not in group
        bake("DIFFUSE", f"light{i}", pass_filter={"DIRECT", "INDIRECT"})
    for mat in bpy.data.materials:
        mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = strengths[mat.name]

    seen = [[], []]
    for obj in meshes:
        attrs = obj.data.color_attributes
        ao, lit = attrs["ao"].data, [attrs[f"light{i}"].data for i in range(len(channels))]
        out = attrs.new("bake", "BYTE_COLOR", "POINT")
        # Emitters glow by the look, not by the bake; their bake is also the noisiest (the
        # bake lights sit inside them), so they get a constant open, unlit value.
        emitter = all(strengths[m.name] > 0 for m in obj.data.materials)
        for k in range(len(out.data)):
            if emitter:
                out.data[k].color = (1.0, 0.0, 0.0, 1.0)
                continue
            values = [ao[k].color[0]]
            for i in range(2):
                v = lit[i][k].color[0] if i < len(lit) else 0.0
                seen[i].append(v)
                values.append(min(1.0, v / full[i]))
            out.data[k].color = (*values, 1.0)
        for name in ["ao"] + [f"light{i}" for i in range(len(channels))]:
            attrs.remove(attrs[name])
        attrs.active_color = attrs["bake"]
        attrs.render_color_index = attrs.active_color_index
    for i, values in enumerate(seen):
        values.sort()
        at = [values[int(q * (len(values) - 1))] for q in (0.5, 0.9, 0.99)] if values else []
        print(f"bake: light{i} p50/p90/p99 {' '.join(f'{v:.3f}' for v in at)} (full {full[i]})")
    for l in lights:
        bpy.data.objects.remove(l)


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
        export_vertex_color="ACTIVE",  # the bake (COLOR_0), where a script baked one
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=draco,
    )
    print(f"exported {out}")
