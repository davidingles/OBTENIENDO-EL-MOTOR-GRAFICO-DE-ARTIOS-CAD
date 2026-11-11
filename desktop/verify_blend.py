import bpy, math
from mathutils import Vector
scene=bpy.context.scene
panels=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Mesh_')]
assert len(panels)==19, len(panels)
positions=[]
for frame in [0,120,270]:
 scene.frame_set(frame)
 positions.append([o.matrix_world.copy() for o in panels])
assert any(sum(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4))>.001 for a,b in zip(positions[0],positions[1]))
assert all(sum(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4))<.0001 for a,b in zip(positions[0],positions[2]))
scene.frame_set(120)
scene.render.resolution_percentage=50
scene.cycles.samples=8
scene.render.filepath=bpy.path.abspath('//Troquel-Preview.png')
bpy.ops.render.render(write_still=True)
print('VALIDATED: 19 panels, moving folds and matching cycle endpoints')
