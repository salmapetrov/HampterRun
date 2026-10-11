// ---- Boss battle: our hampter vs. hampter-evil, turn based ----
//
// Flow (this.phase):
//   "intro"  -> "ROUND 1" / "FIGHT!"
//   "enemy"  -> evil hampter shoots bullets at us; jump (webcam or Space) to dodge
//   "choose" -> our turn: punch at the camera (or key 1, or click) to attack
//   "attack" -> our hampter dashes in, attacks, dashes back
//   ...back to "enemy" until someone runs out of HP...
//   "won" / "lost" -> "K.O.!", then this.result is set and the game goes back
//                     to running

import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY
} from "./constants.js";

const HAMSTER_DIR = "/assets/hamster";

export const BATTLE_IMAGES = {
  idle: `${HAMSTER_DIR}/MR Cookies_Idle_48x48.png`,
  run: `${HAMSTER_DIR}/MR Cookies_Running_48x48.png`,
  hit: `${HAMSTER_DIR}/MR Cookies_Hit_48x48.png`,
  slash: `${HAMSTER_DIR}/MR Cookies_Attack02_48x48.png`,
  death: `${HAMSTER_DIR}/MR Cookies_Death_48x48.png`,
  evil: "/assets/hampter/hampter-evil.png",
  background: "/assets/backgrounds/battle.png",
};

const SHEETS = {
  idle: { frames: 7, fps: 7, loop: true },
  run: { frames: 7, fps: 14, loop: true },
  hit: { frames: 3, fps: 10 },
  slash: { frames: 6, fps: 12 },
  death: { frames: 11, fps: 12 },
};

// ---- Balance ----
const MAX_HP = 100;
const BULLETS_PER_TURN = 3;
const BULLET_DAMAGE = 5;
const BULLET_SPEED = 650;
const BULLET_GAP = 0.35;

// 25 damage = 4 landed punches to K.O. the evil hampter (5 with a miss)
const PUNCH_DAMAGE = 25;
const PUNCH_HIT_CHANCE = 0.9;

// Seconds the "jump to dodge" prompt shows before the first shot
// (longer the first time so there's time to read it)
const FIRST_WARN_TIME = 2.2;
const WARN_TIME = 0.9;

// ---- Layout (canvas is 900 x 500, same size as battle.png) ----
// Feet land on the two hex platforms in the background
const FLOOR_Y = 390;
const HAMSTER_SCALE = 5;
const HAMSTER_HOME_X = 110;
const HAMSTER_STRIKE_X = 390;
const DASH_TIME = 0.25;

const EVIL_W = 216;
const EVIL_H = 185;
const EVIL_X = GAME_WIDTH - 110 - EVIL_W;
const EVIL_Y = FLOOR_Y - EVIL_H;

const MUZZLE_X = EVIL_X + 50;
const MUZZLE_Y = EVIL_Y + 139;

// Where punches land (for the impact burst)
const IMPACT_X = EVIL_X + EVIL_W * 0.45;
const IMPACT_Y = EVIL_Y + EVIL_H * 0.45;

// ---- Look: warm wood / forest colors to match battle.png ----
const COLORS = {
  outline: "#2B1D12", // dark brown, every outline and text stroke
  panel: "rgba(43, 29, 18, 0.82)",
  cream: "#FFF4D6",
  gold: "#FFD23F",
  track: "#5A4632", // empty part of a health bar
  hpHigh: "#7BC043", // grass green
  hpMid: "#F4C430",
  hpLow: "#E04F2F",
  damage: "#E04F2F",
  dodge: "#7BC043",
  miss: "#D8CBB0",
};

class Anim {
  constructor() {
    this.play("idle");
  }

  play(name) {
    this.name = name;
    this.time = 0;
  }

  get frame() {
    const sheet = SHEETS[this.name];
    const f = Math.floor(this.time * sheet.fps);

    return sheet.loop
      ? f % sheet.frames
      : Math.min(f, sheet.frames - 1);
  }

  get done() {
    const sheet = SHEETS[this.name];
    return !sheet.loop && this.time * sheet.fps >= sheet.frames;
  }
}

// Text with a thick dark outline (used for all battle text)
function outlinedText(ctx, text, x, y, size, fill, align = "center") {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size / 5);
  ctx.strokeStyle = COLORS.outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// A white silhouette of an image, drawn over the evil hampter when it's hit
function whiteSilhouette(img, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, w, h);

  return canvas;
}

