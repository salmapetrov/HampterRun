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

// ---- Music (files in /public are served from the site root) ----
const BATTLE_MUSIC = "/assets/sounds/Jeremy Blake - Powerup!.mp3";
const MENU_MUSIC = "/assets/sounds/AdhesiveWombat - Night Shade.mp3";
const GAME_MUSIC = "/assets/sounds/8 Bit Epic GameBoy! Fantasy Adventure Chiptune Game Music by HeatleyBros.mp3";

// ---- Button sounds ----
const HOVER_SOUND = "/assets/sounds/ui/Buttons/hover_soft_01.wav";
const CLICK_SOUND = "/assets/sounds/ui/Buttons/boop_up_01.wav";

// ---- Game event sounds ----
const GAMEOVER_SOUND = "/assets/sounds/gameover.mp3"; // the game over screen appears
const ENEMY_SOUND = "/assets/sounds/enemydetected.mp3"; // touching a sad hampter
const WIN_SOUND = "/assets/sounds/win.mp3";
const GEM_SOUND = "/assets/sounds/powerup.wav"; // picking up a gem / boost
const HIT_SOUND = "/assets/sounds/collide.wav"; // hitting a spike

// Mute switch for the music only (button sounds always play)
const audioState = { muted: false };

// Sound effects go through the Web Audio API so they can be played louder than a
// normal audio element allows (its volume tops out at 1). Each sound is loaded
// once, then every play is a fresh copy, so quick repeats overlap.
const SFX_GAIN = 1.8; // 1 = original loudness, higher = louder (too high can distort)
const ENEMY_GAIN = 0.7; // the "enemy detected" sound is quieter than the rest (lower = quieter)
const GAMEOVER_GAIN = 1; // the game over sound (lower = quieter)
let sfxContext = null;
const sfxBuffers = {}; // src -> decoded audio (or a promise while it loads)

function getSfxContext() {
  if (!sfxContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) sfxContext = new Ctx();
  }
  return sfxContext;
}

// Loads and decodes a sound ahead of time so the first play isn't silent
function preloadSound(src) {
  const ctx = getSfxContext();
  if (!ctx || sfxBuffers[src]) return;

  sfxBuffers[src] = fetch(encodeURI(src))
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      sfxBuffers[src] = buffer;
    })
    .catch((error) => {
      console.warn("Sound could not load:", src, error.message);
      delete sfxBuffers[src];
    });
}

function playSound(src, gain = SFX_GAIN) {
  const ctx = getSfxContext();
  if (!ctx) return;

  // Browsers keep audio paused until the player has clicked or pressed a key
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const buffer = sfxBuffers[src];
  if (!(buffer instanceof AudioBuffer)) {
    preloadSound(src); // not ready yet: skip this one, it's ready next time
    return;
  }

  const source = ctx.createBufferSource();
  const volume = ctx.createGain();
  source.buffer = buffer;
  volume.gain.value = gain;
  source.connect(volume);
  volume.connect(ctx.destination);
  source.start();
}

// Seconds the screen glows blue after touching a gem (just a visual effect)
const GEM_GLOW_TIME = 1;

// Seconds the sad hampter spends turning evil before the battle starts
const TRANSFORM_TIME = 1.2;

// Pixel wipe into the battle: black blocks fill the screen until it is fully black
const WIPE_TIME = 1; // seconds
const WIPE_BLOCK = 20; // size of each black pixel block, in canvas pixels
const REVEAL_TIME = 0.6; // seconds for the black blocks to clear off the battle scene

// ---- Button assets (files in /public are served from the site root) ----
const BUTTON_DIR = "/assets/menu/Buttons";
const TITLE_IMAGE = "/assets/backgrounds/title.png";
const GAME_OVER_IMAGE = "/assets/backgrounds/gameOver.png";
const VICTORY_IMAGE = "/assets/backgrounds/hamptervictory.png";
const INSTRUCTIONS_IMAGE = "/assets/backgrounds/instructions.png";
const CREDITS_IMAGE = "/assets/backgrounds/hampter-credits.png";
const MENU_BACKGROUND_IMAGE = "/assets/backgrounds/background4.png";

