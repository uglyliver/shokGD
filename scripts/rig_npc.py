"""
Auto-rig a static Meshy T-pose human glb via Blender headless.

Pipeline:
  1. Import glb (single static mesh)
  2. Compute mesh world bbox to derive anatomical landmarks
  3. Build a 13-bone armature at those landmarks (Mixamo-ish naming)
  4. Parent the mesh to the armature with Automatic Weights
  5. Author a 1.0-second walk cycle (procedural sin-based hip/leg/arm rotation)
  6. Export rigged glb

Usage (headless):
  blender --background --python scripts/rig_npc.py -- <input.glb> <output.glb>
"""

import sys
import math
import bpy
from mathutils import Vector

argv = sys.argv
if "--" not in argv:
    print("ERR: expected `--` separator before script args")
    sys.exit(1)
script_args = argv[argv.index("--") + 1:]
if len(script_args) < 2:
    print("ERR: usage: blender --background --python rig_npc.py -- <in.glb> <out.glb>")
    sys.exit(1)

IN_GLB, OUT_GLB = script_args[0], script_args[1]

# ---- 1. Reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- 2. Import glb
bpy.ops.import_scene.gltf(filepath=IN_GLB)

# Find the imported mesh object (Meshy ships one mesh per file).
mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
if not mesh_objs:
    print("ERR: no mesh imported")
    sys.exit(2)
if len(mesh_objs) > 1:
    print(f"WARN: {len(mesh_objs)} meshes; will rig the first")
mesh = mesh_objs[0]
print(f"[rig] mesh: {mesh.name} verts={len(mesh.data.vertices)}")

# Flatten: detach mesh from any imported parent, clear any pre-existing
# vertex groups (Meshy sometimes emits empty groups), and apply the world
# transform so subsequent bbox math is in object space.
mesh.parent = None
for vg in list(mesh.vertex_groups):
    mesh.vertex_groups.remove(vg)
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Drop every other imported object (root empties, dummy nodes) — Blender's
# glTF exporter walks the whole scene tree and trips on stray nodes that
# look skin-like.
for o in list(bpy.data.objects):
    if o is not mesh:
        bpy.data.objects.remove(o, do_unlink=True)

# ---- 3. Landmarks from mesh bbox (in Blender WORLD space).
# Blender is Z-up. The glTF importer auto-rotates Y-up → Z-up on import, so
# in this script "vertical" is the Z axis, NOT Y as the glTF export will be.
# The glTF exporter swaps it back at the end.
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.context.view_layer.update()
ws = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
xs = [v.x for v in ws]; ys = [v.y for v in ws]; zs = [v.z for v in ws]
xmin, xmax = min(xs), max(xs)
ymin, ymax = min(ys), max(ys)
zmin, zmax = min(zs), max(zs)
H = zmax - zmin   # vertical (Z is up in Blender)
W = xmax - xmin   # arm-span axis
D = ymax - ymin   # forward-back depth
cx = (xmin + xmax) / 2
cy = (ymin + ymax) / 2
print(f"[rig] bbox: H={H:.3f} W={W:.3f} D={D:.3f} center=({cx:.3f}, {cy:.3f}, _)")

# Bones expressed as (x, y, z) — Blender world space, Z up.
def z(frac): return zmin + H * frac

LANDMARKS = {
    "hips":         (cx,           cy, z(0.50)),
    "spine":        (cx,           cy, z(0.62)),
    "chest":        (cx,           cy, z(0.78)),
    "neck":         (cx,           cy, z(0.90)),
    "head":         (cx,           cy, z(0.95)),
    "head_tip":     (cx,           cy, z(1.02)),

    "l_shoulder":   (cx + W*0.20,  cy, z(0.85)),
    "l_elbow":      (cx + W*0.32,  cy, z(0.66)),
    "l_wrist":      (cx + W*0.42,  cy, z(0.50)),
    "l_hand_tip":   (cx + W*0.46,  cy, z(0.45)),

    "r_shoulder":   (cx - W*0.20,  cy, z(0.85)),
    "r_elbow":      (cx - W*0.32,  cy, z(0.66)),
    "r_wrist":      (cx - W*0.42,  cy, z(0.50)),
    "r_hand_tip":   (cx - W*0.46,  cy, z(0.45)),

    "l_thigh":      (cx + W*0.10,  cy, z(0.50)),
    "l_knee":       (cx + W*0.10,  cy, z(0.27)),
    "l_ankle":      (cx + W*0.10,  cy, z(0.04)),
    "l_toe":        (cx + W*0.10,  cy + D*0.30, z(0.00)),

    "r_thigh":      (cx - W*0.10,  cy, z(0.50)),
    "r_knee":       (cx - W*0.10,  cy, z(0.27)),
    "r_ankle":      (cx - W*0.10,  cy, z(0.04)),
    "r_toe":        (cx - W*0.10,  cy + D*0.30, z(0.00)),
}

