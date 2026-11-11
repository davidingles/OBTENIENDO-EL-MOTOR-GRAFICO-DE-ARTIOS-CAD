"""Import the studio's animated GLB and create a self-contained Blender scene."""
import bpy
import sys
import math
from mathutils import Vector

source, destination = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=source)
meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes:
    raise RuntimeError('El archivo no contiene geometría 3D.')
scene.frame_start = 0
scene.frame_end = 270
scene.timeline_markers.new('Plano abierto', frame=0)
scene.timeline_markers.new('Plegado completo', frame=120)
scene.timeline_markers.new('Comienza apertura', frame=150)
scene.timeline_markers.new('Plano abierto de nuevo', frame=270)
# Bound every animation sample, so the camera contains both the flat and folded box.
points = []
for frame in range(0, 271, 3):
    scene.frame_set(frame)
    for obj in meshes:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
from mathutils import Matrix
scene.frame_set(0)
initial = [o.matrix_world.copy() for o in meshes]
baked = []
for frame in range(271):
    scene.frame_set(frame)
    baked.append([o.matrix_world.copy() for o in meshes])
scene.frame_set(0)
imported = [o.name for o in scene.objects]
rig = bpy.data.objects.new('Esqueleto_Plegado', bpy.data.armatures.new('Plegado'))
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for i in range(len(meshes)):
    bone = rig.data.edit_bones.new('Panel_%02d' % i)
    bone.head = (0,0,0)
    bone.tail = (0,.01,0)