// Home icon: top left on the instructions and credits screens and while playing
const ICON_DIR = "/assets/menu/Icons";
const HOME_STATIC = `${ICON_DIR}/Static/Blue/Blue (28).png`;
const HOME_ANIM_DIR = `${ICON_DIR}/Animated/Blue/Blue (28)`;
const HOME_ANIM_PREFIX = "Blue (28)"; // frames are named <prefix>0.png, <prefix>1.png, ...
const HOME_ICON_WIDTH = 56;
const HOME_ICON_MARGIN = 20;

// Sound toggle sits just left of the home icon.
// Blue (36) = sound is on, Blue (37) = muted. It shows the current state.
const SOUND_ON_STATIC = `${ICON_DIR}/Static/Blue/Blue (36).png`;
const MUTED_STATIC = `${ICON_DIR}/Static/Blue/Blue (37).png`;
const SOUND_ICON_GAP = 10;

// The home and sound icons sit in the top left corner, this far from the edges
const TOP_ICON_MARGIN = 8;

// The lives counter is drawn by hud.js in the top left; this shifts it right (in canvas
// pixels) so it lands near the top center. Raise or lower this to nudge it.
const LIVES_SHIFT_X = 300;
const MAX_FRAMES = 60;
const ANIM_FPS = 12;

// Buttons shrink to this fraction of their size while the mouse is over them
const HOVER_SCALE = 0.94;

// Win screen: Play sits left of the text in the victory box, Menu sits right of it.
// Tweak these (in canvas pixels, the canvas is 900x500) to nudge the buttons.
const WIN_BUTTON_WIDTH = 140;
const WIN_BUTTON_OFFSET = 205; // distance of each button's center from the screen center
const WIN_BUTTONS_CENTER_Y = 313; // vertical middle of the buttons

