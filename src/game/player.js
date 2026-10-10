
import {
  PLAYER_X,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  SUPER_JUMP_VELOCITY,
} from "./constants.js";

import { groundY, platforms, platformY } from "./world.js";

// Hamster sprite sheets (files in /public are served from the site root)
const HAMSTER_DIR = "/assets/hamster";

// Sprite animation code ported from Thaira's player.js (thaira branch)
export class Player {
  constructor() {
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;

    // Load hamster sprites
    this.sprites = {
      idle: new Image(),
      run: new Image(),
      jump: new Image(),
      hit: new Image(),
      death: new Image(),
    };

    this.sprites.idle.src = encodeURI(`${HAMSTER_DIR}/MR Cookies_Idle_48x48.png`);
    this.sprites.run.src = encodeURI(`${HAMSTER_DIR}/MR Cookies_Running_48x48.png`);
    this.sprites.jump.src = encodeURI(`${HAMSTER_DIR}/MR Cookies_Jump_48x48.png`);
    this.sprites.hit.src = encodeURI(`${HAMSTER_DIR}/MR Cookies_Hit_48x48.png`);
    this.sprites.death.src = encodeURI(`${HAMSTER_DIR}/MR Cookies_Death_48x48.png`);

    // Animation configuration
    this.animations = {
      idle: { frames: 7, columns: 7, fps: 7 },
      run: { frames: 7, columns: 7, fps: 12 },
      jump: { frames: 6, columns: 3, fps: 10 },
      hit: { frames: 3, columns: 3, fps: 10 },
      death: { frames: 11, columns: 11, fps: 12 },
    };

    this.frameWidth = 48;
    this.frameHeight = 48;

    // Sprite appearance (independent of collision box)
    this.drawWidth = 120;
    this.drawHeight = 120;

    this.reset();
  }

  // The part of the hamster that spikes can hit. The sprite has empty space
  // around it, so the visible hamster only fills about x+2 .. x+40 of the
  // 55px-wide box. This sits just inside the visible body, so a hit only
  // counts once the hamster really touches the spike.
  get hurtbox() {
    return { x: this.x + 4, y: this.y, width: 34, height: this.height };
  }

  // Ground height under the middle of the hamster
  groundBelow() {
    return groundY(this.x + this.width / 2);
  }

  playHit() {
    if (this.actionAnimation === "death") return;

    this.actionAnimation = "hit";
    this.actionAnimationFinished = false;
    this.setAnimation("hit");
  }

  playDeath() {
    this.actionAnimation = "death";
    this.actionAnimationFinished = false;
    this.setAnimation("death");
  }

  playHit() {
    if (this.actionAnimation === "death") return;

    this.actionAnimation = "hit";
    this.actionAnimationFinished = false;
    this.setAnimation("hit");
    }

    playDeath() {
    this.actionAnimation = "death";
    this.actionAnimationFinished = false;
    this.setAnimation("death");
    }

  jump() {
    // Prevent jumping again while in the air or during hit/death
    if (!this.isGrounded || this.actionAnimation) return;

    this.velocityY = JUMP_VELOCITY;
    this.isGrounded = false;
    this.platform = null;

    // Start jump animation immediately
    this.setAnimation("jump");
  }

  // Blue gem: bounce straight up like a spring, high enough to reach the
  // floating blocks. Happens on touch, so it works even mid-air or mid-hit.
  launch() {
    this.velocityY = SUPER_JUMP_VELOCITY;
    this.isGrounded = false;
    this.platform = null;
    this.setAnimation("jump");
  }