# ---- 4. Build armature
arm_data = bpy.data.armatures.new("rig")
arm_obj = bpy.data.objects.new("rig", arm_data)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")

def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = False
    return b

bone("hips",      LANDMARKS["hips"],      LANDMARKS["spine"])
bone("spine",     LANDMARKS["spine"],     LANDMARKS["chest"],     parent="hips")
bone("chest",     LANDMARKS["chest"],     LANDMARKS["neck"],      parent="spine")
bone("neck",      LANDMARKS["neck"],      LANDMARKS["head"],      parent="chest")
bone("head",      LANDMARKS["head"],      LANDMARKS["head_tip"],  parent="neck")

bone("l_arm",     LANDMARKS["l_shoulder"], LANDMARKS["l_elbow"],  parent="chest")
bone("l_forearm", LANDMARKS["l_elbow"],    LANDMARKS["l_wrist"],  parent="l_arm")
bone("l_hand",    LANDMARKS["l_wrist"],    LANDMARKS["l_hand_tip"], parent="l_forearm")

bone("r_arm",     LANDMARKS["r_shoulder"], LANDMARKS["r_elbow"],  parent="chest")
bone("r_forearm", LANDMARKS["r_elbow"],    LANDMARKS["r_wrist"],  parent="r_arm")
bone("r_hand",    LANDMARKS["r_wrist"],    LANDMARKS["r_hand_tip"], parent="r_forearm")

bone("l_thigh",   LANDMARKS["l_thigh"],    LANDMARKS["l_knee"],   parent="hips")
bone("l_shin",    LANDMARKS["l_knee"],     LANDMARKS["l_ankle"],  parent="l_thigh")
bone("l_foot",    LANDMARKS["l_ankle"],    LANDMARKS["l_toe"],    parent="l_shin")

bone("r_thigh",   LANDMARKS["r_thigh"],    LANDMARKS["r_knee"],   parent="hips")
bone("r_shin",    LANDMARKS["r_knee"],     LANDMARKS["r_ankle"],  parent="r_thigh")
bone("r_foot",    LANDMARKS["r_ankle"],    LANDMARKS["r_toe"],    parent="r_shin")

bpy.ops.object.mode_set(mode="OBJECT")

# ---- 5. Skin: parent + auto-weights, then "commit" via a paint-mode round-trip.
# Why the round-trip: ARMATURE_AUTO alone leaves the mesh in a state where the
# Blender 4.0 glTF exporter can crash with `add_neutral_bones` on a NoneType
# skin. Cycling weight-paint mode forces Blender to materialise the skin
# binding, after which the export goes through cleanly.
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# Commit the skin: switch the mesh into weight paint and back.
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.mode_set(mode="OBJECT")

# Count auto-weight coverage. If most vertices ended up unweighted (Blender's
# voxel-heat algorithm fails on thin / disjoint meshes), do proximity-based
# manual weighting against the nearest bone segment for those orphan verts.
# Every vertex needs at least one bone weight or the glTF export trips on
# the need_neutral_bone bug.
unweighted_verts = []
for v in mesh.data.vertices:
    if not any(g.weight > 0 for g in v.groups):
        unweighted_verts.append(v.index)
print(f"[rig] auto-weights left {len(unweighted_verts)}/{len(mesh.data.vertices)} verts unweighted")

