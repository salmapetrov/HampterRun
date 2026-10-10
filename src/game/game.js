import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
} from "./constants.js";

import { Player } from "./player.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;

    this.player = new Player();

    this.running = false;
    this.lastTime = 0;

    this.loop = this.loop.bind(this);
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.lastTime = performance.now();

    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
  }

  jump() {
    this.player.jump();
  }

  update(dt) {
    this.player.update(dt);
  }

  draw() {
    const ctx = this.ctx;

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Background
    ctx.fillStyle = "#BFE8FF";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Ground
    ctx.fillStyle = "#9BCB77";
    ctx.fillRect(
      0,
      GROUND_Y,
      GAME_WIDTH,
      GAME_HEIGHT - GROUND_Y
    );

    // Ground outline
    ctx.fillStyle = "#5D9445";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 5);

    this.player.draw(ctx);
  }

  loop(timestamp) {
    if (!this.running) return;

    const dt = Math.min(
      (timestamp - this.lastTime) / 1000,
      0.05
    );

    this.lastTime = timestamp;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.loop);
  }
}