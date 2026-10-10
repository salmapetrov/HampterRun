// ---- The level: background image + the ground path the hamster runs on ----

import { WORLD_WIDTH } from "./constants.js";

// Files in /public are served from the site root, so no "public" in the path
export const BACKGROUND_IMAGE = "/assets/backgrounds/background/background.png";

// Top edge of the grass along the bottom of background.png, as [x, y] points.
// Only the corners (where the slope changes) are listed; groundY() fills in
// everything in between. Floating platforms, trees, and bushes are ignored.
// Pattern: flat ground at y=477, 45° slopes, hill tops at y=431.
export const groundPoints = [
  [0, 477],
  [46, 477], [95, 431], [137, 431], [186, 477],     // hill 1
  [280, 477], [327, 431], [373, 431], [418, 477],   // hill 2
  [513, 477], [561, 431], [603, 431], [654, 477],   // hill 3
  [747, 477], [794, 431], [839, 431], [886, 477],   // hill 4
  [979, 477], [1028, 431], [1069, 431], [1120, 477], // hill 5
  [1212, 477], [1259, 431], [1305, 431], [1351, 477], // hill 6
  [1446, 477], [1494, 431], [1537, 431], [1585, 477], // hill 7
  [1679, 477], [1726, 431], [1771, 431], [1818, 477], // hill 8
  [1919, 477],
];

// The floating blocks in the sky, traced the same way as the ground.
// Each platform is its own list of [x, y] points along its top edge.
// They're "one-way": the hamster jumps up through them and lands on top.
// Decorations (bush, rocks, frog, squirrel, fences) are not solid.
export const platforms = [
  // A: far left, low part then a ramp up to a log
  [[0, 212], [77, 212], [110, 175], [143, 175], [145, 165], [273, 165], [275, 175], [325, 175]],
  // B: block with the bush
  [[383, 210], [523, 210]],
  // C: block with the frog
  [[585, 232], [723, 232]],
  // D: hexagon with the rock
  [[770, 212], [790, 192], [855, 192], [878, 212]],
  // E: long path: ramp, bridge, blocks, ramp, bridge, block with the squirrel
  [[918, 213], [970, 213], [1023, 164], [1390, 164], [1425, 123], [1732, 123]],
  // F: hexagon at the far right
  [[1775, 167], [1803, 138], [1867, 138], [1895, 167]],
];

// Straight-line interpolation along a list of [x, y] points
function heightAlong(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];

    if (x <= x2) {
      const t = (x - x1) / (x2 - x1); // 0 at the left point, 1 at the right
      return y1 + (y2 - y1) * t;
    }
  }
  return points[points.length - 1][1];
}

// The level repeats every WORLD_WIDTH pixels, so world x = 2000 is the same
// spot in the background as x = 80. This turns any world x into 0..1919.
export function wrapX(x) {
  return ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
}

// Height of the ground at world x, found by drawing a straight line between
// the two groundPoints on either side of x.
export function groundY(worldX) {
  const x = wrapX(worldX);
  const first = groundPoints[0];
  const last = groundPoints[groundPoints.length - 1];

  // Past either end: keep the end height
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];

  return heightAlong(groundPoints, x);
}

// Height of a platform's top at world x, or null if x is off either end
export function platformY(platform, worldX) {
  const x = wrapX(worldX);
  if (x < platform[0][0] || x > platform[platform.length - 1][0]) return null;
  return heightAlong(platform, x);
}

// Debug: draws the ground path in red and the platforms in orange, with
// yellow dots on each point. Call this while the world transform is active
// so it scrolls with the level.
export function drawGroundDebug(ctx) {
  drawDebugLine(ctx, groundPoints, "red");
  for (const platform of platforms) {
    drawDebugLine(ctx, platform, "orange");
  }
}

function drawDebugLine(ctx, points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "yellow";
  for (const [x, y] of points) {
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
}
