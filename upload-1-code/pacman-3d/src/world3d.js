// 3D world: Three.js scene with textured ground, extruded buildings, characters and markers.
(function () {
  const PM = (window.PM = window.PM || {});
  const T = window.THREE;

  // building palette: 0-4 brick/brownstone, 5-8 limestone, 9-12 glass towers, 13 civic, 14 industrial
  const PALETTE = [
    '#f2a488', '#f7c59f', '#e8907a', '#f4d0a8', '#dea08c',
    '#f6ead3', '#efe0c3', '#e9dcc9', '#f3e6d6',
    '#a9d2ef', '#b9dcf2', '#9ac4e6', '#c6cff5',
    '#f3dc9b',
    '#cdc6db',
].map((c) => new T.Color(c));

  const HOLE_GLSL_DECL = `
    uniform vec3 uHole;       // screen x, y (device px), radius (device px)
    uniform float uHoleDepth; // view-space distance of the player
    varying vec3 vWorldPos;
    float bayer4(vec2 p) {
      vec2 q = mod(floor(p), 4.0);
      float i = q.x + q.y * 4.0;
      return fract(sin(i * 12.9898) * 43758.5453);
    }
  `;

  class World3D {
    static makeRenderer(canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(dpr);
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputColorSpace = T.SRGBColorSpace;
      return r;
    }

    constructor(renderer, data, graph) {
      this.data = data;
      this.graph = graph;
      this.painter = new PM.TilePainter(data, graph);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.renderer = renderer;
      this.lowQ = !renderer.shadowMap.enabled;

      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#cfe8f7');
      scene.fog = new T.Fog('#dcedf7', 1400, 3600);
      this.camera = new T.PerspectiveCamera(46, 1, 5, 5000);

      scene.add(new T.HemisphereLight('#ffffff', '#c7b9d6', 1.45));
      const sun = (this.sun = new T.DirectionalLight('#fff4e0', 1.5));
      sun.castShadow = !this.lowQ;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 2400;
      sun.shadow.bias = -0.0008;
      scene.add(sun, sun.target);

      this.uniforms = { uHole: { value: new T.Vector3(-9999, -9999, 0) }, uHoleDepth: { value: 0 }, uTime: { value: 0 } };
      this.buildGround();
      this.buildBuildingsSetup();
      this.markers = new Map();
      this.labels = [];
    }

    resize(w, h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.w = w; this.h = h;
    }

    // ---------------- ground ----------------
    buildGround() {
      const water = new T.Mesh(new T.PlaneGeometry(60000, 60000), new T.MeshLambertMaterial({ color: '#9fd3ea' }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = -0.6;
      water.receiveShadow = true;
      this.scene.add(water);
      // coarse base tiles (whole island) and fine tiles near the camera
      this.baseM = 2000; this.basePx = 512;
      this.fineM = 400; this.finePx = 704;
      this.base = new Map(); this.fine = new Map();
      this.groundMat = (tex) => new T.MeshLambertMaterial({ map: tex });
      const [x0, y0, x1, y1] = this.data.meta.bounds;
      this.islandBox = [x0 - 1500, y0 - 1500, x1 + 1500, y1 + 1500];
      this.baseQueue = [];
      for (let tx = Math.floor(this.islandBox[0] / this.baseM); tx <= Math.floor(this.islandBox[2] / this.baseM); tx++)
        for (let ty = Math.floor(this.islandBox[1] / this.baseM); ty <= Math.floor(this.islandBox[3] / this.baseM); ty++)
          this.baseQueue.push([tx, ty]);
      // big multi-borough maps: skip open-water tiles far from any street or ferry route
      const used = new Set();
      for (const e of this.graph.edges) for (const [x, y] of e.pts) {
        const tx = Math.floor(x / this.baseM), ty = Math.floor(y / this.baseM);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) used.add((tx + dx) + ',' + (ty + dy));
      }
      this.baseQueue = this.baseQueue.filter(([tx, ty]) => used.has(tx + ',' + ty));
    }

    tileMesh(tx, ty, M, px, y, detail) {
      const cv = this.painter.paint(tx * M, ty * M, M, px, detail);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      tex.generateMipmaps = true;
      const m = new T.Mesh(new T.PlaneGeometry(M, M), this.groundMat(tex));
      m.rotation.x = -Math.PI / 2;
      m.position.set(tx * M + M / 2, y, ty * M + M / 2);
      m.receiveShadow = true;
      if (y > 0) { m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; }
      this.scene.add(m);
      return m;
    }

    // keep: other focus points whose nearby tiles must stay loaded (split-screen)
    updateGround(fx, fz, budget = 2, keep = null) {
      // coarse tiles, nearest first
      if (this.baseQueue.length) {
        this.baseQueue.sort((a, b) => Math.hypot((b[0] + 0.5) * this.baseM - fx, (b[1] + 0.5) * this.baseM - fz) - Math.hypot((a[0] + 0.5) * this.baseM - fx, (a[1] + 0.5) * this.baseM - fz));
        const [tx, ty] = this.baseQueue.pop();
        this.base.set(tx + ',' + ty, this.tileMesh(tx, ty, this.baseM, this.basePx, 0, false));
      }
      const M = this.fineM, R = 1300;
      const want = new Set();
      const cands = [];
      for (let tx = Math.floor((fx - R) / M); tx <= Math.floor((fx + R) / M); tx++)
        for (let ty = Math.floor((fz - R) / M); ty <= Math.floor((fz + R) / M); ty++) {
          const d = Math.hypot((tx + 0.5) * M - fx, (ty + 0.5) * M - fz);
          if (d > R) continue;
          const k = tx + ',' + ty;
          want.add(k);
          if (!this.fine.has(k)) cands.push([d, tx, ty, k]);
        }
      cands.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(budget, cands.length); i++) {
        const [, tx, ty, k] = cands[i];
        this.fine.set(k, this.tileMesh(tx, ty, M, this.finePx, 0.15, true));
      }
      for (const [k, m] of this.fine) {
        if (!want.has(k)) {
          const [tx, ty] = k.split(',').map(Number);
          const far = (px, pz) => Math.hypot((tx + 0.5) * M - px, (ty + 0.5) * M - pz) > R + 600;
          if (far(fx, fz) && (!keep || keep.every(([px, pz]) => far(px, pz)))) {
            this.scene.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose();
            this.fine.delete(k);
          }
        }
      }
    }

    // ---------------- buildings ----------------
    buildBuildingsSetup() {
      const D = this.data;
      this.chunkM = 500;
      this.chunks = new Map();
      D.buildings.forEach((p, i) => {
        let cx = 0, cy = 0; const n = p.length / 2;
        for (let j = 0; j < p.length; j += 2) { cx += p[j]; cy += p[j + 1]; }
        const k = Math.floor(cx / n / this.chunkM) + ',' + Math.floor(cy / n / this.chunkM);
        if (!this.chunks.has(k)) this.chunks.set(k, { ids: [], mesh: null });
        this.chunks.get(k).ids.push(i);
      });
      this.buildingMat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: PM.toonRamp() });
      this.patchHole(this.buildingMat, true);
      this.pendingChunks = [...this.chunks.keys()];
      this.builtCount = 0;
    }

    patchHole(mat, windows) {
      const U = this.uniforms;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uHole = U.uHole;
        sh.uniforms.uHoleDepth = U.uHoleDepth;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + HOLE_GLSL_DECL)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            {
              float dd = length(gl_FragCoord.xy - uHole.xy);
              if (dd < uHole.z && -vViewPosition.z < uHoleDepth - 4.0) {
                float t = smoothstep(uHole.z, uHole.z * 0.55, dd);
                if (bayer4(gl_FragCoord.xy) < t * 0.92) discard;
              }
            }`)
          .replace('#include <color_fragment>', windows ? `#include <color_fragment>
            {
              vec3 nW = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
              if (abs(nW.y) < 0.5 && vWorldPos.y > 3.0) {
                float fl = fract(vWorldPos.y / 3.6);
                float col = fract((vWorldPos.x + vWorldPos.z) / 3.2);
                float win = step(0.3, fl) * step(fl, 0.78) * step(0.22, col) * step(col, 0.78);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.88, 0.98), win * 0.5);
              } else if (nW.y > 0.5) {
                diffuseColor.rgb *= 1.08;
              }
            }` : '#include <color_fragment>');
      };
    }

    buildChunk(k) {
      const ch = this.chunks.get(k);
      if (!ch || ch.mesh) return;
      const D = this.data;
      let nv = 0, ni = 0;
      const polys = ch.ids.map((i) => {
        const p = D.buildings[i];
        const n = p.length / 2;
        const pts = [];
        for (let j = 0; j < n; j++) pts.push(new T.Vector2(p[2 * j], p[2 * j + 1]));
        let area = 0;
        for (let j = 0; j < n; j++) { const a = pts[j], b = pts[(j + 1) % n]; area += a.x * b.y - b.x * a.y; }
        if (area < 0) pts.reverse();
        let tris = [];
        try { tris = T.ShapeUtils.triangulateShape(pts, []); } catch (e) { tris = []; }
        nv += n * 4 + n; ni += n * 6 + tris.length * 3;
        return { pts, tris, h: D.bh[i], c: D.bc[i], wc: D.wc ? D.wc[i] : null, rc: D.rc ? D.rc[i] : null, id: i };
      });
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Uint8Array(nv * 3);
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v = 0, q = 0;
      const tmp = new T.Color();
      const put = (x, y, z, nx, ny, nz, c, shade) => {
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
        tmp.copy(c).multiplyScalar(shade);
        col[v * 3] = Math.min(255, tmp.r * 255); col[v * 3 + 1] = Math.min(255, tmp.g * 255); col[v * 3 + 2] = Math.min(255, tmp.b * 255);
        return v++;
      };
      for (const b of polys) {
        // real colors (tools/color_buildings.py) when present, pastel palette otherwise
        const c = b.wc != null ? new T.Color(b.wc) : PALETTE[b.c] || PALETTE[0];
        const cr = b.rc != null ? new T.Color(b.rc) : c;
        const n = b.pts.length, h = b.h;
        for (let j = 0; j < n; j++) {
          const a = b.pts[j], bb = b.pts[(j + 1) % n];
          const dx = bb.x - a.x, dz = bb.y - a.y, L = Math.hypot(dx, dz) || 1;
          // outward normal for a CCW ring in (x, z)
          const nx = dz / L, nz = -dx / L;
          const a0 = put(a.x, 0, a.y, nx, 0, nz, c, 0.72);
          const b0 = put(bb.x, 0, bb.y, nx, 0, nz, c, 0.72);
          const a1 = put(a.x, h, a.y, nx, 0, nz, c, 1.0);
          const b1 = put(bb.x, h, bb.y, nx, 0, nz, c, 1.0);
          idx[q++] = a0; idx[q++] = b1; idx[q++] = b0;
          idx[q++] = a0; idx[q++] = a1; idx[q++] = b1;
        }
        const base = v;
        for (let j = 0; j < n; j++) put(b.pts[j].x, h, b.pts[j].y, 0, 1, 0, cr, 1.06);
        for (const [i0, i1, i2] of b.tris) {
          const p0 = b.pts[i0], p1 = b.pts[i1], p2 = b.pts[i2];
          const cy = (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y);
          if (cy >= 0) { idx[q++] = base + i0; idx[q++] = base + i1; idx[q++] = base + i2; }
          else { idx[q++] = base + i0; idx[q++] = base + i2; idx[q++] = base + i1; }
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos.subarray(0, v * 3), 3));
      g.setAttribute('normal', new T.BufferAttribute(nor.subarray(0, v * 3), 3));
      g.setAttribute('color', new T.BufferAttribute(col.subarray(0, v * 3), 3, true));
      g.setIndex(new T.BufferAttribute(idx.subarray(0, q), 1));
      g.computeBoundingSphere();
      const m = new T.Mesh(g, this.buildingMat);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      ch.mesh = m;
      this.builtCount++;
    }

    updateBuildings(fx, fz, budgetMs = 6) {
      if (!this.pendingChunks.length) return;
      const t0 = performance.now();
      const C = this.chunkM;
      this.pendingChunks.sort((a, b) => {
        const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
        return Math.hypot((bx + 0.5) * C - fx, (by + 0.5) * C - fz) - Math.hypot((ax + 0.5) * C - fx, (ay + 0.5) * C - fz);
      });
      while (this.pendingChunks.length && performance.now() - t0 < budgetMs) this.buildChunk(this.pendingChunks.pop());
    }

    dispose() {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      });
      this.scene.clear();
    }

    lowerQuality() {
      if (this.lowQ) return;
      this.lowQ = true;
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      const size = this.renderer.getSize(new T.Vector2());
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size.x, size.y, false);
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }

    pendingNear(fx, fz, R) {
      const C = this.chunkM;
      let n = 0;
      for (const k of this.pendingChunks) {
        const [x, y] = k.split(',').map(Number);
        if (Math.hypot((x + 0.5) * C - fx, (y + 0.5) * C - fz) < R) n++;
      }
      return n;
    }

    get buildProgress() { return this.builtCount / this.chunks.size; }

    // footprint polygon of the building containing (x, y), or nearest within maxD
    buildingAt(x, y, maxD = 45) {
      const D = this.data;
      const k = Math.floor(x / this.chunkM), l = Math.floor(y / this.chunkM);
      let best = -1, bd = maxD;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const ch = this.chunks.get((k + i) + ',' + (l + j));
        if (!ch) continue;
        for (const id of ch.ids) {
          const p = D.buildings[id];
          if (pointInFlat(x, y, p)) return id;
          const d = distToFlat(x, y, p);
          if (d < bd) { bd = d; best = id; }
        }
      }
      return best;
    }

    // ---------------- target highlight ----------------
    setTarget(t) {
      if (this.targetGroup) { this.scene.remove(this.targetGroup); this.targetGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const grp = (this.targetGroup = new T.Group());
      const gold = new T.MeshLambertMaterial({ color: '#ffb300', emissive: '#ff8a00', emissiveIntensity: 0.55 });
      this.targetMat = gold;
      let footprint = null, h = 20;
      const bid = t.cat === 'P' ? -1 : this.buildingAt(t.x, t.y, 45);
      if (bid >= 0) { footprint = this.data.buildings[bid]; h = this.data.bh[bid] + 1.5; }
      else {
        const gi = this.greenAt(t.x, t.y);
        if (gi >= 0) { footprint = this.data.green[gi]; h = 1.2; }
      }
      if (footprint) {
        const pts = [];
        for (let j = 0; j < footprint.length; j += 2) pts.push(new T.Vector2(footprint[j], -footprint[j + 1]));
        const shape = new T.Shape(pts);
        const geo = new T.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); // extrude along +y, shape y -> -z (we negated y above)
        const mat = h < 3 ? new T.MeshLambertMaterial({ color: '#ffb300', emissive: '#ff8a00', emissiveIntensity: 0.5, transparent: true, opacity: 0.55 }) : gold;
        const m = new T.Mesh(geo, mat);
        m.scale.set(1.01, 1, 1.01);
        const cx = t.x, cz = t.y;
        m.position.set(-cx * 0.01, 0, -cz * 0.01); // compensate scale about origin
        grp.add(m);
        this.targetMat = mat;
      }
      // beacon ring + light beam
      const ring = new T.Mesh(new T.RingGeometry(34, 44, 48), new T.MeshBasicMaterial({ color: '#ffb300', transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(t.sx, 0.6, t.sy);
      grp.add(ring);
      const beam = new T.Mesh(new T.CylinderGeometry(9, 16, 900, 20, 1, true), new T.MeshBasicMaterial({ color: '#ffd24d', transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
      beam.position.set(t.sx, 450, t.sy);
      grp.add(beam);
      this.targetRing = ring; this.targetBeam = beam;
      this.scene.add(grp);
    }

    greenAt(x, y) {
      const ids = this.painter.query(this.painter.gGrid, x - 1, y - 1, x + 1, y + 1);
      let best = -1, ba = Infinity;
      for (const i of ids) {
        const p = this.data.green[i];
        if (pointInFlat(x, y, p)) { const a = flatArea(p); if (a < ba) { ba = a; best = i; } }
      }
      return best;
    }

    // ---------------- landmark markers ----------------
    addLandmarks(list) {
      const shape = new T.Shape();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 7 : 16;
        const x = Math.cos(a) * r, y = -Math.sin(a) * r;
        i ? shape.lineTo(x, y) : shape.moveTo(x, y);
      }
      const geo = new T.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 1 });
      geo.center();
      this.starOn = new T.MeshToonMaterial({ color: '#ff6b4a', emissive: '#c7361c', emissiveIntensity: 0.35, gradientMap: PM.toonRamp() });
      this.starOff = new T.MeshLambertMaterial({ color: '#9aa0a6' });
      const poleGeo = new T.CylinderGeometry(0.8, 0.8, 40, 6);
      const poleMat = new T.MeshLambertMaterial({ color: '#ffffff' });
      for (const l of list) {
        const g = new T.Group();
        const star = new T.Mesh(geo, this.starOn);
        star.position.y = 48; star.castShadow = true;
        const pole = new T.Mesh(poleGeo, poleMat); pole.position.y = 20;
        const sprite = this.label(l.name);
        sprite.position.y = 70;
        g.add(star, pole, sprite);
        g.position.set(l.sx, 0, l.sy);
        this.scene.add(g);
        this.markers.set(l.name, { g, star, sprite });
      }
    }

    label(text) {
      const cv = document.createElement('canvas');
      const g = cv.getContext('2d');
      const fs = 34;
      g.font = `700 ${fs}px "DM Sans", system-ui, sans-serif`;
      const w = Math.ceil(g.measureText(text).width) + 28;
      cv.width = w; cv.height = fs + 20;
      g.font = `700 ${fs}px "DM Sans", system-ui, sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      roundRect(g, 0, 0, w, cv.height, 12); g.fill();
      g.fillStyle = '#b3261e'; g.textBaseline = 'middle';
      g.fillText(text, 14, cv.height / 2 + 1);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const k = 0.2;
      s.scale.set(w * k, cv.height * k, 1);
      s.renderOrder = 10;
      return s;
    }

    setVisited(name) {
      const m = this.markers.get(name);
      if (m) { m.star.material = this.starOff; m.visited = true; m.g.visible = false; }
    }
    resetMarkers() {
      for (const m of this.markers.values()) { m.star.material = this.starOn; m.visited = false; m.g.visible = true; }
    }

    // ---------------- frame ----------------
    // view (optional, split-screen): { camera, x, y, w, h } with the rectangle in CSS px
    render(focus, t, player, view) {
      const cam = view ? view.camera : this.camera;
      const [fx, fz] = focus;
      // look slightly ahead (uptown) of the player; camera sits south and above
      cam.position.set(fx, 430, fz + 330);
      cam.lookAt(fx, 0, fz - 40);
      this.sun.position.set(fx - 500, 900, fz + 250);
      this.sun.target.position.set(fx, 0, fz);
      this.uniforms.uTime.value = t;
      // x-ray hole around the player
      if (player) {
        const v = new T.Vector3(player[0], 10, player[1]).project(cam);
        let px, py, hr;
        if (view) {
          const pr = this.renderer.getPixelRatio();
          px = (view.x + (v.x * 0.5 + 0.5) * view.w) * pr; py = (view.y + (v.y * 0.5 + 0.5) * view.h) * pr;
          hr = Math.min(view.w, view.h) * pr * 0.2;
        } else { px = (v.x * 0.5 + 0.5) * this.w; py = (v.y * 0.5 + 0.5) * this.h; hr = Math.min(this.w, this.h) * 0.2; }
        const depth = cam.position.distanceTo(new T.Vector3(player[0], 10, player[1]));
        this.uniforms.uHole.value.set(px, py, hr);
        this.uniforms.uHoleDepth.value = depth;
      } else this.uniforms.uHole.value.set(-9999, -9999, 0);
      if (this.targetRing) {
        const p = 0.5 + 0.5 * Math.sin(t * 4);
        this.targetRing.scale.setScalar(1 + p * 0.25);
        this.targetRing.material.opacity = 0.9 - p * 0.5;
        if (this.targetMat.emissiveIntensity !== undefined) this.targetMat.emissiveIntensity = 0.35 + p * 0.5;
      }
      for (const m of this.markers.values()) m.star.rotation.y = t * 1.6;
      if (view) {
        this.renderer.setViewport(view.x, view.y, view.w, view.h);
        this.renderer.setScissor(view.x, view.y, view.w, view.h);
        this.renderer.setScissorTest(true);
      }
      this.renderer.render(this.scene, cam);
      if (view) this.renderer.setScissorTest(false);
    }

    // screen position (CSS px) of a ground point
    toScreen(x, y, h = 0) {
      const v = new T.Vector3(x, h, y).project(this.camera);
      return [(v.x * 0.5 + 0.5) * this.w / this.dpr, (-v.y * 0.5 + 0.5) * this.h / this.dpr, v.z];
    }

    // ground point under a screen position (CSS px)
    groundAt(sx, sy) {
      const ndc = new T.Vector2((sx / (this.w / this.dpr)) * 2 - 1, -(sy / (this.h / this.dpr)) * 2 + 1);
      const ray = new T.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (Math.abs(d.y) < 1e-6) return null;
      const k = -o.y / d.y;
      if (k < 0) return null;
      return [o.x + d.x * k, o.z + d.z * k];
    }
  }

  function pointInFlat(x, y, p) {
    let inside = false;
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
    }
    return inside;
  }
  function distToFlat(x, y, p) {
    let bd = Infinity; const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = p[2 * i], ay = p[2 * i + 1], bx = p[(2 * i + 2) % p.length], by = p[(2 * i + 3) % p.length];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      bd = Math.min(bd, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return bd;
  }
  function flatArea(p) {
    let a = 0; const n = p.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
    return Math.abs(a) / 2;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  PM.World3D = World3D;
})();
