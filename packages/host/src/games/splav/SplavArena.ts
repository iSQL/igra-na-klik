import type { SplavFrame, SplavFramePlayer } from '@igra/shared';
import { SPLAV_PLAYER_RADIUS, SPLAV_RENDER_DELAY_MS } from '@igra/shared';

/**
 * The TV view of the raft: a canvas 2D scene, no three.js and no assets.
 *
 * Penali needed real 3D because a ball flies through space; here everything
 * happens on one plane, so an angled top-down projection (squash Y, extrude
 * the raft into a slab) reads as 3D for a fraction of the cost — and, unlike
 * the Penali chunk, adds nothing to the bundle.
 *
 * Netcode: frames land ~15×/s, so the scene renders `SPLAV_RENDER_DELAY_MS`
 * behind live and interpolates between the two frames straddling that instant.
 * Rendering the newest frame directly would stutter at 15 fps no matter how
 * fast the display is.
 */

interface Timed {
  frame: SplavFrame;
  at: number;
}

export interface SplavRosterInfo {
  name: string;
  color: string;
  emoji: string;
}

/** Vertical squash of the world Y axis — the "camera angle". */
const TILT = 0.5;
/** Half-extent of world space kept in frame (raft + drift + a body radius). */
const EXTENT = 1.28;
/** Raft thickness in screen px, relative to scale. */
const SLAB = 0.075;
/** How long a fall animation runs, ms. */
const FALL_MS = 1400;

export class SplavArena {
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private buffer: Timed[] = [];
  private roster: Record<string, SplavRosterInfo> = {};
  private width = 0;
  private height = 0;
  private dpr = 1;
  private startedAt = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setRoster(roster: Record<string, SplavRosterInfo>): void {
    this.roster = roster;
  }

  pushFrame(frame: SplavFrame): void {
    const last = this.buffer[this.buffer.length - 1];
    // A new round restarts the sequence; anything stale is dropped.
    if (last && frame.seq <= last.frame.seq) return;
    this.buffer.push({ frame, at: performance.now() });
    if (this.buffer.length > 20) this.buffer.shift();
  }

  /** Drop everything — called between rounds so the old raft doesn't linger. */
  reset(): void {
    this.buffer = [];
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ctx = null;
  }

  // --- Loop ----------------------------------------------------------------