if unweighted_verts:
    # Build a segment list from the armature: (bone_name, head_world, tail_world)
    bone_segments = []
    for b in arm_data.bones:
        bone_segments.append((b.name, Vector(b.head_local), Vector(b.tail_local)))

    def nearest_bone_distance(point):
        best_name = None
        best_dist = float("inf")
        for name, h, t in bone_segments:
            seg = t - h
            seg_len2 = seg.dot(seg)
            if seg_len2 < 1e-9:
                d = (point - h).length
            else:
                tparam = max(0.0, min(1.0, (point - h).dot(seg) / seg_len2))
                closest = h + seg * tparam
                d = (point - closest).length
            if d < best_dist:
                best_dist = d
                best_name = name
        return best_name, best_dist

    # Make sure every bone has a vertex group (parent_set may have skipped
    # bones that auto-weights couldn't find any verts for).
    bone_groups = {}
    for b in arm_data.bones:
        vg = mesh.vertex_groups.get(b.name) or mesh.vertex_groups.new(name=b.name)
        bone_groups[b.name] = vg

    for vi in unweighted_verts:
        v = mesh.data.vertices[vi]
        world_pos = mesh.matrix_world @ v.co
        name, _ = nearest_bone_distance(world_pos)
        bone_groups[name].add([vi], 1.0, "REPLACE")
    print(f"[rig] {len(unweighted_verts)} verts manually assigned to nearest bone")

bpy.ops.object.vertex_group_normalize_all()

# ---- 6. Walk animation: 24 fps, 24 frames = 1 second loop.
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 24
bpy.context.scene.render.fps = 24

bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="POSE")

# Helper to set bone Euler rotation at a given frame.
def keyframe(bone_name, frame, rot_xyz_deg):
    pb = arm_obj.pose.bones[bone_name]
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = (
        math.radians(rot_xyz_deg[0]),
        math.radians(rot_xyz_deg[1]),
        math.radians(rot_xyz_deg[2]),
    )
    pb.keyframe_insert(data_path="rotation_euler", frame=frame)

# Stride amplitudes (deg). Tame on purpose so auto-skin failures don't shred.
THIGH_AMP = 30
SHIN_AMP  = 25
ARM_AMP   = 25
HIP_BOB   = 0.04   # meters

# Author keyframes at frames 1 (mid-step), 7 (left foot down), 13 (mid-step
# mirrored), 19 (right foot down), 25 (= 1, looping).
# We use 4 phase samples; Blender will interpolate.
phases = [(1, 0.0), (7, math.pi / 2), (13, math.pi), (19, math.pi * 1.5)]

for frame, phase in phases:
    s = math.sin(phase)
    c = math.cos(phase)

    # Hip bob (translation Y) — reuses location keyframe on hips.
    pb_hips = arm_obj.pose.bones["hips"]
    pb_hips.location = (0, 0, abs(s) * HIP_BOB)
    pb_hips.keyframe_insert(data_path="location", frame=frame)

    # Legs: left and right swing 180° out of phase.
    keyframe("l_thigh", frame, ( s * THIGH_AMP, 0, 0))
    keyframe("r_thigh", frame, (-s * THIGH_AMP, 0, 0))
    # Shin flexes when leg is back — peak when thigh angle is most -ve.
    l_shin_amp = max(0,  s) * SHIN_AMP   # only flex on backswing
    r_shin_amp = max(0, -s) * SHIN_AMP
    keyframe("l_shin",  frame, (-l_shin_amp, 0, 0))
    keyframe("r_shin",  frame, (-r_shin_amp, 0, 0))

    # Arms swing opposite to legs (counter-balance).
    keyframe("l_arm", frame, (-s * ARM_AMP, 0, 0))
    keyframe("r_arm", frame, ( s * ARM_AMP, 0, 0))

    # Subtle spine sway.
    keyframe("spine", frame, (0, c * 5, 0))

# Make the action loop cleanly.
for fc in arm_obj.animation_data.action.fcurves:
    fc.modifiers.new("CYCLES")
arm_obj.animation_data.action.name = "walk"

bpy.ops.object.mode_set(mode="OBJECT")

# ---- 7. Export glb. Include the armature + skinned mesh + animation.
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False,
)
print(f"[rig] wrote {OUT_GLB}")