export class Battle {
  constructor(images) {
    this.images = images;

    this.attackSound = new Audio("/assets/sounds/attack.wav");
    this.attackSound.volume = 0.5;

    this.jumpSound = new Audio("/assets/sounds/jump.wav");
    this.jumpSound.volume = 0.5;

    this.gunshotSound = new Audio("/assets/sounds/Laser_Gun.wav");
    this.gunshotSound.volume = 0.5;

    this.damageSound = new Audio("/assets/sounds/collide.wav");
    this.damageSound.volume = 0.7;

    this.evilWhite = images.evil
      ? whiteSilhouette(images.evil, EVIL_W, EVIL_H)
      : null;

    this.playerHp = MAX_HP;
    this.evilHp = MAX_HP;

    // Health shown on the bars: drains down to the real value so you can
    // see the chunk you just lost
    this.playerHpShown = MAX_HP;
    this.evilHpShown = MAX_HP;

    // Jump physics for dodging
    this.dodgeY = 0;
    this.dodgeVelocityY = 0;
    this.isDodging = false;

    this.phase = "intro";
    this.phaseTime = 0;
    this.result = null;

    // Count turns so the first prompts can say a bit more
    this.enemyTurns = 0;
    this.playerTurns = 0;
    this.warnTime = FIRST_WARN_TIME;

    this.anim = new Anim();
    this.hamsterX = HAMSTER_HOME_X;

    this.bullets = [];
    this.shotsFired = 0;

    this.move = null;
    this.damageDone = false;

    // Hit effects
    this.evilFlash = 0; // white flash on the evil hampter
    this.evilKnock = 0; // pushed back a few pixels when punched
    this.hurtFlash = 0; // red tint when we get shot
    this.shakeTime = 0;
    this.shakePower = 0;
    this.impacts = []; // punch bursts
    this.popups = [];
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  // Top of our hampter's head on the canvas (main.js floats the webcam here).
  // In each 48px frame the hampter is drawn around x 21, head at y 28.
  get hamsterHead() {
    return {
      x: this.hamsterX + 21 * HAMSTER_SCALE,
      y: FLOOR_Y - 46 * HAMSTER_SCALE + 28 * HAMSTER_SCALE + this.dodgeY,
    };
  }

  // PLAYER INPUT

  handleKey(code) {
    if (code === "Digit1" || code === "Numpad1") {
      this.choose("slash");
    }
  }

  // Clicking anywhere on our turn also punches
  handleClick() {
    this.choose("slash");
  }

  choose(move) {
    if (this.phase !== "choose") return;

    this.move = move;
    this.damageDone = false;
    this.setPhase("attack");
  }

  // Jump to dodge bullets
  dodge() {
    // Only jump during enemy turn
    if (this.phase !== "enemy") return;

    // Prevent double jumping
    if (this.isDodging) return;

    // Same jump velocity as player.js
    this.dodgeVelocityY = JUMP_VELOCITY;
    this.dodgeY = 0;
    this.isDodging = true;

    // Play jump sound effect
    this.jumpSound.currentTime = 0;
    this.jumpSound.play().catch(() => {});
  }

  // MAIN UPDATE

  update(dt) {
    this.phaseTime += dt;
    this.anim.time += dt;

    this.evilFlash = Math.max(0, this.evilFlash - dt);
    this.evilKnock = Math.max(0, this.evilKnock - 120 * dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.shakeTime = Math.max(0, this.shakeTime - dt);

    // Bars drain toward the real health
    this.playerHpShown = Math.max(this.playerHp, this.playerHpShown - 40 * dt);
    this.evilHpShown = Math.max(this.evilHp, this.evilHpShown - 40 * dt);

    for (const p of this.popups) {
      p.time += dt;
      p.y -= 40 * dt;
    }
    this.popups = this.popups.filter(p => p.time < 1);

    for (const imp of this.impacts) imp.time += dt;
    this.impacts = this.impacts.filter(imp => imp.time < 0.35);

    if (this.anim.name === "hit" && this.anim.done) {
      this.anim.play("idle");
    }

    // Same physics as the normal player jump
    if (this.isDodging) {
      this.dodgeVelocityY += GRAVITY * dt;
      this.dodgeY += this.dodgeVelocityY * dt;

      // Landing on the platform
      if (this.dodgeY >= 0) {
        this.dodgeY = 0;
        this.dodgeVelocityY = 0;
        this.isDodging = false;
      }
    }

    if (this.phase === "intro") {
      if (this.phaseTime >= 1.6) {
        this.startEnemyTurn();
      }
    } else if (this.phase === "enemy") {
      this.updateEnemyTurn(dt);
    } else if (this.phase === "attack") {
      this.updateAttack();
    } else if (
      this.phase === "won" ||
      this.phase === "lost"
    ) {
      if (this.phaseTime >= 2.5) {
        this.result = this.phase;
      }
    }
  }

  startEnemyTurn() {
    this.enemyTurns++;
    this.warnTime = this.enemyTurns === 1 ? FIRST_WARN_TIME : WARN_TIME;
    this.shotsFired = 0;
    this.bullets = [];
    this.setPhase("enemy");
  }

  startPlayerTurn() {
    this.playerTurns++;
    this.setPhase("choose");
  }

  updateEnemyTurn(dt) {
    const nextShotAt =
      this.warnTime + this.shotsFired * BULLET_GAP;

    if (
      this.shotsFired < BULLETS_PER_TURN &&
      this.phaseTime >= nextShotAt
    ) {
      this.fireBullet();
    }

    const targetX =
      this.hamsterX + 20 * HAMSTER_SCALE;

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x <= targetX) {
        b.hit = true;

        if (this.isDodging) {
          // Bullet misses during jump
          this.popup("DODGE!", targetX, b.y - 40, COLORS.dodge, 28);
        } else {
          // Bullet hits hamster
          this.playerHp = Math.max(0, this.playerHp - BULLET_DAMAGE);
          this.damageSound.currentTime = 0;
          this.damageSound.play().catch(() => {});
          this.anim.play("hit");
          this.hurtFlash = 0.25;
          this.shake(0.15, 5);
          this.popup(`-${BULLET_DAMAGE}`, targetX, b.y - 40, COLORS.damage, 28);
        }
      }
    }

    this.bullets = this.bullets.filter(b => !b.hit);

    if (
      this.shotsFired === BULLETS_PER_TURN &&
      this.bullets.length === 0
    ) {
      if (this.playerHp <= 0) {
        this.anim.play("death");
        this.setPhase("lost");
      } else if (this.phaseTime >= nextShotAt + 0.3) {
        this.startPlayerTurn();
      }
    }
  }

