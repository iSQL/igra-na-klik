// Penali — the 3D pitch on the TV.
//
// Deliberately vanilla three.js (no react-three-fiber): the scene is a single
// self-contained object the React component drives with three calls — reset(),
// playShot() and dispose(). Everything is built from primitives, so there are
// no textures, no loaders and no assets to ship.
//
// World units are metres and match the real thing: a 7.32 × 2.44 m goal with
// the spot 11 m out. Goal-plane coordinates from @igra/shared map in as
//   world.x = aim.x * GOAL_HALF_WIDTH
//   world.y = aim.y * GOAL_HEIGHT
// with the goal line at z = 0 and the shooter at positive z.

import * as THREE from 'three';
import type { PenaliShotResult } from '@igra/shared';
import { ZONE_CENTERS } from '@igra/shared';

const GOAL_HALF_WIDTH = 3.66;
const GOAL_HEIGHT = 2.44;
const POST_RADIUS = 0.06;
const SPOT_Z = 11;
const BALL_RADIUS = 0.11;

// Brand palette (mirrors global.css — the 3D view has to read as the same product).
const COLOR_SKY = 0x162e4e;
const COLOR_GRASS = 0x2f6b45;
const COLOR_GRASS_DARK = 0x27593a;
const COLOR_LINE = 0xf5ebe0;
const COLOR_GOLD = 0xc29b47;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Landing point of a shot in world space. */
function landingToWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * GOAL_HALF_WIDTH, y * GOAL_HEIGHT, 0);
}

