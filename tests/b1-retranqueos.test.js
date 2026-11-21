const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DielineEngine = require('../dieline-engine.js');

const ROOT = path.resolve(__dirname, '..');

function loadBrowserScript(relPath, sandbox = {}) {
  const ctx = { window: sandbox, self: sandbox, ...sandbox };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx);
  return ctx;
}

function makeSyntheticB1Model() {
  // 4 body panels: W=100, L=200, W=100, L=200 (H=150), glue flap on left (w=30),
  // 4 top flaps (height=50, with 2mm slot between flaps), 4 bottom flaps (height=50).
  const yTopOuter = 0;
  const yTopHinge = 50;
  const yBotHinge = 200;
  const yBotOuter = 250;

  const panels = [
    { id: 0, x1: 30, x2: 130, narrow: true },   // W1
    { id: 1, x1: 130, x2: 330, narrow: false }, // L1
    { id: 2, x1: 330, x2: 430, narrow: true },  // W2
    { id: 3, x1: 430, x2: 630, narrow: false }  // L2
  ];

  const makeRect = (x1, y1, x2, y2) => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 }
  ];
  const makeFace = (id, role, poly) => {
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bounds = { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    return {
      id,
      role,
      polygon: poly,
      points: poly,
      holes: [],
      bounds,
      bbox: { ...bounds },
      centroid: { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 },
      areaMm2: bounds.width * bounds.height,
      area: bounds.width * bounds.height
    };
  };

  const faces = [];
  const hinges = [];
  const foldSegments = [];
  const cutSegments = [];

  // Glue flap (id: 100)
  faces.push(makeFace(100, 'GLUE_FLAP', makeRect(0, yTopHinge, 30, yBotHinge)));
  hinges.push({
    id: 'h_glue',
    parentFaceId: 0,
    childFaceId: 100,
    p1: { x: 30, y: yTopHinge },
    p2: { x: 30, y: yBotHinge },
    midpoint: { x: 30, y: (yTopHinge + yBotHinge) * 0.5 }
  });
  foldSegments.push({ x1: 30, y1: yTopHinge, x2: 30, y2: yBotHinge, type: 'FOLD' });

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const topId = 10 + i;
    const botId = 20 + i;
    const slotL = i === 0 ? 0 : 1;
    const slotR = i === 3 ? 0 : 1;

    faces.push(makeFace(p.id, 'BODY', makeRect(p.x1, yTopHinge, p.x2, yBotHinge)));
    faces.push(makeFace(topId, 'FLAP', makeRect(p.x1 + slotL, yTopOuter, p.x2 - slotR, yTopHinge)));
    faces.push(makeFace(botId, 'FLAP', makeRect(p.x1 + slotL, yBotHinge, p.x2 - slotR, yBotOuter)));

    hinges.push({
      id: `h_top_${i}`,
      parentFaceId: p.id,
      childFaceId: topId,
      p1: { x: p.x1, y: yTopHinge },
      p2: { x: p.x2, y: yTopHinge },
      midpoint: { x: (p.x1 + p.x2) * 0.5, y: yTopHinge }
    });
    hinges.push({
      id: `h_bot_${i}`,
      parentFaceId: p.id,
      childFaceId: botId,
      p1: { x: p.x1, y: yBotHinge },
      p2: { x: p.x2, y: yBotHinge },
      midpoint: { x: (p.x1 + p.x2) * 0.5, y: yBotHinge }
    });
    foldSegments.push({ x1: p.x1, y1: yTopHinge, x2: p.x2, y2: yTopHinge, type: 'FOLD' });
    foldSegments.push({ x1: p.x1, y1: yBotHinge, x2: p.x2, y2: yBotHinge, type: 'FOLD' });

    if (i < 3) {
      hinges.push({
        id: `h_v_${i}`,
        parentFaceId: p.id,
        childFaceId: panels[i + 1].id,
        p1: { x: p.x2, y: yTopHinge },
        p2: { x: p.x2, y: yBotHinge },
        midpoint: { x: p.x2, y: (yTopHinge + yBotHinge) * 0.5 }
      });
      foldSegments.push({ x1: p.x2, y1: yTopHinge, x2: p.x2, y2: yBotHinge, type: 'FOLD' });
    }

    // Top flap cuts (left, top, right)
    cutSegments.push({ x1: p.x1 + slotL, y1: yTopHinge, x2: p.x1 + slotL, y2: yTopOuter, type: 'CUT' });
    cutSegments.push({ x1: p.x1 + slotL, y1: yTopOuter, x2: p.x2 - slotR, y2: yTopOuter, type: 'CUT' });
    cutSegments.push({ x1: p.x2 - slotR, y1: yTopOuter, x2: p.x2 - slotR, y2: yTopHinge, type: 'CUT' });

    // Bottom flap cuts (left, bottom, right)
    cutSegments.push({ x1: p.x1 + slotL, y1: yBotHinge, x2: p.x1 + slotL, y2: yBotOuter, type: 'CUT' });
    cutSegments.push({ x1: p.x1 + slotL, y1: yBotOuter, x2: p.x2 - slotR, y2: yBotOuter, type: 'CUT' });
    cutSegments.push({ x1: p.x2 - slotR, y1: yBotOuter, x2: p.x2 - slotR, y2: yBotHinge, type: 'CUT' });
  }

  return {
    rootFaceId: 1,
    faces,
    hinges,
    cutSegments,
    foldSegments,
    cutSegmentsMm: cutSegments,
    foldSegmentsMm: foldSegments,
    bounds: { minX: 0, maxX: 630, minY: 0, maxY: 250, width: 630, height: 250 },
    blankWidthMm: 630,
    blankHeightMm: 250
  };
}