  fireBullet() {
    this.gunshotSound.currentTime = 0;
    this.gunshotSound.play().catch(() => {});

    const targetX =
      this.hamsterX + 20 * HAMSTER_SCALE;

    const targetY = FLOOR_Y - 70;

    const dx = targetX - MUZZLE_X;
    const dy = targetY - MUZZLE_Y;
    const length = Math.hypot(dx, dy);

    this.bullets.push({
      x: MUZZLE_X,
      y: MUZZLE_Y,
      vx: (dx / length) * BULLET_SPEED,
      vy: (dy / length) * BULLET_SPEED,
    });

    this.shotsFired++;
  }

  // PUNCH ATTACK

  updateAttack() {
    const t = this.phaseTime;

    const attackTime =
      SHEETS[this.move].frames / SHEETS[this.move].fps;

    if (t < DASH_TIME) {
      if (this.anim.name !== "run") {
        this.anim.play("run");
      }

      this.hamsterX =
        HAMSTER_HOME_X +
        (HAMSTER_STRIKE_X - HAMSTER_HOME_X) *
        (t / DASH_TIME);

    } else if (t < DASH_TIME + attackTime) {
      this.hamsterX = HAMSTER_STRIKE_X;

      if (this.anim.name !== this.move) {
        this.anim.play(this.move);

        this.attackSound.currentTime = 0;
        this.attackSound.play().catch(() => {});
      }

      if (
        !this.damageDone &&
        t >= DASH_TIME + attackTime / 2
      ) {
        this.damageDone = true;
        this.applyAttack();
      }

    } else if (t < DASH_TIME * 2 + attackTime) {
      if (this.anim.name !== "run") {
        this.anim.play("run");
      }

      const back =
        (t - DASH_TIME - attackTime) / DASH_TIME;

      this.hamsterX =
        HAMSTER_STRIKE_X +
        (HAMSTER_HOME_X - HAMSTER_STRIKE_X) * back;

    } else {
      this.hamsterX = HAMSTER_HOME_X;
      this.anim.play("idle");

      if (this.evilHp <= 0) {
        this.setPhase("won");
      } else {
        this.startEnemyTurn();
      }
    }
  }

