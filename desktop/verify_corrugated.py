"""Import the actual exported GLB and verify/render its embedded corrugated material."""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector
folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
for filename in ['troquel.glb', 'troquel-girado.glb', 'muestra-cantos.glb']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder / filename), disable_bone_shape=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert len(meshes) == 1
    obj = meshes[0]
    material = next(m for m in obj.data.materials if m.name.startswith('Carton_Canto_Cortado'))
    nodes = [n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE']
    assert len(nodes) == 1 and tuple(nodes[0].image.size) == (295, 37)
    assert nodes[0].image.packed_file
    assert obj.data.uv_layers.active
    assert any(p.material_index == list(obj.data.materials).index(material) for p in obj.data.polygons)
    print('VERIFIED_CORRUGATED', filename, 'packed PNG 295x37, material and UV present')
scene = bpy.context.scene
# Render the small exported sample so a real 1.5 mm edge can be inspected.
for rig in [o for o in scene.objects if o.type == 'ARMATURE']:
    if rig.animation_data:
        for track in rig.animation_data.nla_tracks: track.mute = True
        rig.animation_data.action = None
scene.frame_set(0)
bpy.context.view_layer.update()
points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
center = sum(points, Vector()) / 8
bpy.ops.object.camera_add(location=center + Vector((.045, -.055, .036)))
camera = bpy.context.object
camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = .050
camera.data.clip_start = .0001
scene.camera = camera
bpy.ops.object.light_add(type='SUN', location=center+Vector((.02,-.03,.06)))
light = bpy.context.object
light.rotation_euler = (center-light.location).to_track_quat('-Z','Y').to_euler()
light.data.energy = 2
light.data.angle = math.radians(15)
scene.world = bpy.data.worlds.new('Studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65,.7,.8,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200; scene.render.resolution_y = 850
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(folder/'blender-cantos.png')
bpy.ops.render.render(write_still=True)