  // worldX = where the hamster is in the level (the game works this out from
  // how far it has run, so it stays at a fixed screen x while the camera scrolls)
  update(dt, worldX) {
    this.x = worldX;
    const centerX = this.x + this.width / 2;

    if (this.isGrounded) {
      if (this.platform) {
        // Standing on a platform: follow its top edge
        const top = platformY(this.platform, centerX);

        if (top === null) {
          // Ran off the end of the platform: start falling
          this.platform = null;
          this.isGrounded = false;
          this.velocityY = 0;
        } else {
          this.y = top - this.height;
          return;
        }
      } else {
        // On the ground: ride the hills by snapping feet to the ground line
        this.y = this.groundBelow() - this.height;
        return;
      }
    }

    // In the air: apply gravity
    const feetBefore = this.y + this.height;
    this.velocityY += GRAVITY * dt;
    this.y += this.velocityY * dt;
    const feetAfter = this.y + this.height;

    // Landed on a platform? Only when falling, and only if the feet were above
    // its top last frame (so you can jump up through a platform from below)
    if (this.velocityY > 0) {
      for (const platform of platforms) {
        const top = platformY(platform, centerX);
        if (top !== null && feetBefore <= top + 4 && feetAfter >= top) {
          this.y = top - this.height;
          this.velocityY = 0;
          this.isGrounded = true;
          this.platform = platform;
          return;
        }
      }
    }

    // Landed back on the ground?
    if (feetAfter >= this.groundBelow()) {
      this.y = this.groundBelow() - this.height;
      this.velocityY = 0;
      this.isGrounded = true;
    }
  }

  setAnimation(name) {
    if (this.animation === name) return;

    this.animation = name;
    this.frame = 0;
    this.animationTimer = 0;
  }

  updateAnimation(dt, isRunning) {
    // Action animations override normal movement animations
    if (this.actionAnimation) {
      this.setAnimation(this.actionAnimation);
    } else if (!this.isGrounded) {
      this.setAnimation("jump");
    } else if (isRunning) {
      this.setAnimation("run");
    } else {
      this.setAnimation("idle");
    }

    const config = this.animations[this.animation];

    // Freeze on the last frame of the death animation
    if (this.actionAnimation === "death" && this.actionAnimationFinished) {
      return;
    }

    this.animationTimer += dt;
    const frameDuration = 1 / config.fps;

    while (this.animationTimer >= frameDuration) {
      this.animationTimer -= frameDuration;

      if (this.actionAnimation) {
        if (this.frame < config.frames - 1) {
          this.frame++;
        } else {
          this.actionAnimationFinished = true;

          if (this.actionAnimation === "hit") {
            this.actionAnimation = null;
          }

          break;
        }
      } else if (this.animation === "jump") {
        this.frame = Math.min(this.frame + 1, config.frames - 1);
      } else {
        this.frame = (this.frame + 1) % config.frames;
      }
    }
  }

  // Drawn in world coordinates (inside the camera translate)
  draw(ctx) {
    const sprite = this.sprites[this.animation];

    if (!sprite.complete || sprite.naturalWidth === 0) {
      // Placeholder while sprites load
      ctx.fillStyle = "#D9A066";
      ctx.fillRect(this.x, this.y, this.width, this.height);
      return;
    }

    const config = this.animations[this.animation];

    // Find frame position in sprite sheet
    const column = this.frame % config.columns;
    const row = Math.floor(this.frame / config.columns);

    const sourceX = column * this.frameWidth;
    const sourceY = row * this.frameHeight;

    // Center sprite on hitbox and align feet to ground
    const drawX = Math.round(this.x + (this.width - this.drawWidth) / 2);

    // Adjust visual position without affecting collision
    const SPRITE_Y_OFFSET = 11;

    const drawY = Math.round(this.y + this.height - this.drawHeight + SPRITE_Y_OFFSET);

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
      sprite,
      sourceX,
      sourceY,
      this.frameWidth,
      this.frameHeight,
      drawX,
      drawY,
      this.drawWidth,
      this.drawHeight
    );
  }

  reset() {
    this.x = PLAYER_X; // world x (camera starts at 0)
    this.y = this.groundBelow() - this.height;
    this.velocityY = 0;
    this.isGrounded = true;
    this.platform = null; // the platform being stood on, or null for the ground

    this.animation = "idle";
    this.frame = 0;
    this.animationTimer = 0;
    this.actionAnimation = null;
    this.actionAnimationFinished = false;
  }
}
