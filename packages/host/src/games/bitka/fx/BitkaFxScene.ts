import * as THREE from 'three';
import { FX_SHOT_SECONDS, type BitkaFxEvent, type BitkaPoint } from '@igra/shared';

/**
 * Providan three.js sloj iznad mape na TV-u.
 *
 * Pravila preuzeta od Penala: vanilla three (bez react-three-fiber), bez
 * ijednog asseta — sve je primitiv — i sve živi u lenjom chunk-u, pa glavni
 * bandl ne plaća ništa. Telefon ovo nikad ne učitava: controller paket nema
 * three ni u zavisnostima.
 *
 * Koordinatni sistem je isti onaj koji igra već koristi — normalizovano
 * [0,1] nad slikom mape. Ortografska kamera je široka tačno 1, a visoka
 * `visina/širina` kutije, pa su jedinice kvadratne: krug ostaje krug bez
 * obzira na odnos stranica mape.
 *
 * Efekti su kratki namerno: serverski sat ne čeka TV. Najduži (pad zamka) je
 * ~1,8 s, a najkraća podesiva pauza za ishod napada je 3 s.
 */

interface Effect {
  update(dt: number): boolean;
  dispose(): void;
}

const GOLD = '#F2CE74';
const easeOut = (u: number) => 1 - (1 - u) ** 3;

