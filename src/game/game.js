
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
} from "./constants.js";

import { Player } from "./player.js";
import { ObstacleManager } from "./collision.js";
import { LivesDisplay } from "./hud.js";

// ---- Button assets (files in /public are served from the site root) ----
const BUTTON_DIR = "/assets/menu/Buttons";
const TITLE_IMAGE = "/assets/backgrounds/title.png";
const GAME_OVER_IMAGE = "/assets/backgrounds/gameOver.png";
const MAX_FRAMES = 60;
const ANIM_FPS = 12;

// A canvas button with a static image and an optional click animation
class MenuButton {
  constructor({ label, staticFile, animDir, prefix, centerX, y, width }) {
    this.label = label;
    this.staticFile = staticFile;
    this.animDir = animDir;
    this.prefix = prefix;

    this.width = width;
    this.height = 80;
    this.x = centerX - width / 2;
    this.y = y;

    this.image = null;
    this.frames = [];

    this.load();
  }

  async load() {
    this.image = await loadImage(this.staticFile);

    if (this.image) {
      this.height =
        this.width * (this.image.naturalHeight / this.image.naturalWidth);
    } else {
      console.warn("Button image not found:", this.staticFile);
    }

    // Load animation frames until one is missing
    for (let i = 0; i < MAX_FRAMES; i++) {
      const frame = await loadImage(
        `${this.animDir}/${this.prefix}${i}.png`
      );

      if (!frame) break;

      this.frames.push(frame);
    }

    if (this.frames.length === 0) {
      console.warn(
        "No animation frames found. Expected:",
        `${this.animDir}/${this.prefix}0.png`
      );
    }
  }

  // Duration of button click animation in seconds
  get duration() {
    return this.frames.length / ANIM_FPS;
  }

  contains(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  // animTime = null draws static image
  // A number plays the button animation
  draw(ctx, animTime = null) {
    let image = this.image;

    if (animTime !== null && this.frames.length > 0) {
      const index = Math.min(
        Math.floor(animTime * ANIM_FPS),
        this.frames.length - 1
      );

      image = this.frames[index];
    }

    if (image) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, this.x, this.y, this.width, this.height);
      return;
    }

    // Fallback placeholder
    ctx.fillStyle = "#D9A066";
    ctx.fillRect(this.x, this.y, this.width, this.height);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      this.label,
      this.x + this.width / 2,
      this.y + this.height / 2 + 11
    );

    ctx.textAlign = "left";
  }
}

// Blue button assets
const STATIC_SUFFIX = "B";

function blueButton(name, options) {
  return new MenuButton({
    label: name.toUpperCase(),
    staticFile: `${BUTTON_DIR}/Static/Blue/${name}${STATIC_SUFFIX}.png`,
    animDir: `${BUTTON_DIR}/Animated/Blue buttons/${name}`,
    prefix: name,
    ...options,
  });
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);

    img.src = encodeURI(src);
  });
}