export class PitchScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ball: THREE.Mesh;
  private keeper: THREE.Group;
  private keeperBody: THREE.Mesh;
  private frameId = 0;
  private disposed = false;

  /** Null when idle; otherwise the shot currently being replayed. */
  private anim: {
    shot: PenaliShotResult;
    startedAt: number;
    flightDuration: number;
    diveTarget: THREE.Vector3;
    diveTilt: number;
    curve: THREE.QuadraticBezierCurve3;
    /** Where the ball ends up after crossing the goal line. */
    followThrough: THREE.Vector3;
    onVerdict?: () => void;
    verdictFired: boolean;
  } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(COLOR_SKY);
    this.scene.fog = new THREE.Fog(COLOR_SKY, 28, 62);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 3.1, SPOT_Z + 4.6);
    this.camera.lookAt(0, 1.15, 0);

    this.buildLights();
    this.buildPitch();
    this.buildGoal();
    this.ball = this.buildBall();
    this.keeper = this.buildKeeper();
    this.keeperBody = this.keeper.children[0] as THREE.Mesh;
    this.scene.add(this.ball, this.keeper);

    this.reset();
    this.loop();
  }

  // --- Construction --------------------------------------------------------

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, COLOR_GRASS_DARK, 1.5));

    const key = new THREE.DirectionalLight(0xfff2d8, 2.1);
    key.position.set(-7, 12, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -6;
    this.scene.add(key);

    // Warm gold rim from behind the goal so the frame separates from the sky.
    const rim = new THREE.DirectionalLight(COLOR_GOLD, 0.8);
    rim.position.set(4, 5, -8);
    this.scene.add(rim);
  }

  private buildPitch(): void {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: COLOR_GRASS, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.z = 8;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Mown stripes — cheap depth cue, no texture needed.
    for (let i = 0; i < 9; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 3),
        new THREE.MeshStandardMaterial({ color: COLOR_GRASS_DARK, roughness: 1 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.004, i * 6 - 6);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    }

    const line = (w: number, h: number, x: number, z: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: COLOR_LINE, opacity: 0.75, transparent: true })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.scene.add(m);
    };

    // Goal line, six-yard box and the penalty area.
    line(40, 0.12, 0, 0);
    line(0.12, 16.5, -20.15, 8.25);
    line(0.12, 16.5, 20.15, 8.25);
    line(40.3, 0.12, 0, 16.5);
    line(18.32, 0.12, 0, 5.5);
    line(0.12, 5.5, -9.16, 2.75);
    line(0.12, 5.5, 9.16, 2.75);

    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 20),
      new THREE.MeshBasicMaterial({ color: COLOR_LINE })
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.014, SPOT_Z);
    this.scene.add(spot);
  }

  private buildGoal(): void {
    const metal = new THREE.MeshStandardMaterial({
      color: COLOR_LINE,
      roughness: 0.35,
      metalness: 0.1,
    });

    const post = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 12);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(post, metal);
      p.position.set(side * GOAL_HALF_WIDTH, GOAL_HEIGHT / 2, 0);
      p.castShadow = true;
      this.scene.add(p);
    }

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HALF_WIDTH * 2, 12),
      metal
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_HEIGHT, 0);
    bar.castShadow = true;
    this.scene.add(bar);

    this.buildNet();
  }

  /** Net as line segments — reads correctly and costs almost nothing. */
  private buildNet(): void {
    const depth = 1.9;
    const material = new THREE.LineBasicMaterial({
      color: COLOR_LINE,
      transparent: true,
      opacity: 0.28,
    });
    const pts: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3) =>
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);

    const cols = 22;
    const rows = 8;
    // Back panel.
    for (let i = 0; i <= cols; i++) {
      const x = -GOAL_HALF_WIDTH + (i / cols) * GOAL_HALF_WIDTH * 2;
      push(new THREE.Vector3(x, 0, -depth), new THREE.Vector3(x, GOAL_HEIGHT, -depth));
    }
    for (let j = 0; j <= rows; j++) {
      const y = (j / rows) * GOAL_HEIGHT;
      push(
        new THREE.Vector3(-GOAL_HALF_WIDTH, y, -depth),
        new THREE.Vector3(GOAL_HALF_WIDTH, y, -depth)
      );
    }
    // Roof + sides.
    for (let i = 0; i <= cols; i++) {
      const x = -GOAL_HALF_WIDTH + (i / cols) * GOAL_HALF_WIDTH * 2;
      push(
        new THREE.Vector3(x, GOAL_HEIGHT, 0),
        new THREE.Vector3(x, GOAL_HEIGHT, -depth)
      );
    }
    for (const side of [-1, 1]) {
      for (let j = 0; j <= rows; j++) {
        const y = (j / rows) * GOAL_HEIGHT;
        push(
          new THREE.Vector3(side * GOAL_HALF_WIDTH, y, 0),
          new THREE.Vector3(side * GOAL_HALF_WIDTH, y, -depth)
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(geo, material));
  }

  private buildBall(): THREE.Mesh {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.45 })
    );
    ball.castShadow = true;
    return ball;
  }

  private buildKeeper(): THREE.Group {
    const group = new THREE.Group();
    const kit = new THREE.MeshStandardMaterial({ color: 0xe3b45e, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 6, 12), kit);
    body.position.y = 0.86;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: 0.8 })
    );
    head.position.y = 1.48;
    head.castShadow = true;
    group.add(head);

    // Arms spread wide — the classic keeper stance, and they read at TV size.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 4, 8), kit);
      arm.position.set(side * 0.42, 1.12, 0);
      arm.rotation.z = (side * Math.PI) / 3.1;
      arm.castShadow = true;
      group.add(arm);
    }

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.1, 0.44, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.8 })
      );
      leg.position.set(side * 0.14, 0.26, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    group.position.set(0, 0, 0.35);
    return group;
  }

  // --- Public API ----------------------------------------------------------

  setKeeperColor(hex: string): void {
    const color = new THREE.Color(hex);
    const material = this.keeperBody.material as THREE.MeshStandardMaterial;
    material.color.copy(color);
  }

  /** Ball back on the spot, keeper up and centred, camera home. */
  reset(): void {
    this.anim = null;
    this.ball.position.set(0, BALL_RADIUS, SPOT_Z);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;
    this.keeper.position.set(0, 0, 0.35);
    this.keeper.rotation.set(0, 0, 0);
    this.camera.position.set(0, 3.1, SPOT_Z + 4.6);
    this.camera.lookAt(0, 1.15, 0);
  }

  /**
   * Replay a resolved shot. `onVerdict` fires the moment the ball reaches the
   * goal line, so the React overlay can drop its GOOOL / ODBRANA card in sync
   * with the picture instead of guessing at a delay.
   */
  playShot(shot: PenaliShotResult, onVerdict?: () => void): void {
    const target = landingToWorld(shot.landing.x, shot.landing.y);
    const start = new THREE.Vector3(0, BALL_RADIUS, SPOT_Z);

    // Curl: the control point pulls against the aim direction so the ball
    // bends into the corner rather than travelling on a straight line.
    const control = new THREE.Vector3(
      (start.x + target.x) / 2 - shot.landing.x * 0.75,
      Math.max(start.y, target.y) * 0.6 + 0.55,
      (start.z + target.z) / 2
    );
    const curve = new THREE.QuadraticBezierCurve3(start, control, target);

    const zone = ZONE_CENTERS[shot.keeperZone];
    // The keeper reaches for their chosen corner, but stays human about it —
    // feet don't leave the six-yard box and hands don't clip the crossbar.
    const diveTarget = new THREE.Vector3(
      zone.x * GOAL_HALF_WIDTH * 0.78,
      zone.y * GOAL_HEIGHT * 0.42,
      0.35
    );

    // Where the ball carries on to after it reaches the plane of the goal.
    const followThrough = target.clone();
    switch (shot.outcome) {
      case 'gol':
        followThrough.z = -1.55;
        break;
      case 'odbrana':
        // Parried away from the middle.
        followThrough.set(
          target.x + Math.sign(target.x || 1) * 2.4,
          Math.max(0.3, target.y),
          1.6
        );
        break;
      case 'stativa':
        followThrough.set(target.x * 1.15, target.y * 0.7, 2.6);
        break;
      default:
        // Wide or over — let it sail past the frame.
        followThrough.set(target.x * 1.35, target.y * 1.2, -3.2);
    }

    this.anim = {
      shot,
      startedAt: performance.now(),
      flightDuration: 1350 - 480 * shot.power,
      diveTarget,
      diveTilt: -Math.sign(zone.x || 0.001) * (zone.y > 0.5 ? 1.05 : 1.35),
      curve,
      followThrough,
      onVerdict,
      verdictFired: false,
    };
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    this.renderer.dispose();
  }

  // --- Frame loop ----------------------------------------------------------

  private loop = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    this.step();
    this.renderer.render(this.scene, this.camera);
  };

  private step(): void {
    const a = this.anim;
    if (!a) {
      // Idle: a slow drift keeps the shot of the goal from looking like a still.
      const t = performance.now() / 4000;
      this.camera.position.x = Math.sin(t) * 0.35;
      this.camera.lookAt(0, 1.15, 0);
      return;
    }

    const elapsed = performance.now() - a.startedAt;

    // Keeper commits a beat after the ball is struck.
    const diveT = Math.min(1, Math.max(0, (elapsed - 90) / 520));
    const dive = easeOutCubic(diveT);
    this.keeper.position.x = a.diveTarget.x * dive;
    this.keeper.position.y = a.diveTarget.y * dive;
    this.keeper.rotation.z = a.diveTilt * dive;

    if (elapsed <= a.flightDuration) {
      const t = elapsed / a.flightDuration;
      this.ball.position.copy(a.curve.getPoint(t));
      // Spin, scaled to pace.
      const spin = 0.35 + a.shot.power * 0.5;
      this.ball.rotation.x -= spin;
      this.ball.rotation.y += spin * 0.4 * a.shot.landing.x;
      // Ease the camera in as the ball travels — a small dolly, not a swoop.
      const cam = easeOutQuad(t);
      this.camera.position.z = SPOT_Z + 4.6 - cam * 2.2;
      this.camera.position.y = 3.1 - cam * 0.35;
      this.camera.lookAt(0, 1.15, 0);
      return;
    }

    if (!a.verdictFired) {
      a.verdictFired = true;
      a.onVerdict?.();
    }

    // Follow-through: into the net, parried away, or sailing past.
    const afterT = Math.min(1, (elapsed - a.flightDuration) / 700);
    const from = a.curve.getPoint(1);
    this.ball.position.lerpVectors(from, a.followThrough, easeOutQuad(afterT));
    const decay = 1 - afterT;
    this.ball.rotation.x -= 0.3 * decay;
  }
}