export class BitkaFxScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;

  private effects: Effect[] = [];
  private pending: { at: number; ev: BitkaFxEvent }[] = [];
  private clock = 0;
  private raf = 0;
  private lastTime = 0;
  private worldH = 2 / 3;
  /** Da se prazno platno ne prekrečuje 60 puta u sekundi bez potrebe. */
  private needsRender = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new THREE.OrthographicCamera(0, 1, this.worldH, 0, -10, 10);
    this.camera.position.z = 5;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.worldH = height / width;
    this.camera.top = this.worldH;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.needsRender = true;
  }

  /** @param delaySeconds odlaganje, da udar padne kad projektil stigne. */
  play(ev: BitkaFxEvent, delaySeconds = 0) {
    if (delaySeconds > 0) {
      this.pending.push({ at: this.clock + delaySeconds, ev });
      return;
    }
    const fx = this.build(ev);
    if (fx) {
      this.effects.push(fx);
      this.needsRender = true;
    }
  }

  /** Prekid — faza se završila, animacija nema pravo da je prežuvava. */
  clear() {
    for (const fx of this.effects) fx.dispose();
    this.effects = [];
    this.pending = [];
    this.needsRender = true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer.dispose();
  }

  // --- petlja ---------------------------------------------------------------

  private loop(time: number) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = time;
    this.clock += dt;

    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.clock);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.clock);
        for (const d of due) this.play(d.ev);
      }
    }

    if (this.effects.length) {
      this.effects = this.effects.filter((fx) => {
        const alive = fx.update(dt);
        if (!alive) fx.dispose();
        return alive;
      });
      this.needsRender = true;
    }

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      // Poslednji prazan kadar obriše ostatke, pa se staje do sledećeg efekta.
      this.needsRender = this.effects.length > 0;
    }
  }

  // --- efekti ---------------------------------------------------------------

  private toWorld(p: BitkaPoint): THREE.Vector3 {
    return new THREE.Vector3(p.x, (1 - p.y) * this.worldH, 0);
  }

  private build(ev: BitkaFxEvent): Effect | null {
    const at = this.toWorld(ev.at);
    switch (ev.kind) {
      case 'napad':
        return this.shot(ev);
      case 'osvojeno':
        // Sporije i krupnije nego ostali efekti — osvajanje je poenta poteza.
        return composite([
          this.ring(at, ev.color, { r0: 0.02, r1: 0.26, dur: 1.6, width: 0.3 }),
          this.ring(at, ev.color, { r0: 0.02, r1: 0.16, dur: 1.1, width: 0.5 }),
          this.ring(at, '#ffffff', { r0: 0.01, r1: 0.09, dur: 0.6, width: 1, opacity: 0.65 }),
          this.shards(at, ev.color, 20, { speed: 0.2, dur: 1.5, size: 0.016, gravity: 0.1 }),
        ]);
      case 'odbranjeno':
        return composite([
          this.shield(at, ev.from ?? null, ev.color),
          this.ring(at, '#ffffff', { r0: 0.05, r1: 0.09, dur: 0.35, width: 0.5, opacity: 0.7 }),
        ]);
      case 'zid':
        // Vatra i na ravnoj mapi — krhotine koje lete NAVIŠE i gase se, u tri
        // boje plamena. Nema dubine kao 3D verzija, ali čita se isto.
        return composite([
          this.ring(at, '#FF8A3D', { r0: 0.02, r1: 0.12, dur: 0.6, width: 0.4 }),
          this.shards(at, GOLD, 14, { speed: 0.22, dur: 1.0, size: 0.016, gravity: 0.45 }),
          this.shards(at, '#FFE08A', 10, { speed: 0.07, dur: 1.8, size: 0.02, gravity: -0.06 }),
          this.shards(at, '#FF9F3D', 10, { speed: 0.05, dur: 2.0, size: 0.026, gravity: -0.05 }),
          this.shards(at, '#E0362B', 8, { speed: 0.04, dur: 2.1, size: 0.03, gravity: -0.04 }),
        ]);
      case 'zamak-pao':
        return composite([
          this.ring(at, GOLD, { r0: 0.03, r1: 0.28, dur: 1.1, width: 0.22 }),
          this.ring(at, '#E06A5E', { r0: 0.02, r1: 0.18, dur: 0.8, width: 0.35 }),
          this.shards(at, GOLD, 22, { speed: 0.3, dur: 1.6, size: 0.018, gravity: 0.55 }),
          this.shards(at, ev.color, 10, { speed: 0.18, dur: 1.6, size: 0.02, gravity: 0.5 }),
        ]);
      case 'pobeda':
        return composite([
          this.ring(at, ev.color, { r0: 0.03, r1: 0.32, dur: 1.2, width: 0.25 }),
          this.shards(at, ev.color, 24, { speed: 0.34, dur: 2.0, size: 0.02, gravity: 0.3, up: 0.22 }),
          this.shards(at, GOLD, 24, { speed: 0.3, dur: 2.0, size: 0.018, gravity: 0.3, up: 0.26 }),
        ]);
      default:
        return null;
    }
  }

  /** Projektil sa repom — luk od napadačeve zemlje do mete. */
  private shot(ev: BitkaFxEvent): Effect {
    const to = this.toWorld(ev.at);
    // Bez poznatog polazišta udar pada odozgo, umesto da izleti niotkuda.
    const start = ev.from
      ? this.toWorld(ev.from)
      : to.clone().add(new THREE.Vector3(0, this.worldH * 0.45, 0));
    const path = to.clone().sub(start);
    const dist = path.length() || 0.001;
    const arc = new THREE.Vector3(-path.y, path.x, 0).normalize().multiplyScalar(dist * 0.22);

    const geo = new THREE.CircleGeometry(0.013, 20);
    const color = new THREE.Color(ev.color);
    const TRAIL = 6;
    const meshes: THREE.Mesh[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < TRAIL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1 - i / TRAIL,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(1 - i * 0.12);
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      meshes.push(mesh);
      mats.push(mat);
    }

    const pointAt = (u: number) =>
      start.clone().lerp(to, u).add(arc.clone().multiplyScalar(Math.sin(Math.PI * u)));

    let t = 0;
    return {
      update: (dt) => {
        t += dt / FX_SHOT_SECONDS;
        const u = Math.min(1, t);
        const fade = u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1;
        meshes.forEach((mesh, i) => {
          mesh.position.copy(pointAt(Math.max(0, u - i * 0.045)));
          mats[i].opacity = (1 - i / TRAIL) * fade;
        });
        return t < 1;
      },
      dispose: () => {
        for (const mesh of meshes) this.scene.remove(mesh);
        for (const mat of mats) mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Talas — prsten koji se širi i gasi. */
  private ring(
    center: THREE.Vector3,
    colorHex: string,
    opts: { r0: number; r1: number; dur: number; width?: number; opacity?: number }
  ): Effect {
    const width = opts.width ?? 0.2;
    const opacity = opts.opacity ?? 0.9;
    const geo = new THREE.RingGeometry(1 - width, 1, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 9;
    this.scene.add(mesh);

    let t = 0;
    return {
      update: (dt) => {
        t += dt / opts.dur;
        const u = Math.min(1, t);
        mesh.scale.setScalar(opts.r0 + (opts.r1 - opts.r0) * easeOut(u));
        mat.opacity = opacity * (1 - u);
        return t < 1;
      },
      dispose: () => {
        this.scene.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Krhotine — pločice koje odlete i padnu. */
  private shards(
    center: THREE.Vector3,
    colorHex: string,
    count: number,
    opts: { speed: number; dur: number; size: number; gravity: number; up?: number }
  ): Effect {
    const geo = new THREE.PlaneGeometry(opts.size, opts.size);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 1,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const meshes: THREE.Mesh[] = [];
    const vel: THREE.Vector3[] = [];
    const spin: number[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = opts.speed * (0.55 + Math.random() * 0.6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.renderOrder = 11;
      this.scene.add(mesh);
      meshes.push(mesh);
      vel.push(
        new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed + (opts.up ?? 0), 0)
      );
      spin.push((Math.random() - 0.5) * 9);
    }

    let t = 0;
    return {
      update: (dt) => {
        t += dt / opts.dur;
        meshes.forEach((mesh, i) => {
          vel[i].y -= opts.gravity * dt;
          mesh.position.addScaledVector(vel[i], dt);
          mesh.rotation.z += spin[i] * dt;
        });
        mat.opacity = Math.max(0, 1 - t ** 2);
        return t < 1;
      },
      dispose: () => {
        for (const mesh of meshes) this.scene.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Štit — luk okrenut ka napadaču, blesne i odbije udar. */
  private shield(center: THREE.Vector3, from: BitkaPoint | null, colorHex: string): Effect {
    const facing = from
      ? Math.atan2(this.toWorld(from).y - center.y, this.toWorld(from).x - center.x)
      : Math.PI / 2;
    const geo = new THREE.RingGeometry(0.055, 0.075, 40, 1, facing - Math.PI / 2, Math.PI);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 9;
    this.scene.add(mesh);

    const DUR = 0.8;
    let t = 0;
    return {
      update: (dt) => {
        t += dt / DUR;
        const u = Math.min(1, t);
        // Kratko se stegne pa odskoči — udarac koji je zadržan.
        mesh.scale.setScalar(1 + 0.35 * Math.sin(Math.PI * u) - 0.12 * Math.sin(Math.PI * 2 * u));
        mat.opacity = 1 - easeOut(u);
        return t < 1;
      },
      dispose: () => {
        this.scene.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }
}

function composite(parts: Effect[]): Effect {
  let alive = parts.slice();
  return {
    update: (dt) => {
      alive = alive.filter((fx) => {
        const on = fx.update(dt);
        if (!on) fx.dispose();
        return on;
      });
      return alive.length > 0;
    },
    dispose: () => {
      for (const fx of alive) fx.dispose();
      alive = [];
    },
  };
}
