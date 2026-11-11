import bpy
scene=bpy.context.scene
obj=bpy.data.objects['Troquel_Malla_Unica']
assert [m.name for m in obj.data.materials]==['Exterior','Interior','Espesor']
counts=[sum(p.material_index==i for p in obj.data.polygons) for i in range(3)]
assert all(counts), counts
assert obj.data.uv_layers
# Material counts alone missed the old GLB bug: every face appeared once in
# each of the three slots. Compare geometry independently of material/index.
seen=set()
for poly in obj.data.polygons:
 key=tuple(sorted(tuple(round(float(x),8) for x in obj.data.vertices[i].co) for i in poly.vertices))
 assert key not in seen, ('Cara superpuesta',poly.index,poly.material_index)
 seen.add(key)
samples=[]
for frame in [0,120,270]:
 scene.frame_set(frame)
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
 data=evaluated.to_mesh()
 samples.append([v.co.copy() for v in data.vertices])
 evaluated.to_mesh_clear()
assert any((a-b).length>.001 for a,b in zip(samples[0],samples[1]))
assert all((a-b).length<.0001 for a,b in zip(samples[0],samples[2]))
scene.frame_set(120)
scene.cycles.samples=8
scene.render.resolution_percentage=50
scene.render.filepath=bpy.path.abspath('//Troquel-Malla-Unica.png')
bpy.ops.render.render(write_still=True)
print('VERIFIED single mesh, three populated materials, UVs and closed animation cycle',counts)
