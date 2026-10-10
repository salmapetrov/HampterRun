import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
  WORLD_WIDTH,
  MAX_LAPS,
  SCROLL_SPEED,
  PLAYER_X,
} from "./constants.js";

import { Player } from "./player.js";
import { ObstacleManager, isColliding } from "./collision.js";
import { LivesDisplay } from "./hud.js";
import { BACKGROUND_IMAGE, drawGroundDebug } from "./world.js";
import { SPIKE_IMAGES } from "./obstacles.js";
import { OBJECT_IMAGES, createObjects, hitbox, drawObjects } from "./objects.js";
import { Battle, BATTLE_IMAGES } from "./battle.js";

// Seconds the screen glows blue after touching a gem (just a visual effect)
const GEM_GLOW_TIME = 1;

// Seconds the sad hampter spends turning evil before the battle starts
const TRANSFORM_TIME = 1.2;

// ---- Button assets (files in /public are served from the site root) ----
const BUTTON_DIR = "/assets/menu/Buttons";
const TITLE_IMAGE = "/assets/backgrounds/title.png";
const GAME_OVER_IMAGE = "/assets/backgrounds/gameOver.png";
const INSTRUCTIONS_IMAGE = "/assets/backgrounds/instructions.png";
const MENU_BACKGROUND_IMAGE = "/assets/backgrounds/background4.png";

// Home icon (bottom right on the instructions and gameplay screens)
const ICON_DIR = "/assets/menu/Icons";
const HOME_STATIC = `${ICON_DIR}/Static/Blue/Blue (28).png`;
const HOME_ANIM_DIR = `${ICON_DIR}/Animated/Blue/Blue (28)`;
const HOME_ANIM_PREFIX = "Blue (28)"; // frames are named <prefix>0.png, <prefix>1.png, ...
const HOME_ICON_WIDTH = 70;
const HOME_ICON_MARGIN = 20;
const MAX_FRAMES = 60;
const ANIM_FPS = 12;

// A canvas button with a static image and an optional click animation
class MenuButton {
  constructor({ label, staticFile, animDir, prefix, centerX, y, width, bottom }) {
    this.label = label; // fallback text if the image is missing
    this.staticFile = staticFile;
    this.animDir = animDir;
    this.prefix = prefix; // frames are named <prefix>0.png, <prefix>1.png, ...

    this.width = width;
    this.height = 80; // replaced once the image loads
    this.x = centerX - width / 2;
    this.y = y;
    this.bottom = bottom; // optional: keeps the bottom edge here once the height is known

    this.image = null;
    this.frames = [];

    this.load();
  }