// Game states:
// menu -> pressing -> playing -> gameover
// pressing = button animation before its action runs
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;

    this.player = new Player();
    this.obstacles = new ObstacleManager(GAME_WIDTH);
    this.livesDisplay = new LivesDisplay();

    this.state = "menu";

    // Menu buttons
    this.startButton = blueButton("Start", {
      centerX: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      width: 260,
    });

    this.playButton = blueButton("Play", {
      centerX: GAME_WIDTH / 2 - 120,
      y: GAME_HEIGHT / 2 + 20,
      width: 200,
    });

    this.menuButton = blueButton("Menu", {
      centerX: GAME_WIDTH / 2 + 120,
      y: GAME_HEIGHT / 2 + 20,
      width: 200,
    });

    // Button press animation
    this.pending = null;
    this.pressTime = 0;

    // Background images
    this.titleImage = null;

    loadImage(TITLE_IMAGE).then((img) => {
      this.titleImage = img;

      if (!img) {
        console.warn("Title image not found:", TITLE_IMAGE);
      }
    });

    this.gameOverImage = null;

    loadImage(GAME_OVER_IMAGE).then((img) => {
      this.gameOverImage = img;

      if (!img) {
        console.warn("Game over image not found:", GAME_OVER_IMAGE);
      }
    });

    // Main game loop
    this.running = false;
    this.lastTime = 0;
    this.loop = this.loop.bind(this);

    // Running state
    this.isRunning = false;
    this.keyboardRunning = false;

    // Forward movement
    this.runSpeed = 0;
    this.jumpMomentum = 0;
    this.groundOffset = 0;

    // Webcam running detection
    window.addEventListener("hampter-running", (event) => {
      this.isRunning = event.detail.running;
    });

    // Webcam jump detection
    window.addEventListener("hampter-action", (event) => {
      if (event.detail.action === "JUMP") {
        this.jump();
      }
    });

    // Keyboard controls
    window.addEventListener("keydown", (event) => {
      if (
        event.code === "ShiftLeft" ||
        event.code === "ShiftRight"
      ) {
        this.keyboardRunning = true;
      }

      // Enter presses the main button on the current screen
      if (event.code === "Enter") {
        this.pressMainButton();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (
        event.code === "ShiftLeft" ||
        event.code === "ShiftRight"
      ) {
        this.keyboardRunning = false;
      }
    });

    // Mouse controls
    this.canvas.addEventListener("click", (event) => {
      const rect = this.canvas.getBoundingClientRect();

      const x =
        (event.clientX - rect.left) *
        (this.canvas.width / rect.width);

      const y =
        (event.clientY - rect.top) *
        (this.canvas.height / rect.height);

      if (
        this.state === "menu" &&
        this.startButton.contains(x, y)
      ) {
        this.beginStart();
      } else if (this.state === "gameover") {
        if (this.playButton.contains(x, y)) {
          this.press(this.playButton, () => this.startGame());
        } else if (this.menuButton.contains(x, y)) {
          this.press(this.menuButton, () => this.goToMenu());
        }
      }
    });
  }

  // Start rendering
  start() {
    if (this.running) return;

    this.running = true;
    this.lastTime = performance.now();

    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
  }

  // Play button animation before performing its action
  press(button, action) {
    if (this.state === "pressing") return;

    if (button.frames.length === 0) {
      action();
      return;
    }

    this.pending = {
      button,
      action,
      from: this.state,
    };

    this.pressTime = 0;
    this.state = "pressing";
  }

  beginStart() {
    if (this.state !== "menu") return;

    this.press(this.startButton, () => this.startGame());
  }

  // Enter / Space on menu or game-over screen
  pressMainButton() {
    if (this.state === "menu") {
      this.beginStart();
    } else if (this.state === "gameover") {
      this.press(this.playButton, () => this.startGame());
    }
  }

  // Start a new game
  startGame() {
    this.player.reset();
    this.obstacles.reset();

    // Reset movement
    this.runSpeed = 0;
    this.jumpMomentum = 0;
    this.groundOffset = 0;

    this.keyboardRunning = false;

    this.pending = null;
    this.pressTime = 0;

    this.state = "playing";

    // Notify main.js to show the camera panel
    window.dispatchEvent(new CustomEvent("hampter-start"));
  }

  // Return to the main menu
  goToMenu() {
    this.player.reset();
    this.obstacles.reset();

    // Reset movement
    this.runSpeed = 0;
    this.jumpMomentum = 0;
    this.groundOffset = 0;

    this.isRunning = false;
    this.keyboardRunning = false;

    this.pending = null;
    this.pressTime = 0;

    this.state = "menu";

    // Notify main.js to hide the camera panel
    window.dispatchEvent(new CustomEvent("hampter-menu"));
  }

  // Space / webcam jump
  jump() {
    // Start or restart through the menu button system
    if (
        this.state === "menu" ||
        this.state === "gameover"
    ) {
        this.pressMainButton();
        return;
    }

    // Only jump while playing, grounded, and not in a hit animation
    if (
        this.state === "playing" &&
        this.player.isGrounded &&
        !this.player.actionAnimation
    ) {
        // Preserve forward momentum during the jump
        this.jumpMomentum = this.runSpeed;

        this.player.jump();
    }
}

  update(dt) {
    // Handle animated button presses
    if (this.state === "pressing") {
      if (!this.pending) return;

      this.pressTime += dt;

      if (this.pressTime >= this.pending.button.duration) {
        const { action } = this.pending;

        this.pending = null;
        action();
      }

      return;
    }

    if (this.state === "dying") {
        this.player.updateAnimation(dt, false);

        if (this.player.actionAnimationFinished) {
            this.state = "gameover";

            window.dispatchEvent(
            new CustomEvent("hampter-gameover")
            );
        }

        return;
    }

    // Only update runner gameplay while playing
    if (this.state !== "playing") return;

    const isRunning =
      this.isRunning || this.keyboardRunning;

    // Update jump physics
    this.player.update(dt);

    // Smooth running acceleration/deceleration
    const target = isRunning ? 1 : 0;

    this.runSpeed +=
      (target - this.runSpeed) * Math.min(1, dt * 8);

    // Preserve momentum while airborne
    if (!this.player.isGrounded) {
      this.runSpeed = Math.max(
        this.runSpeed,
        this.jumpMomentum
      );
    }

    // Update hamster animations
    this.player.updateAnimation(dt, isRunning);

    // Move the ground
    this.groundOffset += 300 * dt * this.runSpeed;

    // Move obstacles and detect collisions
    this.obstacles.update(
        dt * this.runSpeed,
        this.player
        );

        if (this.obstacles.wasHit) {
            if (this.obstacles.isGameOver) {
                this.player.playDeath();
                this.state = "dying";
            } else {
                this.player.playHit();
            }
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
    ctx.fillRect(
      0,
      GROUND_Y,
      GAME_WIDTH,
      GAME_HEIGHT - GROUND_Y
    );

    // Ground outline
    ctx.fillStyle = "#5D9445";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 5);

    // Scrolling ground marks
    const spacing = 80;
    const offset = this.groundOffset % spacing;

    for (let x = -offset; x < GAME_WIDTH; x += spacing) {
      ctx.fillRect(x, GROUND_Y + 25, 30, 4);
    }
  }

  // Return animation time for the currently pressed button
  animTimeFor(button) {
    if (
      this.state === "pressing" &&
      this.pending?.button === button
    ) {
      return this.pressTime;
    }

    return null;
  }

  drawMenu() {
    const ctx = this.ctx;
    const b = this.startButton;

    ctx.textAlign = "center";

    // Title screen background
    if (this.titleImage) {
      ctx.drawImage(
        this.titleImage,
        0,
        0,
        GAME_WIDTH,
        GAME_HEIGHT
      );
    } else {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 64px sans-serif";

      ctx.fillText(
        "HAMPTER RUN",
        GAME_WIDTH / 2,
        GAME_HEIGHT / 3
      );
    }

    // Start button
    b.draw(ctx, this.animTimeFor(b));

    // Hint text
    ctx.fillStyle = "#000000";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      "Click START or press SPACE / ENTER",
      GAME_WIDTH / 2,
      b.y + b.height + 40
    );

    ctx.textAlign = "left";
  }

  drawGameOver() {
    const ctx = this.ctx;

    if (this.gameOverImage) {
      ctx.drawImage(
        this.gameOverImage,
        0,
        0,
        GAME_WIDTH,
        GAME_HEIGHT
      );
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.font = "bold 56px sans-serif";

      ctx.fillText(
        "GAME OVER",
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 20
      );
    }

    // Game-over buttons
    this.playButton.draw(
      ctx,
      this.animTimeFor(this.playButton)
    );

    this.menuButton.draw(
      ctx,
      this.animTimeFor(this.menuButton)
    );

    // Fallback hint
    if (!this.gameOverImage) {
      ctx.fillStyle = "#000000";
      ctx.font = "22px sans-serif";
      ctx.textAlign = "center";

      ctx.fillText(
        "Press SPACE to play again",
        GAME_WIDTH / 2,
        this.playButton.y +
          this.playButton.height +
          40
      );
    }

    ctx.textAlign = "left";
  }

  draw() {
    this.drawBackground();

    // During button animation, show the previous screen
    const screen =
      this.state === "pressing"
        ? this.pending?.from
        : this.state;

    if (screen === "menu") {
      this.drawMenu();
      return;
    }

    // Gameplay
    this.obstacles.draw(this.ctx);
    this.player.draw(this.ctx);

    // Lives HUD
    this.livesDisplay.draw(
      this.ctx,
      this.obstacles.lives
    );

    // Game-over overlay
    if (screen === "gameover") {
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
