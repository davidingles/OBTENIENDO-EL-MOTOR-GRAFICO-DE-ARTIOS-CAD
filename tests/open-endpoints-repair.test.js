const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DielineEngine = require('../dieline-engine');
const libraryStore = require('../desktop/library-store');
const UserLibrary = require('../library-models');

test('inspectOpenEndpoints y repairOpenEndpoints prolongan o recortan según lo más cercano y dejan intacto lo inalcanzable', () => {
  // Rectángulo exterior 100x100 con un hueco corto en una esquina (debe prolongar 4 mm)
  // + un hendido vertical que sobresale 3 mm por arriba (debe recortar 3 mm) y se queda corto 2 mm por abajo (debe prolongar 2 mm)
  // + una línea suelta apuntando al vacío sin cruce alcanzable (debe quedarse donde está)
  const cutSegments = [
    { x1: 0, y1: 0, x2: 100, y2: 0, type: 'CUT' },
    { x1: 100, y1: 0, x2: 100, y2: 100, type: 'CUT' },
    { x1: 100, y1: 100, x2: 0, y2: 100, type: 'CUT' },
    { x1: 0, y1: 100, x2: 0, y2: 4, type: 'CUT' },       // extremo (0,4) corto por 4 mm -> debe prolongar a (0,0)
    { x1: 140, y1: 20, x2: 140, y2: 80, type: 'CUT' }    // paralela al vacío, sin cruce en ninguno de sus extremos
  ];
  const foldSegments = [
    { x1: 50, y1: -3, x2: 50, y2: 98, type: 'FOLD' }     // (50,-3) sobresale 3 mm -> recorta a (50,0); (50,98) corto 2 mm -> prolonga a (50,100)
  ];

  const repaired = DielineEngine.repairOpenEndpoints(cutSegments, foldSegments);
  // Al reparar por distancia más corta primero, (0,4) cierra la esquina (0,0) y (0,0) queda intacto!
  assert.equal(repaired.cutSegments[0].x1, 0);
  assert.equal(repaired.cutSegments[0].y1, 0);
  assert.equal(repaired.cutSegments[3].x2, 0);
  assert.equal(repaired.cutSegments[3].y2, 0);
  // Línea en el vacío intacta
  assert.equal(repaired.cutSegments[4].x1, 140);
  assert.equal(repaired.cutSegments[4].y1, 20);
  assert.equal(repaired.cutSegments[4].x2, 140);
  assert.equal(repaired.cutSegments[4].y2, 80);
  // Hendido recortado arriba a (50,0) y prolongado abajo a (50,100)
  assert.equal(repaired.foldSegments[0].x1, 50);
  assert.equal(repaired.foldSegments[0].y1, 0);
  assert.equal(repaired.foldSegments[0].x2, 50);
  assert.equal(repaired.foldSegments[0].y2, 100);
  assert.equal(repaired.report.extendCount, 2);
  assert.equal(repaired.report.trimCount, 1);
  assert.equal(repaired.report.unchangedCount, 2);
});

test('repairOpenEndpoints elige el cruce más cercano entre prolongar y recortar', () => {
  const cutSegments = [
    { x1: 0, y1: 0, x2: 100, y2: 0, type: 'CUT' },
    { x1: 0, y1: 20, x2: 100, y2: 20, type: 'CUT' }
  ];
  // Segmento vertical de y=-5 a y=12:
  // Extremo inferior y=12: recortar a y=0 está a 12 mm; prolongar a y=20 está a 8 mm -> debe PROLONGAR a y=20
  // Extremo superior y=-5: recortar a y=0 está a 5 mm (no hay nada más arriba) -> debe RECORTAR a y=0
  const foldSegments = [
    { x1: 50, y1: -5, x2: 50, y2: 12, type: 'FOLD' }
  ];

  const { foldSegments: out } = DielineEngine.repairOpenEndpoints(cutSegments, foldSegments);
  assert.equal(out[0].y1, 0);
  assert.equal(out[0].y2, 20);
});