  async load() {
    this.image = await loadImage(this.staticFile);

    if (this.image) {
      this.height =
        this.width * (this.image.naturalHeight / this.image.naturalWidth);

      if (this.bottom !== undefined) {
        this.y = this.bottom - this.height;
      }
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
//   "menu" -> "instructions" -> "playing" -> "gameover" or "win" -> "playing" (Play) or "menu" (Menu)
//   "dying" = death animation playing before "gameover"
//   "win" = reached the end of the last background copy
//   "pressing" = a button's click animation is playing, then its action runs
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;

    this.player = new Player();
    this.obstacles = new ObstacleManager();
    this.livesDisplay = new LivesDisplay();

    this.state = "menu";

    // Buttons
    this.startButton = blueButton("Start", {
      centerX: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 60,
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
    this.homeButton = new MenuButton({
      label: "HOME",
      staticFile: HOME_STATIC,
      animDir: HOME_ANIM_DIR,
      prefix: HOME_ANIM_PREFIX,
      centerX: GAME_WIDTH - HOME_ICON_MARGIN - HOME_ICON_WIDTH / 2,
      y: GAME_HEIGHT - HOME_ICON_MARGIN - HOME_ICON_WIDTH,
      bottom: GAME_HEIGHT - HOME_ICON_MARGIN,
      width: HOME_ICON_WIDTH,
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

    this.instructionsImage = null;
    this.instructionsShownAt = 0;
    loadImage(INSTRUCTIONS_IMAGE).then((img) => {
      console.log("instructions image:", img);
      this.instructionsImage = img;
      if (!img) {
        console.warn("Instructions image not found:", INSTRUCTIONS_IMAGE);
      }
    });

    this.menuBackgroundImage = null;
    loadImage(MENU_BACKGROUND_IMAGE).then((img) => {
      this.menuBackgroundImage = img;
      if (!img) console.warn("Menu background not found:", MENU_BACKGROUND_IMAGE);
    });

    this.running = false;
    this.lastTime = 0;

    this.loop = this.loop.bind(this);

    // Running state (set by the webcam gesture detection in main.js)
    this.isRunning = false;
    this.keyboardRunning = false; // testing without a webcam: hold Shift
    this.runSpeed = 0; // 0 = standing still, 1 = full speed
    this.jumpMomentum = 0; // runSpeed at the moment of the last jump

    // How far the hamster has run, in pixels
    this.distance = 0;

    // Camera: how far the world has scrolled to the left, in pixels
    this.scrollX = 0;

    // Gems and sad hampters in the level (see objects.js).
    // Spikes live in this.obstacles.
    this.objects = createObjects(0);

    // While playing: "run" = normal level, "transform" = a sad hampter is
    // turning evil, "battle" = boss fight (see battle.js)
    this.scene = "run";
    this.sceneTime = 0;
    this.battle = null;
    this.battleEnemy = null; // the map object we're fighting

    // The level repeats: the highest copy ("lap") whose spikes/gems exist so far
    this.lastLap = 0;

    // Seconds of blue gem glow left (0 = no glow)
    this.gemGlowTime = 0;

    // Press D to show/hide the ground path debug line and hitboxes
    this.showGroundDebug = false;

    // Filled in by loadAssets() before the loop starts
    this.backgroundImage = null;
    this.spikeImages = {};
    this.objectImages = {}; // gem, sad, evil
    this.battleImages = {};

    window.addEventListener("hampter-running", (event) => {
      this.isRunning = event.detail.running;
    });

    window.addEventListener("hampter-action", (event) => {
      if (event.detail.action === "JUMP") this.jump();

      // Webcam slash gesture: attack in the battle. To hook up MediaPipe, send
      //   new CustomEvent("hampter-action", { detail: { action: "SLASH" } })
      if (event.detail.action === "SLASH" && this.scene === "battle" && this.battle) {
        this.battle.choose("slash");
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.keyboardRunning = true;
      }

      // Enter = same as the main button on the current screen
      if (event.code === "Enter") this.pressMainButton();

      if (event.code === "KeyD") this.showGroundDebug = !this.showGroundDebug;

      // Battle: 1 = slash
      if (this.scene === "battle" && this.battle) this.battle.handleKey(event.code);
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

      // The home icon shows on the instructions and gameplay screens
      // (not during the boss battle, which has its own UI)
      const homeVisible =
        (this.state === "instructions" || this.state === "playing") &&
        this.scene !== "battle";

      if (homeVisible && this.homeButton.contains(x, y)) {
        this.press(this.homeButton, () => this.goToMenu());
      } else if (this.state === "menu" && this.startButton.contains(x, y)) {
        this.beginStart();
      } else if (this.state === "instructions") {
        this.leaveInstructions();
      } else if (this.state === "playing" && this.scene === "battle") {
        this.battle.handleClick(x, y);
      } else if (this.isEndScreen()) {
        if (this.playButton.contains(x, y)) {
          this.press(this.playButton, () => this.startGame());
        } else if (this.menuButton.contains(x, y)) {
          this.press(this.menuButton, () => this.goToMenu());
        }
      }
    });
  }

  // Load the level images. main.js waits for this before calling start().
  async loadAssets() {
    this.backgroundImage = await loadImage(BACKGROUND_IMAGE);
    if (!this.backgroundImage) {
      console.warn("Background image not found:", BACKGROUND_IMAGE);
    }

    // Spike sprites
    for (const [name, src] of Object.entries(SPIKE_IMAGES)) {
      this.spikeImages[name] = await loadImage(src);
      if (!this.spikeImages[name]) console.warn("Spike image not found:", src);
    }

    // Gem and sad/evil hampter sprites
    for (const [name, src] of Object.entries(OBJECT_IMAGES)) {
      this.objectImages[name] = await loadImage(src);
      if (!this.objectImages[name]) console.warn("Object image not found:", src);
    }

    // Battle scene sprites
    for (const [name, src] of Object.entries(BATTLE_IMAGES)) {
      this.battleImages[name] = await loadImage(src);
      if (!this.battleImages[name]) console.warn("Battle image not found:", src);
    }
  }

  // Put the level back to the start: camera, hamster, spikes, gems, glow
  resetLevel() {
    this.distance = 0;
    this.scrollX = 0;
    this.gemGlowTime = 0;
    this.jumpMomentum = 0;
    this.objects = createObjects(0);
    this.lastLap = 0;
    this.scene = "run";
    this.battle = null;
    this.battleEnemy = null;
    this.player.reset();
    this.obstacles.reset();
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

    this.press(this.startButton, () => this.showInstructions());
  }

  showInstructions() {
    this.state = "instructions";
    this.instructionsShownAt = performance.now();
  }

  // Continue to the game (ignores input for a moment so a held key can't skip the screen)
  leaveInstructions() {
    if (this.state !== "instructions") return;
    if (performance.now() - this.instructionsShownAt < 400) return;

    this.startGame();
  }

  // Game over and win screens both show the Play / Menu buttons
  isEndScreen() {
    return this.state === "gameover" || this.state === "win";
  }

  // Enter / Space: Start on the menu, continue on instructions, Play on the game over / win screen
  pressMainButton() {
    if (this.state === "menu") {
      this.beginStart();
    } else if (this.state === "instructions") {
      this.leaveInstructions();
    } else if (this.isEndScreen()) {
      this.press(this.playButton, () => this.startGame());
    }
  }

  startGame() {
    this.resetLevel();
    this.state = "playing";

    // Let main.js know a round began (shows the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-start"));
  }

  goToMenu() {
    this.resetLevel();
    this.runSpeed = 0;
    this.state = "menu";

    // Let main.js know we're back at the menu (hides the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-menu"));
  }

  // Space / webcam jump: starts or restarts the game, otherwise jumps
  jump() {
    if (
      this.state === "menu" ||
      this.state === "instructions" ||
      this.isEndScreen()
    ) {
      this.pressMainButton();
      return;
    }

    // No jumping while a hampter turns evil or during the battle
    if (this.state === "playing" && this.scene === "run") {
      // Remember take-off speed so the hamster keeps moving forward mid-air,
      // even if the webcam stops seeing "running" while you jump (Thaira's idea)
      if (this.player.isGrounded) this.jumpMomentum = this.runSpeed;

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

    // Last life lost: let the death animation finish, then show game over
    // (hit/death flow from Thaira's game.js)
    if (this.state === "dying") {
      this.player.updateAnimation(dt, false);

      if (this.player.actionAnimationFinished) {
        this.state = "gameover";

        // Let main.js know the round ended (hides the camera panel)
        window.dispatchEvent(new CustomEvent("hampter-gameover"));
      }
      return;
    }

    if (this.state !== "playing") return;

    // Branch on the scene: the level is frozen during transform and battle
    if (this.scene === "transform") {
      this.updateTransform(dt);
      return;
    }
    if (this.scene === "battle") {
      this.battle.update(dt);
      if (this.battle.result) this.endBattle(this.battle.result);
      return;
    }

    this.updateRun(dt);

    // Update hamster animations (run when moving, idle when standing still)
    this.player.updateAnimation(dt, this.isRunning || this.keyboardRunning);

    if (this.obstacles.wasHit) {
      if (this.obstacles.isGameOver) {
        this.player.playDeath();
        this.state = "dying";
      } else {
        this.player.playHit();
      }
    }

    // Made it to the end of the last background copy: show the win screen
    if (this.state === "playing" && this.distance >= this.maxDistance()) {
      this.state = "win";

      // Same as game over for main.js (hides the camera panel)
      window.dispatchEvent(new CustomEvent("hampter-gameover"));
    }
  }

  // A sad hampter was touched: it shakes as it turns evil, then the battle starts
  updateTransform(dt) {
    this.sceneTime += dt;
    this.player.updateAnimation(dt, false); // stand still (idle)

    if (this.sceneTime >= TRANSFORM_TIME) {
      this.scene = "battle";
      this.battle = new Battle(this.battleImages);
    }
  }

  // Battle over. Won: the evil hampter is gone. Lost: lose a heart (game over
  // if it was the last one). Either way, back to running.
  endBattle(result) {
    this.battleEnemy.state = "gone";
    this.battleEnemy = null;
    this.battle = null;
    this.scene = "run";

    if (result === "lost") {
      this.obstacles.lives = Math.max(0, this.obstacles.lives - 1);
      if (this.obstacles.isGameOver) {
        this.player.playDeath();
        this.state = "dying";
      } else {
        this.player.playHit();
      }
    }
  }

  // The level is MAX_LAPS copies of the background. The hamster stops when
  // its right edge reaches the end of the last copy.
  maxDistance() {
    return MAX_LAPS * WORLD_WIDTH - PLAYER_X - this.player.width;
  }

  // One frame of play: move, scroll, spikes, and gems
  updateRun(dt) {
    // Ease toward full speed when the webcam (or Shift) sees running, toward 0 when not
    const target = this.isRunning || this.keyboardRunning ? 1 : 0;
    this.runSpeed += (target - this.runSpeed) * Math.min(1, dt * 8);

    // Preserve momentum while airborne
    if (!this.player.isGrounded) {
      this.runSpeed = Math.max(this.runSpeed, this.jumpMomentum);
    }

    // Count down the gem glow effect
    this.gemGlowTime = Math.max(0, this.gemGlowTime - dt);

    // Run forward, but not past the end of the last background copy
    this.distance = Math.min(
      this.distance + SCROLL_SPEED * this.runSpeed * dt,
      this.maxDistance()
    );

    // Camera follows the hamster until the last copy's right edge is on screen.
    // After that the camera stops and the hamster runs the rest of the way.
    this.scrollX = Math.min(this.distance, MAX_LAPS * WORLD_WIDTH - GAME_WIDTH);

    this.player.update(dt, this.distance + PLAYER_X);

    // When the next copy of the level comes into view, give it fresh
    // spikes and gems, and drop gems that scrolled off the left
    const rightEdgeLap = Math.min(
      Math.floor((this.scrollX + GAME_WIDTH) / WORLD_WIDTH),
      MAX_LAPS - 1
    );
    while (this.lastLap < rightEdgeLap) {
      this.lastLap++;
      this.obstacles.addLap(this.lastLap);
      this.objects.push(...createObjects(this.lastLap));
    }
    this.objects = this.objects.filter((o) => o.x + o.w >= this.scrollX);

    // Spikes: hits and lives (teammate's ObstacleManager)
    this.obstacles.update(dt, this.player, this.scrollX);

    // Gems: touching one launches the hamster up to the floating blocks.
    // The flight always moves forward at full speed (jumpMomentum = 1), so it
    // follows the same path through the gap however fast the player was running.
    for (const obj of this.objects) {
      if (obj.type !== "gem" || obj.state !== "ready") continue;
      if (isColliding(this.player, hitbox(obj))) {
        obj.state = "collected";
        this.player.launch();
        this.jumpMomentum = 1;
        this.gemGlowTime = GEM_GLOW_TIME;
      }
    }

    // Sad hampters: bumping into one turns it evil and starts the battle
    for (const obj of this.objects) {
      if (obj.type !== "sad" || obj.state !== "sad") continue;
      if (isColliding(this.player.hurtbox, hitbox(obj))) {
        obj.state = "evil";
        this.battleEnemy = obj;
        this.scene = "transform";
        this.sceneTime = 0;
        return;
      }
    }
  }

  // Draws the level in world coordinates. Call inside the camera translate.
  drawWorld() {
    const ctx = this.ctx;

    // The 1920px background repeats. Draw each copy that's on screen:
    // copy n sits at world x = n * WORLD_WIDTH (usually 1 or 2 are visible).
    const firstLap = Math.floor(this.scrollX / WORLD_WIDTH);
    const lastLap = Math.floor((this.scrollX + GAME_WIDTH) / WORLD_WIDTH);

    for (let lap = firstLap; lap <= lastLap; lap++) {
      const x = lap * WORLD_WIDTH;

      if (this.backgroundImage) {
        ctx.drawImage(this.backgroundImage, x, 0);
      } else {
        // Fallback sky if the image is missing
        ctx.fillStyle = "#BFE8FF";
        ctx.fillRect(x, 0, WORLD_WIDTH, GAME_HEIGHT);
      }

      if (this.showGroundDebug) {
        ctx.save();
        ctx.translate(x, 0);
        drawGroundDebug(ctx);
        ctx.restore();
      }
    }
  }

  // Sad hampter turning evil: pulsing red screen + warning text
  drawTransform() {
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(this.sceneTime * 18);

    ctx.fillStyle = `rgba(200, 0, 0, ${0.12 + 0.15 * pulse})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.textAlign = "center";
    ctx.font = "bold 44px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#000000";
    ctx.strokeText("HAMPTER TURNED EVIL!", GAME_WIDTH / 2, 120);
    ctx.fillStyle = "#FF3B3B";
    ctx.fillText("HAMPTER TURNED EVIL!", GAME_WIDTH / 2, 120);
    ctx.textAlign = "left";
  }

  // Gem launch: blue tint over the screen that fades out
  drawGemGlow() {
    const ctx = this.ctx;
    const strength = this.gemGlowTime / GEM_GLOW_TIME; // 1 -> 0 as it fades

    ctx.fillStyle = `rgba(60, 140, 255, ${0.25 * strength})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
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

    ctx.textAlign = "left";
  }

  drawInstructions() {
    const ctx = this.ctx;

    if (this.instructionsImage) {
      // Instructions screen (900x500, drawn over the whole canvas)
      ctx.drawImage(this.instructionsImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
      return;
    }

    // Fallback text if the image hasn't loaded
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";

    ctx.font = "bold 48px sans-serif";
    ctx.fillText("HOW TO PLAY", GAME_WIDTH / 2, 120);

    ctx.font = "26px sans-serif";
    ctx.fillText("Run in place to make the hamster run", GAME_WIDTH / 2, 200);
    ctx.fillText("Jump to hop over the blocks", GAME_WIDTH / 2, 245);
    ctx.fillText("You have 3 lives. Each block you hit costs one.", GAME_WIDTH / 2, 290);

    ctx.font = "22px sans-serif";
    ctx.fillText("Press SPACE or click to begin", GAME_WIDTH / 2, 380);

    ctx.textAlign = "left";
  }

  // Win screen: darken the level and show a message + Play / Menu buttons
  drawWin() {
    const ctx = this.ctx;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("YOU MADE IT!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    ctx.textAlign = "left";

    this.playButton.draw(ctx, this.animTimeFor(this.playButton));
    this.menuButton.draw(ctx, this.animTimeFor(this.menuButton));
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

  // Forest behind the title and instructions screens (those images are see-through)
  drawMenuBackground() {
    const ctx = this.ctx;

    if (this.menuBackgroundImage) {
      // Scale to the canvas height and show the left part, like the start of the level
      const img = this.menuBackgroundImage;
      const scale = GAME_HEIGHT / img.naturalHeight;
      ctx.drawImage(this.menuBackgroundImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
      return;
    }

    // Fallback sky and grass if the image is missing
    ctx.fillStyle = "#BFE8FF";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = "#9BCB77";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);

    ctx.fillStyle = "#5D9445";
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 5);
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false; // keeps pixel art crisp
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // While a button animation plays, keep showing the screen it came from
    const screen = this.state === "pressing" ? this.pending.from : this.state;

    if (screen === "menu") {
      this.drawMenuBackground();
      this.drawMenu();
      return;
    }

    if (screen === "instructions") {
      this.drawMenuBackground();
      this.drawInstructions();
      this.homeButton.draw(ctx, this.animTimeFor(this.homeButton));
      return;
    }

    // Boss battle has its own screen (no level, no hearts)
    if (screen === "playing" && this.scene === "battle") {
      this.battle.draw(ctx);
      return;
    }

    // ---- World: everything here scrolls with the camera ----
    ctx.save();
    // Round so pixel art lands on whole pixels (no blurry half-pixel edges)
    ctx.translate(-Math.round(this.scrollX), 0);
    this.drawWorld();
    this.obstacles.draw(ctx, this.spikeImages, this.showGroundDebug);
    const shake = this.scene === "transform" ? 6 : 0;
    drawObjects(ctx, this.objects, this.objectImages, this.showGroundDebug, shake);
    this.player.draw(ctx);
    ctx.restore();

    // ---- Screen-space effects and HUD: fixed on screen ----
    if (this.gemGlowTime > 0) this.drawGemGlow();
    if (this.scene === "transform") this.drawTransform();

    this.livesDisplay.draw(ctx, this.obstacles.lives);

    if (screen === "playing") {
      this.homeButton.draw(ctx, this.animTimeFor(this.homeButton));
    }

    if (this.showGroundDebug) {
      ctx.fillStyle = "#000000";
      ctx.font = "14px monospace";
      ctx.fillText(`scrollX: ${Math.round(this.scrollX)}`, 20, GAME_HEIGHT - 20);
    }

    if (screen === "gameover") {
      this.drawGameOver();
    } else if (screen === "win") {
      this.drawWin();
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