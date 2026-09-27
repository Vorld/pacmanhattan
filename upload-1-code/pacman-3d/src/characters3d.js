// 3D characters in a soft toon style: the player's ghost, the chompers (original designs), and helpers.
(function () {
  const PM = (window.PM = window.PM || {});
  const T = window.THREE;

  // 3-step toon ramp shared by every toon material
  let RAMP = null;
  function ramp() {
    if (RAMP) return RAMP;
    const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    RAMP = new T.DataTexture(d, 3, 1, T.RGBAFormat);
    RAMP.minFilter = RAMP.magFilter = T.NearestFilter;
    RAMP.needsUpdate = true;
    return RAMP;
  }
  PM.toonRamp = ramp;
  const toon = (color, extra = {}) => new T.MeshToonMaterial({ color, gradientMap: ramp(), ...extra });
  const OUTLINE = new T.MeshBasicMaterial({ color: '#2a2140', side: T.BackSide });

  // inverted-hull outline for a mesh
  function outline(mesh, k = 1.07) {
    const o = new T.Mesh(mesh.geometry, OUTLINE);
    o.scale.setScalar(k);
    mesh.add(o);
    return o;
  }

  function eye(r, pupilColor) {
    const g = new T.Group();
    const white = new T.Mesh(new T.SphereGeometry(r, 24, 16), toon('#ffffff'));
    white.scale.set(1, 1.18, 0.7);
    const pupil = new T.Mesh(new T.SphereGeometry(r * 0.58, 20, 12), toon(pupilColor));
    pupil.scale.set(1, 1.18, 0.6);
    pupil.position.z = r * 0.45;
    const shine = new T.Mesh(new T.SphereGeometry(r * 0.2, 10, 8), new T.MeshBasicMaterial({ color: '#ffffff' }));
    shine.position.set(r * 0.22, r * 0.3, r * 0.82);
    const shine2 = new T.Mesh(new T.SphereGeometry(r * 0.1, 8, 6), new T.MeshBasicMaterial({ color: '#ffffff' }));
    shine2.position.set(-r * 0.2, -r * 0.18, r * 0.84);
    g.add(white, pupil, shine, shine2);
    outline(white, 1.1);
    g.userData = { pupil, white };
    return g;
  }

  function blush(r) {
    const m = new T.Mesh(new T.CircleGeometry(r, 20), new T.MeshBasicMaterial({ color: '#ff8fae', transparent: true, opacity: 0.75, depthWrite: false }));
    return m;
  }

  class Ghost3D {
    constructor(scene, color = '#8f74ff') {
      const root = (this.group = new T.Group());
      const body = (this.body = new T.Group());
      root.add(body);
      const R = 12;
      this.baseColor = new T.Color(color);
      this.mat = toon(color);
      const head = new T.Mesh(new T.SphereGeometry(R, 32, 20), this.mat);
      head.position.y = 14; head.scale.set(1, 0.95, 1);
      const trunk = new T.Mesh(new T.CylinderGeometry(R, R * 1.05, 12, 32, 1, true), this.mat);
      trunk.position.y = 8;
      outline(head); outline(trunk, 1.06);
      body.add(head, trunk);
      // scalloped hem: a ring of soft bumps
      this.bumps = [];
      const bumpGeo = new T.SphereGeometry(R * 0.36, 16, 10);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = new T.Mesh(bumpGeo, this.mat);
        b.position.set(Math.cos(a) * R * 0.8, 2.2, Math.sin(a) * R * 0.8);
        outline(b, 1.12);
        body.add(b); this.bumps.push(b);
      }
      // face
      const face = (this.face = new T.Group());
      face.position.set(0, 14, R * 0.8);
      this.eyes = [eye(3.6, '#2b2a6e'), eye(3.6, '#2b2a6e')];
      this.eyes[0].position.set(-4.4, 1.5, 0); this.eyes[1].position.set(4.4, 1.5, 0);
      const bl = blush(2.1), br = blush(2.1);
      bl.position.set(-7.6, -2.6, 1.4); br.position.set(7.6, -2.6, 1.4);
      bl.rotation.y = -0.45; br.rotation.y = 0.45;
      // smile (half torus) and scared "o" mouth
      this.smile = new T.Mesh(new T.TorusGeometry(1.8, 0.5, 8, 16, Math.PI), toon('#2a2140'));
      this.smile.rotation.z = Math.PI; this.smile.position.set(0, -3.2, 1.6);
      this.oMouth = new T.Mesh(new T.SphereGeometry(1.6, 12, 10), toon('#5a1030'));
      this.oMouth.scale.set(1, 1.3, 0.5); this.oMouth.position.set(0, -3.8, 1.2); this.oMouth.visible = false;
      face.add(...this.eyes, bl, br, this.smile, this.oMouth);
      body.add(face);
      root.traverse((o) => { if (o.isMesh && o.material !== OUTLINE) o.castShadow = true; });
      scene.add(root);
      this.yaw = 0; this.lean = 0;
    }
    setColor(c) { this.baseColor.set(c); }
    update(x, z, heading, t, scared, moving) {
      const g = this.group;
      g.position.set(x, 5 + Math.sin(t * 5) * 1.6, z);
      // face the camera like a classic ghost; turn a little toward sideways moves; eyes look where we go
      const hx = heading ? heading[0] : 0, hz = heading ? heading[1] : 0;
      const targetYaw = Math.max(-0.7, Math.min(0.7, hx * 0.7));
      this.yaw += (targetYaw - this.yaw) * 0.15;
      this.lean += ((moving ? -hx * 0.18 : 0) - this.lean) * 0.15;
      this.look = this.look || [0, 0];
      this.look[0] += (hx * 1.3 - this.look[0]) * 0.25;
      this.look[1] += (-hz * 1.2 - this.look[1]) * 0.25;
      g.rotation.y = this.yaw;
      this.body.rotation.z = this.lean;
      this.body.rotation.x = moving ? hz * 0.12 : 0;
      // squash & stretch
      const s = Math.sin(t * 10) * (moving ? 0.06 : 0.03);
      this.body.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.6);
      this.bumps.forEach((b, i) => { b.position.y = 2.2 + Math.sin(t * 12 + i * 0.9) * 1.1; });
      const flash = scared && Math.floor(t * 7) % 2;
      this.mat.color.copy(scared ? new T.Color(flash ? '#ffffff' : '#6f8cff') : this.baseColor);
      this.smile.visible = !scared; this.oMouth.visible = scared;
      const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
      this.eyes.forEach((e) => { e.scale.y = blink; e.userData.pupil.position.x = this.look[0]; e.userData.pupil.position.y = this.look[1]; });
    }
  }

  class Chomper3D {
    constructor(scene, color = '#ffd21f', label = '') {
      const g = (this.group = new T.Group());
      const R = 13;
      this.R = R;
      this.mat = toon(color);
      const mouthMat = toon('#7a1f35', { side: T.DoubleSide });
      const jaw = (up) => {
        const j = new T.Group();
        const shell = new T.Mesh(new T.SphereGeometry(R, 36, 18, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2), this.mat);
        const ol = new T.Mesh(shell.geometry, new T.MeshBasicMaterial({ color: '#2a2140', side: T.BackSide }));
        ol.scale.setScalar(1.07); shell.add(ol);
        const inner = new T.Mesh(new T.CircleGeometry(R * 0.99, 36), mouthMat);
        inner.rotation.x = up ? Math.PI / 2 : -Math.PI / 2;
        j.add(shell, inner);
        const toothGeo = new T.ConeGeometry(1.6, 3, 6);
        if (up) toothGeo.rotateX(Math.PI);
        for (const a of [-0.35, 0.35]) {
          const tt = new T.Mesh(toothGeo, toon('#ffffff'));
          tt.position.set(Math.sin(a) * R * 0.82, up ? -1.3 : 1.3, Math.cos(a) * R * 0.82);
          j.add(tt);
        }
        if (!up) {
          const tongue = new T.Mesh(new T.SphereGeometry(R * 0.45, 16, 10), toon('#ff7a9a'));
          tongue.scale.set(1, 0.25, 1.1); tongue.position.set(0, 0.6, R * 0.25);
          j.add(tongue);
        }
        return j;
      };
      this.upper = jaw(true); this.lower = jaw(false);
      const bodyG = (this.bodyG = new T.Group());
      bodyG.add(this.upper, this.lower);
      g.add(bodyG);
      // big cute eyes with a cross little brow
      this.eyes = [];
      for (const s of [-1, 1]) {
        const e = eye(3.4, '#1a1a2e');
        e.position.set(s * 5.2, R * 0.55, R * 0.74);
        e.rotation.y = s * 0.3;
        this.upper.add(e); this.eyes.push(e);
        const brow = new T.Mesh(new T.CapsuleGeometry(0.8, 4.2, 4, 8), toon('#2a2140'));
        brow.position.set(s * 5, R * 0.86, R * 0.52);
        brow.rotation.z = Math.PI / 2 + s * 0.4;
        brow.rotation.x = -0.5;
        this.upper.add(brow);
        const b = blush(2.2);
        b.position.set(s * 9, R * 0.28, R * 0.8);
        b.rotation.y = s * 0.7;
        this.upper.add(b);
      }
      g.traverse((o) => { if (o.isMesh && o.material.side !== T.BackSide) o.castShadow = true; });
      this.ring = new T.Mesh(new T.RingGeometry(R * 1.2, R * 1.6, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      scene.add(this.ring);
      scene.add(g);
      this.yaw = 0;
    }
    setVisible(v) { this.group.visible = v; this.ring.visible = v; }
    update(x, z, heading, open, t, spawnFx, excited) {
      const g = this.group;
      const hop = Math.abs(Math.sin(t * 7)) * 3;
      g.position.set(x, this.R + 1 + hop, z);
      if (heading && (heading[0] || heading[1])) {
        const target = Math.atan2(heading[0], heading[1]);
        let d = target - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * 0.3;
      }
      g.rotation.y = this.yaw;
      const a = 0.06 + open * (excited ? 0.7 : 0.5);
      this.upper.rotation.x = -a; this.lower.rotation.x = a;
      const sq = 1 - hop * 0.012;
      this.bodyG.scale.set(1 / sq, sq, 1 / sq);
      g.scale.setScalar(spawnFx > 0 ? Math.max(0.05, 1 - spawnFx * 0.9) : 1);
      this.ring.position.set(x, 0.8, z);
      this.ring.material.opacity = spawnFx > 0 ? Math.min(1, spawnFx) : 0;
      this.ring.scale.setScalar(1 + spawnFx * 3);
      const blink = (t % 4.3) < 0.1 ? 0.15 : 1;
      this.eyes.forEach((e) => { e.scale.y = blink; });
    }
  }

  // Always-visible "you are here" bubble around the ghost
  class Bubble3D {
    constructor(scene) {
      const mk = (r0, r1, op) => new T.Mesh(new T.RingGeometry(r0, r1, 56), new T.MeshBasicMaterial({ color: '#8f74ff', transparent: true, opacity: op, depthTest: false, depthWrite: false, side: T.DoubleSide }));
      this.ring = mk(22, 27, 0.95);
      this.pulse = mk(27, 30, 0.6);
      this.disc = new T.Mesh(new T.CircleGeometry(22, 48), new T.MeshBasicMaterial({ color: '#8f74ff', transparent: true, opacity: 0.18, depthTest: false, depthWrite: false }));
      for (const m of [this.ring, this.pulse, this.disc]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 30; scene.add(m); }
      this.col = new T.Color();
    }
    update(x, z, t, danger) {
      const k = Math.max(0, Math.min(1, 1 - (danger - 120) / 380));
      this.col.set('#8f74ff').lerp(new T.Color('#ff4d6d'), k);
      for (const m of [this.ring, this.pulse, this.disc]) { m.position.set(x, 1.2, z); m.material.color.copy(this.col); }
      const p = (t * (1 + k * 1.5)) % 1;
      this.pulse.scale.setScalar(1 + p * 1.4);
      this.pulse.material.opacity = 0.7 * (1 - p);
    }
    setVisible(v) { this.ring.visible = this.pulse.visible = this.disc.visible = v; }
  }

  // Translucent fading ribbon behind the ghost
  class Trail3D {
    constructor(scene, color = '#8f74ff', life = 45) {
      this.max = 1400; this.life = life; this.pts = [];
      const g = (this.geo = new T.BufferGeometry());
      this.pos = new Float32Array(this.max * 2 * 3);
      this.col = new Float32Array(this.max * 2 * 4);
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new T.BufferAttribute(this.col, 4));
      const idx = new Uint16Array((this.max - 1) * 6);
      for (let i = 0; i < this.max - 1; i++) {
        const a = i * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
      }
      g.setIndex(new T.BufferAttribute(idx, 1));
      this.mat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: T.DoubleSide });
      this.mesh = new T.Mesh(g, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 6;
      this.c = new T.Color(color);
      scene.add(this.mesh);
    }
    reset() { this.pts = []; this.geo.setDrawRange(0, 0); }
    add(x, z, t) {
      const l = this.pts[this.pts.length - 1];
      if (l && Math.hypot(l.x - x, l.z - z) < 5) { l.t = t; return; }
      this.pts.push({ x, z, t });
      if (this.pts.length > this.max) this.pts.shift();
    }
    update(t, headX, headZ) {
      while (this.pts.length && t - this.pts[0].t > this.life) this.pts.shift();
      const P = this.pts.concat(headX !== undefined ? [{ x: headX, z: headZ, t }] : []);
      const n = P.length;
      if (n < 2) { this.geo.setDrawRange(0, 0); return; }
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const age = (t - P[i].t) / this.life;
        const w = 6.5 * (1 - age * 0.6);
        const nx = -dz * w, nz = dx * w;
        this.pos.set([P[i].x + nx, 0.9, P[i].z + nz, P[i].x - nx, 0.9, P[i].z - nz], i * 6);
        const al = Math.max(0, 0.42 * (1 - age)) * Math.min(1, i / 4);
        this.col.set([this.c.r, this.c.g, this.c.b, al, this.c.r, this.c.g, this.c.b, al], i * 8);
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.setDrawRange(0, (n - 1) * 6);
    }
  }

  class HintArrow3D {
    constructor(scene) {
      const s = new T.Shape();
      s.moveTo(0, 18); s.lineTo(-11, 4); s.lineTo(-4.5, 4); s.lineTo(-4.5, -14); s.lineTo(4.5, -14); s.lineTo(4.5, 4); s.lineTo(11, 4); s.closePath();
      const geo = new T.ExtrudeGeometry(s, { depth: 2.5, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.mat = new T.MeshBasicMaterial({ color: '#19b86a', transparent: true, opacity: 1, depthTest: false });
      this.mesh = new T.Mesh(geo, this.mat);
      this.mesh.renderOrder = 31;
      this.mesh.visible = false;
      scene.add(this.mesh);
    }
    update(x, z, ang, alpha, t) {
      if (alpha <= 0) { this.mesh.visible = false; return; }
      this.mesh.visible = true;
      const d = 44 + Math.sin(t * 6) * 4;
      this.mesh.position.set(x + Math.cos(ang) * d, 2, z + Math.sin(ang) * d);
      this.mesh.rotation.y = -ang - Math.PI / 2;
      this.mat.opacity = alpha;
    }
  }

  PM.Ghost3D = Ghost3D;
  PM.Chomper3D = Chomper3D;
  PM.Bubble3D = Bubble3D;
  PM.Trail3D = Trail3D;
  PM.HintArrow3D = HintArrow3D;
})();
