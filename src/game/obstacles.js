import { GROUND_Y } from "./constants.js";

const OBSTACLE_WIDTH = 40;
const OBSTACLE_HEIGHT = 40;
const OBSTACLE_SPEED = 300; // pixels per second

export class Obstacle {
  constructor(x) {
    this.x = x;
    this.width = OBSTACLE_WIDTH;
    this.height = OBSTACLE_HEIGHT;
    this.y = GROUND_Y - this.height;

    // Once an obstacle hits the player, it can't hit again
    this.hasHit = false;
  }

  update(dt) {
    this.x -= OBSTACLE_SPEED * dt;
  }

  isOffScreen() {
    return this.x + this.width < 0;
  }

  draw(ctx) {
    // Temporary obstacle placeholder
    ctx.fillStyle = "#000000";
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}