test('detectB1AmericanBox identifies B1 topology and narrow/wide panels', () => {
  const model = makeSyntheticB1Model();
  const info = DielineEngine.detectB1AmericanBox(model);
  assert.equal(info.isB1, true);
  assert.equal(info.narrowColumns.length, 2);
  assert.equal(info.wideColumns.length, 2);
  assert.deepEqual(info.narrowColumns.map(c => c.bodyFace.id), [0, 2]);
  assert.deepEqual(info.wideColumns.map(c => c.bodyFace.id), [1, 3]);
});

test('detectB1AmericanBox rejects non-B1 models', () => {
  const nonB1 = {
    faces: [{ id: 0, polygon: [], bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 100, height: 100 }, centroid: { x: 50, y: 50 } }],
    hinges: []
  };
  assert.equal(DielineEngine.detectB1AmericanBox(nonB1).isB1, false);
});

test('applyB1Retranqueo(3 mm) moves wide (largo) creases ±3 mm, all flap edges ±6 mm (wide flaps +3 mm, narrow flaps +6 mm)', () => {
  const base = makeSyntheticB1Model();
  const res = DielineEngine.applyB1Retranqueo(base, 3);
  assert.equal(res.b1RetranqueoMm, 3);

  const byId = new Map(res.faces.map(f => [f.id, f]));
  const hingeById = new Map(res.hinges.map(h => [h.id, h]));

  // Narrow (ancho) panels (0 and 2): creases unchanged (50 / 200), outer flap edges moved ±6 mm, flap length +6 mm (56 mm)
  for (const idx of [0, 2]) {
    const body = byId.get(idx);
    const topFlap = byId.get(10 + idx);
    const botFlap = byId.get(20 + idx);
    const hTop = hingeById.get(`h_top_${idx}`);
    const hBot = hingeById.get(`h_bot_${idx}`);

    assert.equal(hTop.p1.y, 50);
    assert.equal(hTop.p2.y, 50);
    assert.equal(hBot.p1.y, 200);
    assert.equal(hBot.p2.y, 200);

    assert.equal(body.bounds.minY, 50);
    assert.equal(body.bounds.maxY, 200);
    assert.equal(body.bounds.height, 150);

    assert.equal(topFlap.bounds.minY, -6);
    assert.equal(topFlap.bounds.maxY, 50);
    assert.equal(topFlap.bounds.height, 56);

    assert.equal(botFlap.bounds.minY, 200);
    assert.equal(botFlap.bounds.maxY, 256);
    assert.equal(botFlap.bounds.height, 56);
  }

  // Wide (largo) panels (1 and 3): creases moved ±3 mm (47 / 203), outer flap edges moved ±6 mm, flap length +3 mm (53 mm)
  for (const idx of [1, 3]) {
    const body = byId.get(idx);
    const topFlap = byId.get(10 + idx);
    const botFlap = byId.get(20 + idx);
    const hTop = hingeById.get(`h_top_${idx}`);
    const hBot = hingeById.get(`h_bot_${idx}`);

    assert.equal(hTop.p1.y, 47);
    assert.equal(hBot.p1.y, 203);
    assert.equal(body.bounds.minY, 47);
    assert.equal(body.bounds.maxY, 203);
    assert.equal(body.bounds.height, 156);

    assert.equal(topFlap.bounds.minY, -6);
    assert.equal(topFlap.bounds.maxY, 47);
    assert.equal(topFlap.bounds.height, 53);

    assert.equal(botFlap.bounds.minY, 203);
    assert.equal(botFlap.bounds.maxY, 256);
    assert.equal(botFlap.bounds.height, 53);
  }

  // Vertical fold segments remain untouched
  const verticalFolds = res.foldSegments.filter(s => Math.abs(s.x1 - s.x2) < 1e-6);
  for (const vf of verticalFolds) {
    assert.equal(vf.y1, 50);
    assert.equal(vf.y2, 200);
  }

  // Switching 3 -> 4.5 and resetting 4.5 -> 0
  const r45 = DielineEngine.applyB1Retranqueo(res, 4.5);
  assert.equal(r45.faces.find(f => f.id === 10).bounds.minY, -9);
  assert.equal(r45.faces.find(f => f.id === 11).bounds.minY, -9);
  assert.equal(r45.hinges.find(h => h.id === 'h_top_1').p1.y, 45.5);

  const r0 = DielineEngine.applyB1Retranqueo(r45, 0);
  assert.equal(r0.faces.find(f => f.id === 10).bounds.minY, 0);
  assert.equal(r0.faces.find(f => f.id === 11).bounds.minY, 0);
  assert.equal(r0.hinges.find(h => h.id === 'h_top_1').p1.y, 50);
});

