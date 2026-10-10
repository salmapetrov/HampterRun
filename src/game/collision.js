import { Obstacle } from "./obstacles.js";
import { platforms, platformY } from "./world.js";
import { WORLD_WIDTH } from "./constants.js";

const STARTING_LIVES = 3;

// The long sky path (platform E in world.js)
const SKY_PATH = platforms[4];

// Where the spikes go: x = center of the spike in world coordinates,
// image = which sprite, surface = what it stands on (default: ground path).
// Keep them on FLAT stretches: on a narrow hilltop the hamster takes off from
// a rising slope and can't clear the spike.
const SPIKE_SPOTS = [
  // On the ground
  { x: 485, image: "spikes2" }, // flat ground after hill 2
  { x: 955, image: "spikes1" }, // flat ground after hill 4
  { x: 1375, image: "spikes1" }, // flat ground after hill 6
  // Up on the sky path
  { x: 1620, image: "spikes2", surface: SKY_PATH }, // high block, before the squirrel
];

// Axis-aligned bounding box check
export function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export class ObstacleManager {
  constructor() {
    this.reset();
  }

  get isGameOver() {
    return this.lives <= 0;
  }

  // Add the spikes for one copy of the level. lap 0 = the first background,
  // lap 1 = the next copy to its right, and so on.
  addLap(lap) {
    const offset = lap * WORLD_WIDTH;

    for (const s of SPIKE_SPOTS) {
      const x = s.x + offset;
      this.obstacles.push(
        s.surface
          ? new Obstacle(x, s.image, platformY(s.surface, x))
          : new Obstacle(x, s.image)
      );
    }
  }

  // scrollX = camera position; spikes that scrolled off the left are dropped
  update(dt, player, scrollX) {
    // True only on the frame the player gets hit
    this.wasHit = false;

    if (this.isGameOver) return;

    this.obstacles = this.obstacles.filter((o) => o.x + o.width >= scrollX);

    for (const obstacle of this.obstacles) {
      obstacle.update(dt);

      // Lose one life per obstacle hit
      // (player.hurtbox matches the visible hamster, see player.js)
      if (!obstacle.hasHit && isColliding(player.hurtbox, obstacle.hitbox)) {
        obstacle.hasHit = true;
        this.lives -= 1;
        this.wasHit = true;
      }
    }
  }

  // Drawn in world coordinates (inside the camera translate)
  draw(ctx, images, showHitboxes) {
    for (const obstacle of this.obstacles) {
      obstacle.draw(ctx, images, showHitboxes);
    }
  }

  reset() {
    this.obstacles = [];
    this.addLap(0);
    this.lives = STARTING_LIVES;
    this.wasHit = false;
  }
}
