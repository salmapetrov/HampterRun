import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
} from "./constants.js";

import { Player } from "./player.js";
import { ObstacleManager } from "./collision.js";

// ---- Start button assets (files in /public are served from the site root) ----
const BUTTON_DIR = "/assets/menu/Buttons";
const START_STATIC = `${BUTTON_DIR}/Static/Purple/StartPu.png`;
const START_ANIM_DIR = `${BUTTON_DIR}/Animated/Purple buttons/Start`;
const START_ANIM_PREFIX = "Start"; // frames are named Start0.png, Start1.png, ...
const MAX_FRAMES = 60;
const ANIM_FPS = 12;
const BUTTON_DRAW_WIDTH = 260;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = encodeURI(src); // handles the space in "Purple buttons"
  });
}

// Game states: "menu" -> "starting" -> "playing" -> "gameover" -> "playing" ...
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;

    this.player = new Player();
    this.obstacles = new ObstacleManager(GAME_WIDTH);

    this.state = "menu";

    // Start button area (resized once the image loads)
    this.startButton = {
      width: BUTTON_DRAW_WIDTH,
      height: 80,
      x: (GAME_WIDTH - BUTTON_DRAW_WIDTH) / 2,
      y: GAME_HEIGHT / 2,
    };

    this.startImage = null;
    this.startFrames = [];
    this.startAnimTime = 0;
    this.loadMenuAssets();

    this.running = false;
    this.lastTime = 0;

    this.loop = this.loop.bind(this);

    // Running state (set by the webcam gesture detection in main.js)
    this.isRunning = false;
    this.keyboardRunning = false; // testing without a webcam: hold Shift
    this.runSpeed = 0; // 0 = standing still, 1 = full speed
    this.jumpMomentum = 0;
    this.groundOffset = 0;

    window.addEventListener("hampter-running", (event) => {
      this.isRunning = event.detail.running;
    });

    window.addEventListener("hampter-action", (event) => {
      if (event.detail.action === "JUMP") this.jump();
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.keyboardRunning = true;
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.keyboardRunning = false;
      }
    });

    // Click the START button
    this.canvas.addEventListener("click", (event) => {
      if (this.state !== "menu") return;

      // Convert screen click to canvas coordinates
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

      const b = this.startButton;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        this.beginStart();
      }
    });

    // Enter also starts the game
    window.addEventListener("keydown", (event) => {
      if (event.code === "Enter") this.beginStart();
    });
  }

  async loadMenuAssets() {
    this.startImage = await loadImage(START_STATIC);

    if (this.startImage) {
      const b = this.startButton;
      b.width = BUTTON_DRAW_WIDTH;
      b.height =
        BUTTON_DRAW_WIDTH *
        (this.startImage.naturalHeight / this.startImage.naturalWidth);
      b.x = (GAME_WIDTH - b.width) / 2;
    } else {
      console.warn("Start button image not found:", START_STATIC);
    }

    // Load animation frames until one is missing
    for (let i = 0; i < MAX_FRAMES; i++) {
      const frame = await loadImage(
        `${START_ANIM_DIR}/${START_ANIM_PREFIX}${i}.png`
      );
      if (!frame) break;
      this.startFrames.push(frame);
    }

    if (this.startFrames.length === 0) {
      console.warn(
        "No Start animation frames found. Expected:",
        `${START_ANIM_DIR}/${START_ANIM_PREFIX}0.png`
      );
    }
  }

  // Starts the render loop (shows the menu first)
  start() {
    if (this.running) return;

    this.running = true;
    this.lastTime = performance.now();

    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
  }

  // Play the button animation, then start the game
  beginStart() {
    if (this.state !== "menu") return;

    if (this.startFrames.length === 0) {
      this.startGame();
      return;
    }

    this.state = "starting";
    this.startAnimTime = 0;
  }

  startGame() {
    this.player.reset();
    this.obstacles.reset();

    this.runSpeed = 0;
    this.jumpMomentum = 0;
    this.groundOffset = 0;

    this.state = "playing";
    }

  // Space / webcam jump: starts or restarts the game, otherwise jumps
  jump() {
    if (this.state === "menu") {
      this.beginStart();
      return;
    }

    if (this.state === "gameover") {
      this.startGame();
      return;
    }

    if (this.state === "playing" && this.player.isGrounded) {
    // Save current forward speed before jumping
    this.jumpMomentum = this.runSpeed;

    this.player.jump();
    }
  }

  update(dt) {
    if (this.state === "starting") {
      this.startAnimTime += dt;

      if (this.startAnimTime * ANIM_FPS >= this.startFrames.length) {
        this.startGame();
      }
      return;
    }

    if (this.state !== "playing") return;

    // Check if the player is running
    const isRunning = this.isRunning || this.keyboardRunning;

    // Update hamster physics (gravity, jumping, landing)
    this.player.update(dt);

    // Smoothly accelerate/decelerate based on running
    const target = isRunning ? 1 : 0;
    this.runSpeed += (target - this.runSpeed) * Math.min(1, dt * 8);

    // Preserve forward momentum while jumping
    if (!this.player.isGrounded) {
    this.runSpeed = Math.max(this.runSpeed, this.jumpMomentum);
    }

    // Update hamster sprite animations
    this.player.updateAnimation(dt, isRunning);

    // Scroll ground and obstacles using the updated speed
    this.groundOffset += 300 * dt * this.runSpeed;
    this.obstacles.update(dt * this.runSpeed, this.player);

    if (this.obstacles.isGameOver) {
      this.state = "gameover";
    }
  }

  drawBackground() {
    const ctx = this.ctx;

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Sky
    ctx.fillStyle = "#BFE8FF";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Ground
    ctx.fillStyle = "#9BCB77";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);

    // Ground outline
    ctx.fillStyle = "#5D9445";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 5);

    // Scrolling ground marks so you can see the world moving
    const spacing = 80;
    const offset = this.groundOffset % spacing;
    for (let x = -offset; x < GAME_WIDTH; x += spacing) {
      ctx.fillRect(x, GROUND_Y + 25, 30, 4);
    }
  }

  drawMenu() {
    const ctx = this.ctx;
    const b = this.startButton;

    ctx.textAlign = "center";

    // Title
    ctx.fillStyle = "#000000";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("HAMPTER RUN", GAME_WIDTH / 2, GAME_HEIGHT / 3);

    // Start button: animated frames while starting, static image otherwise
    let image = this.startImage;

    if (this.state === "starting" && this.startFrames.length > 0) {
      const index = Math.min(
        Math.floor(this.startAnimTime * ANIM_FPS),
        this.startFrames.length - 1
      );
      image = this.startFrames[index];
    }

    if (image) {
      ctx.imageSmoothingEnabled = false; // keeps pixel art crisp
      ctx.drawImage(image, b.x, b.y, b.width, b.height);
    } else {
      // Fallback placeholder if the image hasn't loaded
      ctx.fillStyle = "#D9A066";
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("START", GAME_WIDTH / 2, b.y + b.height / 2 + 12);
    }

    // Hint
    ctx.fillStyle = "#000000";
    ctx.font = "20px sans-serif";
    ctx.fillText(
      "Click START or press SPACE / ENTER",
      GAME_WIDTH / 2,
      b.y + b.height + 40
    );

    ctx.textAlign = "left";
  }

  drawGameOver() {
    const ctx = this.ctx;

    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2);

    ctx.font = "22px sans-serif";
    ctx.fillText("Press SPACE to play again", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    ctx.textAlign = "left";
  }

  draw() {
    this.drawBackground();

    if (this.state === "menu" || this.state === "starting") {
      this.drawMenu();
      return;
    }

    this.obstacles.draw(this.ctx);
    this.player.draw(this.ctx);

    if (this.state === "gameover") {
      this.drawGameOver();
    }
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