test('real ARTIOS_DEFAULT_SVG (b1 caja americana.svg) is detected as B1 and retranqueo 3 mm updates creases & flaps accurately', () => {
  const ctx = loadBrowserScript('artios-assets.js');
  const base = DielineEngine.buildDielineModel(ctx.ARTIOS_DEFAULT_SVG);
  const info = DielineEngine.detectB1AmericanBox(base);
  assert.equal(info.isB1, true);
  assert.equal(info.narrowColumns.length, 2);
  assert.equal(info.wideColumns.length, 2);

  const res = DielineEngine.applyB1Retranqueo(base, 3);
  const byId = new Map(res.faces.map(f => [String(f.id), f]));
  const hingeById = new Map(res.hinges.map(h => [String(h.id), h]));

  for (const col of info.narrowColumns) {
    const hTop = hingeById.get(String(col.topHinge.id));
    const hBot = hingeById.get(String(col.botHinge.id));
    const topFlap = byId.get(String(col.topFlap.id));
    const botFlap = byId.get(String(col.botFlap.id));

    assert.ok(Math.abs(hTop.p1.y - col.topHinge.p1.y) < 1e-4);
    assert.ok(Math.abs(hBot.p1.y - col.botHinge.p1.y) < 1e-4);
    assert.ok(Math.abs(topFlap.bounds.minY - (col.yTopOuter - 6)) < 1e-4);
    assert.ok(Math.abs(botFlap.bounds.maxY - (col.yBotOuter + 6)) < 1e-4);
    assert.ok(Math.abs(topFlap.bounds.height - (col.topFlap.bounds.height + 6)) < 1e-4);
    assert.ok(Math.abs(botFlap.bounds.height - (col.botFlap.bounds.height + 6)) < 1e-4);
  }

  for (const col of info.wideColumns) {
    const hTop = hingeById.get(String(col.topHinge.id));
    const hBot = hingeById.get(String(col.botHinge.id));
    const topFlap = byId.get(String(col.topFlap.id));
    const botFlap = byId.get(String(col.botFlap.id));

    assert.ok(Math.abs(hTop.p1.y - (col.topHinge.p1.y - 3)) < 1e-4);
    assert.ok(Math.abs(hBot.p1.y - (col.botHinge.p1.y + 3)) < 1e-4);
    assert.ok(Math.abs(topFlap.bounds.minY - (col.yTopOuter - 6)) < 1e-4);
    assert.ok(Math.abs(botFlap.bounds.maxY - (col.yBotOuter + 6)) < 1e-4);
    assert.ok(Math.abs(topFlap.bounds.height - (col.topFlap.bounds.height + 3)) < 1e-4);
    assert.ok(Math.abs(botFlap.bounds.height - (col.botFlap.bounds.height + 3)) < 1e-4);
  }
});

