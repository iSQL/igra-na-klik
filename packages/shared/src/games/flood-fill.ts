/**
 * Scanline flood fill on RGBA pixel buffer. Tolerance is per-channel
 * (absolute value, 0 = exact match). Mutates `data` in place.
 *
 * Returns true if any pixel was filled, false if the seed pixel already
 * matched the fill color (no-op).
 */
export function scanlineFloodFill(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  fill: [number, number, number],
  tolerance = 0
): boolean {
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return false;

  const startIdx = (sy * width + sx) * 4;
  const tR = data[startIdx];
  const tG = data[startIdx + 1];
  const tB = data[startIdx + 2];

  if (tR === fill[0] && tG === fill[1] && tB === fill[2]) return false;

  const matches =
    tolerance === 0
      ? (idx: number) =>
          data[idx] === tR && data[idx + 1] === tG && data[idx + 2] === tB
      : (idx: number) =>
          Math.abs(data[idx] - tR) <= tolerance &&
          Math.abs(data[idx + 1] - tG) <= tolerance &&
          Math.abs(data[idx + 2] - tB) <= tolerance;

  // Stack of (x, y) pairs (interleaved). Scanline pushes at most O(rows)
  // entries vs O(pixels) for 4-direction.
  const stack: number[] = [sx, sy];
  let touched = false;

  while (stack.length > 0) {
    const y = stack.pop()!;
    let x = stack.pop()!;

    // Walk left to find span start.
    while (x >= 0 && matches((y * width + x) * 4)) x--;
    x++;

    let spanAbove = false;
    let spanBelow = false;

    while (x < width && matches((y * width + x) * 4)) {
      const idx = (y * width + x) * 4;
      data[idx] = fill[0];
      data[idx + 1] = fill[1];
      data[idx + 2] = fill[2];
      data[idx + 3] = 255;
      touched = true;

      if (y > 0) {
        const aboveIdx = ((y - 1) * width + x) * 4;
        if (matches(aboveIdx)) {
          if (!spanAbove) {
            stack.push(x, y - 1);
            spanAbove = true;
          }
        } else if (spanAbove) {
          spanAbove = false;
        }
      }

      if (y < height - 1) {
        const belowIdx = ((y + 1) * width + x) * 4;
        if (matches(belowIdx)) {
          if (!spanBelow) {
            stack.push(x, y + 1);
            spanBelow = true;
          }
        } else if (spanBelow) {
          spanBelow = false;
        }
      }

      x++;
    }
  }

  return touched;
}

export function parseHexColor(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  if (m.length === 3) {
    return [
      parseInt(m[0] + m[0], 16),
      parseInt(m[1] + m[1], 16),
      parseInt(m[2] + m[2], 16),
    ];
  }
  if (m.length >= 6) {
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16),
    ];
  }
  return [0, 0, 0];
}
