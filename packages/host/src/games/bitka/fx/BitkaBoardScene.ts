import * as THREE from 'three';
import type {
  BitkaMapView as BitkaMapData,
  BitkaPlayerView,
  BitkaPoint,
  BitkaTerritoryState,
} from '@igra/shared';
import { FX_SHOT_SECONDS, type BitkaFxEvent } from '@igra/shared';

/**
 * Bojno polje u 3D-u — TV verzija mape.
 *
 * Ključ je što **mapa i dalje ostaje puka ilustracija**: svaka teritorija je
 * svoj poligon ekstrudiran u ploču, a slika mape se preslikava odozgo. Trik je
 * u tome što `ExtrudeGeometry` pravi UV koordinate direktno od koordinata
 * oblika — pošto se poligoni crtaju u istom normalizovanom [0,1] prostoru u
 * kom su i zapisani, svaka ploča sama pokupi tačno svoj isečak slike. Zato ovo
 * radi sa svakom uploadovanom mapom, bez ijedne izmene sadržaja i bez
 * geografije.
 *
 * Ista pravila kao Penali: vanilla three, bez assets-a, sve primitivi, i sve
 * iza lenjog chunk-a. Telefon ovo nikad ne učitava.
 *
 * Efekti su isti oni iz `bitka-fx.ts` u shared paketu — sloj događaja se nije menjao, samo se
 * ispod njega umesto providnog 2D platna sad nalazi teren.
 */

/** Debljina ploče teritorije. */
const SLAB = 0.035;
/** Koliko se ploča podigne kad je u fokusu ili kad je ponuđena za izbor. */
const LIFT = 0.028;
const GOLD = '#F2CE74';
const NEUTRAL_SIDE = '#3d4757';
const WHITE = new THREE.Color(0xffffff);

const easeOut = (u: number) => 1 - (1 - u) ** 3;
/** Prigušeno primicanje ka cilju, nezavisno od broja kadrova. */
const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt);

interface Effect {
  update(dt: number): boolean;
  dispose(): void;
}

interface Territory {
  id: string;
  mesh: THREE.Mesh;
  cap: THREE.MeshStandardMaterial;
  side: THREE.MeshStandardMaterial;
  label: BitkaPoint;
  /** Vrh ploče u svetskim koordinatama — sidro za zamak i efekte. */
  anchor: THREE.Vector3;
  targetCap: THREE.Color;
  targetSide: THREE.Color;
  targetY: number;
  glow: number;
  castle: THREE.Group;
  tower: THREE.Mesh;
  walls: THREE.Mesh[];
  /** Rušenje zamka je animacija, pa je stanje ne sme vratiti nazad. */
  toppling: boolean;
  /** Zamak igrača koji je na potezu — veći i sa zlatnim sjajem. */
  activeCastle: boolean;
}

export interface BitkaBoardInput {
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  focusId?: string | null;
  highlightIds?: string[];
  /** Ko je na potezu — njegov zamak se uveća i zasvetli. */
  activePlayerId?: string | null;
}