test('real Pacdora FEFCO 0201 is detected as B1 (and FEFCO 0427 is rejected)', () => {
  const ctx = loadBrowserScript('assets/fefco-catalog.js');
  const catalog = ctx.FEFCO_CATALOG || [];
  const entry0201 = catalog.find(e => e.code === '0201' || e.num === 200010);
  assert.ok(entry0201, 'FEFCO 0201 entry should exist in catalog');
  const model0201 = DielineEngine.buildDielineModelFromPacdora(entry0201.knifeData, entry0201);
  const info0201 = DielineEngine.detectB1AmericanBox(model0201);
  assert.equal(info0201.isB1, true);

  const res0201 = DielineEngine.applyB1Retranqueo(model0201, 4.5);
  const byId = new Map(res0201.faces.map(f => [String(f.id), f]));
  for (const col of info0201.narrowColumns) {
    assert.ok(Math.abs(byId.get(String(col.topFlap.id)).bounds.minY - (col.yTopOuter - 9)) < 1e-4);
    assert.ok(Math.abs(byId.get(String(col.botFlap.id)).bounds.maxY - (col.yBotOuter + 9)) < 1e-4);
  }
  for (const col of info0201.wideColumns) {
    assert.ok(Math.abs(byId.get(String(col.topFlap.id)).bounds.minY - (col.yTopOuter - 9)) < 1e-4);
    assert.ok(Math.abs(byId.get(String(col.botFlap.id)).bounds.maxY - (col.yBotOuter + 9)) < 1e-4);
  }

  const entryNonB1 = catalog.find(e => e.code === '0427');
  if (entryNonB1) {
    const modelNonB1 = DielineEngine.buildDielineModelFromPacdora(entryNonB1.knifeData, entryNonB1);
    assert.equal(DielineEngine.detectB1AmericanBox(modelNonB1).isB1, false);
  }
});

test('applyB1Retranqueo reduces X width of faces 1 and 4 by 1/2/3/4 mm for 1.5/3/4.5/7 mm without altering faces 2, 3 or glue flap', () => {
  const base = makeSyntheticB1Model();
  const cases = [
    [1.5, 1],
    [3, 2],
    [4.5, 3],
    [7, 4],
    [0, 0]
  ];

  let current = base;
  for (const [optMm, expectedRed] of cases) {
    current = DielineEngine.applyB1Retranqueo(current, optMm);
    const byId = new Map(current.faces.map(f => [f.id, f]));
    assert.equal(byId.get(0).bounds.width, 100 - expectedRed, `Cara 1 width for ${optMm} mm`);
    assert.equal(byId.get(1).bounds.width, 200, `Cara 2 width unchanged for ${optMm} mm`);
    assert.equal(byId.get(2).bounds.width, 100, `Cara 3 width unchanged for ${optMm} mm`);
    assert.equal(byId.get(3).bounds.width, 200 - expectedRed, `Cara 4 width for ${optMm} mm`);
    assert.equal(byId.get(100).bounds.width, 30, `Glue flap width unchanged for ${optMm} mm`);
    assert.equal(byId.get(10).bounds.width, 99 - expectedRed, `Cara 1 top flap width for ${optMm} mm`);
    assert.equal(byId.get(13).bounds.width, 199 - expectedRed, `Cara 4 top flap width for ${optMm} mm`);
  }

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="btn-b1-retranqueo-done"'), 'LISTO button exists in index.html');
  assert.ok(html.includes('>LISTO<'), 'LISTO label exists in index.html');
});

