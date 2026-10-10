import { Obstacle } from "./obstacles.js";

const MIN_SPAWN_TIME = 1.2; // seconds
const MAX_SPAWN_TIME = 2.2; // seconds
const STARTING_LIVES = 3;

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
  constructor(canvasWidth) {
    this.canvasWidth = canvasWidth;
    this.obstacles = [];
    this.lives = STARTING_LIVES;
    this.spawnTimer = this.nextSpawnTime();
  }

  nextSpawnTime() {
    return MIN_SPAWN_TIME + Math.random() * (MAX_SPAWN_TIME - MIN_SPAWN_TIME);
  }

  get isGameOver() {
    return this.lives <= 0;
  }

  update(dt, player) {
    if (this.isGameOver) return;

    // Spawn new obstacles just past the right edge
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.obstacles.push(new Obstacle(this.canvasWidth));
      this.spawnTimer = this.nextSpawnTime();
    }

    for (const obstacle of this.obstacles) {
      obstacle.update(dt);

      // Lose one life per obstacle hit
      if (!obstacle.hasHit && isColliding(player, obstacle)) {
        obstacle.hasHit = true;
        this.lives -= 1;
      }
    }

    // Remove obstacles that have left the screen
    this.obstacles = this.obstacles.filter((o) => !o.isOffScreen());
  }

  draw(ctx) {
    for (const obstacle of this.obstacles) {
      obstacle.draw(ctx);
    }
  }

  reset() {
    this.obstacles = [];
    this.lives = STARTING_LIVES;
    this.spawnTimer = this.nextSpawnTime();
  }
}