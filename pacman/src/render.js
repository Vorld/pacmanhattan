// 2D map painter used for ground textures (land, parks, water, streets) and the minimap.
(function () {
  const PM = (window.PM = window.PM || {});

  const COLORS = {
    water: '#8ec5dc',
    land: '#ece6db',
    shore: '#dcd4c6',
    park: '#b9dca6',
    parkEdge: '#a3cc8f',
    plaza: '#e2dccf',
    streetCase: '#c9c1b3',
    street: '#fbf9f4',
    major: '#fff6dc',
    path: '#efe7d2',
    pathCase: '#a8c795',
  };
  // street widths (m) by class: 0 park path, 1 pedestrian, 2 local, 3 major
  const WIDTH = [4, 7, 11, 16];

  class TilePainter {
    constructor(data, graph) {
      this.data = data;
      this.graph = graph;
      this.C = 250;
      this.gGrid = this.index(data.green);
      this.wGrid = this.index(data.water);
    }

    index(polys) {
      const grid = new Map(), C = this.C;
      polys.forEach((p, i) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let j = 0; j < p.length; j += 2) {
          x0 = Math.min(x0, p[j]); x1 = Math.max(x1, p[j]); y0 = Math.min(y0, p[j + 1]); y1 = Math.max(y1, p[j + 1]);
        }
        for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
          for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++) {
            const k = gx + ',' + gy;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
          }
      });
      return grid;
    }

    query(grid, x0, y0, x1, y1) {
      const out = new Set(), C = this.C;
      for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
        for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++)
          for (const i of grid.get(gx + ',' + gy) || []) out.add(i);
      return out;
    }

    // paint the square [ox, ox+M] x [oy, oy+M] (metres) onto a new canvas of px x px
    paint(ox, oy, M, px, detail = true) {
      const S = px / M;
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const g = cv.getContext('2d');
      g.setTransform(S, 0, 0, S, -ox * S, -oy * S);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.fillStyle = COLORS.water;
      g.fillRect(ox, oy, M, M);
      g.fillStyle = COLORS.shore;
      for (const r of this.data.mainland) { this.poly(g, r); g.fill(); }
      g.fillStyle = COLORS.land;
      for (const r of this.data.islands) { this.poly(g, r); g.fill(); }
      const x1 = ox + M, y1 = oy + M;
      g.fillStyle = COLORS.park; g.strokeStyle = COLORS.parkEdge; g.lineWidth = Math.max(1 / S, 1);
      for (const i of this.query(this.gGrid, ox, oy, x1, y1)) { this.flat(g, this.data.green[i]); g.fill(); if (detail) g.stroke(); }
      g.fillStyle = COLORS.water;
      for (const i of this.query(this.wGrid, ox, oy, x1, y1)) { this.flat(g, this.data.water[i]); g.fill(); }
      const edges = [...this.graph.edgesIn(ox - 20, oy - 20, x1 + 20, y1 + 20)].sort((a, b) => a.cls - b.cls);
      const minW = 1.2 / S;
      for (const pass of detail ? [0, 1] : [1]) {
        for (const e of edges) {
          if (!detail && e.cls === 0) continue;
          const w = Math.max(minW, WIDTH[e.cls]);
          g.lineWidth = pass === 0 ? w + 3 : w;
          g.strokeStyle = pass === 0 ? (e.cls === 0 ? COLORS.pathCase : COLORS.streetCase)
            : (e.cls === 0 ? COLORS.path : e.cls === 3 ? COLORS.major : COLORS.street);
          g.beginPath();
          g.moveTo(e.pts[0][0], e.pts[0][1]);
          for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]);
          g.stroke();
        }
      }
      return cv;
    }

    poly(g, r) {
      g.beginPath();
      g.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) g.lineTo(r[i][0], r[i][1]);
      g.closePath();
    }

    flat(g, p) {
      g.beginPath();
      g.moveTo(p[0], p[1]);
      for (let j = 2; j < p.length; j += 2) g.lineTo(p[j], p[j + 1]);
      g.closePath();
    }
  }

  PM.TilePainter = TilePainter;
  PM.COLORS = COLORS;
})();
