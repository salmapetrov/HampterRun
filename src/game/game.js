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
    this.label = label; // fallback text if the image is missing
    this.staticFile = staticFile;
    this.animDir = animDir;
    this.prefix = prefix; // frames are named <prefix>0.png, <prefix>1.png, ...

    this.width = width;
    this.height = 80; // replaced once the image loads
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
      const frame = await loadImage(`${this.animDir}/${this.prefix}${i}.png`);
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

  // How long the click animation lasts, in seconds
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

  // animTime = null draws the static image, a number plays the animation
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
      ctx.imageSmoothingEnabled = false; // keeps pixel art crisp
      ctx.drawImage(image, this.x, this.y, this.width, this.height);
      return;
    }

    // Fallback placeholder if the image hasn't loaded
    ctx.fillStyle = "#D9A066";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.label, this.x + this.width / 2, this.y + this.height / 2 + 11);
    ctx.textAlign = "left";
  }
}

// Blue buttons: static image + animation frames (Name0.png, Name1.png, ...)
const STATIC_SUFFIX = "B"; // static files are named like StartB.png
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
//   "menu" -> "playing" -> "gameover" -> "playing" (Play) or "menu" (Menu)
//   "pressing" = a button's click animation is playing, then its action runs
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

    // Buttons
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
    this.pending = null; // { button, action, from }
    this.pressTime = 0;

    this.titleImage = null;
    loadImage(TITLE_IMAGE).then((img) => {
      this.titleImage = img;
      if (!img) console.warn("Title image not found:", TITLE_IMAGE);
    });

    this.gameOverImage = null;
    loadImage(GAME_OVER_IMAGE).then((img) => {
      this.gameOverImage = img;
      if (!img) console.warn("Game over image not found:", GAME_OVER_IMAGE);
    });

    this.running = false;
    this.lastTime = 0;

    this.loop = this.loop.bind(this);

    // Running state (set by the webcam gesture detection in main.js)
    this.isRunning = false;
    this.keyboardRunning = false; // testing without a webcam: hold Shift
    this.runSpeed = 0; // 0 = standing still, 1 = full speed
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

      // Enter = same as the main button on the current screen
      if (event.code === "Enter") this.pressMainButton();
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.keyboardRunning = false;
      }
    });

    // Click the buttons
    this.canvas.addEventListener("click", (event) => {
      // Convert screen click to canvas coordinates
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

      if (this.state === "menu" && this.startButton.contains(x, y)) {
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

  // Play the button's click animation, then run its action
  press(button, action) {
    if (this.state === "pressing") return;

    if (button.frames.length === 0) {
      action();
      return;
    }

    this.pending = { button, action, from: this.state };
    this.pressTime = 0;
    this.state = "pressing";
  }

  beginStart() {
    if (this.state !== "menu") return;

    this.press(this.startButton, () => this.startGame());
  }

  // Enter / Space: Start on the menu, Play on the game over screen
  pressMainButton() {
    if (this.state === "menu") {
      this.beginStart();
    } else if (this.state === "gameover") {
      this.press(this.playButton, () => this.startGame());
    }
  }

  startGame() {
    this.player.reset();
    this.obstacles.reset();
    this.state = "playing";

    // Let main.js know a round began (shows the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-start"));
  }

  goToMenu() {
    this.player.reset();
    this.obstacles.reset();
    this.runSpeed = 0;
    this.state = "menu";

    // Let main.js know we're back at the menu (hides the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-menu"));
  }

  // Space / webcam jump: starts or restarts the game, otherwise jumps
  jump() {
    if (this.state === "menu" || this.state === "gameover") {
      this.pressMainButton();
      return;
    }

    if (this.state === "playing") {
      this.player.jump();
    }
  }

  update(dt) {
    if (this.state === "pressing") {
      this.pressTime += dt;

      if (this.pressTime >= this.pending.button.duration) {
        const { action } = this.pending;
        this.pending = null;
        action();
      }
      return;
    }

    if (this.state !== "playing") return;

    // Ease toward full speed when the user runs, and toward 0 when they stop
    const target = this.isRunning || this.keyboardRunning ? 1 : 0;
    this.runSpeed += (target - this.runSpeed) * Math.min(1, dt * 8);

    // Obstacles and ground only move while the user is running
    this.groundOffset += 300 * dt * this.runSpeed;

    this.player.update(dt);
    this.obstacles.update(dt * this.runSpeed, this.player);

    if (this.obstacles.isGameOver) {
      this.state = "gameover";

      // Let main.js know the round ended (hides the camera panel)
      window.dispatchEvent(new CustomEvent("hampter-gameover"));
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

  // Animation time for a button, or null if it isn't the one being pressed
  animTimeFor(button) {
    if (this.state === "pressing" && this.pending.button === button) {
      return this.pressTime;
    }
    return null;
  }

  drawMenu() {
    const ctx = this.ctx;
    const b = this.startButton;

    ctx.textAlign = "center";

    // Title image (900x500, drawn over the whole canvas)
    if (this.titleImage) {
      ctx.drawImage(this.titleImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      // Fallback text if the image hasn't loaded
      ctx.fillStyle = "#000000";
      ctx.font = "bold 64px sans-serif";
      ctx.fillText("HAMPTER RUN", GAME_WIDTH / 2, GAME_HEIGHT / 3);
    }

    b.draw(ctx, this.animTimeFor(b));

    // Hint
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
      // Game over screen (900x500, drawn over the whole canvas)
      ctx.drawImage(this.gameOverImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      // Fallback text if the image hasn't loaded
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
    }

    this.playButton.draw(ctx, this.animTimeFor(this.playButton));
    this.menuButton.draw(ctx, this.animTimeFor(this.menuButton));

    // Hint text only when the game over image isn't being used
    if (!this.gameOverImage) {
      ctx.fillStyle = "#000000";
      ctx.font = "22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Press SPACE to play again",
        GAME_WIDTH / 2,
        this.playButton.y + this.playButton.height + 40
      );
    }
    ctx.textAlign = "left";
  }

  draw() {
    this.drawBackground();

    // While a button animation plays, keep showing the screen it came from
    const screen = this.state === "pressing" ? this.pending.from : this.state;

    if (screen === "menu") {
      this.drawMenu();
      return;
    }

    this.obstacles.draw(this.ctx);
    this.player.draw(this.ctx);
    this.livesDisplay.draw(this.ctx, this.obstacles.lives);

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