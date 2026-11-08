/**
 * ARTIOS-LIKE 3D PACKAGING ENGINE - CORE GEOMETRY, TOPOLOGY & BOARD CATALOG
 * Parses 1:1 mm SVG dielines (Blue = Cut, Red/Magenta = Fold, Black = Dimension/Cota),
 * performs Planar Half-Edge Subdivision (DCEL) with CAD intersection & T-junction splitting,
 * extracts exact 2D panels with curved slot relief geometry, and builds the 3D kinematic tree.
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

  /**
   * Classify stroke color according to user specification:
   * - Red / Magenta (#e5007d, #ff0000, etc.) -> 'FOLD' (doblez / hendido)
   * - Blue / Cyan (#009ee3, #0000ff, etc.)   -> 'CUT'  (corte)
   * - Black / Gray                           -> 'DIMENSION' (cota)
   */
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
  // 2. LIGHTWEIGHT REGEX/DOM-FREE SVG PARSER
  // ============================================================================

  function parseAttributes(attrString) {
    const attrs = {};
    const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = regex.exec(attrString)) !== null) {
      attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
    }
    return attrs;
  }

  function parseStyleStroke(attrs) {
    let stroke = attrs.stroke || null;
    let fill = attrs.fill || null;
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
            const steps = 12;
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
            const steps = 10;
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
      const { stroke } = parseStyleStroke(attrs);
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

    if (cotaMmValue && cotaMmValue > 0) {
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
  // 4. PLANAR HALF-EDGE GRAPH (DCEL) & KINEMATIC TREE BUILDER
  // ============================================================================

  function buildPlanarSubdivision(parsedDieline) {
    const { cutSegmentsMm, foldSegmentsMm, blankWidthMm, blankHeightMm } = parsedDieline;

    const allSegs = [
      ...cutSegmentsMm.map(s => ({ ...s })),
      ...foldSegmentsMm.map(s => ({ ...s }))
    ];

    const n = allSegs.length;
    const splits = Array.from({ length: n }, () => [0, 1]);
    const INTER_TOL = 0.06; // 0.06 mm CAD snap tolerance

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

    // Prune degree-1 dangling segments (such as fold line overhangs into slots)
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

      if (signedArea > 150) {
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

    // Build hinges between adjacent panels
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

    // Semantic panel classification
    const midY = blankHeightMm * 0.5;
    const bodyFaces = rawFaces
      .filter(f => f.bbox.minY < midY && f.bbox.maxY > midY)
      .sort((a, b) => a.centroid.x - b.centroid.x);

    let bodyCounter = 1;
    const bodyDimensions = [];
    for (const bf of bodyFaces) {
      if (bf.bbox.width < 45 && (bf === bodyFaces[0] || bf === bodyFaces[bodyFaces.length - 1])) {
        bf.role = 'GLUE_FLAP';
        bf.name = 'Pestaña de Pegado';
        bf.shortName = 'Pegado';
        bf.defaultAngle = 90;
        bf.foldOrder = 0.15; // Folds early with body
      } else {
        bf.role = 'BODY';
        bf.bodyIndex = bodyCounter;
        bf.name = `Cara Cuerpo ${bodyCounter}`;
        bf.shortName = `Cara ${bodyCounter}`;
        bf.defaultAngle = 90;
        bf.foldOrder = 0.0; // Body folds first
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
        f.foldOrder = isInnerFlap ? 0.55 : 0.75; // Top inner then top outer
      } else {
        f.role = isInnerFlap ? 'BOTTOM_FLAP_INNER' : 'BOTTOM_FLAP_OUTER';
        f.name = `Solapa Inf. ${idxLabel} (${isInnerFlap ? 'Int.' : 'Ext.'})`;
        f.shortName = `Inf. ${idxLabel}`;
        f.defaultAngle = 90;
        f.foldOrder = isInnerFlap ? 0.25 : 0.40; // Bottom inner then bottom outer
      }
    }

    // Root panel selection: Cara Cuerpo 2 (central long body face)
    const mainBodyCandidates = bodyFaces.filter(f => f.role === 'BODY');
    const rootFace = mainBodyCandidates.length >= 2
      ? mainBodyCandidates[1]
      : (mainBodyCandidates[0] || rawFaces[0]);
    rootFace.isRoot = true;
    rootFace.defaultAngle = 0;

    // Build Kinematic Tree from rootFace via BFS
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

          // In right-handed 3D (x3d = x_mm, y3d = -y_mm, z3d = +up/inward):
          // We want (u_3d x v_3d)_z = ux3d * vy3d - uy3d * vx3d > 0
          // Since x3d = x, y3d = -y, ux3d * vy3d - uy3d * vx3d = -(dx * cy - dy * cx)
          // So if (dx * cy - dy * cx) > 0 in SVG y-down coords, swap p1 and p2!
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

    // Calculate 3D assembled box nominal dimensions (L x W x H)
    let boxLengthMm = rootFace.bbox.width;
    let boxWidthMm = mainBodyCandidates[0] ? mainBodyCandidates[0].bbox.width : rootFace.bbox.width;
    let boxDepthMm = mainBodyCandidates[0] ? mainBodyCandidates[0].bbox.height : rootFace.bbox.height;

    return {
      ...parsedDieline,
      totalAreaMm2,
      boxDimensionsMm: {
        length: boxLengthMm,
        width: boxWidthMm,
        depth: boxDepthMm
      },
      faces: rawFaces,
      hinges: treeHinges,
      rootFaceId: rootFace.id
    };
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

    return {
      ...sub,
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
  }

  return {
    ARTIOS_BOARDS,
    parseSVGDieline,
    buildPlanarSubdivision,
    buildDielineModel,
    pointInPolygon
  };
});
