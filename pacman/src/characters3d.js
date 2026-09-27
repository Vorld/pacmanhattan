// 3D characters: the player's ghost and the yellow chomper (an original design).
(function () {
  const PM = (window.PM = window.PM || {});
  const T = window.THREE;

  class Ghost3D {
    constructor(scene, color = '#7b5cff') {
      const g = (this.group = new T.Group());
      const R = 11, H = 12;
      this.color = new T.Color(color);
      const body = (this.bodyMat = new T.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, emissive: color, emissiveIntensity: 0.18 }));
      const head = new T.Mesh(new T.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), body);
      head.position.y = H;
      const trunk = new T.Mesh(new T.CylinderGeometry(R, R, H, 32, 1, true), body);
      trunk.position.y = H / 2;
      g.add(head, trunk);
      // skirt: ring of cones pointing down
      this.skirt = [];
      const coneGeo = new T.ConeGeometry(R * Math.sin(Math.PI / 8) * 1.05, 5, 12);
      coneGeo.rotateX(Math.PI);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = new T.Mesh(coneGeo, body);
        c.position.set(Math.cos(a) * R * 0.92, -2.4, Math.sin(a) * R * 0.92);
        g.add(c); this.skirt.push(c);
      }
      // eyes
      const white = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
      this.pupilMat = new T.MeshStandardMaterial({ color: '#1b2a8a', roughness: 0.2 });
      this.eyes = [];
      for (const s of [-1, 1]) {
        const eye = new T.Group();
        const w = new T.Mesh(new T.SphereGeometry(3.4, 20, 12), white);
        w.scale.set(1, 1.25, 0.8);
        const p = new T.Mesh(new T.SphereGeometry(1.7, 16, 10), this.pupilMat);
        p.position.z = 2.2;
        eye.add(w, p);
        eye.position.set(s * 4.3, H + 3, R * 0.72);
        eye.userData.pupil = p;
        g.add(eye); this.eyes.push(eye);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      this.float = 5;
      scene.add(g);
      this.yaw = 0;
    }
    update(x, z, heading, t, scared) {
      const g = this.group;
      g.position.set(x, this.float + Math.sin(t * 6) * 1.5, z);
      if (heading && (heading[0] || heading[1])) {
        const target = Math.atan2(heading[0], heading[1]);
        let d = target - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * 0.25;
      }
      g.rotation.y = this.yaw;
      this.skirt.forEach((c, i) => { c.scale.y = 1 + 0.35 * Math.sin(t * 14 + i * 1.3); });
      const flash = scared && Math.floor(t * 8) % 2;
      this.bodyMat.color.set(scared ? (flash ? '#ffffff' : '#2f5bff') : this.color);
      this.bodyMat.emissive.set(scared ? '#2f5bff' : this.color);
      this.pupilMat.color.set(scared ? '#ff3b3b' : '#1b2a8a');
    }
  }

  class Chomper3D {
    constructor(scene) {
      const g = (this.group = new T.Group());
      const R = 14;
      this.R = R;
      const yellow = new T.MeshStandardMaterial({ color: '#ffd21f', roughness: 0.4, metalness: 0.05, emissive: '#ffb300', emissiveIntensity: 0.22 });
      const mouth = new T.MeshStandardMaterial({ color: '#5a0f14', roughness: 0.8, side: T.BackSide });
      const jaw = (up) => {
        const j = new T.Group();
        const shell = new T.Mesh(new T.SphereGeometry(R, 36, 18, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2), yellow);
        const inner = new T.Mesh(new T.CircleGeometry(R * 0.98, 36), mouth);
        inner.rotation.x = up ? Math.PI / 2 : -Math.PI / 2;
        const innerFront = new T.Mesh(new T.CircleGeometry(R * 0.98, 36), new T.MeshStandardMaterial({ color: '#7a1a20', roughness: 0.8 }));
        innerFront.rotation.x = up ? Math.PI / 2 : -Math.PI / 2;
        j.add(shell, inner, innerFront);
        // teeth along the front rim
        const toothGeo = new T.ConeGeometry(1.5, 3.4, 6);
        if (up) toothGeo.rotateX(Math.PI);
        for (let i = -2; i <= 2; i++) {
          const a = i * 0.28;
          const tth = new T.Mesh(toothGeo, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
          tth.position.set(Math.sin(a) * R * 0.86, up ? -1.4 : 1.4, Math.cos(a) * R * 0.86);
          j.add(tth);
        }
        return j;
      };
      this.upper = jaw(true);
      this.lower = jaw(false);
      const hinge = (this.hinge = new T.Group());
      hinge.add(this.upper, this.lower);
      // pivot jaws around the back of the head
      this.upper.position.z = 0; this.lower.position.z = 0;
      g.add(hinge);
      // angry eye + brow on the upper jaw
      const eyeMat = new T.MeshStandardMaterial({ color: '#141414', roughness: 0.3 });
      for (const s of [-1, 1]) {
        const e = new T.Mesh(new T.SphereGeometry(1.9, 14, 10), eyeMat);
        e.position.set(s * 5.5, R * 0.62, R * 0.62);
        this.upper.add(e);
        const brow = new T.Mesh(new T.BoxGeometry(6.5, 1.6, 1.6), eyeMat);
        brow.position.set(s * 5.2, R * 0.82, R * 0.46);
        brow.rotation.z = s * 0.45;
        brow.rotation.x = -0.6;
        this.upper.add(brow);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      // spawn ring
      this.ring = new T.Mesh(new T.RingGeometry(R * 1.2, R * 1.6, 40), new T.MeshBasicMaterial({ color: '#ffd21f', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      scene.add(this.ring);
      scene.add(g);
      this.yaw = 0;
    }
    update(x, z, heading, open, t, spawnFx) {
      const g = this.group;
      g.position.set(x, this.R + 1, z);
      if (heading && (heading[0] || heading[1])) {
        const target = Math.atan2(heading[0], heading[1]);
        let d = target - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * 0.3;
      }
      g.rotation.y = this.yaw;
      const a = 0.08 + open * 0.55;
      this.upper.rotation.x = -a;
      this.lower.rotation.x = a;
      g.scale.setScalar(spawnFx > 0 ? 1 - spawnFx * 0.8 : 1);
      this.ring.position.set(x, 0.8, z);
      this.ring.material.opacity = spawnFx > 0 ? spawnFx : 0;
      this.ring.scale.setScalar(1 + spawnFx * 4);
    }
  }

  class HintArrow3D {
    constructor(scene) {
      const s = new T.Shape();
      s.moveTo(0, 18); s.lineTo(-11, 4); s.lineTo(-4.5, 4); s.lineTo(-4.5, -14); s.lineTo(4.5, -14); s.lineTo(4.5, 4); s.lineTo(11, 4); s.closePath();
      const geo = new T.ExtrudeGeometry(s, { depth: 2.5, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.mat = new T.MeshLambertMaterial({ color: '#12a150', emissive: '#0b7a3b', emissiveIntensity: 0.5, transparent: true, opacity: 1 });
      this.mesh = new T.Mesh(geo, this.mat);
      this.mesh.visible = false;
      scene.add(this.mesh);
    }
    update(x, z, ang, alpha, t) {
      if (alpha <= 0) { this.mesh.visible = false; return; }
      this.mesh.visible = true;
      const d = 34 + Math.sin(t * 6) * 4;
      // arrow shape points toward -z (shape +y) after rotation; rotate to world angle
      this.mesh.position.set(x + Math.cos(ang) * d, 2, z + Math.sin(ang) * d);
      this.mesh.rotation.y = -ang - Math.PI / 2;
      this.mat.opacity = alpha;
    }
  }

  PM.Ghost3D = Ghost3D;
  PM.Chomper3D = Chomper3D;
  PM.HintArrow3D = HintArrow3D;
})();