export class BitkaBoardScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();

  private readonly map: BitkaMapData;
  private readonly territories = new Map<string, Territory>();
  private readonly disposables: { dispose(): void }[] = [];

  private texture: THREE.Texture | null = null;
  /** Cela slika mape leži ispod ploča — bez nje bi pozadina crteža nestala. */
  private base: THREE.Mesh | null = null;
  private baseMat: THREE.MeshStandardMaterial | null = null;
  /** širina/visina slike mape */
  private ratio = 3 / 2;
  /** dubina table u svetskim jedinicama = 1 / ratio */
  private depth = 2 / 3;

  private effects: Effect[] = [];
  private pending: { at: number; ev: BitkaFxEvent }[] = [];
  private clock = 0;
  private raf = 0;
  private lastTime = 0;
  private aspect = 16 / 9;

  private readonly camPos = new THREE.Vector3();
  private readonly camAim = new THREE.Vector3();
  private readonly wantPos = new THREE.Vector3();
  private readonly wantAim = new THREE.Vector3();
  /** Prvi kadar se ne uklizava — tabla se odmah vidi uokvirena. */
  private camSettled = false;

  constructor(canvas: HTMLCanvasElement, map: BitkaMapData) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Uže sočivo (32° umesto 38°) smanjuje perspektivno izobličenje, pa tabla
    // manje liči na trapez i bolje popunjava platno pri istoj margini.
    this.camera = new THREE.PerspectiveCamera(32, this.aspect, 0.01, 60);
    this.scene.add(this.root);

    // Nebo/zemlja + jedno usmereno svetlo: dovoljno da se reljef čita, a
    // nema senki koje bi tražile shadow mape.
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0b1728, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.6, 1.6, 0.9);
    this.scene.add(key);

    this.buildBoard();
    this.frame();

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /**
   * Slika stiže spolja, već učitana — odatle se čita i odnos stranica, pa se
   * ista slika ne skida dvaput (jednom za layout, jednom za teksturu).
   */
  setMapImage(image: HTMLImageElement) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    this.texture?.dispose();
    this.texture = texture;
    for (const t of this.territories.values()) {
      t.cap.map = texture;
      t.cap.needsUpdate = true;
    }
    if (this.baseMat) {
      this.baseMat.map = texture;
      this.baseMat.needsUpdate = true;
    }
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      this.setRatio(image.naturalWidth / image.naturalHeight);
    }
  }

  private setRatio(ratio: number) {
    if (!(ratio > 0) || Math.abs(ratio - this.ratio) < 0.001) return;
    this.ratio = ratio;
    this.depth = 1 / ratio;
    if (this.base) {
      this.base.scale.set(1, this.depth, 1);
      this.base.position.z = this.depth / 2;
    }
    for (const t of this.territories.values()) {
      t.mesh.scale.set(1, this.depth, 1);
      t.mesh.position.z = this.depth;
      t.anchor.set(t.label.x, t.mesh.position.y + SLAB, t.label.y * this.depth);
      t.castle.position.copy(t.anchor);
    }
    this.camSettled = false;
    this.frame();
  }

  /** Stanje partije → ciljne boje, visine i zamkovi. Petlja ih dostiže glatko. */
  update(input: BitkaBoardInput) {
    const colorOf = new Map(input.players.map((p) => [p.playerId, p.avatarColor]));
    const highlight = new Set(input.highlightIds ?? []);

    for (const st of input.board) {
      const t = this.territories.get(st.id);
      if (!t) continue;
      const owner = st.ownerId ? colorOf.get(st.ownerId) : null;
      // Boje se upisuju u postojeće objekte: ovo se zove na svaki tick, a
      // partija traje ~25 minuta — nove instance bi bile čisto smeće.
      // Kapica se tonira vlasnikovom bojom, ali blago: ispod nje je crtež
      // mape i on mora da ostane čitljiv.
      if (owner) {
        t.targetCap.set(owner).lerp(WHITE, 0.55);
        t.targetSide.set(owner);
      } else {
        t.targetCap.setScalar(0.78);
        t.targetSide.set(NEUTRAL_SIDE);
      }

      const focused = input.focusId === st.id;
      t.targetY = focused ? LIFT : highlight.has(st.id) ? LIFT * 0.45 : 0;
      t.glow = focused ? 0.55 : highlight.has(st.id) ? 0.3 : 0;

      if (!t.toppling) {
        const hasCastle = !!st.castle && st.walls > 0;
        t.castle.visible = hasCastle;
        t.tower.visible = hasCastle;
        const towerMat = t.tower.material as THREE.MeshStandardMaterial;
        towerMat.color.set(owner ?? NEUTRAL_SIDE);
        t.walls.forEach((w, i) => {
          w.visible = hasCastle && i < st.walls;
        });
        // Ko je na potezu, njegov zamak se vidi iz aviona — bez toga se sa
        // fotelje ne zna ko trenutno igra, a to je jedina informacija koja
        // objašnjava šta se na mapi upravo dešava.
        t.activeCastle =
          hasCastle && !!input.activePlayerId && st.ownerId === input.activePlayerId;
        towerMat.emissive.set(GOLD);
      }
    }

    const focus = input.focusId ? this.territories.get(input.focusId) : null;
    if (focus) this.aimAt(focus.anchor, 0.62);
    else this.frame();
  }

  playFx(ev: BitkaFxEvent, delaySeconds = 0) {
    if (delaySeconds > 0) {
      this.pending.push({ at: this.clock + delaySeconds, ev });
      return;
    }
    const fx = this.build(ev);
    if (fx) this.effects.push(fx);
  }

  clearFx() {
    for (const fx of this.effects) fx.dispose();
    this.effects = [];
    this.pending = [];
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.frame();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clearFx();
    for (const d of this.disposables) d.dispose();
    this.texture?.dispose();
    this.renderer.dispose();
  }

  // --- tabla ----------------------------------------------------------------

  private buildBoard() {
    // Podloga: ista slika, ravna i potamnjena, tik ispod ploča. Teritorije
    // tako izgledaju kao da su izdignute IZ mape, a delovi crteža koji nisu
    // ničija teritorija (more, pozadina) ostaju vidljivi.
    const baseGeo = new THREE.PlaneGeometry(1, 1);
    this.baseMat = new THREE.MeshStandardMaterial({
      map: this.texture ?? undefined,
      color: 0x8d97a8,
      roughness: 1,
      metalness: 0,
    });
    this.base = new THREE.Mesh(baseGeo, this.baseMat);
    this.base.rotation.x = -Math.PI / 2;
    this.base.scale.set(1, this.depth, 1);
    this.base.position.set(0.5, -0.004, this.depth / 2);
    this.root.add(this.base);
    this.disposables.push(baseGeo, this.baseMat);

    for (const territory of this.map.territories) {
      if (territory.polygon.length < 3) continue;

      const shape = new THREE.Shape();
      territory.polygon.forEach((p, i) => {
        // y se okreće jer slika ide odozgo nadole, a UV odozdo nagore.
        const x = p.x;
        const y = 1 - p.y;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: SLAB,
        bevelEnabled: false,
        curveSegments: 1,
      });
      const cap = new THREE.MeshStandardMaterial({
        map: this.texture ?? undefined,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0,
        emissive: new THREE.Color(GOLD),
        emissiveIntensity: 0,
      });
      const side = new THREE.MeshStandardMaterial({
        color: NEUTRAL_SIDE,
        roughness: 0.75,
        metalness: 0.05,
      });
      // Grupa 0 su kapice (gore i dole), grupa 1 su stranice.
      const mesh = new THREE.Mesh(geometry, [cap, side]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1, this.depth, 1);
      mesh.position.set(0, 0, this.depth);
      this.root.add(mesh);

      const anchor = new THREE.Vector3(
        territory.label.x,
        SLAB,
        territory.label.y * this.depth
      );

      const { group, tower, walls } = this.buildCastle(anchor);

      this.territories.set(territory.id, {
        id: territory.id,
        mesh,
        cap,
        side,
        label: territory.label,
        anchor,
        targetCap: new THREE.Color(0xffffff).multiplyScalar(0.78),
        targetSide: new THREE.Color(NEUTRAL_SIDE),
        targetY: 0,
        glow: 0,
        castle: group,
        tower,
        walls,
        toppling: false,
        activeCastle: false,
      });

      this.disposables.push(geometry, cap, side);
    }
  }

  /** Zamak: kula sa krunom i tri zida oko nje — sve primitivi. */
  private buildCastle(anchor: THREE.Vector3) {
    const group = new THREE.Group();
    group.position.copy(anchor);
    group.visible = false;
    this.root.add(group);

    const towerGeo = new THREE.CylinderGeometry(0.013, 0.017, 0.05, 10);
    const towerMat = new THREE.MeshStandardMaterial({ color: NEUTRAL_SIDE, roughness: 0.7 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = 0.025;
    group.add(tower);

    const crownGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.008, 10);
    const crownMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, metalness: 0.3 });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = 0.052;
    group.add(crown);

    const wallGeo = new THREE.BoxGeometry(0.026, 0.014, 0.007);
    const walls: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const wallMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.6 });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      wall.position.set(Math.cos(angle) * 0.032, 0.008, Math.sin(angle) * 0.032);
      wall.rotation.y = -angle;
      group.add(wall);
      walls.push(wall);
      this.disposables.push(wallMat);
    }

    this.disposables.push(towerGeo, towerMat, crownGeo, crownMat, wallGeo);
    return { group, tower, walls };
  }

  // --- kamera ---------------------------------------------------------------

  /**
   * Kamera stoji na ovim odnosima prema udaljenosti — nagib je konstantan.
   * Strmije od prvobitnog (~63° umesto ~53°): što je pogled niži, to je tabla
   * više trapez, a trapez u pravougaonom kadru uvek ostavlja prazan pojas gore.
   * Ovako se popuni osetno više platna, a perspektiva se i dalje jasno vidi.
   */
  private static readonly CAM_UP = 0.9;
  private static readonly CAM_BACK = 0.46;

  /**
   * Da li cela tabla staje u kadar sa kamere na udaljenosti `dist`.
   *
   * Proverava se **svih osam uglova** (četiri u ravni i četiri na vrhu ploče),
   * jer kamera nije iznad table nego nagnuta: bliža ivica je znatno bliža od
   * središta, pa u kadar ulazi uže. Ravan proračun „koliko treba da dubina
   * stane po visini" to promaši — po njemu izgleda da ima mesta, a u stvari se
   * bliži uglovi odsecaju, dok gore ostaje prazan pojas.
   */
  private boardFits(dist: number): boolean {
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanV * this.aspect;
    const c = new THREE.Vector3(
      0.5,
      dist * BitkaBoardScene.CAM_UP,
      this.depth / 2 + dist * BitkaBoardScene.CAM_BACK
    );
    const forward = new THREE.Vector3(0.5, 0, this.depth / 2).sub(c).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    const up = right.clone().cross(forward);

    const top = SLAB + LIFT;
    for (const x of [0, 1]) {
      for (const z of [0, this.depth]) {
        for (const y of [0, top]) {
          const w = new THREE.Vector3(x, y, z).sub(c);
          const depthAlongView = w.dot(forward);
          if (depthAlongView <= 0) return false;
          if (Math.abs(w.dot(right)) > depthAlongView * tanH) return false;
          if (Math.abs(w.dot(up)) > depthAlongView * tanV) return false;
        }
      }
    }
    return true;
  }

  /** Ceo teren u kadru — polazni i povratni pogled. */
  private frame() {
    // Najmanja udaljenost na kojoj tabla još staje, nađena polovljenjem.
    // Staje-li je monotono po udaljenosti, pa je ovo dovoljno.
    let lo = 0.2;
    let hi = 30;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.boardFits(mid)) hi = mid;
      else lo = mid;
    }
    // Tanak zazor da ivica ne dodiruje okvir.
    const dist = hi * 1.04;
    this.wantAim.set(0.5, 0, this.depth / 2);
    this.wantPos.set(
      0.5,
      dist * BitkaBoardScene.CAM_UP,
      this.depth / 2 + dist * BitkaBoardScene.CAM_BACK
    );
  }

  /** Primicanje jednoj teritoriji — duel se gleda izbliza. */
  private aimAt(point: THREE.Vector3, closeness: number) {
    this.frame();
    const wide = this.wantPos.clone();
    this.wantAim.copy(point);
    this.wantPos.copy(point).lerp(wide, closeness);
    // Ne spuštaj kameru ispod terena ma koliko blizu bila meta.
    this.wantPos.y = Math.max(this.wantPos.y, 0.32);
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
        for (const d of due) this.playFx(d.ev);
      }
    }

    for (const t of this.territories.values()) {
      t.cap.color.lerp(t.targetCap, 1 - Math.exp(-6 * dt));
      t.side.color.lerp(t.targetSide, 1 - Math.exp(-6 * dt));
      // Ponuđene i napadnute teritorije dišu — isto značenje kao isprekidana
      // zlatna kontura na 2D mapi.
      const pulse = t.glow > 0 ? t.glow * (0.55 + 0.45 * Math.sin(this.clock * 4)) : 0;
      t.cap.emissiveIntensity = pulse;
      const y = damp(t.mesh.position.y, t.targetY, 7, dt);
      t.mesh.position.y = y;
      t.anchor.y = y + SLAB;
      if (!t.toppling) {
        t.castle.position.y = t.anchor.y;
        // Aktivan zamak diše: veći je i zlatno pulsira, ostali miruju.
        const wanted = t.activeCastle ? 1.45 + 0.12 * Math.sin(this.clock * 3.2) : 1;
        const scale = damp(t.castle.scale.x, wanted, 8, dt);
        t.castle.scale.setScalar(scale);
        (t.tower.material as THREE.MeshStandardMaterial).emissiveIntensity = t.activeCastle
          ? 0.35 + 0.25 * Math.sin(this.clock * 3.2)
          : 0;
      }
    }

    if (this.camSettled) {
      this.camPos.set(
        damp(this.camPos.x, this.wantPos.x, 3.2, dt),
        damp(this.camPos.y, this.wantPos.y, 3.2, dt),
        damp(this.camPos.z, this.wantPos.z, 3.2, dt)
      );
      this.camAim.set(
        damp(this.camAim.x, this.wantAim.x, 3.2, dt),
        damp(this.camAim.y, this.wantAim.y, 3.2, dt),
        damp(this.camAim.z, this.wantAim.z, 3.2, dt)
      );
    } else {
      this.camPos.copy(this.wantPos);
      this.camAim.copy(this.wantAim);
      this.camSettled = true;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAim);

    if (this.effects.length) {
      this.effects = this.effects.filter((fx) => {
        const alive = fx.update(dt);
        if (!alive) fx.dispose();
        return alive;
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  // --- efekti ---------------------------------------------------------------

  private toWorld(p: BitkaPoint, y = SLAB + 0.004): THREE.Vector3 {
    return new THREE.Vector3(p.x, y, p.y * this.depth);
  }

  private build(ev: BitkaFxEvent): Effect | null {
    const territory = ev.territoryId ? this.territories.get(ev.territoryId) : null;
    const at = territory ? territory.anchor.clone().setY(territory.anchor.y + 0.004) : this.toWorld(ev.at);

    switch (ev.kind) {
      case 'napad':
        return this.shot(ev, at);
      case 'osvojeno':
        // Osvajanje je najvažniji trenutak poteza, pa je i najglasnije: stub
        // svetlosti, dva prstena različitih brzina i kiša krhotina — sporije i
        // krupnije nego ranije, da se stigne videti sa fotelje.
        return composite([
          this.pillar(at, ev.color, 1.6),
          this.ring(at, ev.color, { r0: 0.02, r1: 0.26, dur: 1.6 }),
          this.ring(at, '#ffffff', { r0: 0.02, r1: 0.13, dur: 0.9, opacity: 0.75 }),
          this.shards(at, ev.color, 22, { speed: 0.26, dur: 1.6, size: 0.016, gravity: 0.55, up: 0.6 }),
          territory ? this.bounce(territory) : null,
        ]);
      case 'odbranjeno':
        return composite([
          this.dome(at, ev.color),
          this.ring(at, '#ffffff', { r0: 0.04, r1: 0.09, dur: 0.4, opacity: 0.7 }),
        ]);
      case 'zid':
        // Srušen zid gori — vatra ostaje nad teritorijom i posle udara, pa se
        // zna gde je opsada u toku i bez čitanja teksta.
        return composite([
          this.ring(at, '#FF8A3D', { r0: 0.02, r1: 0.12, dur: 0.6 }),
          this.shards(at, GOLD, 16, { speed: 0.26, dur: 1.1, size: 0.013, gravity: 0.9 }),
          this.fire(at, 2.1),
          territory ? this.breakWall(territory) : null,
        ]);
      case 'zamak-pao':
        return composite([
          this.ring(at, GOLD, { r0: 0.03, r1: 0.34, dur: 1.3 }),
          this.ring(at, '#E06A5E', { r0: 0.02, r1: 0.22, dur: 0.9 }),
          this.shards(at, GOLD, 26, { speed: 0.34, dur: 1.6, size: 0.015, gravity: 1.1 }),
          // Zamak gori duže nego pojedinačan zid — to je kraj jednog igrača.
          this.fire(at, 3.2, 1.5),
          territory ? this.topple(territory) : null,
        ]);
      case 'pobeda':
        return composite([
          this.ring(at, ev.color, { r0: 0.03, r1: 0.34, dur: 1.2 }),
          this.shards(at, ev.color, 26, { speed: 0.36, dur: 2.0, size: 0.016, gravity: 0.6, up: 0.5 }),
          this.shards(at, GOLD, 26, { speed: 0.32, dur: 2.0, size: 0.014, gravity: 0.6, up: 0.55 }),
        ]);
      default:
        return null;
    }
  }

  /** Projektil po luku — sa napadačeve zemlje na metu. */
  private shot(ev: BitkaFxEvent, to: THREE.Vector3): Effect {
    const start = ev.from ? this.toWorld(ev.from) : to.clone().add(new THREE.Vector3(0, 0.5, 0));
    const dist = start.distanceTo(to) || 0.001;
    const peak = Math.max(0.12, dist * 0.45);

    const geo = new THREE.SphereGeometry(0.011, 12, 10);
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
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(1 - i * 0.12);
      this.root.add(mesh);
      meshes.push(mesh);
      mats.push(mat);
    }

    const pointAt = (u: number) => {
      const p = start.clone().lerp(to, u);
      p.y += Math.sin(Math.PI * u) * peak;
      return p;
    };

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
        for (const mesh of meshes) this.root.remove(mesh);
        for (const mat of mats) mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Udarni talas — prsten koji leži na terenu i širi se. */
  private ring(
    center: THREE.Vector3,
    colorHex: string,
    opts: { r0: number; r1: number; dur: number; opacity?: number }
  ): Effect {
    const opacity = opts.opacity ?? 0.9;
    const geo = new THREE.RingGeometry(0.8, 1, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(center);
    this.root.add(mesh);

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
        this.root.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Krhotine — kockice koje odlete i padnu na teren. */
  private shards(
    center: THREE.Vector3,
    colorHex: string,
    count: number,
    opts: { speed: number; dur: number; size: number; gravity: number; up?: number }
  ): Effect {
    const geo = new THREE.BoxGeometry(opts.size, opts.size, opts.size);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 1,
      roughness: 0.6,
    });
    const meshes: THREE.Mesh[] = [];
    const vel: THREE.Vector3[] = [];
    const spin: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = opts.speed * (0.5 + Math.random() * 0.7);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
      this.root.add(mesh);
      meshes.push(mesh);
      vel.push(
        new THREE.Vector3(
          Math.cos(angle) * speed,
          (opts.up ?? 0.35) + Math.random() * 0.35,
          Math.sin(angle) * speed
        )
      );
      spin.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        )
      );
    }

    let t = 0;
    return {
      update: (dt) => {
        t += dt / opts.dur;
        meshes.forEach((mesh, i) => {
          vel[i].y -= opts.gravity * dt;
          mesh.position.addScaledVector(vel[i], dt);
          mesh.rotation.x += spin[i].x * dt;
          mesh.rotation.y += spin[i].y * dt;
          mesh.rotation.z += spin[i].z * dt;
        });
        mat.opacity = Math.max(0, 1 - t ** 2);
        return t < 1;
      },
      dispose: () => {
        for (const mesh of meshes) this.root.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /**
   * Stub svetlosti u boji novog vlasnika — vertikala se sa fotelje vidi i kad
   * je teritorija mala, što prsten sam po sebi ne postiže.
   */
  private pillar(center: THREE.Vector3, colorHex: string, dur: number): Effect {
    const geo = new THREE.CylinderGeometry(0.05, 0.075, 1, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    this.root.add(mesh);

    let t = 0;
    return {
      update: (dt) => {
        t += dt / dur;
        const u = Math.min(1, t);
        const h = 0.05 + 0.45 * easeOut(u);
        mesh.scale.set(1 + u * 0.5, h, 1 + u * 0.5);
        mesh.position.y = center.y + h / 2;
        // Brzo plane, pa polako iščezne.
        mat.opacity = u < 0.15 ? (u / 0.15) * 0.85 : 0.85 * (1 - (u - 0.15) / 0.85);
        return t < 1;
      },
      dispose: () => {
        this.root.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Ploča poskoči kad promeni gospodara — zemlja se fizički trgne. */
  private bounce(t: Territory): Effect {
    const DUR = 1.1;
    let time = 0;
    const base = t.mesh.position.y;
    return {
      update: (dt) => {
        time += dt / DUR;
        const u = Math.min(1, time);
        // Prigušeni odskok — dva zamaha pa mir.
        const lift = Math.sin(Math.PI * u * 2) * 0.05 * (1 - u);
        t.mesh.position.y = base + Math.max(0, lift);
        return time < 1;
      },
      // Petlja ionako vraća ploču na `targetY`, pa nema šta da se čisti.
      dispose: () => {},
    };
  }

  /**
   * Vatra nad teritorijom — srušen zid gori.
   *
   * Bez ijednog asseta: plamenovi su uspravne ravni sa aditivnim mešanjem koje
   * se dižu, sužavaju i trepere, u tri boje od žute ka tamnocrvenoj. Sprite bi
   * bio jeftiniji, ali bi tražio teksturu.
   */
  private fire(center: THREE.Vector3, dur: number, scale = 1): Effect {
    const COLORS = ['#FFE08A', '#FF9F3D', '#E0362B'];
    const COUNT = 16;
    const geo = new THREE.PlaneGeometry(0.05 * scale, 0.09 * scale);
    const mats = COLORS.map(
      (c) =>
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(c),
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
    );
    const flames: { mesh: THREE.Mesh; phase: number; speed: number; radius: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
      const angle = (i / COUNT) * Math.PI * 2;
      const radius = (0.01 + Math.random() * 0.05) * scale;
      mesh.position.set(
        center.x + Math.cos(angle) * radius,
        center.y,
        center.z + Math.sin(angle) * radius
      );
      this.root.add(mesh);
      flames.push({ mesh, phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 0.8, radius });
    }

    let t = 0;
    return {
      update: (dt) => {
        t += dt / dur;
        const u = Math.min(1, t);
        // Bukne, drži se, pa se ugasi.
        const envelope = u < 0.12 ? u / 0.12 : u > 0.65 ? (1 - u) / 0.35 : 1;
        for (const f of flames) {
          f.phase += dt * 7 * f.speed;
          const flicker = 0.75 + 0.25 * Math.sin(f.phase);
          f.mesh.scale.set(flicker, flicker * (0.8 + 0.4 * Math.sin(f.phase * 0.7)), 1);
          f.mesh.position.y = center.y + 0.045 * scale * flicker;
          // Plamen uvek gleda u kameru, inače se iz profila izgubi.
          f.mesh.quaternion.copy(this.camera.quaternion);
        }
        for (const m of mats) m.opacity = 0.9 * Math.max(0, envelope);
        return t < 1;
      },
      dispose: () => {
        for (const f of flames) this.root.remove(f.mesh);
        for (const m of mats) m.dispose();
        geo.dispose();
      },
    };
  }

  /** Kupola — odbrana koja je izdržala. */
  private dome(center: THREE.Vector3, colorHex: string): Effect {
    const geo = new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    this.root.add(mesh);

    const DUR = 0.85;
    let t = 0;
    return {
      update: (dt) => {
        t += dt / DUR;
        const u = Math.min(1, t);
        mesh.scale.setScalar(1 + 0.3 * Math.sin(Math.PI * u) - 0.1 * Math.sin(Math.PI * 2 * u));
        mat.opacity = 0.85 * (1 - easeOut(u));
        return t < 1;
      },
      dispose: () => {
        this.root.remove(mesh);
        mat.dispose();
        geo.dispose();
      },
    };
  }

  /** Jedan zid se prevrne — stanje ga posle svakako sakrije. */
  private breakWall(t: Territory): Effect {
    const wall = [...t.walls].reverse().find((w) => w.visible);
    if (!wall) return noop();
    const DUR = 0.7;
    let time = 0;
    return {
      update: (dt) => {
        time += dt / DUR;
        wall.rotation.z += 3.5 * dt;
        wall.position.y -= 0.03 * dt;
        return time < 1;
      },
      dispose: () => {
        wall.rotation.z = 0;
        wall.position.y = 0.008;
      },
    };
  }

  /** Pad zamka — kula se prevali i propadne kroz teren. */
  private topple(t: Territory): Effect {
    t.toppling = true;
    const DUR = 1.4;
    let time = 0;
    return {
      update: (dt) => {
        time += dt / DUR;
        const u = Math.min(1, time);
        t.castle.rotation.z = -Math.PI * 0.5 * easeOut(u);
        t.castle.position.y = t.anchor.y - 0.06 * easeOut(u);
        return time < 1;
      },
      dispose: () => {
        // Sve se vraća u mirno stanje; sledeći `update` odlučuje šta se vidi.
        t.castle.rotation.z = 0;
        t.castle.position.y = t.anchor.y;
        t.castle.visible = false;
        t.tower.visible = false;
        for (const w of t.walls) w.visible = false;
        t.toppling = false;
      },
    };
  }
}

function noop(): Effect {
  return { update: () => false, dispose: () => {} };
}

function composite(parts: (Effect | null)[]): Effect {
  let alive = parts.filter((p): p is Effect => p !== null);
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
