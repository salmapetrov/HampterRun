
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

    this.y = GROUND_Y - this.height;
    this.velocityY = 0;
    this.isGrounded = true;

    // Load hamster sprites
    this.sprites = {
      idle: new Image(),
      run: new Image(),
      jump: new Image(),
      hit: new Image(),
      death: new Image(),
    };

    this.sprites.idle.src = "/assets/hamster/hamster-idle.png";
    this.sprites.run.src = "/assets/hamster/hamster-run.png";
    this.sprites.jump.src = "/assets/hamster/hamster-jump.png";
    this.sprites.hit.src = "/assets/hamster/hamster-hit.png";
    this.sprites.death.src = "/assets/hamster/hamster-death.png";

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

    this.animation = "idle";
    this.frame = 0;
    this.animationTimer = 0;
    this.actionAnimation = null;
    this.actionAnimationFinished = false;

    // Sprite appearance (independent of collision box)
    this.drawWidth = 120;
    this.drawHeight = 120;
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
    if (!this.isGrounded || this.actionAnimation) return;

    this.velocityY = JUMP_VELOCITY;
    this.isGrounded = false;

    // Start jump animation immediately
    this.setAnimation("jump");
  }

  update(dt) {
    if (this.isGrounded) return;

    this.velocityY += GRAVITY * dt;
    this.y += this.velocityY * dt;

    if (this.y + this.height >= GROUND_Y) {
      this.y = GROUND_Y - this.height;
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
    if (
        this.actionAnimation === "death" &&
        this.actionAnimationFinished
    ) {
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
        this.frame = Math.min(
            this.frame + 1,
            config.frames - 1
        );
        } else {
        this.frame = (this.frame + 1) % config.frames;
        }
    }
    }

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
    const drawX = this.x + (this.width - this.drawWidth) / 2;

    // Adjust visual position without affecting collision
    const SPRITE_Y_OFFSET = 11;

    const drawY = this.y + this.height - this.drawHeight + SPRITE_Y_OFFSET;

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
    this.y = GROUND_Y - this.height;
    this.velocityY = 0;
    this.isGrounded = true;

    this.setAnimation("idle");
    this.frame = 0;
    this.animationTimer = 0;
    this.actionAnimation = null;
    this.actionAnimationFinished = false;
  }
}