// Where the mouse is on the canvas (in canvas pixels), updated by the Game
const pointer = { x: 0, y: 0, inside: false };

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

    // Buttons without an animation folder just have no click animation
    if (!this.animDir) return;

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

  // Moves the button. Give either top or bottom: that edge stays where you put it
  // (bottom is kept even if the image finishes loading later).
  moveTo({ centerX, top, bottom }) {
    this.x = centerX - this.width / 2;

    if (bottom !== undefined) {
      this.bottom = bottom;
      this.y = bottom - this.height;
    } else {
      this.bottom = undefined;
      this.y = top;
    }
  }

  // Changes the width and keeps the image's proportions (call moveTo afterwards)
  resize(width) {
    this.width = width;

    if (this.image) {
      this.height = width * (this.image.naturalHeight / this.image.naturalWidth);
    }
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
    // Shrinks slightly (around its center) while the mouse is over it
    const hovered = pointer.inside && this.contains(pointer.x, pointer.y);
    const scale = hovered ? HOVER_SCALE : 1;
    const w = this.width * scale;
    const h = this.height * scale;
    const x = this.x + (this.width - w) / 2;
    const y = this.y + (this.height - h) / 2;

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
      ctx.drawImage(image, x, y, w, h);
      return;
    }

    // Fallback placeholder if the image hasn't loaded
    ctx.fillStyle = "#D9A066";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.label, x + w / 2, y + h / 2 + 11);
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
//   "menu" -> "credits" (Credits button) -> "menu" (Home / click / Enter)
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
    this.creditsButton = blueButton("Credits", {
      centerX: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 158,
      width: 200,
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
      // Top center: the home icon is the right one of the pair
      centerX: GAME_WIDTH / 2 + (HOME_ICON_WIDTH + SOUND_ICON_GAP) / 2,
      y: HOME_ICON_MARGIN,
      width: HOME_ICON_WIDTH,
    });

    // Sound on / muted icons (positioned by layoutIcons below)
    const soundIcon = {
      animDir: null,
      prefix: "",
      centerX: GAME_WIDTH / 2 - (HOME_ICON_WIDTH + SOUND_ICON_GAP) / 2,
      y: HOME_ICON_MARGIN,
      width: HOME_ICON_WIDTH,
    };
    this.soundOnButton = new MenuButton({
      ...soundIcon,
      label: "SOUND",
      staticFile: SOUND_ON_STATIC,
    });
    this.mutedButton = new MenuButton({
      ...soundIcon,
      label: "MUTED",
      staticFile: MUTED_STATIC,
    });

    this.layoutIcons();

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

    this.victoryImage = null;
    loadImage(VICTORY_IMAGE).then((img) => {
      this.victoryImage = img;
      if (!img) console.warn("Victory image not found:", VICTORY_IMAGE);
    });

    this.instructionsImage = null;
    this.instructionsShownAt = 0;
    loadImage(INSTRUCTIONS_IMAGE).then((img) => {
      this.instructionsImage = img;
      if (!img) {
        console.warn("Instructions image not found:", INSTRUCTIONS_IMAGE);
      }
    });

    this.creditsImage = null;
    this.creditsShownAt = 0;
    loadImage(CREDITS_IMAGE).then((img) => {
      this.creditsImage = img;
      if (!img) console.warn("Credits image not found:", CREDITS_IMAGE);
    });

    this.menuBackgroundImage = null;
    loadImage(MENU_BACKGROUND_IMAGE).then((img) => {
      this.menuBackgroundImage = img;
      if (!img) console.warn("Menu background not found:", MENU_BACKGROUND_IMAGE);
    });

    // Load the sound effects now so the first hover or click isn't silent
    for (const src of [
      HOVER_SOUND,
      CLICK_SOUND,
      GAMEOVER_SOUND,
      ENEMY_SOUND,
      WIN_SOUND,
      GEM_SOUND,
      HIT_SOUND,
    ]) {
      preloadSound(src);
    }

    // Battle music: loops while a battle is happening
    this.battleMusic = new Audio(encodeURI(BATTLE_MUSIC));
    this.battleMusic.loop = true;
    this.battleMusic.volume = 0.4; // 0 to 1

    // Menu music: plays on the menu, credits and instructions screens, stops when the game starts
    this.menuMusic = new Audio(encodeURI(MENU_MUSIC));
    this.menuMusic.loop = true;
    this.menuMusic.volume = 0.2; // 0 to 1

    // Game music: plays while running the level, pauses during battles
    this.gameMusic = new Audio(encodeURI(GAME_MUSIC));
    this.gameMusic.loop = true;
    this.gameMusic.volume = 0.2; // 0 to 1
    this.gameMusicWanted = false; // true while the level music should be playing
    this.musicRetry = 0; // seconds until the next "is it playing?" check

    // Browsers block sound until the player clicks or presses a key, so try now
    // and again on the first click or key press while on the menu or instructions
    this.startMenuMusic();
    const unlockMenuMusic = () => {
      const screen = this.state === "pressing" && this.pending
        ? this.pending.from
        : this.state;
      if (screen === "menu" || screen === "credits" || screen === "instructions") {
        this.startMenuMusic();
      }
    };
    window.addEventListener("pointerdown", unlockMenuMusic);
    window.addEventListener("keydown", unlockMenuMusic);

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
    // turning evil, "wipe" = black pixels cover the screen, "reveal" = black
    // pixels clear off the battle scene, "battle" = boss fight (see battle.js)
    this.scene = "run";
    this.sceneTime = 0;
    this.battle = null;
    this.battleEnemy = null; // the map object we're fighting
    this.battleResult = null; // "won" / "lost", kept while the screen wipes to black
    this.exitRevealLeft = 0; // seconds of black blocks still clearing off after a battle

    // Pixel wipe between the level and the battle
    this.wipeTime = 0;
    this.revealTime = 0;
    this.wipeCells = [];

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

      if (
        event.detail.action === "DODGE" &&
        this.scene === "battle" &&
        this.battle
      ) {
        this.battle.dodge();
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

    // Hover sound: plays once when the mouse moves onto a button
    this.hoveredButton = null;

    this.canvas.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;

      const over = this.visibleButtons().find((b) => b.contains(x, y)) || null;

      if (over && over !== this.hoveredButton) playSound(HOVER_SOUND);
      this.hoveredButton = over;
    });

    this.canvas.addEventListener("mouseleave", () => {
      pointer.inside = false;
      this.hoveredButton = null;
    });

    // Click the buttons
    this.canvas.addEventListener("click", (event) => {
      // Convert screen click to canvas coordinates
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

      // The home icon shows on the instructions, credits and gameplay screens
      // (not during the boss battle, which has its own UI)
      const homeVisible =
        (this.state === "instructions" ||
          this.state === "credits" ||
          this.state === "playing") &&
        this.scene !== "battle" &&
        this.scene !== "reveal" &&
        this.scene !== "exitWipe";

      if (homeVisible && this.homeButton.contains(x, y)) {
        this.press(this.homeButton, () => this.goToMenu());
      } else if (homeVisible && this.currentSoundButton().contains(x, y)) {
        this.toggleMute();
      } else if (this.state === "menu" && this.startButton.contains(x, y)) {
        this.beginStart();
      } else if (this.state === "menu" && this.creditsButton.contains(x, y)) {
        this.press(this.creditsButton, () => this.showCredits());
      } else if (this.state === "credits") {
        this.leaveCredits();
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

  // Places the home and sound icons in the top left corner (home first, then
  // the sound icon to its right). Used on the instructions screen and while playing.
  layoutIcons() {
    const w = HOME_ICON_WIDTH;

    this.homeButton.moveTo({
      centerX: TOP_ICON_MARGIN + w / 2,
      top: TOP_ICON_MARGIN,
    });
    for (const b of [this.soundOnButton, this.mutedButton]) {
      b.moveTo({
        centerX: TOP_ICON_MARGIN + w + SOUND_ICON_GAP + w / 2,
        top: TOP_ICON_MARGIN,
      });
    }
  }

  // Places the Play / Menu buttons for the end screens. On the win screen they sit
  // on the left and right of the text in the victory box; on game over they sit
  // side by side in the middle.
  layoutEndButtons(isWin) {
    const buttons = [this.playButton, this.menuButton];

    if (isWin) {
      for (const b of buttons) b.resize(WIN_BUTTON_WIDTH);

      this.playButton.moveTo({
        centerX: GAME_WIDTH / 2 - WIN_BUTTON_OFFSET,
        top: WIN_BUTTONS_CENTER_Y - this.playButton.height / 2,
      });
      this.menuButton.moveTo({
        centerX: GAME_WIDTH / 2 + WIN_BUTTON_OFFSET,
        top: WIN_BUTTONS_CENTER_Y - this.menuButton.height / 2,
      });
      return;
    }

    for (const b of buttons) b.resize(200);

    this.playButton.moveTo({ centerX: GAME_WIDTH / 2 - 120, top: GAME_HEIGHT / 2 + 20 });
    this.menuButton.moveTo({ centerX: GAME_WIDTH / 2 + 120, top: GAME_HEIGHT / 2 + 20 });
  }

  // Whichever sound icon matches the current state
  currentSoundButton() {
    return audioState.muted ? this.mutedButton : this.soundOnButton;
  }

  // Mutes or unmutes the music only (button sounds still play)
  toggleMute() {
    playSound(CLICK_SOUND);
    audioState.muted = !audioState.muted;

    for (const music of [this.menuMusic, this.gameMusic, this.battleMusic]) {
      if (music) music.muted = audioState.muted;
    }
  }

  // The buttons on screen right now (used for the hover sound)
  visibleButtons() {
    if (this.state === "menu") return [this.startButton];
    if (this.state === "instructions") {
      return [this.homeButton, this.currentSoundButton()];
    }
    if (this.isEndScreen()) return [this.playButton, this.menuButton];

    if (
      this.state === "playing" &&
      this.scene !== "battle" &&
      this.scene !== "reveal" &&
      this.scene !== "exitWipe"
    ) {
      return [this.homeButton, this.currentSoundButton()];
    }
    return [];
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

  startBattleMusic() {
    if (!this.battleMusic) return;
    this.battleMusic.currentTime = 0;
    this.battleMusic.play().catch(() => {});
  }

  stopBattleMusic() {
    if (!this.battleMusic) return;
    this.battleMusic.pause();
    this.battleMusic.currentTime = 0;
  }

  // Does nothing if the music is already playing, so it never restarts
  startMenuMusic() {
    if (!this.menuMusic || !this.menuMusic.paused) return;
    this.menuMusic.play().catch(() => {});
  }

  stopMenuMusic() {
    if (!this.menuMusic) return;
    this.menuMusic.pause();
    this.menuMusic.currentTime = 0;
  }

  // Starts or resumes the game music (does nothing if it's already playing)
  startGameMusic() {
    if (!this.gameMusic) return;
    this.gameMusicWanted = true;
    if (!this.gameMusic.paused) return;

    this.gameMusic.play().catch((error) => {
      console.warn("Game music could not play:", error.message);
    });
  }


  // Stops it and rewinds to the start
  stopGameMusic() {
    if (!this.gameMusic) return;
    this.gameMusicWanted = false;
    this.gameMusic.pause();
    this.gameMusic.currentTime = 0;
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
    this.battleResult = null;
    this.exitRevealLeft = 0;
    this.player.reset();
    this.obstacles.reset();
    this.stopBattleMusic();
    this.stopGameMusic();
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

    playSound(CLICK_SOUND);

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

  showCredits() {
    this.state = "credits";
    this.creditsShownAt = performance.now();
  }

  // Back to the title screen (ignores input for a moment, like the instructions)
  leaveCredits() {
    if (this.state !== "credits") return;
    if (performance.now() - this.creditsShownAt < 400) return;

    this.state = "menu";
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

  // Enter / Space: Start on the menu, back to the menu from credits, continue on instructions, Play on the game over / win screen
  pressMainButton() {
    if (this.state === "menu") {
      this.beginStart();
    } else if (this.state === "credits") {
      this.leaveCredits();
    } else if (this.state === "instructions") {
      this.leaveInstructions();
    } else if (this.isEndScreen()) {
      this.press(this.playButton, () => this.startGame());
    }
  }

  startGame() {
    this.stopMenuMusic();
    this.resetLevel();
    this.state = "playing";
    this.startGameMusic();

    // Let main.js know a round began (shows the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-start"));
  }

  goToMenu() {
    this.resetLevel();
    this.runSpeed = 0;
    this.state = "menu";
    this.startMenuMusic();

    // Let main.js know we're back at the menu (hides the camera panel)
    window.dispatchEvent(new CustomEvent("hampter-menu"));
  }

  // Space / webcam jump: starts or restarts the game, otherwise jumps
  jump() {
    if (
      this.state === "menu" ||
      this.state === "credits" ||
      this.state === "instructions" ||
      this.isEndScreen()
    ) {
      this.pressMainButton();
      return;
    }

    // No jumping while a hampter turns evil or during the battle
    if (this.state === "playing" && this.scene === "run" && this.exitRevealLeft <= 0) {
      // Remember take-off speed so the hamster keeps moving forward mid-air,
      // even if the webcam stops seeing "running" while you jump (Thaira's idea)
      if (this.player.isGrounded) this.jumpMomentum = this.runSpeed;

      this.player.jump();
    }
  }

  update(dt) {
    // Black blocks clearing off the level after a battle
    if (this.exitRevealLeft > 0) {
      this.exitRevealLeft = Math.max(0, this.exitRevealLeft - dt);
    }

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
        this.layoutEndButtons(false);
        playSound(GAMEOVER_SOUND, GAMEOVER_GAIN);

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
    if (this.scene === "wipe") {
      this.updateWipe(dt);
      return;
    }
    if (this.scene === "reveal") {
      this.updateReveal(dt);
      return;
    }
    if (this.scene === "exitWipe") {
      this.updateExitWipe(dt);
      return;
    }
    if (this.scene === "battle") {
      this.battle.update(dt);
      if (this.battle.result) this.beginExitWipe(this.battle.result);
      return;
    }

    // The level stays frozen while the black blocks clear off after a battle
    if (this.exitRevealLeft > 0) {
      this.player.updateAnimation(dt, false);
      return;
    }

    // Safety net: if the level music should be playing but isn't (for example the
    // browser refused to resume it after a battle), try again about once a second
    this.musicRetry -= dt;
    if (this.musicRetry <= 0) {
      this.musicRetry = 1;
      if (this.gameMusicWanted) this.startGameMusic();
    }

    this.updateRun(dt);

    // Update hamster animations (run when moving, idle when standing still)
    this.player.updateAnimation(dt, this.isRunning || this.keyboardRunning);

    if (this.obstacles.wasHit) {
      playSound(HIT_SOUND);

      if (this.obstacles.isGameOver) {
        this.player.playDeath();
        this.state = "dying";
        this.stopGameMusic();
      } else {
        this.player.playHit();
      }
    }

    // Made it to the end of the last background copy: show the win screen
    if (this.state === "playing" && this.distance >= this.maxDistance()) {
      this.state = "win";
      this.layoutEndButtons(true);
      playSound(WIN_SOUND);
      this.stopGameMusic();

      // Same as game over for main.js (hides the camera panel)
      window.dispatchEvent(new CustomEvent("hampter-gameover"));
    }
  }

  // A sad hampter was touched: it shakes as it turns evil, then the battle starts
  updateTransform(dt) {
    this.sceneTime += dt;
    this.player.updateAnimation(dt, false); // stand still (idle)

    if (this.sceneTime >= TRANSFORM_TIME) {
      this.scene = "wipe";
      this.wipeTime = 0;
      this.wipeCells = this.makeWipeCells();
      this.stopGameMusic(); // rewinds; the level music starts over after the battle
      this.startBattleMusic();
    }
  }

  // One random threshold (0 to 1) per block: the block turns black once the wipe passes it
  makeWipeCells() {
    const cols = Math.ceil(GAME_WIDTH / WIPE_BLOCK);
    const rows = Math.ceil(GAME_HEIGHT / WIPE_BLOCK);
    const cells = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cells.push({ x: col * WIPE_BLOCK, y: row * WIPE_BLOCK, t: Math.random() });
      }
    }
    return cells;
  }

  // Black blocks fill in until the screen is fully black, then the battle starts
  updateWipe(dt) {
    this.wipeTime += dt;
    this.player.updateAnimation(dt, false); // stand still (idle)

    if (this.wipeTime >= WIPE_TIME) {
      this.scene = "reveal";
      this.revealTime = 0;
      this.battle = new Battle(this.battleImages);
    }
  }

  // The battle is frozen while the black blocks clear off, then it begins
  updateReveal(dt) {
    this.revealTime += dt;

    if (this.revealTime >= REVEAL_TIME) {
      this.scene = "battle";
    }
  }

  // The wipe in reverse: the blocks that went black last clear first
  drawReveal() {
    const ctx = this.ctx;
    const remaining = 1 - Math.min(1, this.revealTime / REVEAL_TIME);

    ctx.fillStyle = "#000000";

    for (const cell of this.wipeCells) {
      if (cell.t <= remaining) ctx.fillRect(cell.x, cell.y, WIPE_BLOCK, WIPE_BLOCK);
    }
  }

  drawWipe() {
    const ctx = this.ctx;
    const progress = Math.min(1, this.wipeTime / WIPE_TIME);

    ctx.fillStyle = "#000000";

    if (progress >= 1) {
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      return;
    }

    for (const cell of this.wipeCells) {
      if (cell.t <= progress) ctx.fillRect(cell.x, cell.y, WIPE_BLOCK, WIPE_BLOCK);
    }
  }

// The battle just ended: black blocks fill the screen over the battle scene
  beginExitWipe(result) {
    this.battleResult = result;
    this.scene = "exitWipe";
    this.wipeTime = 0;
    this.wipeCells = this.makeWipeCells();
  }

  // When the screen is fully black, switch back to the level (endBattle) and
  // let the black blocks clear off it
  updateExitWipe(dt) {
    this.wipeTime += dt;

    if (this.wipeTime >= WIPE_TIME) {
      const result = this.battleResult;
      this.battleResult = null;

      this.endBattle(result);
      this.exitRevealLeft = REVEAL_TIME;
    }
  }

  // Same blocks as the wipe, cleared in reverse over the level after a battle
  drawExitReveal() {
    const ctx = this.ctx;
    const remaining = this.exitRevealLeft / REVEAL_TIME;

    ctx.fillStyle = "#000000";

    for (const cell of this.wipeCells) {
      if (cell.t <= remaining) ctx.fillRect(cell.x, cell.y, WIPE_BLOCK, WIPE_BLOCK);
    }
  }

  // Battle over. Won: the evil hampter is gone. Lost: lose a heart (game over
  // if it was the last one). Either way, back to running.
  endBattle(result) {
    this.stopBattleMusic();
    this.battleEnemy.state = "gone";
    this.battleEnemy = null;
    this.battle = null;
    this.scene = "run";

    if (result === "lost") {
      this.obstacles.lives = Math.max(0, this.obstacles.lives - 1);
      if (this.obstacles.isGameOver) {
        this.player.playDeath();
        this.state = "dying";
        this.stopGameMusic();
      } else {
        this.player.playHit();
      }
    }

    // Back to the level: the game music starts over from the beginning
    if (this.state === "playing") this.startGameMusic();
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
        playSound(GEM_SOUND);
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
        playSound(ENEMY_SOUND, ENEMY_GAIN);
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
    this.creditsButton.draw(ctx, this.animTimeFor(this.creditsButton));

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

  drawCredits() {
    const ctx = this.ctx;

    // The image itself is the #credits <img> in index.html, shown by main.js
    // on top of the canvas (same as the instructions)
    if (this.creditsImage) return;

    // Fallback text if the image hasn't loaded
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";

    ctx.font = "bold 48px sans-serif";
    ctx.fillText("CREDITS", GAME_WIDTH / 2, 120);

    ctx.font = "26px sans-serif";
    ctx.fillText("Cheryl Nguyen", GAME_WIDTH / 2, 200);
    ctx.fillText("Salma Petrov", GAME_WIDTH / 2, 245);
    ctx.fillText("Thaira Choudhury", GAME_WIDTH / 2, 290);
    ctx.fillText("Rhode Sanchez", GAME_WIDTH / 2, 335);

    ctx.textAlign = "left";
  }

  // Win screen: the victory image + Play / Menu buttons
  drawWin() {
    const ctx = this.ctx;

    if (this.victoryImage) {
      // Victory screen (900x500, drawn over the whole canvas)
      ctx.drawImage(this.victoryImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      // Fallback if the image hasn't loaded: darken the level and show text
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText("YOU MADE IT!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
      ctx.textAlign = "left";
    }

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

  // Background behind the title, credits and instructions screens (those images are see-through)
  drawMenuBackground() {
    const ctx = this.ctx;

    if (this.menuBackgroundImage) {
      // Stretched to fit the whole canvas
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

    if (screen === "credits") {
      this.drawMenuBackground();
      this.drawCredits();
      this.homeButton.draw(ctx, this.animTimeFor(this.homeButton));
      this.currentSoundButton().draw(ctx);
      return;
    }

    if (screen === "instructions") {
      this.drawMenuBackground();
      this.drawInstructions();
      this.homeButton.draw(ctx, this.animTimeFor(this.homeButton));
      this.currentSoundButton().draw(ctx);
      return;
    }

    // Boss battle has its own screen (no level, no hearts)
    if (
      screen === "playing" &&
      (this.scene === "battle" || this.scene === "reveal" || this.scene === "exitWipe")
    ) {
      this.battle.draw(ctx);
      if (this.scene === "reveal") this.drawReveal();
      if (this.scene === "exitWipe") this.drawWipe();
      return;
    }

    // ---- World: everything here scrolls with the camera ----
    ctx.save();
    // Round so pixel art lands on whole pixels (no blurry half-pixel edges)
    ctx.translate(-Math.round(this.scrollX), 0);
    this.drawWorld();
    this.obstacles.draw(ctx, this.spikeImages, this.showGroundDebug);
    const shake = this.scene === "transform" || this.scene === "wipe" ? 6 : 0;
    drawObjects(ctx, this.objects, this.objectImages, this.showGroundDebug, shake);
    this.player.draw(ctx);
    ctx.restore();

    // ---- Screen-space effects and HUD: fixed on screen ----
    if (this.gemGlowTime > 0) this.drawGemGlow();
    if (this.scene === "transform" || this.scene === "wipe") this.drawTransform();

    // Lives counter: shifted right so it sits at the top center
    ctx.save();
    ctx.translate(LIVES_SHIFT_X, 0);
    this.livesDisplay.draw(ctx, this.obstacles.lives);
    ctx.restore();

    if (screen === "playing") {
      this.homeButton.draw(ctx, this.animTimeFor(this.homeButton));
      this.currentSoundButton().draw(ctx);
    }

    if (this.showGroundDebug) {
      ctx.fillStyle = "#000000";
      ctx.font = "14px monospace";
      ctx.fillText(`scrollX: ${Math.round(this.scrollX)}`, 20, GAME_HEIGHT - 20);
    }

    // Black blocks clearing off the level after a battle
    if (this.exitRevealLeft > 0) this.drawExitReveal();

    // Black pixel wipe goes on top of everything in the level
    if (screen === "playing" && this.scene === "wipe") this.drawWipe();

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