  private loop(): void {
    this.raf = requestAnimationFrame(this.loop);
    const ctx = this.ctx;
    if (!ctx || this.width === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const t = (performance.now() - this.startedAt) / 1000;
    this.drawWater(ctx, t);

    const view = this.sample();
    if (!view) return;
    this.drawScene(ctx, view, t);
  }

  /**
   * Interpolated world state at (now − render delay). Also hands back a
   * per-player velocity so the scene can lean and trail a dashing capsule
   * without the server ever sending one.
   */
  private sample(): {
    r: number;
    cx: number;
    cy: number;
    players: (SplavFramePlayer & { vx: number; vy: number })[];
  } | null {
    if (this.buffer.length === 0) return null;
    const target = performance.now() - SPLAV_RENDER_DELAY_MS;

    let a = this.buffer[0];
    let b = this.buffer[0];
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].at <= target) {
        a = this.buffer[i];
        b = this.buffer[i + 1] ?? this.buffer[i];
      }
    }
    const span = b.at - a.at;
    const k = span > 0 ? Math.max(0, Math.min(1, (target - a.at) / span)) : 0;
    const lerp = (p: number, q: number) => p + (q - p) * k;

    const byId = new Map(b.frame.players.map((p) => [p.id, p]));
    const players = a.frame.players.map((p) => {
      const n = byId.get(p.id) ?? p;
      // An eliminated body is frozen server-side; interpolating it toward a
      // stale sibling would drag it across the water.
      const moving = !p.out && !n.out;
      return {
        ...n,
        x: moving ? lerp(p.x, n.x) : p.out ? p.x : n.x,
        y: moving ? lerp(p.y, n.y) : p.out ? p.y : n.y,
        vx: span > 0 ? ((n.x - p.x) / span) * 1000 : 0,
        vy: span > 0 ? ((n.y - p.y) / span) * 1000 : 0,
      };
    });

    return {
      r: lerp(a.frame.r, b.frame.r),
      cx: lerp(a.frame.cx, b.frame.cx),
      cy: lerp(a.frame.cy, b.frame.cy),
      players,
    };
  }

  // --- Drawing -------------------------------------------------------------

  private get scale(): number {
    const byWidth = (this.width * 0.46) / EXTENT;
    // Leave headroom for the capsules standing on the raft and its slab.
    const byHeight = (this.height * 0.42 - 70) / (EXTENT * TILT);
    return Math.max(40, Math.min(byWidth, byHeight));
  }

  private get originX(): number {
    return this.width / 2;
  }

  private get originY(): number {
    return this.height * 0.54;
  }

  private drawWater(ctx: CanvasRenderingContext2D, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#0b1c33');
    g.addColorStop(0.55, '#132a4a');
    g.addColorStop(1, '#1d3557');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // Lazy swell — thin arcs drifting sideways at slightly different speeds.
    ctx.save();
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = (this.height / 14) * i + Math.sin(t * 0.6 + i) * 6;
      const phase = t * (10 + i * 1.5) + i * 40;
      ctx.strokeStyle = `rgba(146, 191, 224, ${0.03 + (i % 3) * 0.012})`;
      ctx.beginPath();
      for (let x = -80; x < this.width + 80; x += 16) {
        const wy = y + Math.sin((x + phase) / 90) * 5;
        if (x === -80) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawScene(
    ctx: CanvasRenderingContext2D,
    view: NonNullable<ReturnType<SplavArena['sample']>>,
    t: number
  ): void {
    const s = this.scale;
    const ox = this.originX + view.cx * s;
    const oy = this.originY + view.cy * s * TILT;
    const rx = view.r * s;
    const ry = view.r * s * TILT;
    const slab = Math.max(8, s * SLAB);

    // Wake around the raft — sells that it is floating, not painted on.
    ctx.save();
    ctx.strokeStyle = 'rgba(146, 191, 224, 0.14)';
    ctx.lineWidth = 3;
    for (let i = 1; i <= 2; i++) {
      const puff = 8 * i + Math.sin(t * 1.6 + i) * 4;
      ctx.beginPath();
      ctx.ellipse(ox, oy + slab * 0.6, rx + puff, ry + puff * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Slab: underside ellipse + the band that joins it to the deck.
    ctx.fillStyle = '#5a3d22';
    ctx.beginPath();
    ctx.ellipse(ox, oy + slab, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ox - rx, oy, rx * 2, slab);

    // Deck.
    const deck = ctx.createLinearGradient(0, oy - ry, 0, oy + ry);
    deck.addColorStop(0, '#c9a063');
    deck.addColorStop(1, '#9a7440');
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = deck;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(60, 36, 14, 0.35)';
    ctx.lineWidth = Math.max(1, s * 0.012);
    const plank = Math.max(10, s * 0.16);
    for (let x = -rx; x <= rx; x += plank) {
      ctx.beginPath();
      ctx.moveTo(ox + x, oy - ry);
      ctx.lineTo(ox + x, oy + ry);
      ctx.stroke();
    }
    ctx.restore();

    // Edge: gold while there's room, angrier as the raft closes in.
    const danger = Math.max(0, Math.min(1, (0.62 - view.r) / 0.42));
    const pulse = 0.55 + 0.45 * Math.sin(t * (3 + danger * 6));
    ctx.save();
    ctx.lineWidth = 4 + danger * 4;
    ctx.strokeStyle = danger > 0
      ? `rgba(${Math.round(194 + 60 * danger)}, ${Math.round(155 - 90 * danger)}, ${Math.round(71 - 30 * danger)}, ${0.55 + 0.4 * pulse})`
      : 'rgba(194, 155, 71, 0.75)';
    ctx.shadowColor = ctx.strokeStyle as string;
    ctx.shadowBlur = 12 + danger * 26 * pulse;
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Painter's algorithm: whoever is further "back" is drawn first.
    const sorted = [...view.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (p.out) this.drawFalling(ctx, p, s);
      else this.drawPlayer(ctx, p, s);
    }
  }

  private screen(x: number, y: number, s: number): { sx: number; sy: number } {
    return { sx: this.originX + x * s, sy: this.originY + y * s * TILT };
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    p: SplavFramePlayer & { vx: number; vy: number },
    s: number
  ): void {
    const info = this.roster[p.id];
    const { sx, sy } = this.screen(p.x, p.y, s);
    const w = SPLAV_PLAYER_RADIUS * 2 * s;
    const h = w * 1.65;
    const hit = p.h >= 0 && p.h < 220;
    // Impact squash — wide and short for a beat after a real collision.
    const squash = hit ? 1 - 0.22 * (1 - p.h / 220) : 1;
    const bw = w / squash;
    const bh = h * squash;

    // Contact shadow on the deck.
    ctx.save();
    ctx.fillStyle = 'rgba(40, 24, 10, 0.32)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 0.55, w * 0.55 * TILT, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dash ready — a faint gold ring means "this one can still hit you".
    if (p.cd >= 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(194, 155, 71, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.72, w * 0.72 * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Motion trail while the burst is in flight.
    if (p.d) {
      const len = Math.hypot(p.vx, p.vy) || 1;
      const ux = (p.vx / len) * s * 0.05;
      const uy = (p.vy / len) * s * 0.05 * TILT;
      for (let i = 3; i >= 1; i--) {
        ctx.save();
        ctx.globalAlpha = 0.1 * i;
        this.capsule(ctx, sx - ux * i, sy - uy * i, bw, bh, info?.color ?? '#888');
        ctx.restore();
      }
    }

    this.capsule(ctx, sx, sy, bw, bh, info?.color ?? '#888888');

    if (hit) {
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - p.h / 220);
      this.capsule(ctx, sx, sy, bw, bh, '#ffffff');
      ctx.restore();
    }

    // Face + name.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(bw * 0.62)}px system-ui, "Segoe UI Emoji", sans-serif`;
    ctx.fillText(info?.emoji ?? '👤', sx, sy - bh * 0.62);
    ctx.restore();

    if (info?.name) {
      const label = info.name;
      ctx.save();
      ctx.font = `700 ${Math.max(11, Math.round(s * 0.11))}px "Baloo 2", system-ui, sans-serif`;
      const tw = ctx.measureText(label).width;
      const ty = sy - bh - Math.max(12, s * 0.09);
      const ph = Math.max(16, s * 0.15);
      ctx.fillStyle = 'rgba(11, 28, 51, 0.72)';
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2 - 8, ty - ph / 2, tw + 16, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = '#F5EBE0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, ty + 1);
      ctx.restore();
    }
  }

  private drawFalling(
    ctx: CanvasRenderingContext2D,
    p: SplavFramePlayer,
    s: number
  ): void {
    if (p.ot < 0 || p.ot > FALL_MS) return;
    const info = this.roster[p.id];
    const { sx, sy } = this.screen(p.x, p.y, s);
    const t = p.ot / 1000;
    const w = SPLAV_PLAYER_RADIUS * 2 * s;
    const h = w * 1.65;

    // Splash where they hit the water.
    if (p.ot < 500) {
      const k = p.ot / 500;
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.strokeStyle = '#92bfe0';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * (0.6 + k * 2.2), w * (0.6 + k * 2.2) * TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.ot / FALL_MS);
    ctx.translate(sx, sy + 0.5 * 2400 * t * t);
    ctx.rotate(t * 2.4);
    this.capsule(ctx, 0, 0, w, h, info?.color ?? '#888888');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(w * 0.62)}px system-ui, "Segoe UI Emoji", sans-serif`;
    ctx.fillText('😵', 0, -h * 0.62);
    ctx.restore();
  }

  /** A standing capsule whose bottom sits on (x, y). */
  private capsule(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ): void {
    const g = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
    g.addColorStop(0, color);
    g.addColorStop(1, shade(color, -0.35));
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, w / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(11, 28, 51, 0.55)';
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.stroke();
    ctx.restore();
  }
}

/** Darken (or lighten) a #rrggbb by a factor — capsules need a shaded side. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
