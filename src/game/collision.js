
import { Obstacle } from "./obstacles.js";

const MIN_SPAWN_TIME = 1.2;
const MAX_SPAWN_TIME = 2.2;
const STARTING_LIVES = 3;

const DAMAGE_COOLDOWN = 0.8;

// Axis-aligned bounding box collision
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

    // Collision event tracking
    this.wasHit = false;
    this.damageCooldown = 0;
  }

  nextSpawnTime() {
    return (
      MIN_SPAWN_TIME +
      Math.random() * (MAX_SPAWN_TIME - MIN_SPAWN_TIME)
    );
  }

  get isGameOver() {
    return this.lives <= 0;
  }

  update(dt, player) {
    // Reset hit flag every frame
    this.wasHit = false;

    if (this.isGameOver) return;

    // Decrease damage cooldown
    this.damageCooldown = Math.max(
      0,
      this.damageCooldown - dt
    );

    // Spawn obstacles
    this.spawnTimer -= dt;

    if (this.spawnTimer <= 0) {
      this.obstacles.push(
        new Obstacle(this.canvasWidth)
      );

      this.spawnTimer = this.nextSpawnTime();
    }

    // Update obstacles and detect collisions
    for (const obstacle of this.obstacles) {
      obstacle.update(dt);

      if (
        !obstacle.hasHit &&
        isColliding(player, obstacle) &&
        this.damageCooldown <= 0
      ) {
        obstacle.hasHit = true;

        this.lives = Math.max(
          0,
          this.lives - 1
        );

        this.wasHit = true;
        this.damageCooldown = DAMAGE_COOLDOWN;
      }
    }

    // Remove obstacles that left the screen
    this.obstacles = this.obstacles.filter(
      (obstacle) => !obstacle.isOffScreen()
    );
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

    this.wasHit = false;
    this.damageCooldown = 0;
  }
}