test('applyB1Retranqueo trims shifted wide horizontal foldSegments to cut intersections and restores on 0 mm', () => {
  const base = makeSyntheticB1Model();
  const r3 = DielineEngine.applyB1Retranqueo(base, 3);

  // Panel 1 (wide, X=[130, 330], slot cuts at 131 and 329): folds at y=47 and y=203 must be trimmed to [131, 329]
  const col1Folds = r3.foldSegments.filter(s => Math.abs(s.y1 - s.y2) < 1e-6 && (s.x1 + s.x2) * 0.5 > 130 && (s.x1 + s.x2) * 0.5 < 330);
  assert.equal(col1Folds.length, 2);
  for (const f of col1Folds) {
    assert.ok(Math.abs(Math.min(f.x1, f.x2) - 131) < 1e-4);
    assert.ok(Math.abs(Math.max(f.x1, f.x2) - 329) < 1e-4);
  }

  // Panel 3 (wide, X=[430, 628] after -2mm X reduction, left slot cut at 431, right outer cut at 628)
  const col3Folds = r3.foldSegments.filter(s => Math.abs(s.y1 - s.y2) < 1e-6 && (s.x1 + s.x2) * 0.5 > 430 && (s.x1 + s.x2) * 0.5 < 630);
  assert.equal(col3Folds.length, 2);
  for (const f of col3Folds) {
    assert.ok(Math.abs(Math.min(f.x1, f.x2) - 431) < 1e-4);
    assert.ok(Math.abs(Math.max(f.x1, f.x2) - 628) < 1e-4);
  }

  // Resetting to 0 mm restores original unclipped endpoints
  const r0 = DielineEngine.applyB1Retranqueo(r3, 0);
  const col1Folds0 = r0.foldSegments.filter(s => Math.abs(s.y1 - s.y2) < 1e-6 && (s.x1 + s.x2) * 0.5 > 130 && (s.x1 + s.x2) * 0.5 < 330);
  for (const f of col1Folds0) {
    assert.ok(Math.abs(Math.min(f.x1, f.x2) - 130) < 1e-4);
    assert.ok(Math.abs(Math.max(f.x1, f.x2) - 330) < 1e-4);
  }
  const col3Folds0 = r0.foldSegments.filter(s => Math.abs(s.y1 - s.y2) < 1e-6 && (s.x1 + s.x2) * 0.5 > 430 && (s.x1 + s.x2) * 0.5 <= 630);
  for (const f of col3Folds0) {
    assert.ok(Math.abs(Math.min(f.x1, f.x2) - 430) < 1e-4);
    assert.ok(Math.abs(Math.max(f.x1, f.x2) - 630) < 1e-4);
  }

  // Also verify on real ARTIOS_DEFAULT_SVG: shifted wide folds must not cross any cut segment
  const ctx = loadBrowserScript('artios-assets.js');
  const artiosBase = DielineEngine.buildDielineModel(ctx.ARTIOS_DEFAULT_SVG);
  const artiosR3 = DielineEngine.applyB1Retranqueo(artiosBase, 3);
  const artiosInfo = DielineEngine.detectB1AmericanBox(artiosR3);
  for (const col of artiosInfo.wideColumns) {
    const bxMin = col.bodyFace.bounds.minX - 0.5;
    const bxMax = col.bodyFace.bounds.maxX + 0.5;
    const wideFolds = artiosR3.foldSegments.filter(s => Math.abs(s.y1 - s.y2) <= 1.5 && (s.x1 + s.x2) * 0.5 >= bxMin && (s.x1 + s.x2) * 0.5 <= bxMax);
    assert.equal(wideFolds.length, 2);
    for (const f of wideFolds) {
      const fMinX = Math.min(f.x1, f.x2);
      const fMaxX = Math.max(f.x1, f.x2);
      const fy = (f.y1 + f.y2) * 0.5;
      for (const c of artiosR3.cutSegments) {
        if (Math.abs(c.y2 - c.y1) < 1e-6) continue;
        if (fy < Math.min(c.y1, c.y2) - 1e-4 || fy > Math.max(c.y1, c.y2) + 1e-4) continue;
        const t = Math.max(0, Math.min(1, (fy - c.y1) / (c.y2 - c.y1)));
        const ix = c.x1 + t * (c.x2 - c.x1);
        assert.ok(!(ix > fMinX + 1e-3 && ix < fMaxX - 1e-3), `Fold segment [${fMinX}, ${fMaxX}] at y=${fy} should not cross cut at x=${ix}`);
      }
    }
  }
});
