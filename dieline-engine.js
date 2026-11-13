/**
 * ARTIOS-LIKE 3D PACKAGING ENGINE - CORE GEOMETRY, TOPOLOGY, FEFCO & PARAMETRIC SOLVER
 * Parses 1:1 mm SVG dielines (Blue = Cut, Red/Magenta = Fold, Black = Dimension/Cota)
 * AND Pacdora / FEFCO parametric knifeData models (faces, dlist M/L/A/Q/Z, holes, cuts, folds, animations),
 * performs Planar Half-Edge Subdivision (DCEL) or direct parametric topology extraction,
 * and supports real-time 2D + 3D Parametric Resizing (Largo L × Ancho W × Alto H) for any model.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DielineEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============================================================================
  // 0. OFFICIAL ARTIOSCAD 12.0 BOARD & MATERIAL DATABASE
  //    Extracted from Esko ArtiosCAD 12.0 (Databa~1.cab & Artios~1.cab)
  // ============================================================================

  const ARTIOS_BOARDS = [
    {
      code: 'M-125B',
      name: 'M-125B · Cartón Corrugado Canal B Kraft (3.0 mm)',
      category: 'Corrugado Simple (Canal B)',
      caliperMm: 3.0,
      flute: 'B',
      insideLossMm: 2.0,
      outsideGainMm: 1.0,
      grammageGsm: 420,
      outerTexture: 'assets/textures/boardbrown.jpg',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/boardedge3.JPG',
      flutePitchMm: 6.5,
      outerColor: '#b5895a',
      innerColor: '#aa7e50',
      edgeColor: '#9c7043',
      roughness: 0.78
    },
    {
      code: 'M-125E',
      name: 'M-125E · Microcanal E Kraft (1.5 mm)',
      category: 'Microcorrugado (Canal E)',
      caliperMm: 1.5,
      flute: 'E',
      insideLossMm: 1.0,
      outsideGainMm: 1.0,
      grammageGsm: 410,
      outerTexture: 'assets/textures/boardbrown.jpg',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/boardedge3.JPG',
      flutePitchMm: 3.5,
      outerColor: '#ba8e60',
      innerColor: '#ae8254',
      edgeColor: '#9c7043',
      roughness: 0.75
    },
    {
      code: 'M-125C',
      name: 'M-125C · Cartón Corrugado Canal C Kraft (4.0 mm)',
      category: 'Corrugado Simple (Canal C)',
      caliperMm: 4.0,
      flute: 'C',
      insideLossMm: 2.0,
      outsideGainMm: 2.0,
      grammageGsm: 435,
      outerTexture: 'assets/textures/boardbrown.jpg',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/boardedge3.JPG',
      flutePitchMm: 7.8,
      outerColor: '#b08354',
      innerColor: '#a5794b',
      edgeColor: '#96693d',
      roughness: 0.80
    },
    {
      code: 'M-200BC',
      name: 'M-200BC · Doble Canal BC Kraft Industrial (7.0 mm)',
      category: 'Doble Corrugado (Canal BC)',
      caliperMm: 7.0,
      flute: 'BC',
      insideLossMm: 4.0,
      outsideGainMm: 3.0,
      grammageGsm: 799,
      outerTexture: 'assets/textures/boardbrown.jpg',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/boardedge_double.jpg',
      flutePitchMm: 7.5,
      outerColor: '#ad8050',
      innerColor: '#a37648',
      edgeColor: '#8e6236',
      roughness: 0.82
    },
    {
      code: 'W-175B',
      name: 'W-175B · Canal B Blanco Estucado / Interior Kraft (3.0 mm)',
      category: 'Corrugado Blanco / Expositores',
      caliperMm: 3.0,
      flute: 'B',
      insideLossMm: 2.0,
      outsideGainMm: 1.0,
      grammageGsm: 530,
      outerTexture: 'assets/textures/WhiteBoard3.JPG',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/boardedge3.JPG',
      flutePitchMm: 6.5,
      outerColor: '#f2f0eb',
      innerColor: '#b5895a',
      edgeColor: '#a67b4e',
      roughness: 0.45
    },
    {
      code: 'W-125E-MOT',
      name: 'W-125E · Microcanal E Blanco Jaspeado (1.5 mm)',
      category: 'Corrugado Blanco / Expositores',
      caliperMm: 1.5,
      flute: 'E',
      insideLossMm: 1.0,
      outsideGainMm: 1.0,
      grammageGsm: 440,
      outerTexture: 'assets/textures/boardmottled.JPG',
      innerTexture: 'assets/textures/boardtan.JPG',
      edgeTexture: 'assets/textures/boardedge3.JPG',
      flutePitchMm: 3.5,
      outerColor: '#e6e2d8',
      innerColor: '#c9a679',
      edgeColor: '#a88156',
      roughness: 0.55
    },
    {
      code: 'M-SBS-400',
      name: 'M-SBS-400 · Cartulina Estucada Blanca Folding (0.55 mm)',
      category: 'Cartulina / Estuchería (Folding)',
      caliperMm: 0.55,
      flute: 'SBS',
      insideLossMm: 0.25,
      outsideGainMm: 0.25,
      grammageGsm: 400,
      outerTexture: 'assets/textures/WhiteBoard3.JPG',
      innerTexture: 'assets/textures/WhiteBoard3.JPG',
      edgeTexture: 'assets/textures/WhiteEdge1.JPG',
      flutePitchMm: 2.0,
      outerColor: '#f7f7f5',
      innerColor: '#efede8',
      edgeColor: '#dcd9d0',
      roughness: 0.35
    },
    {
      code: 'M-WCC-600',
      name: 'M-WCC-600 · Cartoncillo Estucado Reverso Gris (0.65 mm)',
      category: 'Cartulina / Estuchería (Folding)',
      caliperMm: 0.65,
      flute: 'WCC',
      insideLossMm: 0.3,
      outsideGainMm: 0.3,
      grammageGsm: 600,
      outerTexture: 'assets/textures/WhiteBoard3.JPG',
      innerTexture: 'assets/textures/GreyBoard3.JPG',
      edgeTexture: 'assets/textures/GreyEdge3.JPG',
      flutePitchMm: 2.0,
      outerColor: '#f4f4f2',
      innerColor: '#8d8e91',
      edgeColor: '#7a7b7e',
      roughness: 0.42
    },
    {
      code: 'REBOARD-10',
      name: 'REBOARD-10 · Cartón Estructural Re-board (10.0 mm)',
      category: 'Estructural / PLV / Nido de Abeja',
      caliperMm: 10.0,
      flute: 'RB',
      insideLossMm: 5.0,
      outsideGainMm: 5.0,
      grammageGsm: 1100,
      outerTexture: 'assets/textures/boardtan.JPG',
      innerTexture: 'assets/textures/boardtan.JPG',
      edgeTexture: 'assets/textures/reboardedge.jpg',
      flutePitchMm: 12.0,
      outerColor: '#cca97c',
      innerColor: '#c4a072',
      edgeColor: '#9c784c',
      roughness: 0.68
    },
    {
      code: 'HEX-12',
      name: 'HEX-12 · Panel Nido de Abeja Hexacomb (12.0 mm)',
      category: 'Estructural / PLV / Nido de Abeja',
      caliperMm: 12.0,
      flute: 'HEX',
      insideLossMm: 6.0,
      outsideGainMm: 6.0,
      grammageGsm: 1250,
      outerTexture: 'assets/textures/boardbrown.jpg',
      innerTexture: 'assets/textures/boardbrown.jpg',
      edgeTexture: 'assets/textures/hexacombedge.JPG',
      flutePitchMm: 15.0,
      outerColor: '#b88b5d',
      innerColor: '#b08355',
      edgeColor: '#946a3e',
      roughness: 0.76
    },
    {
      code: 'FOAM-5',
      name: 'FOAM-5 · Cartón Pluma / Foamboard Blanco (5.0 mm)',
      category: 'Espuma / PLV',
      caliperMm: 5.0,
      flute: 'FOAM',
      insideLossMm: 2.5,
      outsideGainMm: 2.5,
      grammageGsm: 650,
      outerTexture: 'assets/textures/WhiteBoard3.JPG',
      innerTexture: 'assets/textures/WhiteBoard3.JPG',
      edgeTexture: 'assets/textures/foam_core_edge.jpg',
      flutePitchMm: 8.0,
      outerColor: '#f5f5f5',
      innerColor: '#f0f0f0',
      edgeColor: '#e2e2e2',
      roughness: 0.40
    }
  ];

  // ============================================================================
  // 1. COLOR & SVG ELEMENT CLASSIFICATION
  // ============================================================================

  function parseHexOrRgb(colorStr) {
    if (!colorStr) return null;
    const s = colorStr.trim().toLowerCase();
    if (s === 'none' || s === 'transparent') return null;
    if (s === 'red' || s === 'magenta' || s === 'crimson') return { r: 255, g: 0, b: 0 };
    if (s === 'blue' || s === 'cyan' || s === 'deepskyblue' || s === 'dodgerblue') return { r: 0, g: 158, b: 227 };
    if (s === 'black') return { r: 0, g: 0, b: 0 };
    if (s === 'white') return { r: 255, g: 255, b: 255 };

    if (s.startsWith('#')) {
      let hex = s.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length >= 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      }
    }
    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
    }
    return null;
  }

  function classifyStrokeColor(strokeStr) {
    const rgb = parseHexOrRgb(strokeStr);
    if (!rgb) return 'IGNORE';
    const { r, g, b } = rgb;
    if (r > 140 && r > g * 1.6 && r >= b * 0.8) {
      return 'FOLD';
    }
    if (b > 120 && b > r * 1.5) {
      return 'CUT';
    }
    if (r < 60 && g < 60 && b < 60) {
      return 'DIMENSION';
    }
    return 'OTHER';
  }

  // ============================================================================
  // 2. SVG ARC TESSELLATOR & LIGHTWEIGHT REGEX SVG PARSER
  // ============================================================================

  /**
   * Tessellates an SVG elliptical arc from (x1, y1) to (x2, y2) into linear points.
   */
  function sampleSvgArc(x1, y1, rxIn, ryIn, phiDeg, largeArcFlag, sweepFlag, x2, y2, steps = 10) {
    const dx2 = (x1 - x2) / 2.0;
    const dy2 = (y1 - y2) / 2.0;
    if (Math.hypot(dx2, dy2) < 1e-5) return [{ x: x2, y: y2 }];

    let rx = Math.abs(rxIn || 0);
    let ry = Math.abs(ryIn || 0);
    if (rx < 1e-5 || ry < 1e-5) return [{ x: x2, y: y2 }];

    const phi = ((phiDeg || 0) * Math.PI) / 180.0;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const x1p = cosPhi * dx2 + sinPhi * dy2;
    const y1p = -sinPhi * dx2 + cosPhi * dy2;

    let rxSq = rx * rx;
    let rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;

    const lambda = x1pSq / rxSq + y1pSq / rySq;
    if (lambda > 1.0) {
      const sqrtL = Math.sqrt(lambda);
      rx *= sqrtL;
      ry *= sqrtL;
      rxSq = rx * rx;
      rySq = ry * ry;
    }

    const fa = largeArcFlag ? 1 : 0;
    const fs = sweepFlag ? 1 : 0;
    const sign = fa === fs ? -1 : 1;
    const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
    const den = rxSq * y1pSq + rySq * x1pSq;
    const coef = sign * Math.sqrt(den > 1e-12 ? num / den : 0);

    const cxp = coef * ((rx * y1p) / ry);
    const cyp = coef * (-(ry * x1p) / rx);

    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2.0;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2.0;

    function vecAngle(ux, uy, vx, vy) {
      const dot = ux * vx + uy * vy;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      const ang = Math.acos(Math.max(-1, Math.min(1, len > 1e-12 ? dot / len : 1)));
      return ux * vy - uy * vx < 0 ? -ang : ang;
    }

    const ux = (x1p - cxp) / rx;
    const uy = (y1p - cyp) / ry;
    const vx = (-x1p - cxp) / rx;
    const vy = (-y1p - cyp) / ry;

    const theta1 = vecAngle(1, 0, ux, uy);
    let dTheta = vecAngle(ux, uy, vx, vy);
    if (!fs && dTheta > 0) dTheta -= 2 * Math.PI;
    else if (fs && dTheta < 0) dTheta += 2 * Math.PI;

    const arcLenApprox = Math.abs(dTheta) * Math.max(rx, ry);
    const nSteps = Math.max(3, Math.min(steps, Math.ceil(arcLenApprox / 2.2)));
    const pts = [];
    for (let i = 1; i <= nSteps; i++) {
      const t = i / nSteps;
      const theta = theta1 + dTheta * t;
      const px = cosPhi * rx * Math.cos(theta) - sinPhi * ry * Math.sin(theta) + cx;
      const py = sinPhi * rx * Math.cos(theta) + cosPhi * ry * Math.sin(theta) + cy;
      pts.push({ x: px, y: py });
    }
    return pts;
  }

  function parseAttributes(attrString) {
    const attrs = {};
    const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = regex.exec(attrString)) !== null) {
      attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
    }
    return attrs;
  }

  function svgClassStyleRules(svgText) {
    const rules = [];
    for (const block of svgText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
      const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = {};
        for (const property of rule[2].matchAll(/(?:^|;)\s*(stroke|fill)\s*:\s*([^;]+)/gi)) {
          declarations[property[1].toLowerCase()] = property[2].trim();
        }
        for (const selector of rule[1].split(',')) {
          const classes = /^\.([\w-]+(?:\.[\w-]+)*)$/.exec(selector.trim());
          if (classes) rules.push({classes: classes[1].split('.'), declarations});
        }
      }
    }
    // Higher specificity wins; equal specificity follows source order.
    return rules.sort((a, b) => a.classes.length - b.classes.length);
  }

  function parseStyleStroke(attrs, classRules = []) {
    let stroke = attrs.stroke || null;
    let fill = attrs.fill || null;
    const classes = new Set((attrs.class || '').split(/\s+/));
    for (const rule of classRules) {
      if (!rule.classes.every(name => classes.has(name))) continue;
      if (rule.declarations.stroke !== undefined) stroke = rule.declarations.stroke;
      if (rule.declarations.fill !== undefined) fill = rule.declarations.fill;
    }
    if (attrs.style) {
      const sm = attrs.style.match(/stroke\s*:\s*([^;]+)/i);
      if (sm) stroke = sm[1].trim();
      const fm = attrs.style.match(/fill\s*:\s*([^;]+)/i);
      if (fm) fill = fm[1].trim();
    }
    return { stroke, fill };
  }

  function parsePathData(d) {
    if (!d) return [];
    const subpaths = [];
    let current = [];
    let cx = 0, cy = 0;
    let startX = 0, startY = 0;

    const tokens = d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
    if (!tokens) return [];

    let i = 0;
    let cmd = '';
    const nextNum = () => parseFloat(tokens[i++]);
    const hasNum = () => i < tokens.length && !/^[a-df-zA-DF-Z]$/.test(tokens[i]);

    while (i < tokens.length) {
      if (/^[a-df-zA-DF-Z]$/.test(tokens[i])) {
        cmd = tokens[i++];
      }
      switch (cmd) {
        case 'M':
        case 'm': {
          const isRel = cmd === 'm';
          const x = nextNum() + (isRel ? cx : 0);
          const y = nextNum() + (isRel ? cy : 0);
          if (current.length > 1) subpaths.push(current);
          current = [{ x, y }];
          cx = startX = x;
          cy = startY = y;
          cmd = isRel ? 'l' : 'L';
          break;
        }
        case 'L':
        case 'l': {
          const isRel = cmd === 'l';
          while (hasNum()) {
            cx = nextNum() + (isRel ? cx : 0);
            cy = nextNum() + (isRel ? cy : 0);
            current.push({ x: cx, y: cy });
          }
          break;
        }
        case 'H':
        case 'h': {
          const isRel = cmd === 'h';
          while (hasNum()) {
            cx = nextNum() + (isRel ? cx : 0);
            current.push({ x: cx, y: cy });
          }
          break;
        }
        case 'V':
        case 'v': {
          const isRel = cmd === 'v';
          while (hasNum()) {
            cy = nextNum() + (isRel ? cy : 0);
            current.push({ x: cx, y: cy });
          }
          break;
        }
        case 'A':
        case 'a': {
          const isRel = cmd === 'a';
          while (hasNum()) {
            const rx = nextNum();
            const ry = nextNum();
            const xAxisRot = nextNum();
            const largeArc = nextNum();
            const sweep = nextNum();
            const x = nextNum() + (isRel ? cx : 0);
            const y = nextNum() + (isRel ? cy : 0);
            const arcPts = sampleSvgArc(cx, cy, rx, ry, xAxisRot, largeArc, sweep, x, y, 10);
            for (const pt of arcPts) current.push(pt);
            cx = x;
            cy = y;
          }
          break;
        }
        case 'C':
        case 'c': {
          const isRel = cmd === 'c';
          while (hasNum()) {
            const x1 = nextNum() + (isRel ? cx : 0);
            const y1 = nextNum() + (isRel ? cy : 0);
            const x2 = nextNum() + (isRel ? cx : 0);
            const y2 = nextNum() + (isRel ? cy : 0);
            const x = nextNum() + (isRel ? cx : 0);
            const y = nextNum() + (isRel ? cy : 0);
            const steps = 10;
            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const mt = 1 - t;
              const px = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
              const py = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
              current.push({ x: px, y: py });
            }
            cx = x;
            cy = y;
          }
          break;
        }
        case 'Q':
        case 'q': {
          const isRel = cmd === 'q';
          while (hasNum()) {
            const x1 = nextNum() + (isRel ? cx : 0);
            const y1 = nextNum() + (isRel ? cy : 0);
            const x = nextNum() + (isRel ? cx : 0);
            const y = nextNum() + (isRel ? cy : 0);
            const steps = 8;
            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const mt = 1 - t;
              const px = mt * mt * cx + 2 * mt * t * x1 + t * t * x;
              const py = mt * mt * cy + 2 * mt * t * y1 + t * t * y;
              current.push({ x: px, y: py });
            }
            cx = x;
            cy = y;
          }
          break;
        }
        case 'Z':
        case 'z': {
          if (current.length > 0) {
            current.push({ x: startX, y: startY });
            subpaths.push(current);
            current = [];
          }
          cx = startX;
          cy = startY;
          break;
        }
        default: {
          while (hasNum()) nextNum();
          break;
        }
      }
    }
    if (current.length > 1) subpaths.push(current);
    return subpaths;
  }

  function parsePointsList(pointsStr) {
    if (!pointsStr) return [];
    const nums = pointsStr.trim().match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
    if (!nums || nums.length < 4) return [];
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) });
    }
    return pts;
  }

  function simplifyPolyline(pts, epsilon) {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let index = 0;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    for (let i = 1; i < pts.length - 1; i++) {
      let dist;
      if (lenSq < 1e-12) {
        dist = Math.hypot(pts[i].x - start.x, pts[i].y - start.y);
      } else {
        const t = Math.max(0, Math.min(1, ((pts[i].x - start.x) * dx + (pts[i].y - start.y) * dy) / lenSq));
        const projX = start.x + t * dx;
        const projY = start.y + t * dy;
        dist = Math.hypot(pts[i].x - projX, pts[i].y - projY);
      }
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }

    if (maxDist > epsilon) {
      const left = simplifyPolyline(pts.slice(0, index + 1), epsilon);
      const right = simplifyPolyline(pts.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    }
    return [start, end];
  }

  // ============================================================================
  // 3. PARSE SVG DIELINE & DETECT 1:1 MILLIMETER SCALE FROM COTA
  // ============================================================================

  function parseSVGDieline(svgText) {
    const classRules = svgClassStyleRules(svgText);
    let cotaMmValue = null;
    let cotaLabel = null;

    const textMatches = svgText.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
    if (textMatches) {
      cotaMmValue = parseFloat(textMatches[1].replace(',', '.'));
      cotaLabel = textMatches[0];
    }

    const rawCutPolylines = [];
    const rawFoldSegments = [];
    const dimensionLines = [];

    const tagRegex = /<(line|polyline|polygon|path|rect)\b([^>]*)\/?>/gi;
    let match;
    while ((match = tagRegex.exec(svgText)) !== null) {
      const tag = match[1].toLowerCase();
      const attrs = parseAttributes(match[2]);
      const { stroke } = parseStyleStroke(attrs, classRules);
      const role = classifyStrokeColor(stroke);

      if (role === 'IGNORE' || role === 'OTHER') continue;

      if (tag === 'line') {
        const x1 = parseFloat(attrs.x1 || 0);
        const y1 = parseFloat(attrs.y1 || 0);
        const x2 = parseFloat(attrs.x2 || 0);
        const y2 = parseFloat(attrs.y2 || 0);
        if (Math.hypot(x2 - x1, y2 - y1) < 1e-5) continue;

        if (role === 'CUT') {
          rawCutPolylines.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
        } else if (role === 'FOLD') {
          rawFoldSegments.push({ x1, y1, x2, y2 });
        } else if (role === 'DIMENSION') {
          dimensionLines.push({ x1, y1, x2, y2 });
        }
      } else if (tag === 'polyline' || tag === 'polygon') {
        const pts = parsePointsList(attrs.points);
        if (pts.length < 2) continue;
        if (tag === 'polygon') pts.push({ x: pts[0].x, y: pts[0].y });
        const totalLen = pts.reduce((acc, p, idx) => idx === 0 ? 0 : acc + Math.hypot(p.x - pts[idx - 1].x, p.y - pts[idx - 1].y), 0);
        if (totalLen < 1e-4) continue;

        if (role === 'CUT') {
          rawCutPolylines.push(pts);
        } else if (role === 'FOLD') {
          for (let i = 0; i < pts.length - 1; i++) {
            if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) > 1e-4) {
              rawFoldSegments.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
            }
          }
        }
      } else if (tag === 'path') {
        const subpaths = parsePathData(attrs.d);
        for (const pts of subpaths) {
          const totalLen = pts.reduce((acc, p, idx) => idx === 0 ? 0 : acc + Math.hypot(p.x - pts[idx - 1].x, p.y - pts[idx - 1].y), 0);
          if (totalLen < 1e-4) continue;
          if (role === 'CUT') {
            rawCutPolylines.push(pts);
          } else if (role === 'FOLD') {
            for (let i = 0; i < pts.length - 1; i++) {
              if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) > 1e-4) {
                rawFoldSegments.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
              }
            }
          }
        }
      } else if (tag === 'rect') {
        const x = parseFloat(attrs.x || 0);
        const y = parseFloat(attrs.y || 0);
        const w = parseFloat(attrs.width || 0);
        const h = parseFloat(attrs.height || 0);
        if (w <= 0 || h <= 0) continue;
        const pts = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y }
        ];
        if (role === 'CUT') {
          rawCutPolylines.push(pts);
        } else if (role === 'FOLD') {
          for (let i = 0; i < 4; i++) {
            rawFoldSegments.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
          }
        }
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of rawCutPolylines) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const rawWidth = maxX - minX;
    const rawHeight = maxY - minY;

    let mmPerUnit = 25.4 / 72;
    let scaleSource = 'Estándar CAD/Illustrator (72 pt = 25.4 mm)';

    const svgElement=svgText.match(/<svg\b[^>]*>/i);
    const svgAttrs=svgElement?parseAttributes(svgElement[0]):{};
    const physicalWidth=/^([\d.e+-]+)mm$/i.exec(svgAttrs.width||'');
    const viewBox=(svgAttrs.viewBox||svgAttrs.viewbox||'').trim().split(/[\s,]+/).map(Number);
    if (physicalWidth && Number(physicalWidth[1])>0) {
      mmPerUnit=viewBox.length===4&&viewBox[2]>0?Number(physicalWidth[1])/viewBox[2]:1;
      scaleSource='Escala física SVG en milímetros';
    } else if (cotaMmValue && cotaMmValue > 0) {
      let witnessSpan = null;
      if (dimensionLines.length >= 2) {
        const vLines = dimensionLines.filter(l => Math.abs(l.x2 - l.x1) < 0.01 && Math.abs(l.y2 - l.y1) > 5);
        if (vLines.length >= 2) {
          const xs = vLines.map(l => l.x1).sort((a, b) => a - b);
          witnessSpan = xs[xs.length - 1] - xs[0];
        }
      }
      if (witnessSpan && witnessSpan > 10) {
        mmPerUnit = cotaMmValue / witnessSpan;
        scaleSource = `Cota detectada (${cotaMmValue} mm = ${witnessSpan.toFixed(2)} pt, 1:1)`;
      } else if (Math.abs(rawWidth * (25.4 / 72) - cotaMmValue) < 2.0) {
        mmPerUnit = cotaMmValue / rawWidth;
        scaleSource = `Cota ancho total (${cotaMmValue} mm, 1:1)`;
      }
    } else {
      const svgTagMatch = svgText.match(/<svg\b[^>]*>/i);
      if (svgTagMatch && /width\s*=\s*["'][^"']*mm["']/i.test(svgTagMatch[0])) {
        mmPerUnit = 1.0;
        scaleSource = 'Unidades SVG nativas en mm (1:1)';
      }
    }

    const cutSegmentsMm = [];
    let totalCutLengthMm = 0;
    for (const poly of rawCutPolylines) {
      const scaled = poly.map(p => ({
        x: (p.x - minX) * mmPerUnit,
        y: (p.y - minY) * mmPerUnit
      }));
      const simplified = scaled.length > 4 ? simplifyPolyline(scaled, 0.04) : scaled;
      for (let i = 0; i < simplified.length - 1; i++) {
        const a = simplified[i];
        const b = simplified[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 0.002) {
          totalCutLengthMm += len;
          cutSegmentsMm.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'CUT' });
        }
      }
    }

    const foldSegmentsMm = [];
    let totalFoldLengthMm = 0;
    for (const seg of rawFoldSegments) {
      const a = { x: (seg.x1 - minX) * mmPerUnit, y: (seg.y1 - minY) * mmPerUnit };
      const b = { x: (seg.x2 - minX) * mmPerUnit, y: (seg.y2 - minY) * mmPerUnit };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0.01) {
        totalFoldLengthMm += len;
        foldSegmentsMm.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'FOLD' });
      }
    }

    return {
      mmPerUnit,
      scaleSource,
      cotaMmValue,
      cotaLabel,
      blankWidthMm: rawWidth * mmPerUnit,
      blankHeightMm: rawHeight * mmPerUnit,
      totalCutLengthMm,
      totalFoldLengthMm,
      cutSegmentsMm,
      foldSegmentsMm
    };
  }

  // ============================================================================
  // 4. PLANAR HALF-EDGE GRAPH (DCEL) & KINEMATIC TREE BUILDER FOR ARBITRARY SVG
  // ============================================================================

  function buildPlanarSubdivision(parsedDieline) {
    const { cutSegmentsMm, foldSegmentsMm, blankWidthMm, blankHeightMm } = parsedDieline;

    const allSegs = [
      ...cutSegmentsMm.map(s => ({ ...s })),
      ...foldSegmentsMm.map(s => ({ ...s }))
    ];

    const n = allSegs.length;
    const splits = Array.from({ length: n }, () => [0, 1]);
    const INTER_TOL = 0.06;

    function pointToSegmentProj(px, py, s) {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-10) return null;
      const t = ((px - s.x1) * dx + (py - s.y1) * dy) / lenSq;
      if (t <= 1e-5 || t >= 1 - 1e-5) return null;
      const projX = s.x1 + t * dx;
      const projY = s.y1 + t * dy;
      const dist = Math.hypot(px - projX, py - projY);
      return { t, dist };
    }

    function segSegIntersection(s1, s2) {
      const x1 = s1.x1, y1 = s1.y1, x2 = s1.x2, y2 = s1.y2;
      const x3 = s2.x1, y3 = s2.y1, x4 = s2.x2, y4 = s2.y2;
      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denom) < 1e-9) return null;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
      if (t >= -1e-4 && t <= 1 + 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
        return {
          t: Math.max(0, Math.min(1, t)),
          u: Math.max(0, Math.min(1, u))
        };
      }
      return null;
    }

    for (let i = 0; i < n; i++) {
      const s1 = allSegs[i];
      for (let j = i + 1; j < n; j++) {
        const s2 = allSegs[j];
        if (Math.max(s1.x1, s1.x2) + INTER_TOL < Math.min(s2.x1, s2.x2) ||
            Math.max(s2.x1, s2.x2) + INTER_TOL < Math.min(s1.x1, s1.x2) ||
            Math.max(s1.y1, s1.y2) + INTER_TOL < Math.min(s2.y1, s2.y2) ||
            Math.max(s2.y1, s2.y2) + INTER_TOL < Math.min(s1.y1, s1.y2)) {
          continue;
        }

        const inter = segSegIntersection(s1, s2);
        if (inter) {
          if (inter.t > 1e-4 && inter.t < 1 - 1e-4) splits[i].push(inter.t);
          if (inter.u > 1e-4 && inter.u < 1 - 1e-4) splits[j].push(inter.u);
        }

        for (const [px, py] of [[s1.x1, s1.y1], [s1.x2, s1.y2]]) {
          const proj = pointToSegmentProj(px, py, s2);
          if (proj && proj.dist <= INTER_TOL) splits[j].push(proj.t);
        }
        for (const [px, py] of [[s2.x1, s2.y1], [s2.x2, s2.y2]]) {
          const proj = pointToSegmentProj(px, py, s1);
          if (proj && proj.dist <= INTER_TOL) splits[i].push(proj.t);
        }
      }
    }

    const vertices = [];
    const VERT_SNAP = 0.05;

    function getVertexId(x, y) {
      for (let i = 0; i < vertices.length; i++) {
        if (Math.hypot(vertices[i].x - x, vertices[i].y - y) <= VERT_SNAP) {
          return i;
        }
      }
      vertices.push({ id: vertices.length, x, y });
      return vertices.length - 1;
    }

    const edgeMap = new Map();
    for (let i = 0; i < n; i++) {
      const s = allSegs[i];
      const ts = splits[i].sort((a, b) => a - b);
      const uniqueTs = [ts[0]];
      for (let k = 1; k < ts.length; k++) {
        if (ts[k] - uniqueTs[uniqueTs.length - 1] > 1e-4) {
          uniqueTs.push(ts[k]);
        }
      }
      for (let k = 0; k < uniqueTs.length - 1; k++) {
        const t0 = uniqueTs[k];
        const t1 = uniqueTs[k + 1];
        const x0 = s.x1 + t0 * (s.x2 - s.x1);
        const y0 = s.y1 + t0 * (s.y2 - s.y1);
        const x1 = s.x1 + t1 * (s.x2 - s.x1);
        const y1 = s.y1 + t1 * (s.y2 - s.y1);
        const u = getVertexId(x0, y0);
        const v = getVertexId(x1, y1);
        if (u === v) continue;
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        const existing = edgeMap.get(key);
        if (!existing) {
          edgeMap.set(key, { u: Math.min(u, v), v: Math.max(u, v), type: s.type });
        } else if (s.type === 'FOLD') {
          existing.type = 'FOLD';
        }
      }
    }

    let edges = Array.from(edgeMap.values());
    let changed = true;
    while (changed) {
      changed = false;
      const deg = new Int32Array(vertices.length);
      for (const e of edges) {
        deg[e.u]++;
        deg[e.v]++;
      }
      const filtered = edges.filter(e => deg[e.u] >= 2 && deg[e.v] >= 2);
      if (filtered.length !== edges.length) {
        edges = filtered;
        changed = true;
      }
    }

    const halfEdges = [];
    const outgoing = Array.from({ length: vertices.length }, () => []);

    edges.forEach((e, idx) => {
      const uPt = vertices[e.u];
      const vPt = vertices[e.v];
      const he0 = {
        id: idx * 2,
        twin: idx * 2 + 1,
        u: e.u,
        v: e.v,
        type: e.type,
        angle: Math.atan2(vPt.y - uPt.y, vPt.x - uPt.x),
        visited: false,
        faceId: -1
      };
      const he1 = {
        id: idx * 2 + 1,
        twin: idx * 2,
        u: e.v,
        v: e.u,
        type: e.type,
        angle: Math.atan2(uPt.y - vPt.y, uPt.x - vPt.x),
        visited: false,
        faceId: -1
      };
      halfEdges.push(he0, he1);
      outgoing[e.u].push(he0);
      outgoing[e.v].push(he1);
    });

    for (let v = 0; v < vertices.length; v++) {
      outgoing[v].sort((a, b) => a.angle - b.angle);
    }

    const nextHe = new Int32Array(halfEdges.length);
    for (const he of halfEdges) {
      const twin = halfEdges[he.twin];
      const list = outgoing[he.v];
      const idx = list.indexOf(twin);
      const nextIdx = (idx - 1 + list.length) % list.length;
      nextHe[he.id] = list[nextIdx].id;
    }

    const rawFaces = [];
    let totalAreaMm2 = 0;
    for (const startHe of halfEdges) {
      if (startHe.visited) continue;
      const cycle = [];
      let curr = startHe;
      while (!curr.visited) {
        curr.visited = true;
        cycle.push(curr);
        curr = halfEdges[nextHe[curr.id]];
      }
      if (cycle.length < 3) continue;

      let area2 = 0;
      const pts = cycle.map(h => vertices[h.u]);
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        area2 += p1.x * p2.y - p2.x * p1.y;
      }
      const signedArea = area2 * 0.5;

      if (signedArea > 0.05) {
        const faceId = rawFaces.length;
        cycle.forEach(h => { h.faceId = faceId; });
        totalAreaMm2 += signedArea;

        let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
        let cx = 0, cy = 0;
        for (const p of pts) {
          if (p.x < fMinX) fMinX = p.x;
          if (p.y < fMinY) fMinY = p.y;
          if (p.x > fMaxX) fMaxX = p.x;
          if (p.y > fMaxY) fMaxY = p.y;
          cx += p.x;
          cy += p.y;
        }
        cx /= pts.length;
        cy /= pts.length;

        rawFaces.push({
          id: faceId,
          points: pts,
          holes: [],
          areaMm2: signedArea,
          bbox: {
            minX: fMinX,
            minY: fMinY,
            maxX: fMaxX,
            maxY: fMaxY,
            width: fMaxX - fMinX,
            height: fMaxY - fMinY
          },
          centroid: { x: cx, y: cy }
        });
      }
    }

    if (!rawFaces.length) throw new Error('No hay paneles cerrados. Comprueba que los cortes forman un contorno cerrado.');
    for (const face of rawFaces) {
      const host = rawFaces.filter(other => other.id !== face.id && other.areaMm2 > face.areaMm2 && face.points.every(p => pointInPolygon(p, other.points)))
        .sort((a,b) => a.areaMm2-b.areaMm2)[0];
      if (host) {face.isHole=true;face.role='HOLE';host.holes.push(face.points);}
    }
    totalAreaMm2=0;
    for (const face of rawFaces.filter(f=>!f.isHole)) {
      face.areaMm2-=rawFaces.filter(f=>f.isHole&&face.holes.includes(f.points)).reduce((sum,f)=>sum+f.areaMm2,0);
      totalAreaMm2+=face.areaMm2;
    }

    const hinges = [];
    const adjMap = new Map();

    for (const he of halfEdges) {
      if (he.type !== 'FOLD') continue;
      const twin = halfEdges[he.twin];
      const fA = he.faceId;
      const fB = twin.faceId;
      if (fA >= 0 && fB >= 0 && fA < fB) {
        const key = `${fA}_${fB}`;
        if (!adjMap.has(key)) {
          adjMap.set(key, { faceA: fA, faceB: fB, pts: [] });
        }
        adjMap.get(key).pts.push(vertices[he.u], vertices[he.v]);
      }
    }

    for (const item of adjMap.values()) {
      let maxDist = -1;
      let pStart = item.pts[0];
      let pEnd = item.pts[1];
      for (let i = 0; i < item.pts.length; i++) {
        for (let j = i + 1; j < item.pts.length; j++) {
          const d = Math.hypot(item.pts[j].x - item.pts[i].x, item.pts[j].y - item.pts[i].y);
          if (d > maxDist) {
            maxDist = d;
            pStart = item.pts[i];
            pEnd = item.pts[j];
          }
        }
      }
      const isVertical = Math.abs(pEnd.y - pStart.y) > Math.abs(pEnd.x - pStart.x);
      hinges.push({
        id: `hinge_${item.faceA}_${item.faceB}`,
        faceA: item.faceA,
        faceB: item.faceB,
        p1: { x: pStart.x, y: pStart.y },
        p2: { x: pEnd.x, y: pEnd.y },
        midpoint: { x: (pStart.x + pEnd.x) * 0.5, y: (pStart.y + pEnd.y) * 0.5 },
        lengthMm: maxDist,
        orientation: isVertical ? 'VERTICAL' : 'HORIZONTAL'
      });
    }

    const midY = blankHeightMm * 0.5;
    const bodyFaces = rawFaces
      .filter(f => !f.isHole && f.bbox.minY < midY && f.bbox.maxY > midY)
      .sort((a, b) => a.centroid.x - b.centroid.x);

    let bodyCounter = 1;
    const bodyDimensions = [];
    for (const bf of bodyFaces) {
      if (bf.bbox.width < 45 && (bf === bodyFaces[0] || bf === bodyFaces[bodyFaces.length - 1])) {
        bf.role = 'GLUE_FLAP';
        bf.name = 'Pestaña de Pegado';
        bf.shortName = 'Pegado';
        bf.defaultAngle = 90;
        bf.foldOrder = 0.15;
      } else {
        bf.role = 'BODY';
        bf.bodyIndex = bodyCounter;
        bf.name = `Cara Cuerpo ${bodyCounter}`;
        bf.shortName = `Cara ${bodyCounter}`;
        bf.defaultAngle = 90;
        bf.foldOrder = 0.0;
        bodyDimensions.push(bf);
        bodyCounter++;
      }
    }

    for (const f of rawFaces) {
      if (f.role) continue;
      const connectedHinge = hinges.find(h => h.faceA === f.id || h.faceB === f.id);
      const parentId = connectedHinge ? (connectedHinge.faceA === f.id ? connectedHinge.faceB : connectedHinge.faceA) : -1;
      const parentFace = rawFaces[parentId];
      const idxLabel = parentFace && parentFace.bodyIndex ? parentFace.bodyIndex : f.id;
      const isInnerFlap = parentFace && parentFace.bodyIndex ? (parentFace.bodyIndex % 2 === 1) : false;

      if (f.centroid.y < midY) {
        f.role = isInnerFlap ? 'TOP_FLAP_INNER' : 'TOP_FLAP_OUTER';
        f.name = `Solapa Sup. ${idxLabel} (${isInnerFlap ? 'Int.' : 'Ext.'})`;
        f.shortName = `Sup. ${idxLabel}`;
        f.defaultAngle = 90;
        f.foldOrder = isInnerFlap ? 0.55 : 0.75;
      } else {
        f.role = isInnerFlap ? 'BOTTOM_FLAP_INNER' : 'BOTTOM_FLAP_OUTER';
        f.name = `Solapa Inf. ${idxLabel} (${isInnerFlap ? 'Int.' : 'Ext.'})`;
        f.shortName = `Inf. ${idxLabel}`;
        f.defaultAngle = 90;
        f.foldOrder = isInnerFlap ? 0.25 : 0.40;
      }
    }

    const mainBodyCandidates = bodyFaces.filter(f => f.role === 'BODY');
    const rootFace = mainBodyCandidates.length >= 2
      ? mainBodyCandidates[1]
      : (mainBodyCandidates[0] || rawFaces.find(f=>!f.isHole));
    rootFace.isRoot = true;
    rootFace.defaultAngle = 0;

    const visitedFaces = new Set([rootFace.id]);
    const queue = [rootFace.id];
    const treeHinges = [];

    while (queue.length > 0) {
      const currId = queue.shift();
      for (const h of hinges) {
        let childId = -1;
        if (h.faceA === currId && !visitedFaces.has(h.faceB)) {
          childId = h.faceB;
        } else if (h.faceB === currId && !visitedFaces.has(h.faceA)) {
          childId = h.faceA;
        }
        if (childId !== -1) {
          visitedFaces.add(childId);
          queue.push(childId);
          const childFace = rawFaces[childId];
          childFace.parentId = currId;
          childFace.hingeId = h.id;

          let p1 = { ...h.p1 };
          let p2 = { ...h.p2 };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const cx = childFace.centroid.x - p1.x;
          const cy = childFace.centroid.y - p1.y;
          if (dx * cy - dy * cx > 0) {
            const tmp = p1;
            p1 = p2;
            p2 = tmp;
          }

          treeHinges.push({
            ...h,
            parentId: currId,
            childId,
            p1,
            p2
          });
        }
      }
    }

    const boxLengthMm = +(rootFace.bbox.width).toFixed(1);
    const boxWidthMm = +(mainBodyCandidates[0] ? mainBodyCandidates[0].bbox.width : rootFace.bbox.width).toFixed(1);
    const boxDepthMm = +(mainBodyCandidates[0] ? mainBodyCandidates[0].bbox.height : rootFace.bbox.height).toFixed(1);

    return {
      ...parsedDieline,
      totalAreaMm2,
      boxDimensionsMm: {
        length: boxLengthMm,
        width: boxWidthMm,
        depth: boxDepthMm
      },
      faces: rawFaces.filter(f=>!f.isHole),
      hinges: treeHinges,
      rootFaceId: rootFace.id
    };
  }

  // ============================================================================
  // 5. PACDORA / FEFCO KNIFEDATA NATIVE PARSER & 3D KINEMATIC BUILDER
  // ============================================================================

  /**
   * Converts a Pacdora `dlist` array of commands (M, L, A, Q, Z) into a clean 2D polygon
   * of `{x, y}` points in 1:1 mm, ensuring clockwise winding (positive signed area in Y-down).
   */
  function dlistToPolygon(dlist, ensureClockwise = true) {
    if (!dlist || dlist.length === 0) return [];
    const pts = [];
    let cx = 0, cy = 0;

    for (let i = 0; i < dlist.length; i++) {
      const cmd = dlist[i];
      if (!cmd || !cmd.mtd) continue;
      if (cmd.mtd === 'M') {
        cx = Number(cmd.x) || 0;
        cy = Number(cmd.y) || 0;
        if (pts.length === 0) {
          pts.push({ x: cx, y: cy });
        } else {
          // If consecutive M appears at start (like FEFCO 0212 HL), update start point
          if (pts.length === 1) {
            pts[0] = { x: cx, y: cy };
          } else {
            pts.push({ x: cx, y: cy });
          }
        }
      } else if (cmd.mtd === 'L') {
        const nx = Number(cmd.x) || 0;
        const ny = Number(cmd.y) || 0;
        if (pts.length === 0 || Math.hypot(nx - cx, ny - cy) > 0.01) {
          pts.push({ x: nx, y: ny });
        }
        cx = nx;
        cy = ny;
      } else if (cmd.mtd === 'A') {
        const nx = Number(cmd.x) || 0;
        const ny = Number(cmd.y) || 0;
        const arcPts = sampleSvgArc(cx, cy, cmd.rx || 1, cmd.ry || 1, cmd.ang || 0, cmd.arc || 0, cmd.dir || 0, nx, ny, 8);
        for (const p of arcPts) {
          if (pts.length === 0 || Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 0.01) {
            pts.push(p);
          }
        }
        cx = nx;
        cy = ny;
      } else if (cmd.mtd === 'Q') {
        const nx = Number(cmd.x) || 0;
        const ny = Number(cmd.y) || 0;
        const qx = cmd.cx !== undefined ? Number(cmd.cx) : (cx + nx) * 0.5;
        const qy = cmd.cy !== undefined ? Number(cmd.cy) : (cy + ny) * 0.5;
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt * mt * cx + 2 * mt * t * qx + t * t * nx;
          const py = mt * mt * cy + 2 * mt * t * qy + t * t * ny;
          if (pts.length === 0 || Math.hypot(px - pts[pts.length - 1].x, py - pts[pts.length - 1].y) > 0.01) {
            pts.push({ x: px, y: py });
          }
        }
        cx = nx;
        cy = ny;
      }
    }

    if (pts.length >= 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.05) {
      pts.pop();
    }
    if (pts.length < 3) return pts;

    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      area2 += p1.x * p2.y - p2.x * p1.y;
    }

    if (ensureClockwise && area2 < 0) {
      pts.reverse();
    } else if (!ensureClockwise && area2 > 0) {
      pts.reverse();
    }
    return pts;
  }

  /**
   * Splits a hole command list into one or more closed hole subpaths.
   */
  function parseHoleSubpaths(holeCmdList) {
    if (!holeCmdList || holeCmdList.length === 0) return [];
    const sublists = [];
    let cur = [];
    for (const cmd of holeCmdList) {
      if (cmd.mtd === 'M') {
        if (cur.length >= 3) sublists.push(cur);
        cur = [cmd];
      } else {
        cur.push(cmd);
        if (cmd.mtd === 'Z') {
          if (cur.length >= 3) sublists.push(cur);
          cur = [];
        }
      }
    }
    if (cur.length >= 3) sublists.push(cur);
    return sublists.map(sl => dlistToPolygon(sl, false)).filter(p => p.length >= 3);
  }

  function pointInPolygon(pt, vs) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const PANEL_SPANISH_NAMES = {
    H: 'Panel Base / Principal (H)',
    F: 'Panel Frontal / Tapa (F)',
    B: 'Panel Fondo / Inferior (B)',
    T: 'Panel Superior (T)',
    FL: 'Pared Lateral Izq. (FL)',
    FR: 'Pared Lateral Der. (FR)',
    HL: 'Pestaña / Lateral Izq. (HL)',
    HR: 'Pestaña / Lateral Der. (HR)',
    HT: 'Solapa Sup. Base (HT)',
    HB: 'Solapa Inf. Base (HB)',
    FT: 'Solapa Sup. Frontal (FT)',
    FB: 'Solapa Inf. Frontal (FB)',
    FLT: 'Solapa Esquina Sup. Izq. (FLT)',
    FLB: 'Solapa Esquina Inf. Izq. (FLB)',
    FRT: 'Solapa Esquina Sup. Der. (FRT)',
    FRB: 'Solapa Esquina Inf. Der. (FRB)',
    HLT: 'Solapa Esquina Base Sup. (HLT)',
    HLB: 'Solapa Esquina Base Inf. (HLB)',
    TT: 'Doble Pared / Pliegue Sup. (TT)',
    BB: 'Doble Pared / Pliegue Inf. (BB)',
    L: 'Pared Izquierda (L)',
    R: 'Pared Derecha (R)'
  };

  /**
   * Builds a complete `dieline` model directly from a Pacdora/FEFCO `knifeData` object
   * (`faces`, `holes`, `cuts`, `folds`, `sizeArrowData`, `animations`) and metadata (`length`, `width`, `height`).
   */
  // Square the terminal glue corner in both the face and the exported knife path.
  // Only arcs joining the attachment edge to the outer edge of a narrow glue
  // flap qualify; radii on lids, handles and locking tabs remain authored curves.
  function squareGlueCorners(data) {
    const replacements=[];
    for(const f of data.faces || []) {
      if(!(f.w<50 && f.h>f.w*3))continue;
      const attachments=(data.folds || []).filter(h=>(h.name || '').split('_').includes(f.name));
      if(attachments.length!==1 || Math.abs(attachments[0].x1-attachments[0].x2)>0.05 ||
        Math.abs(attachments[0].x1-(f.x+f.w))>0.05)continue;
      let previous=null;
      for(const c of f.dlist || []) {
        if(c.mtd==='A' && previous && Math.abs(previous.x-(f.x+f.w))<0.05 && Math.abs(c.x-f.x)<0.05 &&
          Math.abs(previous.y-(f.y+f.h))<0.05) {
          replacements.push({from:previous,to:c,corner:{mtd:'L',x:c.x,y:previous.y}});
        }
        if(c.x!=null && c.y!=null)previous=c;
      }
    }
    if(!replacements.length)return data;
    const rewrite=list=>{
      let previous=null; const result=[];
      for(const c of list || []) {
        const match=c.mtd==='A' && previous && replacements.find(r=>
          Math.hypot(previous.x-r.from.x,previous.y-r.from.y)<0.05 && Math.hypot(c.x-r.to.x,c.y-r.to.y)<0.05);
        const reverse=c.mtd==='A' && previous && replacements.find(r=>
          Math.hypot(previous.x-r.to.x,previous.y-r.to.y)<0.05 && Math.hypot(c.x-r.from.x,c.y-r.from.y)<0.05);
        if(match || reverse) result.push({...((match || reverse).corner)},{mtd:'L',x:c.x,y:c.y});
        else result.push(c);
        if(c.x!=null && c.y!=null)previous=c;
      }
      return result;
    };
    return {...data,faces:data.faces.map(f=>({...f,dlist:rewrite(f.dlist)})),cuts:rewrite(data.cuts)};
  }

  function buildDielineModelFromPacdora(knifeData, meta = {}) {
    knifeData = squareGlueCorners(knifeData || {});
    if (!knifeData || !knifeData.faces || knifeData.faces.length === 0) {
      throw new Error('Datos paramétricos FEFCO (knifeData) vacíos o inválidos.');
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const rawFaces = [];
    const faceByName = new Map();
    let totalAreaMm2 = 0;

    // 1. Convert each face's dlist into a 1:1 mm polygon
    knifeData.faces.forEach((f, idx) => {
      const poly = dlistToPolygon(f.dlist, true);
      if (poly.length < 3) return;

      let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
      let cx = 0, cy = 0, area2 = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        area2 += p1.x * p2.y - p2.x * p1.y;
        if (p1.x < fMinX) fMinX = p1.x;
        if (p1.y < fMinY) fMinY = p1.y;
        if (p1.x > fMaxX) fMaxX = p1.x;
        if (p1.y > fMaxY) fMaxY = p1.y;
        if (p1.x < minX) minX = p1.x;
        if (p1.y < minY) minY = p1.y;
        if (p1.x > maxX) maxX = p1.x;
        if (p1.y > maxY) maxY = p1.y;
        cx += p1.x;
        cy += p1.y;
      }
      cx /= poly.length;
      cy /= poly.length;
      const areaMm2 = Math.abs(area2 * 0.5);
      totalAreaMm2 += areaMm2;

      const label = PANEL_SPANISH_NAMES[f.name] || `Panel ${f.name}`;
      const faceObj = {
        id: idx,
        pacdoraName: f.name,
        name: label,
        shortName: f.name,
        label,
        role: (f.name === 'H' || f.name === 'F' || f.name === 'B' || f.name === 'T') ? 'BODY' : (f.name === 'HL' && (f.w < 50 || f.h < 50) ? 'GLUE_FLAP' : 'FLAP'),
        points: poly,
        polygon: poly,
        holes: [],
        areaMm2,
        area: areaMm2,
        bbox: {
          minX: fMinX,
          minY: fMinY,
          maxX: fMaxX,
          maxY: fMaxY,
          width: fMaxX - fMinX,
          height: fMaxY - fMinY
        },
        bounds: {
          minX: fMinX,
          minY: fMinY,
          maxX: fMaxX,
          maxY: fMaxY,
          width: fMaxX - fMinX,
          height: fMaxY - fMinY
        },
        centroid: { x: cx, y: cy },
        defaultAngle: 90
      };
      rawFaces.push(faceObj);
      faceByName.set(f.name, faceObj);
    });

    // Normalize coordinates so global minX = 0, minY = 0
    if (isFinite(minX) && isFinite(minY) && (Math.abs(minX) > 1e-4 || Math.abs(minY) > 1e-4)) {
      for (const f of rawFaces) {
        for (const p of f.polygon) {
          p.x -= minX;
          p.y -= minY;
        }
        f.centroid.x -= minX;
        f.centroid.y -= minY;
        f.bbox.minX -= minX;
        f.bbox.maxX -= minX;
        f.bbox.minY -= minY;
        f.bbox.maxY -= minY;
        f.bounds = { ...f.bbox };
      }
    } else {
      minX = 0;
      minY = 0;
    }

    const blankWidthMm = Math.max(1, maxX - minX);
    const blankHeightMm = Math.max(1, maxY - minY);

    // 2. Parse interior holes and assign them to the containing face (if strictly interior and not already cut into face perimeter)
    const allHolePolys = [];
    for (const hCmds of (knifeData.holes || [])) {
      const subPolys = parseHoleSubpaths(hCmds);
      for (const hp of subPolys) {
        const shifted = hp.map(p => ({ x: p.x - minX, y: p.y - minY }));
        allHolePolys.push(shifted);
        let hcx = 0, hcy = 0;
        for (const p of shifted) { hcx += p.x; hcy += p.y; }
        hcx /= shifted.length;
        hcy /= shifted.length;

        const hostFace = rawFaces.find(f => pointInPolygon({ x: hcx, y: hcy }, f.polygon));
        if (hostFace) {
          hostFace.holes.push(shifted);
        }
      }
    }

    // 3. Extract 2D Cut Segments (from `cuts` + `holes` or face perimeters) and Fold Segments
    const cutSegmentsMm = [];
    let totalCutLengthMm = 0;

    if (knifeData.cuts && knifeData.cuts.length > 0) {
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const pushCutPoly = (pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len > 0.01) {
            totalCutLengthMm += len;
            cutSegmentsMm.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'CUT' });
          }
        }
      };
      let currPts = [];
      for (const cmd of knifeData.cuts) {
        if (cmd.mtd === 'M') {
          if (currPts.length > 1) pushCutPoly(currPts);
          cx = sx = (Number(cmd.x) || 0) - minX;
          cy = sy = (Number(cmd.y) || 0) - minY;
          currPts = [{ x: cx, y: cy }];
        } else if (cmd.mtd === 'L') {
          cx = (Number(cmd.x) || 0) - minX;
          cy = (Number(cmd.y) || 0) - minY;
          currPts.push({ x: cx, y: cy });
        } else if (cmd.mtd === 'A') {
          const nx = (Number(cmd.x) || 0) - minX;
          const ny = (Number(cmd.y) || 0) - minY;
          const arcPts = sampleSvgArc(cx, cy, cmd.rx || 1, cmd.ry || 1, cmd.ang || 0, cmd.arc || 0, cmd.dir || 0, nx, ny, 8);
          for (const p of arcPts) currPts.push(p);
          cx = nx; cy = ny;
        } else if (cmd.mtd === 'Q') {
          const nx = (Number(cmd.x) || 0) - minX;
          const ny = (Number(cmd.y) || 0) - minY;
          const qx = (cmd.cx !== undefined ? Number(cmd.cx) : (cx + nx) * 0.5) - minX;
          const qy = (cmd.cy !== undefined ? Number(cmd.cy) : (cy + ny) * 0.5) - minY;
          for (let s = 1; s <= 6; s++) {
            const t = s / 6, mt = 1 - t;
            currPts.push({
              x: mt * mt * cx + 2 * mt * t * qx + t * t * nx,
              y: mt * mt * cy + 2 * mt * t * qy + t * t * ny
            });
          }
          cx = nx; cy = ny;
        } else if (cmd.mtd === 'Z') {
          currPts.push({ x: sx, y: sy });
          pushCutPoly(currPts);
          currPts = [];
        }
      }
      if (currPts.length > 1) pushCutPoly(currPts);
    }

    // Also add hole outlines to 2D blue cut segments so slots/windows are drawn in blue in 2D
    for (const hp of allHolePolys) {
      for (let i = 0; i < hp.length; i++) {
        const a = hp[i];
        const b = hp[(i + 1) % hp.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 0.01) {
          totalCutLengthMm += len;
          cutSegmentsMm.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'CUT' });
        }
      }
    }

    const foldSegmentsMm = [];
    let totalFoldLengthMm = 0;
    for (const fl of (knifeData.folds || [])) {
      const x1 = (Number(fl.x1) || 0) - minX;
      const y1 = (Number(fl.y1) || 0) - minY;
      const x2 = (Number(fl.x2) || 0) - minX;
      const y2 = (Number(fl.y2) || 0) - minY;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > 0.01) {
        totalFoldLengthMm += len;
        foldSegmentsMm.push({ name: fl.name, x1, y1, x2, y2, type: 'FOLD' });
      }
    }

    // 4. Build the Kinematic Tree and Multi-Step Phased Animation Schedule from `folds` and `animations`
    const totalAnimSteps = Math.max(1, (knifeData.animations || []).length);
    const animByFoldName = new Map();
    (knifeData.animations || []).forEach((stepList, stepIdx) => {
      for (const act of (stepList || [])) {
        if (!act || !act.name || act.action !== 'rotate') continue;
        if (!animByFoldName.has(act.name)) animByFoldName.set(act.name, []);
        animByFoldName.get(act.name).push({
          stepIndex: stepIdx,
          totalSteps: totalAnimSteps,
          rawRotate: Number(act.rotate) || 0
        });
      }
    });

    // Determine natural root face(s): in Pacdora, every fold `A_B` is directed from parent `A` to child `B`
    const parentSet = new Set();
    const childSet = new Set();
    const adjByFace = new Map();
    for (const f of rawFaces) adjByFace.set(f.pacdoraName, []);

    for (const fl of foldSegmentsMm) {
      if (!fl.name || !fl.name.includes('_')) continue;
      const [pName, cName] = fl.name.split('_');
      if (!faceByName.has(pName) || !faceByName.has(cName)) continue;
      parentSet.add(pName);
      childSet.add(cName);
      adjByFace.get(pName).push({ parentName: pName, childName: cName, fold: fl, reversed: false });
      adjByFace.get(cName).push({ parentName: cName, childName: pName, fold: fl, reversed: true });
    }

    const naturalRoots = [...parentSet].filter(p => !childSet.has(p));
    const primaryRootName = naturalRoots[0] || (faceByName.has('H') ? 'H' : (faceByName.has('B') ? 'B' : rawFaces[0].pacdoraName));
    const rootFace = faceByName.get(primaryRootName) || rawFaces[0];
    rootFace.isRoot = true;
    rootFace.defaultAngle = 0;
    rootFace.role = 'BODY';

    const visited = new Set([rootFace.pacdoraName]);
    const queue = [rootFace.pacdoraName];
    const treeHinges = [];

    const processComponent = (startName) => {
      visited.add(startName);
      queue.push(startName);
      while (queue.length > 0) {
        const uName = queue.shift();
        const uFace = faceByName.get(uName);
        const edges = adjByFace.get(uName) || [];
        // Prefer edges that follow Pacdora's natural Parent_Child direction
        edges.sort((a, b) => (a.reversed ? 1 : 0) - (b.reversed ? 1 : 0));

        for (const edge of edges) {
          const vName = edge.childName;
          if (visited.has(vName)) continue;
          visited.add(vName);
          queue.push(vName);

          const vFace = faceByName.get(vName);
          const fl = edge.fold;

          // Compute all segments of this fold line (including any 'x' continuation segments collinear with fl)
          let p1 = { x: fl.x1, y: fl.y1 };
          let p2 = { x: fl.x2, y: fl.y2 };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const cx = vFace.centroid.x - p1.x;
          const cy = vFace.centroid.y - p1.y;
          const cross2d = dx * cy - dy * cx;
          const sCross = Math.sign(cross2d) || 1;

          // Orient p1 -> p2 so that in our 3D engine (x3d = x, y3d = -y), +angle always folds INWARD (+Z)
          if (cross2d > 0) {
            const tmp = p1;
            p1 = p2;
            p2 = tmp;
          }

          // Convert Pacdora's animation steps using our exact verified theorem:
          // ourDeltaDeg = sCross * pacdoraRotate (if edge was reversed, flip sign)
          const dirSign = edge.reversed ? -sCross : sCross;
          const rawSteps = animByFoldName.get(fl.name) || [];
          const animSteps = rawSteps.map(st => ({
            start: st.stepIndex / st.totalSteps,
            end: (st.stepIndex + 1) / st.totalSteps,
            deltaDeg: +(dirSign * st.rawRotate).toFixed(2)
          }));

          const totalAngle = animSteps.length > 0
            ? +(animSteps.reduce((acc, s) => acc + s.deltaDeg, 0)).toFixed(2)
            : 90;

          vFace.parentId = uFace.id;
          vFace.defaultAngle = totalAngle;

          const lenMm = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const isVertical = Math.abs(p2.y - p1.y) > Math.abs(p2.x - p1.x);
          const hingeId = `hinge_${uFace.id}_${vFace.id}`;
          vFace.hingeId = hingeId;

          treeHinges.push({
            id: hingeId,
            pacdoraFoldName: fl.name,
            faceA: uFace.id,
            faceB: vFace.id,
            parentId: uFace.id,
            childId: vFace.id,
            parentFaceId: uFace.id,
            childFaceId: vFace.id,
            p1,
            p2,
            midpoint: { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 },
            lengthMm: lenMm,
            length: lenMm,
            orientation: isVertical ? 'VERTICAL' : 'HORIZONTAL',
            defaultAngle: totalAngle,
            animSteps
          });
        }
      }
    };

    processComponent(rootFace.pacdoraName);
    // In case of multi-piece boxes (like FEFCO 0307 lid + base), connect any remaining unvisited piece
    for (const rName of naturalRoots) {
      if (!visited.has(rName)) processComponent(rName);
    }

    // Extract L, W, H from meta or sizeArrowData
    const findArrowLen = (code) => {
      const item = (knifeData.sizeArrowData || []).find(s => s.lineName === code);
      return item ? Number(item.lineLength) : null;
    };
    const boxLengthMm = Number(meta.length) || findArrowLen('L') || +(rootFace.bbox.width).toFixed(1);
    const boxWidthMm = Number(meta.width) || findArrowLen('W') || +(rootFace.bbox.height).toFixed(1);
    const boxDepthMm = Number(meta.height) || findArrowLen('H') || 100;

    // 5. Parse Bleed lines (Green outer offset contour) if provided by solver
    const bleedSegmentsMm = [];
    if (Array.isArray(knifeData.bleeds) && knifeData.bleeds.length > 0) {
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const pushBleedPoly = (pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) {
            bleedSegmentsMm.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'BLEED' });
          }
        }
      };
      let currPts = [];
      for (const cmd of knifeData.bleeds) {
        if (cmd.mtd === 'M') {
          if (currPts.length > 1) pushBleedPoly(currPts);
          cx = sx = (Number(cmd.x) || 0) - minX;
          cy = sy = (Number(cmd.y) || 0) - minY;
          currPts = [{ x: cx, y: cy }];
        } else if (cmd.mtd === 'L') {
          cx = (Number(cmd.x) || 0) - minX;
          cy = (Number(cmd.y) || 0) - minY;
          currPts.push({ x: cx, y: cy });
        } else if (cmd.mtd === 'A') {
          const nx = (Number(cmd.x) || 0) - minX;
          const ny = (Number(cmd.y) || 0) - minY;
          const arcPts = sampleSvgArc(cx, cy, cmd.rx || 1, cmd.ry || 1, cmd.ang || 0, cmd.arc || 0, cmd.dir || 0, nx, ny, 8);
          for (const p of arcPts) currPts.push(p);
          cx = nx; cy = ny;
        } else if (cmd.mtd === 'Q') {
          const nx = (Number(cmd.x) || 0) - minX;
          const ny = (Number(cmd.y) || 0) - minY;
          const qx = (cmd.cx !== undefined ? Number(cmd.cx) : (cx + nx) * 0.5) - minX;
          const qy = (cmd.cy !== undefined ? Number(cmd.cy) : (cy + ny) * 0.5) - minY;
          for (let s = 1; s <= 6; s++) {
            const t = s / 6, mt = 1 - t;
            currPts.push({
              x: mt * mt * cx + 2 * mt * t * qx + t * t * nx,
              y: mt * mt * cy + 2 * mt * t * qy + t * t * ny
            });
          }
          cx = nx; cy = ny;
        } else if (cmd.mtd === 'Z') {
          currPts.push({ x: sx, y: sy });
          pushBleedPoly(currPts);
          currPts = [];
        }
      }
      if (currPts.length > 1) pushBleedPoly(currPts);
    }

    const shiftArrowList = (arr) => (arr || []).map(sa => ({
      ...sa,
      p1: sa.p1 ? { x: sa.p1.x - minX, y: sa.p1.y - minY } : null,
      p2: sa.p2 ? { x: sa.p2.x - minX, y: sa.p2.y - minY } : null,
      tpointer: sa.tpointer ? { ...sa.tpointer, x: sa.tpointer.x - minX, y: sa.tpointer.y - minY } : null
    }));

    return {
      isPacdoraModel: true,
      pacdoraMeta: {
        id: meta.id,
        num: meta.num,
        fefcoCode: meta.fefcoCode || '',
        name: meta.name || ''
      },
      mmPerUnit: 1.0,
      scaleSource: `Paramétrico 1:1 (${meta.fefcoCode || '#' + (meta.num || '')})`,
      cotaMmValue: blankWidthMm,
      cotaLabel: `${blankWidthMm.toFixed(1)} mm`,
      blankWidthMm,
      blankHeightMm,
      totalCutLengthMm,
      totalFoldLengthMm,
      totalAreaMm2,
      boxDimensionsMm: {
        length: boxLengthMm,
        width: boxWidthMm,
        depth: boxDepthMm
      },
      solverDimensions: {
        mfg: knifeData.knifeSize || { length: boxLengthMm, width: boxWidthMm, height: boxDepthMm },
        inner: knifeData.size || null,
        outer: knifeData.outSize || null
      },
      openParams: knifeData.openParams || [],
      bleedMm: knifeData.bleedMm !== undefined ? Number(knifeData.bleedMm) : 5,
      sizeArrowData: shiftArrowList(knifeData.sizeArrowData),
      outsideArrowData: shiftArrowList(knifeData.outsideArrowData),
      calibration: {
        mmPerUnit: 1.0,
        detectedCotaMM: blankWidthMm,
        source: `Motor Paramétrico 1:1 (${meta.fefcoCode || 'Nativo'})`
      },
      bounds: {
        minX: 0,
        minY: 0,
        maxX: blankWidthMm,
        maxY: blankHeightMm,
        width: blankWidthMm,
        height: blankHeightMm
      },
      cutSegmentsMm,
      foldSegmentsMm,
      bleedSegmentsMm,
      cutSegments: cutSegmentsMm,
      foldSegments: foldSegmentsMm,
      bleedSegments: bleedSegmentsMm,
      faces: rawFaces,
      hinges: treeHinges,
      rootFaceId: rootFace.id
    };
  }

  // ============================================================================
  // 6. UNIVERSAL REAL-TIME PIECEWISE 2D/3D PARAMETRIC RESIZER
  //    Resizes ANY dieline (both arbitrary .SVG files and 116 FEFCO models)
  //    in real time at 60 FPS when the user changes Largo (L), Ancho (W), or Alto (H).
  // ============================================================================

  /**
   * Builds a 1D piecewise-linear coordinate warp function `warp(coord)` from intervals
   * `[{ min, max, targetSpan }]` so that each parametric panel band scales to `targetSpan`
   * while rigid regions (glue flaps, slots, locking tabs, chamfers) translate without distortion!
   */
  function buildPiecewiseAxisMap(intervals) {
    if (!intervals || intervals.length === 0) return (v) => v;
    const sorted = intervals
      .filter(it => it && it.max - it.min > 1.0 && it.targetSpan > 1.0)
      .sort((a, b) => a.min - b.min);
    if (sorted.length === 0) return (v) => v;

    // Merge overlapping intervals that represent the same column/row band
    const bands = [];
    for (const it of sorted) {
      if (bands.length === 0) {
        bands.push({ min: it.min, max: it.max, targetSpan: it.targetSpan });
      } else {
        const prev = bands[bands.length - 1];
        const overlap = Math.min(prev.max, it.max) - Math.max(prev.min, it.min);
        const minSpan = Math.min(prev.max - prev.min, it.max - it.min);
        if (overlap > minSpan * 0.55) {
          // Same band
          prev.min = Math.min(prev.min, it.min);
          prev.max = Math.max(prev.max, it.max);
        } else if (it.min >= prev.max - 0.5) {
          bands.push({ min: Math.max(prev.max, it.min), max: it.max, targetSpan: it.targetSpan });
        }
      }
    }

    const knots = [];
    let shift = 0;
    for (const b of bands) {
      const origSpan = b.max - b.min;
      knots.push({ orig: b.min, mapped: b.min + shift, scale: b.targetSpan / origSpan });
      shift += (b.targetSpan - origSpan);
      knots.push({ orig: b.max, mapped: b.max + shift, scale: 1.0 });
    }

    return function warpCoord(v) {
      if (v <= knots[0].orig) {
        return knots[0].mapped + (v - knots[0].orig);
      }
      for (let i = 0; i < knots.length - 1; i++) {
        const k0 = knots[i];
        const k1 = knots[i + 1];
        if (v >= k0.orig && v <= k1.orig) {
          const span = k1.orig - k0.orig;
          if (span < 1e-6) return k0.mapped;
          const t = (v - k0.orig) / span;
          return k0.mapped + t * (k1.mapped - k0.mapped);
        }
      }
      const last = knots[knots.length - 1];
      return last.mapped + (v - last.orig);
    };
  }

  /**
   * Deep-clones and warps a dieline model (`baseModel`) to new target dimensions `(newL, newW, newH)` in mm.
   * Works for:
   *  - Custom `.svg` dielines (RSC American boxes, trays, folding cartons)
   *  - All 116 FEFCO models (instant 60fps client-side feedback while dragging sliders/wheel)
   */
  // Only infer a rectangular sleeve from four rectangular walls connected in a
  // strip with an end glue seam. Names and matching dimensions are insufficient.
  function inferSleeveBands(model, targets) {
    const walls = model.faces.filter(f => f.role === 'BODY');
    if (walls.length !== 4) return [];
    const near = (a, b) => Math.abs(a - b) < 0.25;
    const linked = (a, b) => (model.hinges || []).some(h => {
      const ids = [h.parentFaceId ?? h.parentId ?? h.faceA, h.childFaceId ?? h.childId ?? h.faceB];
      return ids.includes(a.id) && ids.includes(b.id) &&
        (h.defaultAngle == null || near(Math.abs(h.defaultAngle), 90));
    });
    for (const axis of ['x', 'y']) {
      const cross = axis === 'x' ? 'y' : 'x';
      const lo = axis === 'x' ? 'minX' : 'minY', hi = axis === 'x' ? 'maxX' : 'maxY';
      const clo = axis === 'x' ? 'minY' : 'minX', chi = axis === 'x' ? 'maxY' : 'maxX';
      const ordered = [...walls].sort((a,b) => a.bounds[lo] - b.bounds[lo]);
      const first = ordered[0].bounds;
      if (!ordered.every(f => {
        const b = f.bounds, poly = f.polygon || [];
        let area = 0;
        for (let i=0;i<poly.length;i++) {
          const a=poly[i], c=poly[(i+1)%poly.length]; area += a.x*c.y-c.x*a.y;
        }
        return near(b[clo], first[clo]) && near(b[chi], first[chi]) &&
          Math.abs(Math.abs(area/2) - b.width*b.height) < 0.001*b.width*b.height;
      })) continue;
      if (!ordered.slice(1).every((f,i) => near(ordered[i].bounds[hi], f.bounds[lo]) && linked(ordered[i],f))) continue;
      if (!model.faces.some(f => f.role === 'GLUE_FLAP' && (linked(f,ordered[0]) || linked(f,ordered[3])))) continue;
      const labels = [null, null];
      let conflict = false;
      for (const arrow of model.sizeArrowData || []) {
        if (!['L','W'].includes(arrow.lineName) || !arrow.p1 || !arrow.p2 || !near(arrow.p1[cross],arrow.p2[cross])) continue;
        const min = Math.min(arrow.p1[axis],arrow.p2[axis]), max = Math.max(arrow.p1[axis],arrow.p2[axis]);
        const i = ordered.findIndex(f => near(f.bounds[lo],min) && near(f.bounds[hi],max));
        if (i < 0) continue;
        if (labels[i%2] && labels[i%2] !== arrow.lineName) conflict = true;
        labels[i%2] = arrow.lineName;
      }
      if (conflict || (labels[0] && labels[0] === labels[1])) return [];
      if (!labels[0] && !labels[1]) continue;
      if (!labels[0]) labels[0] = labels[1] === 'L' ? 'W' : 'L';
      if (!labels[1]) labels[1] = labels[0] === 'L' ? 'W' : 'L';
      return ordered.map((f,i) => ({axis, min:f.bounds[lo], max:f.bounds[hi], targetSpan:targets[labels[i%2]]}));
    }
    return [];
  }

  // Track the three physical directions through orthogonal folds. A width
  // measured on a lid can therefore drive the side wall's horizontal span.
  function inferFoldDimensionBands(model, targets) {
    const faces = new Map(model.faces.map(f => [f.id, f]));
    const frames = new Map(), edges = new Map();
    const root = model.rootFaceId ?? model.faces[0]?.id;
    if (!faces.has(root)) return [];
    for (const h of model.hinges || []) {
      if (!h.p1 || !h.p2) continue;
      const dx=Math.abs(h.p2.x-h.p1.x), dy=Math.abs(h.p2.y-h.p1.y);
      const angle=Math.abs(h.defaultAngle ?? 90);
      if (Math.min(dx,dy)>0.05 || Math.max(dx,dy)<1 || Math.abs(angle-90)>1) continue;
      const a=h.parentFaceId ?? h.parentId ?? h.faceA, b=h.childFaceId ?? h.childId ?? h.faceB;
      if (!faces.has(a) || !faces.has(b)) continue;
      for (const [from,to] of [[a,b],[b,a]]) {
        if (!edges.has(from)) edges.set(from,[]);
        edges.get(from).push({to, swap:dx>dy?1:0});
      }
    }
    frames.set(root,[0,1,2]);
    const queue=[root];
    for (let i=0;i<queue.length;i++) for (const edge of edges.get(queue[i]) || []) {
      const frame=[...frames.get(queue[i])];
      [frame[edge.swap],frame[2]]=[frame[2],frame[edge.swap]];
      if (frames.has(edge.to)) {
        if (frames.get(edge.to).some((v,j)=>v!==frame[j])) return [];
      } else { frames.set(edge.to,frame); queue.push(edge.to); }
    }
    const labels=new Map();
    for (const arrow of model.sizeArrowData || []) {
      if (!['L','W','H'].includes(arrow.lineName) || !arrow.p1 || !arrow.p2) continue;
      const axis=Math.abs(arrow.p2.y-arrow.p1.y)<0.05?'x':Math.abs(arrow.p2.x-arrow.p1.x)<0.05?'y':null;
      if (!axis) continue;
      const lo=axis==='x'?'minX':'minY',hi=axis==='x'?'maxX':'maxY';
      const cross=axis==='x'?'y':'x',clo=axis==='x'?'minY':'minX',chi=axis==='x'?'maxY':'maxX';
      const min=Math.min(arrow.p1[axis],arrow.p2[axis]),max=Math.max(arrow.p1[axis],arrow.p2[axis]);
      const candidates=model.faces.filter(f=>frames.has(f.id) && f.role!=='GLUE_FLAP' &&
        (arrow.faceId == null || arrow.faceId===f.id) &&
        Math.abs(f.bounds[lo]-min)<3 && Math.abs(f.bounds[hi]-max)<3 &&
        arrow.p1[cross]>=f.bounds[clo]-0.1 && arrow.p1[cross]<=f.bounds[chi]+0.1);
      const dirs=new Set(candidates.map(f=>frames.get(f.id)[axis==='x'?0:1]));
      if (dirs.size!==1) continue;
      const dir=[...dirs][0];
      if (labels.has(dir) && labels.get(dir)!==arrow.lineName) return [];
      labels.set(dir,arrow.lineName);
    }
    if (labels.size!==3 || new Set(labels.values()).size!==3) return [];
    const dims=model.boxDimensionsMm || {};
    const original={L:dims.length,W:dims.width,H:dims.depth};
    const bands=[];
    for (const f of model.faces) {
      if (!frames.has(f.id) || f.role==='GLUE_FLAP') continue;
      for (const [i,axis,lo,hi] of [[0,'x','minX','maxX'],[1,'y','minY','maxY']]) {
        const label=labels.get(frames.get(f.id)[i]), span=f.bounds[hi]-f.bounds[lo];
        const reference=original[label];
        // Keep manufacturing allowances; partial dust flaps and locking tabs
        // are not promoted to full walls just because they share a direction.
        if (!(reference>0) || Math.abs(span-reference)>Math.max(6,reference*0.04)) continue;
        const targetSpan=span+targets[label]-reference;
        if (targetSpan>1) bands.push({axis,min:f.bounds[lo],max:f.bounds[hi],targetSpan});
      }
    }
    return bands;
  }

  function preservedPlanarSlope(h) {
    const dx=h.p2.x-h.p1.x,dy=h.p2.y-h.p1.y;
    if(Math.abs(dx)<1 || Math.abs(dy)<1)return h.planarSlope;
    // Near-flat diagonal glue hinges identify the automatic-bottom linkage.
    // Recover its canonical angle even in saved models predating slope metadata.
    if(Number.isFinite(h.defaultAngle) && Math.abs(h.defaultAngle)<10) return Math.sign(dx/dy);
    return h.planarSlope ?? dx/dy;
  }

  // A dimension is a measurement of two geometric anchors. Requested solver
  // values must never override it, even when a constraint could not be satisfied.
  function measureDimensionArrow(arrow) {
    if(!arrow?.p1 || !arrow?.p2)return 0;
    return Math.hypot(arrow.p2.x-arrow.p1.x,arrow.p2.y-arrow.p1.y);
  }

  function reconcileDimensionMeasurements(model) {
    if(!model)return model;
    const arrows=list=>(list || []).map(a=>{
      if(!a.p1 || !a.p2)return a;
      const lineLength=measureDimensionArrow(a);
      const prefix=['L','W','H'].includes(a.lineName)?a.lineName+'=':'';
      return {...a,lineLength,tpointer:a.tpointer?{...a.tpointer,value:prefix+lineLength.toFixed(1)+' mm'}:a.tpointer};
    });
    const sizeArrowData=arrows(model.sizeArrowData), dims=model.boxDimensionsMm || {};
    const requested={L:dims.length,W:dims.width,H:dims.depth};
    const dimensionErrors=sizeArrowData.filter(a=>Number.isFinite(requested[a.lineName]) &&
      Math.abs(a.lineLength-requested[a.lineName])>0.1).map(a=>({dimension:a.lineName,requested:requested[a.lineName],measured:a.lineLength}));
    return {...model,sizeArrowData,outsideArrowData:arrows(model.outsideArrowData),dimensionErrors};
  }

  // Move every stroke belonging to an internal feature with the SAME rigid
  // transform as its hole. In particular, a handle crease must not use the wall warp.
  function rigidFeatureForSegment(s, translations) {
    return translations.find(t=>{
      const xs=t.points.map(p=>p.x),ys=t.points.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),eps=0.2;
      return [s.x1,s.x2].every(x=>x>=minX-eps&&x<=maxX+eps) &&
        [s.y1,s.y2].every(y=>y>=minY-eps&&y<=maxY+eps);
    });
  }

  function resizeDielineParametric(baseModel, newL, newW, newH, bandEdit = null) {
    if (!baseModel) return null;
    const origL = Math.max(5, baseModel.boxDimensionsMm?.length || 200);
    const origW = Math.max(5, baseModel.boxDimensionsMm?.width || 150);
    const origH = Math.max(5, baseModel.boxDimensionsMm?.depth || 100);

    const targetL = Math.max(10, Number(newL) || origL);
    const targetW = Math.max(10, Number(newW) || origW);
    const targetH = Math.max(10, Number(newH) || origH);

    const sleeveBands = inferSleeveBands(baseModel, {L: targetL, W: targetW});
    const foldBands = inferFoldDimensionBands(baseModel, {L: targetL, W: targetW, H: targetH});
    if (!sleeveBands.length && !bandEdit && Math.abs(targetL - origL) < 0.05 && Math.abs(targetW - origW) < 0.05 && Math.abs(targetH - origH) < 0.05) {
      return reconcileDimensionMeasurements(enforceFlapLengthLimit(baseModel));
    }

    const xIntervals = [];
    const yIntervals = [];

    // 1. If model has sizeArrowData (FEFCO / Pacdora models), use L, W, H arrows + panel matching
    const tol = 6.0;
    for (const f of baseModel.faces) {
      const fw = f.bounds.width;
      const fh = f.bounds.height;

      // Classify X span of panel
      if (f.role === 'GLUE_FLAP') {
        // Keep glue flap width constant!
      } else if (Math.abs(fw - origL) <= tol) {
        xIntervals.push({ min: f.bounds.minX, max: f.bounds.maxX, targetSpan: fw + (targetL - origL) });
      } else if (Math.abs(fw - origW) <= tol) {
        xIntervals.push({ min: f.bounds.minX, max: f.bounds.maxX, targetSpan: fw + (targetW - origW) });
      } else if (Math.abs(fw - origH) <= tol) {
        xIntervals.push({ min: f.bounds.minX, max: f.bounds.maxX, targetSpan: fw + (targetH - origH) });
      }

      // Classify Y span of panel
      if (f.role === 'BODY' && Math.abs(fh - origH) <= tol) {
        yIntervals.push({ min: f.bounds.minY, max: f.bounds.maxY, targetSpan: fh + (targetH - origH) });
      } else if (f.role && f.role.includes('FLAP') && Math.abs(fh - origW * 0.5) <= Math.max(12, origW * 0.12)) {
        // Las solapas nunca deben superar la mitad de la cara más pequeña menos 1 mm
        const maxFlap = Math.max(5, (Math.min(targetL, targetW) / 2) - 1);
        const flapScale = targetW / origW;
        const targetFlapH = Math.min(fh * flapScale, maxFlap);
        yIntervals.push({ min: f.bounds.minY, max: f.bounds.maxY, targetSpan: targetFlapH });
      } else if (Math.abs(fh - origL) <= tol) {
        yIntervals.push({ min: f.bounds.minY, max: f.bounds.maxY, targetSpan: fh + (targetL - origL) });
      } else if (Math.abs(fh - origW) <= tol) {
        yIntervals.push({ min: f.bounds.minY, max: f.bounds.maxY, targetSpan: fh + (targetW - origW) });
      } else if (Math.abs(fh - origH) <= tol) {
        yIntervals.push({ min: f.bounds.minY, max: f.bounds.maxY, targetSpan: fh + (targetH - origH) });
      }
    }

    // Main dimension arrows define authoritative bands. Nearby flap bounds can
    // overlap these bands by a few mm; do not let them swallow the L/W/H span.
    const anchorDimensionBands = (intervals, axis) => {
      const targets = { L: targetL, W: targetW, H: targetH };
      const anchors = (baseModel.sizeArrowData || []).filter(sa => {
        if (!Object.hasOwn(targets, sa.lineName) || !sa.p1 || !sa.p2) return false;
        const crossAxis = axis === 'x' ? 'y' : 'x';
        return Math.abs(sa.p2[crossAxis] - sa.p1[crossAxis]) < 0.01 &&
          Math.abs(sa.p2[axis] - sa.p1[axis]) > 1;
      }).map(sa => ({
        min: Math.min(sa.p1[axis], sa.p2[axis]),
        max: Math.max(sa.p1[axis], sa.p2[axis]),
        targetSpan: targets[sa.lineName]
      }));
      for (const band of sleeveBands.filter(b => b.axis === axis)) {
        for (let i=anchors.length-1;i>=0;i--) {
          if (anchors[i].min < band.max && anchors[i].max > band.min) anchors.splice(i,1);
        }
        anchors.push(band);
      }
      if (!anchors.length) return intervals;
      const remaining = intervals.flatMap(interval => {
        const scale = interval.targetSpan / (interval.max - interval.min);
        let pieces = [interval];
        for (const anchor of anchors) {
          pieces = pieces.flatMap(piece => {
            if (piece.max <= anchor.min || piece.min >= anchor.max) return [piece];
            return [
              { min: piece.min, max: Math.min(piece.max, anchor.min) },
              { min: Math.max(piece.min, anchor.max), max: piece.max }
            ].filter(part => part.max - part.min > 1);
          });
        }
        return pieces.map(piece => ({ ...piece, targetSpan: (piece.max - piece.min) * scale }));
      });
      return [...anchors, ...remaining];
    };
    // Fold directions replace dimension-by-size guesses wherever resolved.
    for (const [axis, intervals] of [['x',xIntervals],['y',yIntervals]]) {
      const inferred=foldBands.filter(b=>b.axis===axis);
      if (!inferred.length) continue;
      for (let i=intervals.length-1;i>=0;i--) {
        if (inferred.some(b=>intervals[i].min<b.max && intervals[i].max>b.min)) intervals.splice(i,1);
      }
      intervals.push(...inferred);
    }
    const anchoredXIntervals = anchorDimensionBands(xIntervals, 'x');
    const anchoredYIntervals = anchorDimensionBands(yIntervals, 'y');

    // Fallback global scaling if a custom irregular dieline had no matching standard bands
    const warpX = bandEdit ? (bandEdit.axis === 'x' ? buildPiecewiseAxisMap([bandEdit]) : (x => x)) : anchoredXIntervals.length > 0
      ? buildPiecewiseAxisMap(anchoredXIntervals) : (x => x * (targetL / origL));
    const warpY = bandEdit ? (bandEdit.axis === 'y' ? buildPiecewiseAxisMap([bandEdit]) : (y => y)) : anchoredYIntervals.length > 0
      ? buildPiecewiseAxisMap(anchoredYIntervals) : (y => y * (targetH / origH));

    // Apply coordinate maps to all faces, holes, cutSegments, foldSegments, and hinges
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let totalAreaMm2 = 0;

    // Los agujeros interiores (asas, orificios, uñeros interiores) conservan sus medidas exactas sin deformarse
    const holeTranslations = [];
    const newFaces = baseModel.faces.map(f => {
      const poly = f.polygon.map(p => ({ x: warpX(p.x), y: warpY(p.y) }));
      const holes = (f.holes || []).map(hp => {
        if (!hp || !hp.length) return [];
        const xs = hp.map(p => p.x), ys = hp.map(p => p.y);
        const oldCx = (Math.min(...xs) + Math.max(...xs)) * 0.5;
        const oldCy = (Math.min(...ys) + Math.max(...ys)) * 0.5;
        const newCx = warpX(oldCx);
        const newCy = warpY(oldCy);
        const dx = newCx - oldCx;
        const dy = newCy - oldCy;
        holeTranslations.push({ dx, dy, points: hp });
        return hp.map(p => ({ x: p.x + dx, y: p.y + dy }));
      });

      let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
      let cx = 0, cy = 0, area2 = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        area2 += p1.x * p2.y - p2.x * p1.y;
        if (p1.x < fMinX) fMinX = p1.x;
        if (p1.y < fMinY) fMinY = p1.y;
        if (p1.x > fMaxX) fMaxX = p1.x;
        if (p1.y > fMaxY) fMaxY = p1.y;
        if (p1.x < minX) minX = p1.x;
        if (p1.y < minY) minY = p1.y;
        if (p1.x > maxX) maxX = p1.x;
        if (p1.y > maxY) maxY = p1.y;
        cx += p1.x;
        cy += p1.y;
      }
      cx /= poly.length;
      cy /= poly.length;
      const areaMm2 = Math.abs(area2 * 0.5);
      totalAreaMm2 += areaMm2;

      const bbox = {
        minX: fMinX,
        minY: fMinY,
        maxX: fMaxX,
        maxY: fMaxY,
        width: fMaxX - fMinX,
        height: fMaxY - fMinY
      };

      return {
        ...f,
        points: poly,
        polygon: poly,
        holes,
        areaMm2,
        area: areaMm2,
        bbox,
        bounds: { ...bbox },
        centroid: { x: cx, y: cy }
      };
    });

    const isPointInHole = (pt, holePts) => holePts.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 0.2);
    let totalCutLengthMm = 0;
    const newCutSegments = (baseModel.cutSegments || []).map(s => {
      let matchedTrans = rigidFeatureForSegment(s,holeTranslations);
      for (const trans of holeTranslations) {
        if (isPointInHole({ x: s.x1, y: s.y1 }, trans.points) && isPointInHole({ x: s.x2, y: s.y2 }, trans.points)) {
          matchedTrans = trans;
          break;
        }
      }
      if (matchedTrans) {
        const x1 = s.x1 + matchedTrans.dx, y1 = s.y1 + matchedTrans.dy;
        const x2 = s.x2 + matchedTrans.dx, y2 = s.y2 + matchedTrans.dy;
        totalCutLengthMm += Math.hypot(x2 - x1, y2 - y1);
        return { ...s, x1, y1, x2, y2 };
      }
      const x1 = warpX(s.x1), y1 = warpY(s.y1);
      const x2 = warpX(s.x2), y2 = warpY(s.y2);
      totalCutLengthMm += Math.hypot(x2 - x1, y2 - y1);
      return { ...s, x1, y1, x2, y2 };
    });

    let totalFoldLengthMm = 0;
    const newFoldSegments = (baseModel.foldSegments || []).map(s => {
      const feature=rigidFeatureForSegment(s,holeTranslations);
      const x1 = feature?s.x1+feature.dx:warpX(s.x1), y1 = feature?s.y1+feature.dy:warpY(s.y1);
      const x2 = feature?s.x2+feature.dx:warpX(s.x2), y2 = feature?s.y2+feature.dy:warpY(s.y2);
      totalFoldLengthMm += Math.hypot(x2 - x1, y2 - y1);
      return { ...s, x1, y1, x2, y2 };
    });

    const newHinges = (baseModel.hinges || []).map(h => {
      const feature=rigidFeatureForSegment({x1:h.p1.x,y1:h.p1.y,x2:h.p2.x,y2:h.p2.y},holeTranslations);
      const p1 = { x: feature?h.p1.x+feature.dx:warpX(h.p1.x), y: feature?h.p1.y+feature.dy:warpY(h.p1.y) };
      const p2 = { x: feature?h.p2.x+feature.dx:warpX(h.p2.x), y: feature?h.p2.y+feature.dy:warpY(h.p2.y) };
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      return {
        ...h,
        planarSlope: preservedPlanarSlope(h),
        p1,
        p2,
        midpoint: { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 },
        lengthMm: len,
        length: len
      };
    });

    const newBleedSegments = (baseModel.bleedSegments || []).map(s => ({
      ...s,
      x1: warpX(s.x1),
      y1: warpY(s.y1),
      x2: warpX(s.x2),
      y2: warpY(s.y2)
    }));

    const warpArrowList = (arr) => (arr || []).map(sa => {
      const feature=sa.p1&&sa.p2?rigidFeatureForSegment({x1:sa.p1.x,y1:sa.p1.y,x2:sa.p2.x,y2:sa.p2.y},holeTranslations):null;
      const map=p=>feature?{x:p.x+feature.dx,y:p.y+feature.dy}:{x:warpX(p.x),y:warpY(p.y)};
      const p1 = sa.p1 ? map(sa.p1) : null;
      const p2 = sa.p2 ? map(sa.p2) : null;
      const tpointer = sa.tpointer ? { ...sa.tpointer, x: warpX(sa.tpointer.x), y: warpY(sa.tpointer.y) } : null;
      const lineLength = p1 && p2 ? Math.hypot(p2.x-p1.x,p2.y-p1.y) : sa.lineLength;
      return { ...sa, p1, p2, tpointer, lineLength };
    });

    const blankW = Math.max(1, maxX - minX);
    const blankH = Math.max(1, maxY - minY);

    return reconcileDimensionMeasurements(enforceFlapLengthLimit({
      ...baseModel,
      blankWidthMm: blankW,
      blankHeightMm: blankH,
      totalCutLengthMm,
      totalFoldLengthMm,
      totalAreaMm2,
      boxDimensionsMm: {
        length: targetL,
        width: targetW,
        depth: targetH
      },
      sizeArrowData: warpArrowList(baseModel.sizeArrowData),
      outsideArrowData: warpArrowList(baseModel.outsideArrowData),
      bounds: {
        minX: isFinite(minX) ? minX : 0,
        minY: isFinite(minY) ? minY : 0,
        maxX: isFinite(maxX) ? maxX : blankW,
        maxY: isFinite(maxY) ? maxY : blankH,
        width: blankW,
        height: blankH
      },
      cutSegmentsMm: newCutSegments,
      foldSegmentsMm: newFoldSegments,
      bleedSegmentsMm: newBleedSegments,
      cutSegments: newCutSegments,
      foldSegments: newFoldSegments,
      bleedSegments: newBleedSegments,
      faces: newFaces,
      hinges: newHinges
    }));
  }

  // These four end flaps must fit across half the width of the main H panel.
  // Work on the finished geometry, including Details edits, and keep each
  // attachment edge fixed. No change to the caller's parametric source model.
  function enforceFlapLengthLimit(model, anglePass = false) {
    if (!model) return model;
    const code = f => f.pacdoraName || f.shortName;
    const base = model.faces.find(f => code(f) === 'H');
    const limit = base?.bounds?.height / 2;
    const names = new Set(['FBL', 'FBR', 'HBL', 'HBR']);
    const xEdits = (limit > 0) ? model.faces.filter(f => names.has(code(f)) && f.bounds.width > limit + 1e-8).map(face => {
      const b = face.bounds;
      const anchor = code(face).endsWith('L') ? b.maxX : b.minX;
      return {face, axis: 'x', anchor, scale: limit / b.width};
    }) : [];

    // Regla de solapas superiores e inferiores en cajas plegables / RSC (cajas de 4 caras):
    // Nunca deben superar la mitad de la cara más pequeña menos 1 mm.
    const fourPanelBody = model.faces.filter(f => f.role === 'BODY' && f.name && f.name.includes('Cara Cuerpo'));
    let yEdits = [];
    if (fourPanelBody.length >= 4) {
      const minBodyWidth = Math.min(...fourPanelBody.map(f => f.bounds.width));
      const flapLimitY = Math.max(5, (minBodyWidth / 2) - 1);
      const isTopFlap = f => f.role === 'TOP_FLAP_INNER' || f.role === 'TOP_FLAP_OUTER' || (f.name && f.name.startsWith('Solapa Sup.'));
      const isBottomFlap = f => f.role === 'BOTTOM_FLAP_INNER' || f.role === 'BOTTOM_FLAP_OUTER' || (f.name && f.name.startsWith('Solapa Inf.'));

      for (const face of model.faces) {
        if (isTopFlap(face) && face.bounds.height > flapLimitY + 1e-4) {
          yEdits.push({ face, axis: 'y', anchor: face.bounds.maxY, scale: flapLimitY / face.bounds.height });
        } else if (isBottomFlap(face) && face.bounds.height > flapLimitY + 1e-4) {
          yEdits.push({ face, axis: 'y', anchor: face.bounds.minY, scale: flapLimitY / face.bounds.height });
        }
      }
    }

    // A dust flap closes across the receiving wall, not across its own wall.
    // Recognize a four-wall strip through folds, independent of labels/catalog IDs.
    const sourceHinges = model.hinges || [];
    const ends = h => [h.parentFaceId ?? h.parentId ?? h.faceA, h.childFaceId ?? h.childId ?? h.faceB];
    const incident = f => sourceHinges.filter(h => ends(h).includes(f.id));
    const neighbor = (h,f) => model.faces.find(g => g.id === ends(h).find(id => id !== f.id));
    const horizontal = h => Math.abs(h.p1.y-h.p2.y)<0.05;
    const vertical = h => Math.abs(h.p1.x-h.p2.x)<0.05;
    const structuralEdits = [];
    for (const flap of model.faces) {
      const links=incident(flap);
      if (links.length!==1 || !horizontal(links[0])) continue;
      const wall=neighbor(links[0],flap);
      if (!wall || flap.bounds.minY>=wall.bounds.minY-1) continue;
      const strip=new Set([wall.id]), queue=[wall];
      for(let i=0;i<queue.length;i++) for(const h of incident(queue[i]).filter(vertical)) {
        const other=neighbor(h,queue[i]);
        if(!other || strip.has(other.id) || other.role==='GLUE_FLAP')continue;
        const allowance=Math.max(3,wall.bounds.height*0.03);
        if(Math.abs(other.bounds.minY-wall.bounds.minY)>allowance || Math.abs(other.bounds.maxY-wall.bounds.maxY)>allowance)continue;
        strip.add(other.id);queue.push(other);
      }
      if(strip.size!==4)continue;
      const receivers=incident(wall).filter(vertical).map(h=>neighbor(h,wall)).filter(f=>f&&strip.has(f.id));
      if(!receivers.length)continue;
      const cap=Math.min(...receivers.map(f=>f.bounds.width))/2;
      if(cap>0 && flap.bounds.height>cap+1e-8 && !yEdits.some(e=>e.face.id===flap.id)) {
        structuralEdits.push({face:flap,axis:'y',anchor:links[0].p1.y,scale:cap/flap.bounds.height});
      }
    }
    // Preserve the source direction of oblique bottom folds. Use the same affine
    // shear for both faces sharing the fold and hold their body attachment fixed.
    // This preserves a 45-degree lock fold without forcing other slopes to 45.
    const angleEdits=[];
    for(const h of sourceHinges) {
      const slope=preservedPlanarSlope(h);
      if(!Number.isFinite(slope) || Math.abs(slope)<0.05 || Math.abs(slope)>20)continue;
      const dy=h.p2.y-h.p1.y,dx=h.p2.x-h.p1.x;
      if(Math.abs(dy)<1 || Math.abs(dx-slope*dy)<1e-7)continue;
      const pair=ends(h).map(id=>model.faces.find(f=>f.id===id));
      if(pair.some(f=>!f))continue;
      const attachment=pair.flatMap(f=>incident(f).filter(g=>g!==h && horizontal(g)).map(g=>({g,f})))[0];
      if(!attachment)continue;
      const anchor=attachment.g.p1.y;
      const other=neighbor(attachment.g,attachment.f);
      if(!other || pair.some(f=>f.bounds.minY<anchor-0.1) || other.bounds.maxY>anchor+0.1)continue;
      const shear=(slope*dy-dx)/dy;
      for(const face of pair)angleEdits.push({face,axis:'shear',anchor,shear});
    }
    const edits = anglePass ? angleEdits : [...xEdits, ...yEdits, ...structuralEdits];

    if (!edits.length) return anglePass ? model : enforceFlapLengthLimit(model, true);
    const mapInFace = (p, edit) => edit.axis === 'shear'
      ? ({...p, x:p.x+edit.shear*(p.y-edit.anchor)}) : edit.axis === 'y'
      ? ({...p, y: edit.anchor + (p.y - edit.anchor) * edit.scale})
      : ({...p, x: edit.anchor + (p.x - edit.anchor) * edit.scale});
    const belongs = (p, face) => {
      const b = face.bounds, eps = 1e-6;
      if (p.x < b.minX-eps || p.x > b.maxX+eps || p.y < b.minY-eps || p.y > b.maxY+eps) return false;
      if (pointInPolygon(p, face.polygon)) return true;
      return face.polygon.some((a,i) => {
        const q = face.polygon[(i+1)%face.polygon.length], dx=q.x-a.x, dy=q.y-a.y;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<eps;
      });
    };
    const mapPoint = p => {
      const edit = edits.find(e => belongs(p,e.face));
      return edit ? mapInFace(p,edit) : {...p};
    };
    const area = poly => Math.abs(poly.reduce((s,p,i) => {const q=poly[(i+1)%poly.length];return s+p.x*q.y-q.x*p.y;},0)/2);
    const holeTranslations = [];
    const faces = model.faces.map(face => {
      const edit = edits.find(e => e.face.id === face.id);
      if (!edit) return face;
      const polygon = face.polygon.map(p => mapInFace(p,edit));
      const holes = (face.holes || []).map(h => {
        if (!h || !h.length) return [];
        const xs = h.map(p => p.x), ys = h.map(p => p.y);
        const oldCx = (Math.min(...xs) + Math.max(...xs)) * 0.5;
        const oldCy = (Math.min(...ys) + Math.max(...ys)) * 0.5;
        const newC = mapInFace({ x: oldCx, y: oldCy }, edit);
        const dx = newC.x - oldCx;
        const dy = newC.y - oldCy;
        holeTranslations.push({ dx, dy, points: h });
        return h.map(p => ({ x: p.x + dx, y: p.y + dy }));
      });
      const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const bounds={minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};
      const areaMm2=area(polygon)-holes.reduce((s,h)=>s+area(h),0);
      return {...face,polygon,points:polygon,holes,bounds,bbox:{...bounds},areaMm2,area:areaMm2,
        centroid:face.centroid ? mapInFace(face.centroid,edit) : face.centroid};
    });
    const isPointInHole = (pt, holePts) => holePts.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 0.2);
    const segments = list => (list || []).map(s => {
      let matchedTrans = null;
      for (const trans of holeTranslations) {
        if (isPointInHole({ x: s.x1, y: s.y1 }, trans.points) && isPointInHole({ x: s.x2, y: s.y2 }, trans.points)) {
          matchedTrans = trans;
          break;
        }
      }
      if (matchedTrans) {
        return { ...s, x1: s.x1 + matchedTrans.dx, y1: s.y1 + matchedTrans.dy, x2: s.x2 + matchedTrans.dx, y2: s.y2 + matchedTrans.dy };
      }
      const a=mapPoint({x:s.x1,y:s.y1}),b=mapPoint({x:s.x2,y:s.y2});
      return {...s,x1:a.x,y1:a.y,x2:b.x,y2:b.y};
    });
    const cutSegments=segments(model.cutSegments),foldSegments=segments(model.foldSegments);
    const hinges=(model.hinges || []).map(h => {
      const p1=mapPoint(h.p1),p2=mapPoint(h.p2),length=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      return {...h,planarSlope:preservedPlanarSlope(h),p1,p2,midpoint:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2},length,lengthMm:length};
    });
    const arrows = list => (list || []).map(a => {
      const p1=a.p1 ? mapPoint(a.p1) : a.p1,p2=a.p2 ? mapPoint(a.p2) : a.p2;
      const moved=p1 && p2 && (p1.x!==a.p1.x || p2.x!==a.p2.x || p1.y!==a.p1.y || p2.y!==a.p2.y);
      return {...a,p1,p2,tpointer:a.tpointer ? mapPoint(a.tpointer) : a.tpointer,
        lineLength:moved ? Math.hypot(p2.x-p1.x,p2.y-p1.y) : a.lineLength};
    });
    const minX=Math.min(...faces.map(f=>f.bounds.minX)),maxX=Math.max(...faces.map(f=>f.bounds.maxX));
    const minY=Math.min(...faces.map(f=>f.bounds.minY)),maxY=Math.max(...faces.map(f=>f.bounds.maxY));
    const length=s=>Math.hypot(s.x2-s.x1,s.y2-s.y1);
    const constrained = {...model,faces,hinges,cutSegments,foldSegments,cutSegmentsMm:cutSegments,foldSegmentsMm:foldSegments,
      bleedSegments:[],bleedSegmentsMm:[],sizeArrowData:arrows(model.sizeArrowData),outsideArrowData:arrows(model.outsideArrowData),
      bounds:{minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY},blankWidthMm:maxX-minX,blankHeightMm:maxY-minY,
      totalAreaMm2:faces.reduce((s,f)=>s+area(f.polygon)-(f.holes||[]).reduce((n,h)=>n+area(h),0),0),
      totalCutLengthMm:cutSegments.reduce((s,e)=>s+length(e),0),totalFoldLengthMm:foldSegments.reduce((s,e)=>s+length(e),0)};
    return anglePass ? constrained : enforceFlapLengthLimit(constrained, true);
  }

  /**
   * Finds the primary lid / closure flap face of a model (used for `Parts` highlight and structural modification).
   */
  // Match reflected geometry, including cutouts, on either symmetry axis.
  function findSymmetricFace(model, face, axis, mirrorAxis = null) {
    if (!model || !face || !face.bounds || !face.polygon) return null;
    const tolerance = 0.35;
    const editableAxis = f => f.bounds.width < f.bounds.height ? 'x' : 'y';
    if (editableAxis(face) !== axis) return null;
    const distanceToRing = (p, ring) => {
      let best = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy || 1)));
        best = Math.min(best, Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy));
      }
      return best;
    };
    for (const mirror of mirrorAxis ? [mirrorAxis] : ['x', 'y']) {
      const sum = mirror === 'x' ? model.bounds.minX + model.bounds.maxX : model.bounds.minY + model.bounds.maxY;
      const reflect = p => ({x: mirror === 'x' ? sum-p.x : p.x, y: mirror === 'y' ? sum-p.y : p.y});
      const ringsMatch = (a, b) => {
        const reflected = a.map(reflect);
        return reflected.every(p => distanceToRing(p, b) <= tolerance) && b.every(p => distanceToRing(p, reflected) <= tolerance);
      };
      const a = face.bounds;
      const other = model.faces.find(candidate => {
        if (candidate.id === face.id || !candidate.bounds || !candidate.polygon || editableAxis(candidate) !== axis || candidate.role !== face.role) return false;
        const b = candidate.bounds;
        const centerA = reflect({x:(a.minX+a.maxX)/2, y:(a.minY+a.maxY)/2});
        if (Math.abs(centerA.x-(b.minX+b.maxX)/2) > tolerance || Math.abs(centerA.y-(b.minY+b.maxY)/2) > tolerance ||
            Math.abs(a.width-b.width) > tolerance || Math.abs(a.height-b.height) > tolerance) return false;
        if (!ringsMatch(face.polygon, candidate.polygon)) return false;
        const holesA = face.holes || [], holesB = candidate.holes || [];
        if (holesA.length !== holesB.length) return false;
        const remaining = holesB.slice();
        return holesA.every(hole => {
          const index = remaining.findIndex(otherHole => ringsMatch(hole, otherHole));
          if (index < 0) return false;
          remaining.splice(index, 1);
          return true;
        });
      });
      if (other) return other;
    }
    return null;
  }

  function dimensionsFromBase(model,rootFaceId=model.rootFaceId) {
    const base=model.faces.find(f=>f.id===rootFaceId);
    if(!base)return model.boxDimensionsMm;
    const depths=[];
    for(const h of model.hinges){
      const childId=h.parentFaceId===rootFaceId?h.childFaceId:h.childFaceId===rootFaceId?h.parentFaceId:null;
      const child=model.faces.find(f=>f.id===childId);if(!child)continue;
      const dx=h.p2.x-h.p1.x,dy=h.p2.y-h.p1.y,length=Math.hypot(dx,dy)||1;
      const depth=Math.max(...child.polygon.map(p=>Math.abs((p.x-h.p1.x)*dy-(p.y-h.p1.y)*dx)/length));
      if(depth>1)depths.push(depth);
    }
    depths.sort((a,b)=>a-b);
    return {length:+base.bounds.width.toFixed(3),width:+base.bounds.height.toFixed(3),depth:+(depths.length?depths[Math.floor(depths.length/2)]:(model.boxDimensionsMm?.depth||40)).toFixed(3)};
  }

  function rerootDielineModel(model, rootFaceId) {
    if(!model.faces.some(f=>f.id===rootFaceId))throw new Error('Panel base no encontrado.');
    const faces=model.faces.map(f=>({...f,isRoot:f.id===rootFaceId,parentId:null}));
    const hinges=[],visited=new Set([rootFaceId]),queue=[rootFaceId];
    while(queue.length){const parent=queue.shift();for(const h of model.hinges){
      const reverse=h.childFaceId===parent,child=reverse?h.parentFaceId:h.parentFaceId===parent?h.childFaceId:null;
      if(child===null||visited.has(child))continue;
      visited.add(child);queue.push(child);
      const face=faces.find(f=>f.id===child);face.parentId=parent;
      hinges.push({...h,parentFaceId:parent,childFaceId:child,parentId:parent,childId:child,defaultAngle:(h.defaultAngle??90)*(reverse?-1:1),animSteps:h.animSteps?.map(s=>({...s,deltaDeg:s.deltaDeg*(reverse?-1:1)}))});
    }}
    if(visited.size!==faces.length)throw new Error('Hay paneles sin unión de hendido. Revisa la clasificación de las capas.');
    return {...model,faces,hinges,rootFaceId,boxDimensionsMm:dimensionsFromBase(model,rootFaceId)};
  }

  function findPrimaryLidFlapFace(model) {
    if (!model || !model.faces || model.faces.length === 0) return null;
    const byName = ['FT', 'TT', 'HT', 'FB', 'F', 'T'];
    for (const code of byName) {
      const f = model.faces.find(x => x.pacdoraName === code);
      if (f) return f;
    }
    // Otherwise pick the topmost or rightmost outer flap
    let best = model.faces[0];
    let bestScore = -Infinity;
    for (const f of model.faces) {
      const score = -f.bounds.minY + (f.role && f.role.includes('FLAP') ? 500 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  /**
   * Applies a structural Part variation (`standard` | `thumb_notch` | `tab_lock` | `handle` | `tear_strip`)
   * to a dieline model in 1:1 mm, returning a modified model whose 2D cut/crease segments and 3D faces/holes
   * reflect the selected part!
   */
  function getPartEdge(model) {
    const face = findPrimaryLidFlapFace(model);
    if (!face) return null;
    let best = null;
    for (let i = 0; i < face.polygon.length; i++) {
      const a = face.polygon[i], b = face.polygon[(i + 1) % face.polygon.length];
      const length = Math.hypot(b.x-a.x, b.y-a.y);
      if (length < 8) continue;
      const tx = (b.x-a.x)/length, ty = (b.y-a.y)/length;
      const onEdge = p => Math.abs((p.x-a.x)*ty-(p.y-a.y)*tx) < 0.2;
      const isFold = model.hinges.some(h => (h.parentFaceId === face.id || h.childFaceId === face.id) && onEdge(h.p1) && onEdge(h.p2));
      if (isFold || (best && best.length >= length)) continue;
      let nx = -ty, ny = tx;
      if (nx*(face.centroid.x-a.x)+ny*(face.centroid.y-a.y) < 0) { nx=-nx; ny=-ny; }
      best = {face, index:i, a, b, tx, ty, nx, ny, length,
        depth: Math.max(...face.polygon.map(p => (p.x-a.x)*nx+(p.y-a.y)*ny))};
    }
    return best;
  }

  
  function getSideLocksData(model) {
    if (!model || !model.faces) return null;
    const hl = model.faces.find(f => f.pacdoraName === 'HL' || f.name?.includes('HL') || f.label?.includes('HL'));
    const hr = model.faces.find(f => f.pacdoraName === 'HR' || f.name?.includes('HR') || f.label?.includes('HR'));
    const base = model.faces.find(f => f.pacdoraName === 'H' || (f.role === 'BODY' && f.id === model.rootFaceId));
    if (!hl || !hr || !base) return null;
    return { hl, hr, base, spanY: hl.bounds.height, minY: hl.bounds.minY, maxY: hl.bounds.maxY };
  }

  function applySideLocksVariation(baseModel, params) {
    const data = getSideLocksData(baseModel);
    if (!data) {
      return { ...baseModel, partError: 'Esta variación requiere una caja automontable con solapas laterales (HL/HR).' };
    }

    const model = {
      ...baseModel,
      faces: baseModel.faces.map(f => ({
        ...f,
        polygon: f.polygon.map(p => ({ ...p })),
        holes: (f.holes || []).map(h => h.map(p => ({ ...p })))
      })),
      cutSegments: baseModel.cutSegments.map(s => ({ ...s })),
      foldSegments: baseModel.foldSegments.map(s => ({ ...s })),
      hinges: baseModel.hinges.map(h => ({ ...h })),
      activePartVariation: 'side_locks',
      partOptions: params
    };

    const hl = model.faces.find(f => f.id === data.hl.id);
    const hr = model.faces.find(f => f.id === data.hr.id);
    const base = model.faces.find(f => f.id === data.base.id);

    const count = params.count || 2;
    const length = params.length || 36;
    const distance = params.distance || 80;
    const radius = params.radius ?? 2.5;
    const depth = params.depth || 3.8;

    const minY = hl.bounds.minY;
    const maxY = hl.bounds.maxY;
    const midY = (minY + maxY) / 2;

    let centers = [];
    if (count === 1) centers = [midY];
    else if (count === 2) centers = [midY + distance / 2, midY - distance / 2];
    else centers = [midY + distance, midY, midY - distance];
    centers.sort((a, b) => b - a);

    // 1. Reconstruir HL (machos a la izquierda)
    const xMachoHL = hl.bounds.minX;
    const xBaseHL = hl.bounds.minX + depth;
    const xInnerHL = hl.bounds.maxX;

    const newHlPoly = [
      { x: xInnerHL, y: maxY },
      { x: xBaseHL, y: maxY }
    ];
    for (const cy of centers) {
      const yTop = cy + length / 2;
      const yBot = cy - length / 2;
      const taper = Math.min(1.5, depth);
      newHlPoly.push({ x: xBaseHL, y: yTop + taper });
      newHlPoly.push({ x: xMachoHL, y: yTop });
      newHlPoly.push({ x: xMachoHL, y: yBot });
      newHlPoly.push({ x: xBaseHL, y: yBot - taper });
    }
    newHlPoly.push({ x: xBaseHL, y: minY });
    newHlPoly.push({ x: xInnerHL, y: minY });
    hl.polygon = newHlPoly;

    // 2. Reconstruir HR (machos a la derecha)
    const xMachoHR = hr.bounds.maxX;
    const xBaseHR = hr.bounds.maxX - depth;
    const xInnerHR = hr.bounds.minX;

    const newHrPoly = [
      { x: xInnerHR, y: maxY },
      { x: xInnerHR, y: minY },
      { x: xBaseHR, y: minY }
    ];
    const centersAsc = centers.slice().sort((a, b) => a - b);
    for (const cy of centersAsc) {
      const yBot = cy - length / 2;
      const yTop = cy + length / 2;
      const taper = Math.min(1.5, depth);
      newHrPoly.push({ x: xBaseHR, y: yBot - taper });
      newHrPoly.push({ x: xMachoHR, y: yBot });
      newHrPoly.push({ x: xMachoHR, y: yTop });
      newHrPoly.push({ x: xBaseHR, y: yTop + taper });
    }
    newHrPoly.push({ x: xBaseHR, y: maxY });
    hr.polygon = newHrPoly;

    // 3. Reconstruir ranuras hembra en Base H
    const xLeft = base.bounds.minX;
    const xRight = base.bounds.maxX;
    const yBaseMin = base.bounds.minY;
    const yBaseMax = base.bounds.maxY;
    const slotW = 5.0;
    const r = Math.max(0, Math.min(radius, slotW / 2, length / 4));

    function slotPoints(cx, cy, isLeft) {
      const yTop = cy + length / 2;
      const yBot = cy - length / 2;
      const sign = isLeft ? 1 : -1;
      const xInner = cx + sign * slotW;
      const pts = [];
      if (r < 0.2) {
        pts.push({ x: cx, y: yTop });
        pts.push({ x: xInner, y: yTop });
        pts.push({ x: xInner, y: yBot });
        pts.push({ x: cx, y: yBot });
        return pts;
      }
      pts.push({ x: cx, y: yTop });
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * (Math.PI / 2);
        pts.push({ x: xInner - sign * r + sign * Math.sin(a) * r, y: yTop - r + Math.cos(a) * r });
      }
      pts.push({ x: xInner, y: yBot + r });
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * (Math.PI / 2);
        pts.push({ x: xInner - sign * r + sign * Math.cos(a) * r, y: yBot + r - Math.sin(a) * r });
      }
      pts.push({ x: cx, y: yBot });
      return pts;
    }

    const rightSlotPoints = [];
    for (const cy of centersAsc) {
      const yBot = cy - length / 2;
      const yTop = cy + length / 2;
      rightSlotPoints.push({ x: xRight, y: yBot });
      rightSlotPoints.push(...slotPoints(xRight, cy, false));
      rightSlotPoints.push({ x: xRight, y: yTop });
    }

    const leftSlotPoints = [];
    for (const cy of centers) {
      const yTop = cy + length / 2;
      const yBot = cy - length / 2;
      leftSlotPoints.push({ x: xLeft, y: yTop });
      leftSlotPoints.push(...slotPoints(xLeft, cy, true));
      leftSlotPoints.push({ x: xLeft, y: yBot });
    }

    base.polygon = [
      { x: xLeft, y: yBaseMin },
      { x: xRight, y: yBaseMin },
      ...rightSlotPoints,
      { x: xRight, y: yBaseMax },
      { x: xLeft, y: yBaseMax },
      ...leftSlotPoints
    ];

    // 4. Actualizar cortes y hendidos
    model.cutSegments = model.cutSegments.filter(s => {
      if (s.x1 <= xBaseHL + 0.5 && s.x2 <= xBaseHL + 0.5 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      if (s.x1 >= xBaseHR - 0.5 && s.x2 >= xBaseHR - 0.5 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      if (Math.abs(s.x1 - xLeft) < slotW + 1 && Math.abs(s.x2 - xLeft) < slotW + 1 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      if (Math.abs(s.x1 - xRight) < slotW + 1 && Math.abs(s.x2 - xRight) < slotW + 1 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      return true;
    });

    model.foldSegments = model.foldSegments.filter(s => {
      if (Math.abs(s.x1 - xLeft) < 1 && Math.abs(s.x2 - xLeft) < 1 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      if (Math.abs(s.x1 - xRight) < 1 && Math.abs(s.x2 - xRight) < 1 && s.y1 >= minY - 2 && s.y2 <= maxY + 2) return false;
      return true;
    });

    const addCutLine = (p1, p2) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.05) {
        model.cutSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'CUT', isPartMod: true });
      }
    };
    const addFoldLine = (p1, p2) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.05) {
        model.foldSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'FOLD', isPartMod: true });
      }
    };

    // Cortes de HL
    for (let i = 1; i < newHlPoly.length - 1; i++) addCutLine(newHlPoly[i], newHlPoly[i + 1]);
    // Cortes de HR
    for (let i = 2; i < newHrPoly.length; i++) addCutLine(newHrPoly[i], newHrPoly[(i + 1) % newHrPoly.length]);

    // Cortes y pliegues en ranuras izquierda
    const sortedYLeft = [yBaseMax];
    for (const cy of centers) {
      const yTop = cy + length / 2;
      const yBot = cy - length / 2;
      sortedYLeft.push(yTop, yBot);
      const pts = [{ x: xLeft, y: yTop }, ...slotPoints(xLeft, cy, true), { x: xLeft, y: yBot }];
      for (let i = 0; i < pts.length - 1; i++) addCutLine(pts[i], pts[i + 1]);
      addCutLine({ x: xLeft, y: yTop }, { x: xLeft, y: yBot });
    }
    sortedYLeft.push(yBaseMin);
    for (let i = 0; i < sortedYLeft.length; i += 2) {
      addFoldLine({ x: xLeft, y: sortedYLeft[i] }, { x: xLeft, y: sortedYLeft[i + 1] });
    }

    // Cortes y pliegues en ranuras derecha
    const sortedYRight = [yBaseMin];
    for (const cy of centersAsc) {
      const yBot = cy - length / 2;
      const yTop = cy + length / 2;
      sortedYRight.push(yBot, yTop);
      const pts = [{ x: xRight, y: yBot }, ...slotPoints(xRight, cy, false), { x: xRight, y: yTop }];
      for (let i = 0; i < pts.length - 1; i++) addCutLine(pts[i], pts[i + 1]);
      addCutLine({ x: xRight, y: yBot }, { x: xRight, y: yTop });
    }
    sortedYRight.push(yBaseMax);
    for (let i = 0; i < sortedYRight.length; i += 2) {
      addFoldLine({ x: xRight, y: sortedYRight[i] }, { x: xRight, y: sortedYRight[i + 1] });
    }

    // Recalcular bounds
    for (const face of [hl, hr, base]) {
      const xs = face.polygon.map(p => p.x), ys = face.polygon.map(p => p.y);
      face.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      face.bbox = { ...face.bounds };
    }

    return model;
  }

  function getPartVariationSettings(model, key, options = {}) {
    const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
    const limits = {}, params = {};
    const field = (name, min, max, fallback) => {
      limits[name] = {min, max:Math.max(min, max)};
      params[name] = +clamp(options[name], min, limits[name].max, Math.round(fallback*2)/2).toFixed(3);
    };

    if (key === 'side_locks') {
      const data = getSideLocksData(model);
      const span = data ? data.spanY : 100;
      params.count = [1, 2, 3].includes(Number(options.count)) ? Number(options.count) : 2;
      field('length', 10, Math.max(10, span * 0.4), 36);
      const maxDist = params.count === 3 ? Math.max(15, (span - params.length - 8) / 2) : Math.max(15, span - params.length - 8);
      const defDist = params.count === 3 ? Math.min(45, maxDist * 0.8) : Math.min(80, maxDist * 0.8);
      field('distance', 10, maxDist, defDist);
      field('radius', 0, 5, 2.5);
      field('depth', 2, 8, 3.8);
      return {params, limits};
    }

    const edge = getPartEdge(model);
    if (!edge) return {params:{}, limits:{}};
    if (key === 'handle') {
      field('length', 4, edge.length-8, 86);
      field('width', 3, edge.depth-8, 22);
      field('radius', 0, Math.min(params.width, params.length)/2, 8);
    } else if (key === 'thumb_notch') {
      params.count = Number(options.count) === 2 ? 2 : 1;
      field('radius', 1, Math.min(edge.depth-3, (edge.length-8)/(params.count === 2 ? 4 : 2)), 10);
      field('distance', params.radius*2+2, edge.length-params.radius*2-8, edge.length*0.35);
      // If the edge is too short for a gap, shrink the radius instead of overlapping cuts.
      if (params.count === 2 && params.distance+2*params.radius > edge.length-4) {
        params.radius = Math.max(1, (edge.length-10)/4);
        params.distance = params.radius*2+2;
      }
    } else if (key === 'tab_lock') {
      field('length', 6, edge.length-8, 64);
      field('depth', 3, Math.max(3, edge.depth*0.8), 18);
    }
    return {params, limits};
  }

  function applyPartVariationToModel(baseModel, partKey, options = {}) {
    if (!baseModel || !partKey || partKey === 'standard') return baseModel;
    if (partKey === 'tear_strip') return applyLegacyPartVariation(baseModel, partKey);
    if (partKey === 'side_locks') {
      const {params} = getPartVariationSettings(baseModel, partKey, options);
      return applySideLocksVariation(baseModel, params);
    }
    const edge = getPartEdge(baseModel);
    if (!edge) return baseModel;
    const {params} = getPartVariationSettings(baseModel, partKey, options);
    const model = {...baseModel,
      faces: baseModel.faces.map(f => ({...f, polygon:f.polygon.map(p=>({...p})), holes:(f.holes||[]).map(h=>h.map(p=>({...p})))})),
      cutSegments: baseModel.cutSegments.map(s=>({...s})),
      foldSegments: baseModel.foldSegments.map(s=>({...s})),
      hinges: baseModel.hinges.map(h=>({...h})),
      activePartVariation:partKey, partTargetFaceId:edge.face.id, partOptions:params};
    const flap = model.faces.find(f=>f.id===edge.face.id);
    const at = (t, d=0) => ({x:edge.a.x+edge.tx*t+edge.nx*d, y:edge.a.y+edge.ty*t+edge.ny*d});
    const area = ring => ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
    const positive = ring => area(ring)<0 ? ring.slice().reverse() : ring;
    const addCuts = (points, closed=false) => {
      for(let i=0;i<points.length-(closed?0:1);i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if(Math.hypot(b.x-a.x,b.y-a.y)>1e-6) model.cutSegments.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,type:'CUT',isPartMod:true});
      }
    };
    const removeEdgeCut = (start,end) => {
      model.cutSegments = model.cutSegments.flatMap(s=>{
        const distance = (x,y)=>(x-edge.a.x)*edge.ty-(y-edge.a.y)*edge.tx;
        if(Math.abs(distance(s.x1,s.y1))>0.05 || Math.abs(distance(s.x2,s.y2))>0.05) return [s];
        const project=(x,y)=>(x-edge.a.x)*edge.tx+(y-edge.a.y)*edge.ty;
        const t1=project(s.x1,s.y1),t2=project(s.x2,s.y2),lo=Math.min(t1,t2),hi=Math.max(t1,t2);
        if(hi<=start || lo>=end)return [s];
        const pieces=[];
        if(lo<start)pieces.push([lo,start]);
        if(hi>end)pieces.push([end,hi]);
        return pieces.map(([a,b])=>{const p=at(a),q=at(b);return {...s,x1:p.x,y1:p.y,x2:q.x,y2:q.y};});
      });
    };
    if(partKey==='handle') {
      const {length, width, radius:r}=params;
      const pts=[];
      const c=edge.length/2, d=edge.depth/2;
      const corners=[[c+length/2-r,d+width/2-r,0],[c-length/2+r,d+width/2-r,Math.PI/2],[c-length/2+r,d-width/2+r,Math.PI],[c+length/2-r,d-width/2+r,Math.PI*1.5]];
      for(const [u,v,start] of corners) for(let i=0;i<=8;i++) {
        const angle=start+i*Math.PI/16;
        pts.push(at(u+Math.cos(angle)*r,v+Math.sin(angle)*r));
      }
      if(!pts.every(p=>pointInPolygon(p,flap.polygon))) return {...baseModel,partError:'El asa no cabe en esta solapa. Reduce su largo o ancho.'};
      flap.holes.push(positive(pts));
      addCuts(pts,true);
    } else if(partKey==='thumb_notch') {
      const centers=params.count===2 ? [edge.length/2-params.distance/2,edge.length/2+params.distance/2] : [edge.length/2];
      const path=[{...edge.a}];
      for(const center of centers) {
        for(let i=0;i<=32;i++) {
          const angle=Math.PI*i/32;
          path.push(at(center-params.radius*Math.cos(angle),params.radius*Math.sin(angle)));
        }
      }
      path.push({...edge.b});
      removeEdgeCut(0,edge.length);
      addCuts(path);
      // Replace the straight perimeter by the notched perimeter for both viewers.
      flap.polygon = positive([...flap.polygon.slice(0,edge.index),...path,...flap.polygon.slice(edge.index+2)]);
    } else if(partKey==='tab_lock') {
      const start=(edge.length-params.length)/2,end=start+params.length;
      const a=at(start),b=at(end),taper=Math.min(4,params.length*0.15);
      const outer=[a,at(start+taper,-params.depth),at(end-taper,-params.depth),b];
      removeEdgeCut(start,end);
      addCuts(outer);
      const id=Math.max(...model.faces.map(f=>Number(f.id)||0))+1;
      const hingeId='part_tab_'+id;
      const polygon=positive(outer);
      const centroid={x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};
      const cross=(b.x-a.x)*(-(centroid.y-a.y))-(-(b.y-a.y))*(centroid.x-a.x);
      const angle=cross>=0?90:-90;
      model.faces.push({id,name:'Pestaña de cierre',label:'Pestaña de cierre',role:'FLAP_CLOSURE',polygon,holes:[],centroid,parentId:flap.id,hingeId,defaultAngle:angle});
      const fold={x1:a.x,y1:a.y,x2:b.x,y2:b.y,type:'FOLD',isPartMod:true};
      model.foldSegments.push(fold);
      const len=Math.hypot(b.x-a.x,b.y-a.y);
      model.hinges.push({id:hingeId,parentFaceId:flap.id,childFaceId:id,parentId:flap.id,childId:id,faceA:flap.id,faceB:id,
        p1:a,p2:b,midpoint:at(edge.length/2),length:len,lengthMm:len,defaultAngle:angle,animSteps:[{start:0.8,end:1,deltaDeg:angle}],isPartMod:true});
    }
    for(const face of model.faces) {
      const xs=face.polygon.map(p=>p.x),ys=face.polygon.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      face.bounds={minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};face.bbox={...face.bounds};face.points=face.polygon;
      face.areaMm2=Math.abs(area(face.polygon))-(face.holes||[]).reduce((s,h)=>s+Math.abs(area(h)),0);face.area=face.areaMm2;
    }
    const minX=Math.min(...model.faces.map(f=>f.bounds.minX)),maxX=Math.max(...model.faces.map(f=>f.bounds.maxX));
    const minY=Math.min(...model.faces.map(f=>f.bounds.minY)),maxY=Math.max(...model.faces.map(f=>f.bounds.maxY));
    model.bounds={minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};
    model.blankWidthMm=maxX-minX;model.blankHeightMm=maxY-minY;
    model.cutSegmentsMm=model.cutSegments;model.foldSegmentsMm=model.foldSegments;
    const segmentLength=s=>Math.hypot(s.x2-s.x1,s.y2-s.y1);
    model.totalCutLengthMm=model.cutSegments.reduce((s,e)=>s+segmentLength(e),0);
    model.totalFoldLengthMm=model.foldSegments.reduce((s,e)=>s+segmentLength(e),0);
    model.totalAreaMm2=model.faces.reduce((s,f)=>s+f.areaMm2,0);
    return model;
  }

  function applyLegacyPartVariation(baseModel, partKey) {
    if (!baseModel || !partKey || partKey === 'standard') return baseModel;

    const targetFlap = findPrimaryLidFlapFace(baseModel);
    if (!targetFlap) return baseModel;

    // Clone faces and segments so baseModel remains pristine
    const faces = baseModel.faces.map(f => ({
      ...f,
      polygon: f.polygon.map(p => ({ ...p })),
      points: f.polygon.map(p => ({ ...p })),
      holes: (f.holes || []).map(h => h.map(p => ({ ...p }))),
      bounds: { ...f.bounds },
      bbox: { ...f.bbox }
    }));
    const cutSegments = (baseModel.cutSegments || []).map(s => ({ ...s }));
    const foldSegments = (baseModel.foldSegments || []).map(s => ({ ...s }));

    const flap = faces.find(f => f.id === targetFlap.id) || faces[0];
    const fb = flap.bounds;
    const isHorizontalFlap = fb.width >= fb.height;
    const cx = (fb.minX + fb.maxX) * 0.5;
    const cy = (fb.minY + fb.maxY) * 0.5;
    const globalMidY = (baseModel.bounds.minY + baseModel.bounds.maxY) * 0.5;
    const globalMidX = (baseModel.bounds.minX + baseModel.bounds.maxX) * 0.5;

    const addHolePolygon = (hostFace, pts) => {
      if (!pts || pts.length < 3) return;
      hostFace.holes.push(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        cutSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'CUT', isPartMod: true });
      }
    };

    if (partKey === 'handle') {
      // Die-cut carrying handle slot centered in the flap (rounded stadium slot)
      const slotW = isHorizontalFlap ? Math.min(86, Math.max(36, fb.width * 0.34)) : Math.min(22, Math.max(12, fb.width * 0.32));
      const slotH = isHorizontalFlap ? Math.min(22, Math.max(12, fb.height * 0.32)) : Math.min(86, Math.max(36, fb.height * 0.34));
      const rx = Math.min(slotW, slotH) * 0.48;
      const pts = [];
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const px = cx + Math.cos(ang) * (slotW * 0.5 - rx) + Math.cos(ang) * rx;
        const py = cy + Math.sin(ang) * (slotH * 0.5 - rx) + Math.sin(ang) * rx;
        pts.push({ x: px, y: py });
      }
      addHolePolygon(flap, pts);
    } else if (partKey === 'thumb_notch') {
      // Semicircular thumb notch cut out along the outer free edge of the flap
      const r = Math.min(14, Math.max(7, (isHorizontalFlap ? fb.width : fb.height) * 0.065));
      const notchPts = [];
      const steps = 12;
      if (isHorizontalFlap) {
        const isTopEdge = cy <= globalMidY;
        const edgeY = isTopEdge ? fb.minY : fb.maxY;
        const dirY = isTopEdge ? 1 : -1;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const ang = Math.PI * t;
          notchPts.push({
            x: cx - Math.cos(ang) * r,
            y: edgeY + Math.sin(ang) * r * dirY
          });
        }
      } else {
        const isRightEdge = cx >= globalMidX;
        const edgeX = isRightEdge ? fb.maxX : fb.minX;
        const dirX = isRightEdge ? -1 : 1;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const ang = Math.PI * t;
          notchPts.push({
            x: edgeX + Math.sin(ang) * r * dirX,
            y: cy - Math.cos(ang) * r
          });
        }
      }
      for (let i = 0; i < notchPts.length - 1; i++) {
        cutSegments.push({
          x1: notchPts[i].x,
          y1: notchPts[i].y,
          x2: notchPts[i + 1].x,
          y2: notchPts[i + 1].y,
          type: 'CUT',
          isPartMod: true
        });
      }
    } else if (partKey === 'tab_lock') {
      // Protruding locking tab on the outer edge of the lid flap + corresponding crease line
      const tabSpan = Math.min(64, Math.max(26, (isHorizontalFlap ? fb.width : fb.height) * 0.25));
      const tabDepth = Math.min(18, Math.max(10, (isHorizontalFlap ? fb.height : fb.width) * 0.28));
      if (isHorizontalFlap) {
        const isTopEdge = cy <= globalMidY;
        const edgeY = isTopEdge ? fb.minY : fb.maxY;
        const outY = isTopEdge ? edgeY - tabDepth : edgeY + tabDepth;
        const xL = cx - tabSpan * 0.5;
        const xR = cx + tabSpan * 0.5;
        cutSegments.push(
          { x1: xL, y1: edgeY, x2: xL + 4, y2: outY, type: 'CUT', isPartMod: true },
          { x1: xL + 4, y1: outY, x2: xR - 4, y2: outY, type: 'CUT', isPartMod: true },
          { x1: xR - 4, y1: outY, x2: xR, y2: edgeY, type: 'CUT', isPartMod: true }
        );
        foldSegments.push({ x1: xL, y1: edgeY, x2: xR, y2: edgeY, type: 'FOLD', isPartMod: true });
      } else {
        const isRightEdge = cx >= globalMidX;
        const edgeX = isRightEdge ? fb.maxX : fb.minX;
        const outX = isRightEdge ? edgeX + tabDepth : edgeX - tabDepth;
        const yT = cy - tabSpan * 0.5;
        const yB = cy + tabSpan * 0.5;
        cutSegments.push(
          { x1: edgeX, y1: yT, x2: outX, y2: yT + 4, type: 'CUT', isPartMod: true },
          { x1: outX, y1: yT + 4, x2: outX, y2: yB - 4, type: 'CUT', isPartMod: true },
          { x1: outX, y1: yB - 4, x2: edgeX, y2: yB, type: 'CUT', isPartMod: true }
        );
        foldSegments.push({ x1: edgeX, y1: yT, x2: edgeX, y2: yB, type: 'FOLD', isPartMod: true });
      }
    } else if (partKey === 'tear_strip') {
      // Double parallel zipper tear-strip lines across the flap
      const bandHalf = 5.5;
      if (isHorizontalFlap) {
        const xL = fb.minX + 4;
        const xR = fb.maxX - 4;
        const dashCount = Math.max(8, Math.floor((xR - xL) / 14));
        const step = (xR - xL) / dashCount;
        for (let i = 0; i < dashCount; i++) {
          const sx = xL + i * step + 1.5;
          const ex = sx + step * 0.68;
          cutSegments.push(
            { x1: sx, y1: cy - bandHalf, x2: ex, y2: cy - bandHalf, type: 'CUT', isPartMod: true },
            { x1: sx, y1: cy + bandHalf, x2: ex, y2: cy + bandHalf, type: 'CUT', isPartMod: true }
          );
        }
        cutSegments.push(
          { x1: xL, y1: cy - bandHalf, x2: xL + 8, y2: cy, type: 'CUT', isPartMod: true },
          { x1: xL + 8, y1: cy, x2: xL, y2: cy + bandHalf, type: 'CUT', isPartMod: true }
        );
      } else {
        const yT = fb.minY + 4;
        const yB = fb.maxY - 4;
        const dashCount = Math.max(8, Math.floor((yB - yT) / 14));
        const step = (yB - yT) / dashCount;
        for (let i = 0; i < dashCount; i++) {
          const sy = yT + i * step + 1.5;
          const ey = sy + step * 0.68;
          cutSegments.push(
            { x1: cx - bandHalf, y1: sy, x2: cx - bandHalf, y2: ey, type: 'CUT', isPartMod: true },
            { x1: cx + bandHalf, y1: sy, x2: cx + bandHalf, y2: ey, type: 'CUT', isPartMod: true }
          );
        }
        cutSegments.push(
          { x1: cx - bandHalf, y1: yT, x2: cx, y2: yT + 8, type: 'CUT', isPartMod: true },
          { x1: cx, y1: yT + 8, x2: cx + bandHalf, y2: yT, type: 'CUT', isPartMod: true }
        );
      }
    }

    return {
      ...baseModel,
      activePartVariation: partKey,
      partTargetFaceId: flap.id,
      faces,
      cutSegmentsMm: cutSegments,
      cutSegments,
      foldSegmentsMm: foldSegments,
      foldSegments
    };
  }

  /**
   * Computes outer bleed segments in 1:1 mm for a model:
   * - If the model already has exact `bleedSegments` from the solver and `bleedMm` matches, returns them.
   * - Otherwise generates a clean outer bleed contour around the dieline bounds / outer faces.
   */
  function getOrBuildBleedSegments(model, bleedMm = 5) {
    if (!model || bleedMm <= 0) return [];
    if (Array.isArray(model.bleedSegments) && model.bleedSegments.length > 0 && Math.abs((model.bleedMm || 5) - bleedMm) < 0.2) {
      return model.bleedSegments;
    }
    // Scale existing solver bleed segments around center if bleedMm changed
    if (Array.isArray(model.bleedSegments) && model.bleedSegments.length > 0) {
      const b = model.bounds;
      const cx = (b.minX + b.maxX) * 0.5;
      const cy = (b.minY + b.maxY) * 0.5;
      const delta = bleedMm - (model.bleedMm || 5);
      const sx = (b.width + delta * 2) / Math.max(1, b.width);
      const sy = (b.height + delta * 2) / Math.max(1, b.height);
      return model.bleedSegments.map(s => ({
        x1: cx + (s.x1 - cx) * sx,
        y1: cy + (s.y1 - cy) * sy,
        x2: cx + (s.x2 - cx) * sx,
        y2: cy + (s.y2 - cy) * sy,
        type: 'BLEED'
      }));
    }

    // Fallback: offset each cut segment outward from the centroid of its nearest face by `bleedMm`,
    // keeping only exterior cut segments (those not shared between two faces).
    const out = [];
    const b = model.bounds;
    const gcx = (b.minX + b.maxX) * 0.5;
    const gcy = (b.minY + b.maxY) * 0.5;
    for (const seg of (model.cutSegments || [])) {
      const mx = (seg.x1 + seg.x2) * 0.5;
      const my = (seg.y1 + seg.y2) * 0.5;
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const len = Math.hypot(dx, dy);
      if (len < 2.0) continue;
      let nx = -dy / len;
      let ny = dx / len;
      if (nx * (mx - gcx) + ny * (my - gcy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      // Check if a point slightly outward in direction (nx, ny) is inside any face
      const testPt = { x: mx + nx * 1.5, y: my + ny * 1.5 };
      const insideAny = (model.faces || []).some(f => pointInPolygon(testPt, f.polygon));
      if (insideAny) continue;

      out.push({
        x1: seg.x1 + nx * bleedMm,
        y1: seg.y1 + ny * bleedMm,
        x2: seg.x2 + nx * bleedMm,
        y2: seg.y2 + ny * bleedMm,
        type: 'BLEED'
      });
    }
    return out;
  }

  /**
   * Exports any current `dieline` model (whether resized SVG or FEFCO model) to a clean 1:1 mm `.svg` string
   * with Green (#22c55e) bleed lines, Blue (#009ee3) cut lines, Red (#e5007d) crease lines, and Black dimension cota.
   */
  function exportDielineToSVG(model, bleedMm = 0) {
    if (!model) return '';
    const pad = 25;
    const b = model.bounds;
    const totalW = +(b.width + pad * 2).toFixed(2);
    const totalH = +(b.height + pad * 2 + 15).toFixed(2);
    const ox = pad - b.minX;
    const oy = pad + 10 - b.minY;

    const lines = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">`);
    lines.push(`  <!-- Generado por TROQUELES VICENTE (Escala 1:1 mm) | L=${model.boxDimensionsMm.length} W=${model.boxDimensionsMm.width} H=${model.boxDimensionsMm.depth} mm -->`);

    // 1. Cota 1:1 mm (Black #000000)
    const x1 = +(b.minX + ox).toFixed(3);
    const x2 = +(b.maxX + ox).toFixed(3);
    const cy = +(b.minY + oy - 8).toFixed(3);
    lines.push(`  <g id="Cota_Escala_1_1" stroke="#000000" stroke-width="0.35" fill="none">`);
    lines.push(`    <line x1="${x1}" y1="${(b.minY + oy - 2).toFixed(3)}" x2="${x1}" y2="${(cy - 3).toFixed(3)}" />`);
    lines.push(`    <line x1="${x2}" y1="${(b.minY + oy - 2).toFixed(3)}" x2="${x2}" y2="${(cy - 3).toFixed(3)}" />`);
    lines.push(`    <line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" />`);
    lines.push(`    <text x="${((b.minX + b.maxX) * 0.5 + ox).toFixed(3)}" y="${(cy - 2).toFixed(3)}" fill="#000000" font-family="Arial, sans-serif" font-size="4.5" text-anchor="middle">${b.width.toFixed(2)} mm</text>`);
    lines.push(`  </g>`);

    // 2. Bleed lines (Green #22c55e)
    const bleeds = getOrBuildBleedSegments(model, bleedMm);
    if (bleeds.length > 0) {
      lines.push(`  <g id="Bleed_Verde" stroke="#22c55e" stroke-width="0.4" fill="none" stroke-linecap="round">`);
      for (const s of bleeds) {
        lines.push(`    <line x1="${(s.x1 + ox).toFixed(3)}" y1="${(s.y1 + oy).toFixed(3)}" x2="${(s.x2 + ox).toFixed(3)}" y2="${(s.y2 + oy).toFixed(3)}" />`);
      }
      lines.push(`  </g>`);
    }

    // 3. Cut lines (Blue #009ee3)
    lines.push(`  <g id="Corte_Azul" stroke="#009ee3" stroke-width="0.5" fill="none" stroke-linecap="round">`);
    for (const s of (model.cutSegments || [])) {
      lines.push(`    <line x1="${(s.x1 + ox).toFixed(3)}" y1="${(s.y1 + oy).toFixed(3)}" x2="${(s.x2 + ox).toFixed(3)}" y2="${(s.y2 + oy).toFixed(3)}" />`);
    }
    lines.push(`  </g>`);

    // 4. Fold / Crease lines (Red/Magenta #e5007d)
    const foldList = (model.foldSegments && model.foldSegments.length > 0)
      ? model.foldSegments
      : (model.hinges || []).map(h => ({ x1: h.p1.x, y1: h.p1.y, x2: h.p2.x, y2: h.p2.y }));
    lines.push(`  <g id="Hendido_Rojo" stroke="#e5007d" stroke-width="0.5" fill="none" stroke-linecap="round">`);
    for (const s of foldList) {
      lines.push(`    <line x1="${(s.x1 + ox).toFixed(3)}" y1="${(s.y1 + oy).toFixed(3)}" x2="${(s.x2 + ox).toFixed(3)}" y2="${(s.y2 + oy).toFixed(3)}" />`);
    }
    lines.push(`  </g>`);
    lines.push(`</svg>`);
    return lines.join('\n');
  }

  /**
   * Exports the active dieline to an AutoCAD / ArtiosCAD R12 `.dxf` file in 1:1 mm
   * with separate layers: `CUT` (color 5 blue), `CREASE` (color 1 red), and `BLEED` (color 3 green).
   */
  function exportDielineToDXF(model, bleedMm = 0) {
    if (!model) return '';
    const b = model.bounds;
    const ox = -b.minX;
    const oy = b.maxY; // Flip Y so CAD Y-up is positive

    const dxf = [];
    const pushPair = (code, val) => {
      dxf.push(String(code), String(val));
    };

    pushPair(0, 'SECTION');
    pushPair(2, 'HEADER');
    pushPair(9, '$INSUNITS');
    pushPair(70, 4); // 4 = millimeters
    pushPair(0, 'ENDSEC');

    pushPair(0, 'SECTION');
    pushPair(2, 'TABLES');
    pushPair(0, 'TABLE');
    pushPair(2, 'LAYER');
    pushPair(70, bleedMm > 0 ? 3 : 2);

    const addLayer = (name, colorCode) => {
      pushPair(0, 'LAYER');
      pushPair(2, name);
      pushPair(70, 0);
      pushPair(62, colorCode);
      pushPair(6, 'CONTINUOUS');
    };
    addLayer('CUT', 5);
    addLayer('CREASE', 1);
    if (bleedMm > 0) addLayer('BLEED', 3);

    pushPair(0, 'ENDTAB');
    pushPair(0, 'ENDSEC');

    pushPair(0, 'SECTION');
    pushPair(2, 'ENTITIES');

    const addLine = (layer, x1, y1, x2, y2, color) => {
      pushPair(0, 'LINE');
      pushPair(8, layer);
      pushPair(10, (x1 + ox).toFixed(4));
      pushPair(20, (oy - y1).toFixed(4));
      pushPair(30, '0.0');
      pushPair(11, (x2 + ox).toFixed(4));
      pushPair(21, (oy - y2).toFixed(4));
      pushPair(31, '0.0');
    };

    const bleeds = getOrBuildBleedSegments(model, bleedMm);
    for (const s of bleeds) {
      addLine('BLEED', s.x1, s.y1, s.x2, s.y2);
    }
    for (const s of (model.cutSegments || [])) {
      addLine('CUT', s.x1, s.y1, s.x2, s.y2, s.color);
    }
    const foldList = (model.foldSegments && model.foldSegments.length > 0)
      ? model.foldSegments
      : (model.hinges || []).map(h => ({ x1: h.p1.x, y1: h.p1.y, x2: h.p2.x, y2: h.p2.y }));
    for (const s of foldList) {
      addLine('CREASE', s.x1, s.y1, s.x2, s.y2);
    }

    pushPair(0, 'ENDSEC');
    pushPair(0, 'EOF');
    return dxf.join('\r\n');
  }

  /**
   * Generates a standalone 1:1 mm vector `.pdf` (and `.ai` Adobe Illustrator PDF-compatible) document
   * with zero watermarks, exact mm page dimensions, and vector strokes for Bleed, Cut, and Crease.
   */
  function exportDielineToPDF(model, bleedMm = 0, isAiFormat = false) {
    if (!model) return '';
    const pad = 20;
    const b = model.bounds;
    const totalWmm = b.width + pad * 2;
    const totalHmm = b.height + pad * 2;
    const MM_TO_PT = 72 / 25.4;
    const pageW = +(totalWmm * MM_TO_PT).toFixed(3);
    const pageH = +(totalHmm * MM_TO_PT).toFixed(3);

    const toPtX = (x) => +(((x - b.minX) + pad) * MM_TO_PT).toFixed(3);
    const toPtY = (y) => +((totalHmm - ((y - b.minY) + pad)) * MM_TO_PT).toFixed(3);

    const streamLines = [];
    streamLines.push('1 J 1 j'); // Round cap & join

    // 1. Bleed (Green #22c55e -> 0.133 0.773 0.369 RG)
    const bleeds = getOrBuildBleedSegments(model, bleedMm);
    if (bleeds.length > 0) {
      streamLines.push('0.85 w 0.133 0.773 0.369 RG');
      for (const s of bleeds) {
        streamLines.push(`${toPtX(s.x1)} ${toPtY(s.y1)} m ${toPtX(s.x2)} ${toPtY(s.y2)} l S`);
      }
    }

    // 2. Cut / Trim (Blue #009ee3 -> 0.000 0.620 0.890 RG)
    streamLines.push('1.15 w 0.000 0.620 0.890 RG');
    for (const s of (model.cutSegments || [])) {
      streamLines.push(`${toPtX(s.x1)} ${toPtY(s.y1)} m ${toPtX(s.x2)} ${toPtY(s.y2)} l S`);
    }

    // 3. Crease / Fold (Red #e5007d -> 0.898 0.000 0.490 RG)
    const foldList = (model.foldSegments && model.foldSegments.length > 0)
      ? model.foldSegments
      : (model.hinges || []).map(h => ({ x1: h.p1.x, y1: h.p1.y, x2: h.p2.x, y2: h.p2.y }));
    streamLines.push('1.15 w 0.898 0.000 0.490 RG');
    for (const s of foldList) {
      streamLines.push(`${toPtX(s.x1)} ${toPtY(s.y1)} m ${toPtX(s.x2)} ${toPtY(s.y2)} l S`);
    }

    // 4. Header spec text in PDF
    const titleStr = `Troquel 1:1 mm | Fabricacion: ${model.boxDimensionsMm.length}x${model.boxDimensionsMm.width}x${model.boxDimensionsMm.depth} mm | Plano: ${b.width.toFixed(1)}x${b.height.toFixed(1)} mm`;
    streamLines.push(`BT /F1 9 Tf 0.15 0.20 0.28 rg ${+(pad * MM_TO_PT).toFixed(2)} ${+((totalHmm - 8) * MM_TO_PT).toFixed(2)} Td (${titleStr.replace(/[()\\]/g, '')}) Tj ET`);

    const contentStream = streamLines.join('\n');

    const objects = [];
    objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
    objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);
    objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /TrimBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`);
    objects.push(`4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj`);
    objects.push(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);
    const creator = isAiFormat ? 'Adobe Illustrator / ArtiosCAD 3D Studio 1:1 mm' : 'ArtiosCAD 3D Studio Vector PDF 1:1 mm';
    objects.push(`6 0 obj\n<< /Creator (${creator}) /Producer (ArtiosCAD 3D Studio) >>\nendobj`);

    let pdf = `%PDF-1.5\n`;
    const offsets = [];
    for (const obj of objects) {
      offsets.push(pdf.length);
      pdf += obj + '\n';
    }
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += String(off).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return pdf;
  }

  // Normalizar catálogo de cartones con alias compatibles
  for (const b of ARTIOS_BOARDS) {
    b.id = b.code;
    b.caliper = b.caliperMm;
    b.insideLoss = b.insideLossMm;
    b.outsideGain = b.outsideGainMm;
    b.grammage = b.grammageGsm;
    b.surfaceTex = (b.outerTexture || '').replace(/^assets\/textures\//, '');
    b.innerTex = (b.innerTexture || '').replace(/^assets\/textures\//, '');
    b.edgeTex = (b.edgeTexture || '').replace(/^assets\/textures\//, '');
    b.colorHex = parseInt((b.outerColor || '#c69c6d').replace('#', '0x'), 16);
  }

  function generateSizeArrowData(model) {
    if (!model || !Array.isArray(model.faces) || !model.faces.length) return [];
    let dims = model.boxDimensionsMm;
    if (!dims || !Number.isFinite(dims.length) || !Number.isFinite(dims.width)) {
      dims = dimensionsFromBase(model, model.rootFaceId) || { length: 200, width: 150, depth: 100 };
    }
    const L = +Number(dims.length || 200).toFixed(1);
    const W = +Number(dims.width || 150).toFixed(1);
    const H = +Number(dims.depth || 100).toFixed(1);

    const bodyFaces = model.faces.filter(f => f.role === 'BODY' || (f.name && f.name.includes('Cara Cuerpo')));
    const arrows = [];

    if (bodyFaces.length >= 2) {
      const fL = bodyFaces.find(f => Math.abs(f.bounds.width - L) < 3) || bodyFaces[0];
      const fW = bodyFaces.find(f => Math.abs(f.bounds.width - W) < 3 && f.id !== fL.id) || bodyFaces[1] || bodyFaces[0];

      // Flecha L (Largo)
      const yL = fL.bounds.minY + fL.bounds.height * 0.5;
      arrows.push({
        lineName: 'L',
        lineLength: L,
        p1: { x: fL.bounds.minX, y: yL },
        p2: { x: fL.bounds.maxX, y: yL },
        tpointer: { x: (fL.bounds.minX + fL.bounds.maxX) * 0.5, y: yL, value: 'L=' + L }
      });

      // Flecha W (Ancho)
      const yW = fW.bounds.minY + fW.bounds.height * 0.5;
      arrows.push({
        lineName: 'W',
        lineLength: W,
        p1: { x: fW.bounds.minX, y: yW },
        p2: { x: fW.bounds.maxX, y: yW },
        tpointer: { x: (fW.bounds.minX + fW.bounds.maxX) * 0.5, y: yW, value: 'W=' + W }
      });

      // Flecha H (Alto)
      const xH = fL.bounds.minX + Math.min(30, fL.bounds.width * 0.2);
      arrows.push({
        lineName: 'H',
        lineLength: H,
        p1: { x: xH, y: fL.bounds.minY },
        p2: { x: xH, y: fL.bounds.maxY },
        tpointer: { x: xH, y: (fL.bounds.minY + fL.bounds.maxY) * 0.5, value: 'H=' + H }
      });
    } else {
      const baseFace = model.faces.find(f => f.id === model.rootFaceId) || model.faces[0];
      const yL = baseFace.bounds.minY + baseFace.bounds.height * 0.5;
      arrows.push({
        lineName: 'L',
        lineLength: L,
        p1: { x: baseFace.bounds.minX, y: yL },
        p2: { x: baseFace.bounds.maxX, y: yL },
        tpointer: { x: (baseFace.bounds.minX + baseFace.bounds.maxX) * 0.5, y: yL, value: 'L=' + L }
      });

      const xW = baseFace.bounds.minX + baseFace.bounds.width * 0.5;
      arrows.push({
        lineName: 'W',
        lineLength: W,
        p1: { x: xW, y: baseFace.bounds.minY },
        p2: { x: xW, y: baseFace.bounds.maxY },
        tpointer: { x: xW, y: (baseFace.bounds.minY + baseFace.bounds.maxY) * 0.5, value: 'W=' + W }
      });

      let wallFace = null;
      for (const h of model.hinges || []) {
        if (h.parentFaceId === baseFace.id || h.childFaceId === baseFace.id) {
          const otherId = h.parentFaceId === baseFace.id ? h.childFaceId : h.parentFaceId;
          const other = model.faces.find(f => f.id === otherId);
          if (other && (other.bounds.width > 5 || other.bounds.height > 5)) {
            wallFace = other;
            break;
          }
        }
      }
      if (wallFace) {
        const isHorizWall = wallFace.bounds.width > wallFace.bounds.height;
        if (isHorizWall) {
          const xH = wallFace.bounds.minX + wallFace.bounds.width * 0.5;
          arrows.push({
            lineName: 'H',
            lineLength: H,
            p1: { x: xH, y: wallFace.bounds.minY },
            p2: { x: xH, y: wallFace.bounds.maxY },
            tpointer: { x: xH, y: (wallFace.bounds.minY + wallFace.bounds.maxY) * 0.5, value: 'H=' + H }
          });
        } else {
          const yH = wallFace.bounds.minY + wallFace.bounds.height * 0.5;
          arrows.push({
            lineName: 'H',
            lineLength: H,
            p1: { x: wallFace.bounds.minX, y: yH },
            p2: { x: wallFace.bounds.maxX, y: yH },
            tpointer: { x: (wallFace.bounds.minX + wallFace.bounds.maxX) * 0.5, y: yH, value: 'H=' + H }
          });
        }
      } else {
        const xH = baseFace.bounds.maxX + 15;
        arrows.push({
          lineName: 'H',
          lineLength: H,
          p1: { x: xH, y: baseFace.bounds.minY },
          p2: { x: xH, y: baseFace.bounds.minY + H },
          tpointer: { x: xH, y: baseFace.bounds.minY + H * 0.5, value: 'H=' + H }
        });
      }
    }
    return arrows.map(a=>{const lineLength=measureDimensionArrow(a);return {...a,lineLength,
      tpointer:a.tpointer?{...a.tpointer,value:a.lineName+'='+lineLength.toFixed(1)+' mm'}:a.tpointer};});
  }

  function generateOutsideArrowData(model) {
    if (!model || !Array.isArray(model.faces) || !model.faces.length) return [];
    const arrows = [];
    for (const f of model.faces) {
      if (!f.bounds || f.bounds.width < 1 || f.bounds.height < 1) continue;
      const b = f.bounds;
      const w = +b.width.toFixed(2);
      const h = +b.height.toFixed(2);
      const label = f.name || f.label || `Área ${f.id}`;

      // Cota horizontal (Ancho del área)
      const yW = b.height > 16 ? b.minY + b.height * 0.70 : (b.minY + b.maxY) * 0.5;
      arrows.push({
        faceId: f.id,
        faceName: label,
        dimensionType: 'width',
        lineName: `${f.id}_W`,
        lineLength: w,
        p1: { x: b.minX, y: yW },
        p2: { x: b.maxX, y: yW },
        tpointer: { x: (b.minX + b.maxX) * 0.5, y: yW, value: `${w.toFixed(1)}` }
      });

      // Cota vertical (Alto del área)
      const xH = b.width > 16 ? b.minX + b.width * 0.30 : (b.minX + b.maxX) * 0.5;
      arrows.push({
        faceId: f.id,
        faceName: label,
        dimensionType: 'height',
        lineName: `${f.id}_H`,
        lineLength: h,
        p1: { x: xH, y: b.minY },
        p2: { x: xH, y: b.maxY },
        tpointer: { x: xH, y: (b.minY + b.maxY) * 0.5, value: `${h.toFixed(1)}` }
      });

      // Huecos y asas interiores
      if (Array.isArray(f.holes) && f.holes.length) {
        for (let hi = 0; hi < f.holes.length; hi++) {
          const hole = f.holes[hi];
          if (!hole || hole.length < 3) continue;
          const xs = hole.map(p => p.x), ys = hole.map(p => p.y);
          const hMinX = Math.min(...xs), hMaxX = Math.max(...xs);
          const hMinY = Math.min(...ys), hMaxY = Math.max(...ys);
          const hw = +(hMaxX - hMinX).toFixed(2), hh = +(hMaxY - hMinY).toFixed(2);
          if (hw < 1 || hh < 1) continue;
          const midY = (hMinY + hMaxY) * 0.5, midX = (hMinX + hMaxX) * 0.5;

          arrows.push({
            faceId: f.id,
            holeIndex: hi,
            dimensionType: 'hole_width',
            lineName: `hole_${f.id}_${hi}_W`,
            lineLength: hw,
            p1: { x: hMinX, y: midY },
            p2: { x: hMaxX, y: midY },
            tpointer: { x: midX, y: midY, value: `${hw.toFixed(1)}` }
          });

          arrows.push({
            faceId: f.id,
            holeIndex: hi,
            dimensionType: 'hole_height',
            lineName: `hole_${f.id}_${hi}_H`,
            lineLength: hh,
            p1: { x: midX, y: hMinY },
            p2: { x: midX, y: hMaxY },
            tpointer: { x: midX, y: midY, value: `${hh.toFixed(1)}` }
          });
        }
      }
    }
    return arrows;
  }

  function ensureDielineDimensions(model) {
    if (!model) return model;
    if (!model.boxDimensionsMm) {
      const bodyFaces = model.faces.filter(f => f.role === 'BODY' || (f.name && f.name.includes('Cara Cuerpo')));
      if (bodyFaces.length >= 2) {
        const bodyWidths = bodyFaces.map(f => f.bounds.width);
        const L = Math.max(...bodyWidths);
        const W = Math.min(...bodyWidths);
        const H = bodyFaces[0].bounds.height;
        model.boxDimensionsMm = { length: +L.toFixed(2), width: +W.toFixed(2), depth: +H.toFixed(2) };
      } else {
        model.boxDimensionsMm = dimensionsFromBase(model, model.rootFaceId);
      }
    }

    if (!Array.isArray(model.sizeArrowData) || !model.sizeArrowData.length) {
      model.sizeArrowData = generateSizeArrowData(model);
    }
    if (!Array.isArray(model.outsideArrowData) || !model.outsideArrowData.length) {
      model.outsideArrowData = generateOutsideArrowData(model);
    }
    return reconcileDimensionMeasurements(model);
  }

  function buildDielineModel(svgText) {
    const parsed = parseSVGDieline(svgText);
    const sub = buildPlanarSubdivision(parsed);

    const roleMap = {
      TOP_FLAP_INNER: 'FLAP_INNER_TOP',
      TOP_FLAP_OUTER: 'FLAP_OUTER_TOP',
      BOTTOM_FLAP_INNER: 'FLAP_INNER_BOTTOM',
      BOTTOM_FLAP_OUTER: 'FLAP_OUTER_BOTTOM'
    };

    const faces = sub.faces.map(f => ({
      ...f,
      polygon: f.points,
      holes: f.holes || [],
      bounds: f.bbox,
      area: f.areaMm2,
      label: f.name,
      role: roleMap[f.role] || f.role
    }));

    const hinges = sub.hinges.map(h => {
      const childFace = faces.find(f => f.id === h.childId);
      return {
        ...h,
        parentFaceId: h.parentId,
        childFaceId: h.childId,
        length: h.lengthMm,
        defaultAngle: childFace ? (childFace.defaultAngle || 90) : 90
      };
    });

    const model = {
      ...sub,
      isPacdoraModel: false,
      calibration: {
        mmPerUnit: sub.mmPerUnit,
        detectedCotaMM: sub.cotaMmValue,
        source: sub.scaleSource
      },
      bounds: {
        minX: 0,
        minY: 0,
        maxX: sub.blankWidthMm,
        maxY: sub.blankHeightMm,
        width: sub.blankWidthMm,
        height: sub.blankHeightMm
      },
      cutSegments: sub.cutSegmentsMm,
      foldSegments: sub.foldSegmentsMm,
      faces,
      hinges,
      rootFaceId: sub.rootFaceId
    };

    return ensureDielineDimensions(enforceFlapLengthLimit(model));
  }

  return {
    ARTIOS_BOARDS,
    parseSVGDieline,
    buildPlanarSubdivision,
    buildDielineModel,
    buildDielineModelFromPacdora,
    resizeDielineParametric,
    measureDimensionArrow,
    reconcileDimensionMeasurements,
    inferFoldDimensionBands,
    enforceFlapLengthLimit,
    getSideLocksData,
    applyPartVariationToModel,
    getPartVariationSettings,
    findPrimaryLidFlapFace,
    findSymmetricFace,
    rerootDielineModel,
    dimensionsFromBase,
    generateSizeArrowData,
    generateOutsideArrowData,
    ensureDielineDimensions,
    getOrBuildBleedSegments,
    exportDielineToSVG,
    exportDielineToDXF,
    exportDielineToPDF,
    pointInPolygon
  };
});