  applyAttack() {
    const popX = EVIL_X + EVIL_W / 2;

    if (Math.random() > PUNCH_HIT_CHANCE) {
      this.popup("MISS!", popX, EVIL_Y - 20, COLORS.miss, 32);
      return;
    }

    this.evilHp = Math.max(0, this.evilHp - PUNCH_DAMAGE);

    // Visual cue: white flash, knockback, burst, shake, POW! and the damage
    this.evilFlash = 0.3;
    this.evilKnock = 18;
    this.shake(0.2, 8);
    this.impacts.push({ x: IMPACT_X, y: IMPACT_Y, time: 0 });
    this.popup("POW!", IMPACT_X, IMPACT_Y - 10, COLORS.gold, 44);
    this.popup(`-${PUNCH_DAMAGE}`, popX + 60, EVIL_Y - 20, COLORS.damage, 34);
  }

  shake(time, power) {
    this.shakeTime = time;
    this.shakePower = power;
  }

  popup(text, x, y, color, size) {
    this.popups.push({
      text,
      x,
      y,
      time: 0,
      color,
      size
    });
  }

  // DRAW

  draw(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (this.images.background) {
      ctx.drawImage(
        this.images.background,
        0,
        0,
        GAME_WIDTH,
        GAME_HEIGHT
      );
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Fighters shake when a hit lands (the background and HUD stay put)
    ctx.save();
    if (this.shakeTime > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.shakePower * 2,
        (Math.random() - 0.5) * this.shakePower * 2
      );
    }
    this.drawEvil(ctx);
    this.drawHamster(ctx);
    this.drawBullets(ctx);
    this.drawImpacts(ctx);
    ctx.restore();

    // Red tint when we get shot
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(224, 79, 47, ${this.hurtFlash})`;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    this.drawHealthBars(ctx);
    this.drawPopups(ctx);
    this.drawPrompt(ctx);

    ctx.restore();
  }

  drawHamster(ctx) {
    const img = this.images[this.anim.name];
    const size = 48 * HAMSTER_SCALE;

    // Base ground position plus jump displacement
    const y =
      FLOOR_Y - 46 * HAMSTER_SCALE + this.dodgeY;

    if (img) {
      ctx.drawImage(
        img,
        this.anim.frame * 48,
        0,
        48,
        48,
        Math.round(this.hamsterX),
        y,
        size,
        size
      );
    } else {
      ctx.fillStyle = "#D9A066";

      ctx.fillRect(
        this.hamsterX + 70,
        FLOOR_Y - 110 + this.dodgeY,
        100,
        110
      );
    }
  }

  drawEvil(ctx) {
    const fade =
      this.phase === "won"
        ? Math.max(0, 1 - this.phaseTime)
        : 1;

    ctx.save();
    ctx.globalAlpha = fade;

    // Flip so the evil hampter (and its gun) face left at us
    ctx.translate(
      EVIL_X + EVIL_W + this.evilKnock,
      EVIL_Y
    );

    ctx.scale(-1, 1);

    if (this.images.evil) {
      ctx.drawImage(this.images.evil, 0, 0, EVIL_W, EVIL_H);
    } else {
      ctx.fillStyle = "#8B0000";
      ctx.fillRect(0, 0, EVIL_W, EVIL_H);
    }

    // White flash when punched
    if (this.evilFlash > 0 && this.evilWhite) {
      ctx.globalAlpha = fade * Math.min(1, this.evilFlash / 0.15);
      ctx.drawImage(this.evilWhite, 0, 0);
    }

    ctx.restore();
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.fillStyle = COLORS.outline;
      ctx.fillRect(Math.round(b.x) - 10, Math.round(b.y) - 5, 20, 10);

      ctx.fillStyle = "#F4A100";
      ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) - 3, 16, 6);

      ctx.fillStyle = "#FFE066";
      ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) - 1, 6, 2);
    }
  }

  // Comic-style burst where a punch lands: a ring plus 8 rays
  drawImpacts(ctx) {
    for (const imp of this.impacts) {
      const t = imp.time / 0.35;
      const r = 24 + 56 * t;

      ctx.globalAlpha = 1 - t;

      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 8 * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(imp.x, imp.y, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = COLORS.cream;
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.beginPath();
        ctx.moveTo(imp.x + Math.cos(a) * r * 0.75, imp.y + Math.sin(a) * r * 0.75);
        ctx.lineTo(imp.x + Math.cos(a) * r, imp.y + Math.sin(a) * r);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Two bars at the top that drain toward the outside, with a VS badge
  drawHealthBars(ctx) {
    const barW = 330;
    const barH = 22;
    const y = 28;
    const leftX = GAME_WIDTH / 2 - 48 - barW;
    const rightX = GAME_WIDTH / 2 + 48;

    const bar = (x, hp, shown, alignRight) => {
      // Frame
      ctx.fillStyle = COLORS.outline;
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 4, barW + 8, barH + 8, 6);
      ctx.fill();

      ctx.fillStyle = COLORS.track;
      ctx.fillRect(x, y, barW, barH);

      // Chunk just lost (drains away)
      const shownW = (barW * shown) / MAX_HP;
      ctx.fillStyle = COLORS.cream;
      ctx.fillRect(alignRight ? x + barW - shownW : x, y, shownW, barH);

      // Remaining health: green, then yellow, then red
      const w = (barW * hp) / MAX_HP;
      ctx.fillStyle =
        hp > MAX_HP / 2 ? COLORS.hpHigh :
        hp > MAX_HP / 4 ? COLORS.hpMid :
        COLORS.hpLow;
      ctx.fillRect(alignRight ? x + barW - w : x, y, w, barH);

      // Shine along the top
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(alignRight ? x + barW - w : x, y, w, 5);
    };

    bar(leftX, this.playerHp, this.playerHpShown, true);
    bar(rightX, this.evilHp, this.evilHpShown, false);

    const nameY = y + barH + 20;
    outlinedText(ctx, "HAMPTER", leftX, nameY, 18, COLORS.cream, "left");
    outlinedText(ctx, `${Math.ceil(this.playerHp)} HP`, leftX + barW, nameY, 16, COLORS.cream, "right");
    outlinedText(ctx, "EVIL HAMPTER", rightX + barW, nameY, 18, COLORS.cream, "right");
    outlinedText(ctx, `${Math.ceil(this.evilHp)} HP`, rightX, nameY, 16, COLORS.cream, "left");

    // VS badge
    const cx = GAME_WIDTH / 2;
    const cy = y + barH / 2;
    ctx.fillStyle = COLORS.outline;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 25, 0, Math.PI * 2);
    ctx.stroke();
    outlinedText(ctx, "VS", cx, cy + 1, 22, COLORS.gold);
  }

  drawPopups(ctx) {
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.time;
      // Pop in a little bigger, then settle
      const size = Math.round(p.size * (1 + Math.max(0, 0.15 - p.time) * 3));
      outlinedText(ctx, p.text, p.x, p.y, size, p.color);
    }
    ctx.globalAlpha = 1;
  }

  // Big words ("ROUND 1", "K.O.!") and the how-to-play prompts
  drawPrompt(ctx) {
    if (this.phase === "intro") {
      const text = this.phaseTime < 0.8 ? "ROUND 1" : "FIGHT!";
      outlinedText(ctx, text, GAME_WIDTH / 2, 170, 64, COLORS.gold);

    } else if (this.phase === "enemy") {
      this.drawBanner(
        ctx,
        "JUMP TO DODGE!",
        this.enemyTurns === 1
          ? "The Evil Hampter is shooting at you. Jump over the bullets!"
          : "Here come the bullets!",
        COLORS.gold
      );

    } else if (this.phase === "choose") {
      this.drawBanner(
        ctx,
        "YOUR TURN: PUNCH!",
        this.playerTurns === 1
          ? "Throw a punch at the camera to hit the Evil Hampter (or press 1)"
          : "Punch to deal damage! (or press 1)",
        COLORS.gold
      );

    } else if (this.phase === "won" || this.phase === "lost") {
      outlinedText(
        ctx,
        "K.O.!",
        GAME_WIDTH / 2,
        160,
        80,
        this.phase === "won" ? COLORS.gold : COLORS.damage
      );
      outlinedText(
        ctx,
        this.phase === "won"
          ? "You beat the Evil Hampter!"
          : "The Evil Hampter got you...",
        GAME_WIDTH / 2,
        215,
        24,
        COLORS.cream
      );
    }
  }

  // Dark panel under the health bars with a title and a hint
  drawBanner(ctx, title, hint, titleColor) {
    // Slide/fade in at the start of each phase
    const t = Math.min(1, this.phaseTime / 0.2);
    const w = 620;
    const h = 78;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 82 - (1 - t) * 12;

    ctx.globalAlpha = t;

    ctx.fillStyle = COLORS.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 7);
    ctx.stroke();

    // Title gently pulses so it reads as "do this now"
    const pulse = 1 + Math.sin(this.phaseTime * 6) * 0.04;
    outlinedText(ctx, title, GAME_WIDTH / 2, y + 28, Math.round(30 * pulse), titleColor);
    outlinedText(ctx, hint, GAME_WIDTH / 2, y + 57, 16, COLORS.cream);

    ctx.globalAlpha = 1;
  }
}