bpy.ops.object.mode_set(mode='OBJECT')
for i, obj in enumerate(meshes):
    obj.parent = None
    obj.animation_data_clear()
    obj.data.transform(initial[i])
    obj.matrix_world = Matrix.Identity(4)
    obj.vertex_groups.new(name='Panel_%02d' % i).add(list(range(len(obj.data.vertices))),1,'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
troquel = bpy.context.object
troquel.name = 'Troquel_Malla_Unica'
slots = list(troquel.data.materials)
def category(mat):
    name = mat.name if mat else ''
    if 'Exterior' in name: return 0
    if 'Interior' in name: return 1
    return 2
indices = [category(slots[p.material_index]) for p in troquel.data.polygons]
materials = []
for index, name in enumerate(['Exterior','Interior','Espesor']):
    # Use the actual cut-edge shader, including its embedded corrugated PNG,
    # rather than the crease-core shader (both belong to thickness).
    material = (next((m for m in slots if m and 'Canto_Corrugado' in m.name),None)
                if index == 2 else None)
    material = material or next((m for m in slots if category(m)==index),None)
    if material is None:
        material = bpy.data.materials.new(name)
        material.diffuse_color = (.55,.36,.17,1)
    materials.append(material)
for material in materials:
    material.use_fake_user = True  # Keep imported shaders alive while rebuilding slots.
troquel.data.materials.clear()
for material, name in zip(materials,['Exterior','Interior','Espesor']):
    material.name = name
    troquel.data.materials.append(material)
for poly, index in zip(troquel.data.polygons,indices): poly.material_index=index
# Material preview spheres have no mesh color attribute. Supply a white fallback
# there, while retaining the imported vertex colors on the actual geometry.
color_layer = troquel.data.color_attributes.get('Color')
if color_layer:
    for datum in color_layer.data:
        c = datum.color
        if max(c[0], c[1], c[2]) < 0.001:
            datum.color = (0.001, 0.001, 0.001, c[3])
for material in materials:
    if not material.use_nodes:
        continue
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for vertex in [n for n in nodes if n.type in {'VERTEX_COLOR', 'ATTRIBUTE'} and (n.type != 'ATTRIBUTE' or n.attribute_name == 'Color')]:
        outgoing = list(vertex.outputs['Color'].links)
        if not outgoing:
            continue
        luminance = nodes.new('ShaderNodeRGBToBW')
        threshold = nodes.new('ShaderNodeMath')
        threshold.operation = 'GREATER_THAN'
        threshold.inputs[1].default_value = 0.0001
        fallback = nodes.new('ShaderNodeMixRGB')
        fallback.blend_type = 'MIX'
        fallback.inputs[1].default_value = (1, 1, 1, 1)
        links.new(vertex.outputs['Color'], luminance.inputs[0])
        links.new(luminance.outputs[0], threshold.inputs[0])
        links.new(threshold.outputs[0], fallback.inputs[0])
        links.new(vertex.outputs['Color'], fallback.inputs[2])
        for link in outgoing:
            target = link.to_socket
            links.remove(link)
            links.new(fallback.outputs[0], target)
# Keep the imported artwork UVs intact. Make independent packed UV maps for
# the interior and the cut edges, without changing the exterior texture map.
original_uv_name = troquel.data.uv_layers.active.name
bpy.context.view_layer.objects.active = troquel
for material_index, name in [(1, 'UV_Interior'), (2, 'UV_Espesor')]:
    layer = troquel.data.uv_layers.new(name=name)
    troquel.data.uv_layers.active = layer
    for poly in troquel.data.polygons:
        poly.select = poly.material_index == material_index
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.uv.smart_project(island_margin=0.002)
    bpy.ops.object.mode_set(mode='OBJECT')
troquel.data.uv_layers.active = troquel.data.uv_layers[original_uv_name]
troquel.data.uv_layers[original_uv_name].active_render = True
for poly in troquel.data.polygons:
    poly.select = False
troquel.modifiers.new('Animacion_de_plegado','ARMATURE').object=rig
troquel.parent=rig
for frame, matrices in enumerate(baked):
    scene.frame_set(frame)
    for i, matrix in enumerate(matrices):
        bone=rig.pose.bones['Panel_%02d'%i]
        bone.rotation_mode='QUATERNION'
        bone.matrix_basis=matrix @ initial[i].inverted()
        for prop in ['location','rotation_quaternion','scale']: bone.keyframe_insert(prop,frame=frame)
for frame in [0,60,120,210,270]:
    scene.frame_set(frame)
    evaluated=troquel.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=evaluated.to_mesh()
    for i in range(len(initial)):
        group=troquel.vertex_groups['Panel_%02d'%i].index
        vertex=next(v for v in troquel.data.vertices if any(g.group==group for g in v.groups))
        expected=baked[frame][i] @ initial[i].inverted() @ vertex.co
        actual=evaluated.matrix_world @ data.vertices[vertex.index].co
        assert (actual-expected).length<1e-5, (frame,i,(actual-expected).length)
    evaluated.to_mesh_clear()
for name in imported:
    obj=bpy.data.objects.get(name)
    if obj is not None and obj!=troquel: bpy.data.objects.remove(obj,do_unlink=True)
assert len(troquel.data.materials)==3
assert troquel.data.uv_layers, 'Faltan las UV exteriores'
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (low + high) / 2
span = max(high - low)
bpy.ops.object.camera_add(location=center + Vector((1.2, -1.5, 1.2)) * span)
camera = bpy.context.object
camera.name = 'Camara_Plegado'
camera.rotation_euler = (center-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = span * 1.9
camera.data.clip_start = .001
camera.data.clip_end = max(100, span * 20)
scene.camera = camera
for name, offset, power, size in [('Principal',(1,-1,2),350,1.5),('Relleno',(-1,-.5,1),180,1.3),('Contraluz',(0,1,1.5),250,1)]:
    bpy.ops.object.light_add(type='AREA', location=center+Vector(offset)*span)
    light=bpy.context.object
    light.name=name
    light.data.energy=power*span*span
    light.data.shape='DISK'
    light.data.size=size*span
    light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=span*8, location=(center.x,center.y,low.z-.002))
floor=bpy.context.object
floor.name='Suelo_estudio'
material=bpy.data.materials.new('Fondo_gris_claro')
material.diffuse_color=(.28,.32,.38,1)
floor.data.materials.append(material)
scene.world=bpy.data.worlds.new('Ambiente_estudio')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.5,.6,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.render.resolution_x=1600
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.frame_set(120)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
scene['Instrucciones']='Espacio: reproducir. Fotogramas 0–120: plegado; 120–150: pausa; 150–270: apertura. Unidades: metros.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=destination)
print('BLEND_CREATED='+destination)