test('los 4 casos de las fotos: estirar, recortar sobrante, recortar si está más cerca y alargar si está más cerca', () => {
  // Foto 1: horizontal corta a la derecha de una vertical -> alarga hasta la vertical
  const f1 = DielineEngine.repairOpenEndpoints(
    [{ x1: 0, y1: 0, x2: 0, y2: 100, type: 'CUT' }],
    [{ x1: 6, y1: 50, x2: 80, y2: 50, type: 'FOLD' }]
  );
  assert.equal(f1.foldSegments[0].x1, 0);

  // Foto 2: horizontal sobresale por la izquierda de una vertical -> recorta el sobrante hasta x=0
  const f2 = DielineEngine.repairOpenEndpoints(
    [{ x1: 0, y1: 0, x2: 0, y2: 100, type: 'CUT' }],
    [{ x1: -8, y1: 50, x2: 80, y2: 50, type: 'FOLD' }]
  );
  assert.equal(f2.foldSegments[0].x1, 0);

  // Foto 3: dos verticales (x=0 y x=40); horizontal cruza x=40 y sobresale poco (x=32 -> 8 mm a x=40 vs 32 mm a x=0) -> RECORTA a x=40
  const f3 = DielineEngine.repairOpenEndpoints(
    [
      { x1: 0, y1: 0, x2: 0, y2: 100, type: 'CUT' },
      { x1: 40, y1: 0, x2: 40, y2: 100, type: 'CUT' }
    ],
    [{ x1: 32, y1: 50, x2: 80, y2: 50, type: 'FOLD' }]
  );
  assert.equal(f3.foldSegments[0].x1, 40);

  // Foto 4: dos verticales (x=0 y x=40); horizontal cruza x=40 y llega hasta x=5 (5 mm a x=0 vs 35 mm a x=40) -> ALARGA a x=0
  const f4 = DielineEngine.repairOpenEndpoints(
    [
      { x1: 0, y1: 0, x2: 0, y2: 100, type: 'CUT' },
      { x1: 40, y1: 0, x2: 40, y2: 100, type: 'CUT' }
    ],
    [{ x1: 5, y1: 50, x2: 80, y2: 50, type: 'FOLD' }]
  );
  assert.equal(f4.foldSegments[0].x1, 0);

  // Foto 3 con rabillo ya partido en la intersección (modelo de biblioteca): el rabillo de 8 mm se elimina recortando hasta x=40
  const f3Split = DielineEngine.repairOpenEndpoints(
    [
      { x1: 0, y1: 0, x2: 0, y2: 100, type: 'CUT' },
      { x1: 40, y1: 0, x2: 40, y2: 100, type: 'CUT' }
    ],
    [
      { x1: 32, y1: 50, x2: 40, y2: 50, type: 'FOLD' },
      { x1: 40, y1: 50, x2: 80, y2: 50, type: 'FOLD' }
    ]
  );
  assert.equal(f3Split.foldSegments.length, 1);
  assert.equal(f3Split.foldSegments[0].x1, 40);
});

test('libraryStore.replace sobreescribe un troquel existente conservando su identificador', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-lib-replace-'));
  try {
    const geom = {
      faces: [{ id: 1, polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
      hinges: [],
      cutSegments: [],
      foldSegments: [],
      bounds: { width: 100, height: 100 },
      rootFaceId: 1
    };
    const original = UserLibrary.create('Caja Prueba', 'C1', geom, 'caja.svg', 1700000000001);
    libraryStore.add(dir, original);

    const updated = UserLibrary.create('Caja Prueba', 'C3', geom, 'caja.svg', original.num);
    libraryStore.replace(dir, updated);

    const loaded = libraryStore.read(dir);
    assert.equal(loaded.models.length, 1);
    assert.equal(loaded.models[0].num, original.num);
    assert.equal(loaded.models[0].boardCode, 'C3');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
