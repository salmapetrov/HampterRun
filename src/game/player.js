import {
  GROUND_Y,
  PLAYER_X,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
} from "./constants.js";

export class Player {
  constructor() {
    this.x = PLAYER_X;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;

    // Place the hamster directly on the ground
    this.y = GROUND_Y - this.height;

    this.velocityY = 0;
    this.isGrounded = true;
  }

  jump() {
    // Prevent jumping again while in the air
    if (!this.isGrounded) return;

    this.velocityY = JUMP_VELOCITY;
    this.isGrounded = false;
  }

  update(dt) {
    if (this.isGrounded) return;

    // Apply gravity
    this.velocityY += GRAVITY * dt;

    // Update vertical position
    this.y += this.velocityY * dt;

    // Check if hamster landed
    if (this.y + this.height >= GROUND_Y) {
      this.y = GROUND_Y - this.height;
      this.velocityY = 0;
      this.isGrounded = true;
    }
  }

  draw(ctx) {
    // Temporary hamster placeholder
    ctx.fillStyle = "#D9A066";

    ctx.fillRect(
      this.x,
      this.y,
      this.width,
      this.height
    );
  }

  reset() {
    this.y = GROUND_Y - this.height;
    this.velocityY = 0;
    this.isGrounded = true;
  }
}