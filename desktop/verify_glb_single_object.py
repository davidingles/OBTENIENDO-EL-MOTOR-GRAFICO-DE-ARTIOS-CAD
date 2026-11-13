"""Verify Blender import: one mesh, one armature, rigid 90-degree folding."""
import bpy
import sys
import json
import math

for filename in sys.argv[sys.argv.index('--') + 1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filename, disable_bone_shape=True)
    objects = list(bpy.context.scene.objects)
    meshes = [o for o in objects if o.type == 'MESH']
    rigs = [o for o in objects if o.type == 'ARMATURE']
    assert len(meshes) == 1 and len(rigs) == 1, [(o.name, o.type) for o in objects]
    assert len(objects) == 2, [(o.name, o.type) for o in objects]
    obj, rig = meshes[0], rigs[0]
    assert obj.data.shape_keys is None
    assert obj.data.uv_layers
    assert any(m.type == 'ARMATURE' and m.object == rig for m in obj.modifiers)
    assert len(set(p.material_index for p in obj.data.polygons)) >= 3
    for vertex in obj.data.vertices:
        weights = [g.weight for g in vertex.groups if g.weight > 1e-7]
        assert len(weights) == 1 and abs(weights[0] - 1) < 1e-6, weights
    cycle = next(a for a in bpy.data.actions if a.name.startswith('02_'))
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = cycle
    rig.animation_data.action_slot = cycle.slots[0]
    scene = bpy.context.scene
    def bounds():
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        data = evaluated.to_mesh()
        coords = [evaluated.matrix_world @ v.co for v in data.vertices]
        result = [max(p[i] for p in coords) - min(p[i] for p in coords) for i in range(3)]
        evaluated.to_mesh_clear()
        return result
    poses = []
    quarter_turns = []
    for seconds in [0, 4, 9]:
        scene.frame_set(round(seconds * scene.render.fps / scene.render.fps_base))
        bpy.context.view_layer.update()
        poses.append(bounds())
        for bone in rig.pose.bones:
            if not bone.name.startswith('Pivot_'):
                continue
            angle = math.degrees(bone.matrix_basis.to_quaternion().angle)
            angle = min(angle, 360-angle)
            expected = 90 if seconds == 4 else 0
            assert abs(angle-expected) < .001, (bone.name, seconds, angle)
            if seconds == 4:
                quarter_turns.append(angle)
    assert quarter_turns
    assert max(abs(a-b) for a,b in zip(poses[0],poses[1])) > .005, poses
    assert max(abs(a-b) for a,b in zip(poses[0],poses[2])) < 1e-5, poses
    assert max(poses[0]) < 2, 'La escala debe ser metros'
    print('VERIFIED_GLB_ARMATURE', json.dumps({'file':filename,'meshes':1,'armatures':1,'bones':len(rig.data.bones),'shape_keys':0,'fold_angles_degrees':quarter_turns,'open_bounds_m':poses[0],'closed_bounds_m':poses[1]}))
