const test = require('node:test');
const assert = require('node:assert/strict');
const VectorCAD = require('../vector-cad');
const UserLibrary = require('../library-models');

test('VectorCAD.eraseInBox borra todas las líneas cruzadas o contenidas por el rectángulo', () => {
  const model = {
    cutSegments: [
      { x1: 0, y1: 50, x2: 100, y2: 50, type: 'CUT' },   // cruzada -> se borra entera
      { x1: 30, y1: 30, x2: 40, y2: 40, type: 'CUT' },   // dentro -> se borra entera
      { x1: 0, y1: 0, x2: 100, y2: 0, type: 'CUT' }      // fuera -> se conserva
    ],
    foldSegments: [
      { x1: 50, y1: 0, x2: 50, y2: 100, type: 'FOLD' },  // cruzada -> se borra entera
      { x1: 90, y1: 0, x2: 90, y2: 100, type: 'FOLD' }   // fuera -> se conserva
    ]
  };
  const box = { minX: 20, maxX: 60, minY: 20, maxY: 80 };
  const out = VectorCAD.eraseInBox(model, box);

  assert.equal(out.cutSegments.length, 1);
  assert.equal(out.cutSegments[0].y1, 0);
  assert.equal(out.foldSegments.length, 1);
  assert.equal(out.foldSegments[0].x1, 90);
});

test('VectorCAD.erasePartialInBox borra solo el tramo interior al rectángulo y conserva los exteriores', () => {
  const model = {
    cutSegments: [
      { x1: 0, y1: 50, x2: 100, y2: 50, type: 'CUT' },   // atraviesa x=[20,60] -> quedan [0,20] y [60,100]
      { x1: 30, y1: 30, x2: 40, y2: 40, type: 'CUT' },   // 100% dentro -> se borra completa
      { x1: 0, y1: 0, x2: 100, y2: 0, type: 'CUT' }      // 100% fuera -> queda intacta
    ],
    foldSegments: [
      { x1: 50, y1: 0, x2: 50, y2: 60, type: 'FOLD' }    // entra en y=20 y acaba dentro en y=60 -> queda [0,20]
    ]
  };
  const box = { minX: 20, maxX: 60, minY: 20, maxY: 80 };
  const out = VectorCAD.erasePartialInBox(model, box);

  assert.equal(out.cutSegments.length, 3);
  assert.deepEqual(
    out.cutSegments.map(s => [s.x1, s.y1, s.x2, s.y2]),
    [
      [0, 50, 20, 50],
      [60, 50, 100, 50],
      [0, 0, 100, 0]
    ]
  );

  assert.equal(out.foldSegments.length, 1);
  assert.deepEqual([out.foldSegments[0].x1, out.foldSegments[0].y1, out.foldSegments[0].x2, out.foldSegments[0].y2], [50, 0, 50, 20]);
});

test('UserLibrary.create conserva foldOrder (pasos, caras y ángulos objetivo) junto con el troquel', () => {
  const geom = {
    faces: [{ id: 1, polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
    hinges: [],
    cutSegments: [],
    foldSegments: [],
    bounds: { width: 100, height: 100 },
    rootFaceId: 1,
    foldOrder: {
      steps: 2,
      map: { '2': 1, '3': 2 },
      targetAngles: { 'h1': 40, 'h2': -40 }
    }
  };
  const saved = UserLibrary.create('Troquel Con Orden', 'C1', geom, 'orden.svg', 1700000000099);
  assert.deepEqual(saved.geometry.foldOrder, geom.foldOrder);
});
