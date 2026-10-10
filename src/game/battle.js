// ---- Boss battle: our hampter vs. hampter-evil, turn based ----
//
// Flow (this.phase):
//   "intro"  -> "ROUND 1" / "FIGHT!"
//   "enemy"  -> evil hampter shoots bullets at us (it always goes first)
//   "choose" -> our turn: SLASH (webcam slash gesture, key 1, or click the button)
//   "attack" -> our hampter dashes in, attacks, dashes back
//   ...back to "enemy" until someone runs out of HP...
//   "won" / "lost" -> "K.O.!", then this.result is set and the game goes back
//                     to running
// Jumping does nothing here.
import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";

const HAMSTER_DIR = "/assets/hamster";

// Images the battle needs (loaded by Game.loadAssets before the game starts)
export const BATTLE_IMAGES = {
  idle: `${HAMSTER_DIR}/MR Cookies_Idle_48x48.png`,
  run: `${HAMSTER_DIR}/MR Cookies_Running_48x48.png`,
  hit: `${HAMSTER_DIR}/MR Cookies_Hit_48x48.png`,
  slash: `${HAMSTER_DIR}/MR Cookies_Attack02_48x48.png`, // sweeping arc
  death: `${HAMSTER_DIR}/MR Cookies_Death_48x48.png`,
  evil: "/assets/hampter/hampter-evil.png",
  background: "/assets/backgrounds/battle.png",
};

// Our hampter's sprite sheets: one row of 48x48 frames each
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
const BULLET_SPEED = 650; // pixels per second
const BULLET_GAP = 0.35; // seconds between shots
const SLASH_DAMAGE = 35;
const SLASH_HIT_CHANCE = 0.90; // 90% of slashes land

// ---- Layout (canvas is 900 x 500, same size as battle.png) ----
// Feet land on the two hex platforms in the background
const FLOOR_Y = 390;
const HAMSTER_SCALE = 5; // 48px frames drawn at 240px
const HAMSTER_HOME_X = 110; // left edge of our hampter's frame
const HAMSTER_STRIKE_X = 390; // how far it dashes in to attack
const DASH_TIME = 0.25; // seconds to dash in (and back)
const EVIL_W = 216;
const EVIL_H = 185;
const EVIL_X = GAME_WIDTH - 110 - EVIL_W;
const EVIL_Y = FLOOR_Y - EVIL_H;
// The gun's muzzle, after flipping the evil hampter to face left
const MUZZLE_X = EVIL_X + 50;
const MUZZLE_Y = EVIL_Y + 139;

// On-screen attack button (also key 1, or the webcam slash gesture)
const BUTTONS = [
  { move: "slash", key: "1", label: "SLASH", info: `${SLASH_DAMAGE} dmg, can miss`, x: GAME_WIDTH / 2 - 95, y: 430, w: 190, h: 52 },
];

// Plays one of our hampter's sprite sheets
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
    return sheet.loop ? f % sheet.frames : Math.min(f, sheet.frames - 1);
  }

  // True once a non-looping animation has shown its last frame
  get done() {
    const sheet = SHEETS[this.name];
    return !sheet.loop && this.time * sheet.fps >= sheet.frames;
  }
}

export class Battle {
  constructor(images) {
    this.images = images;

    this.playerHp = MAX_HP;
    this.evilHp = MAX_HP;
    this.dodgeTime = 0;
    this.dodgeDuration = 0.7; // Jump lasts 0.7 seconds

    this.phase = "intro";
    this.phaseTime = 0;
    this.result = null; // set to "won" or "lost" when the battle is over

    this.anim = new Anim();
    this.hamsterX = HAMSTER_HOME_X;

    this.bullets = []; // { x, y, vx, vy }
    this.shotsFired = 0;

    this.move = null; // "slash" while attacking
    this.damageDone = false; // so each attack only hits once

    this.evilFlash = 0; // seconds the evil hampter flickers after a hit
    this.popups = []; // floating damage numbers { text, x, y, time, color }
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  // ---- Input ----

  handleKey(code) {
    if (code === "Digit1" || code === "Numpad1") this.choose("slash");
  }

  // x, y in canvas coordinates
  handleClick(x, y) {
    for (const b of BUTTONS) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.choose(b.move);
      }
    }
  }

  choose(move) {
    if (this.phase !== "choose") return;
    this.move = move;
    this.damageDone = false;
    this.setPhase("attack");
  }

  dodge() {
    // Only dodge during Evil Hampter's turn
    if (this.phase !== "enemy") return;
  
    // Don't restart a jump while already jumping
    if (this.dodgeTime > 0) return;
  
    this.dodgeTime = this.dodgeDuration;
  
    console.log("HAMSTER DODGED!");
  }

  handleAction(action) {
    if (action === "PUNCH") {
      this.choose("slash");
    }
  }

  // ---- Update ----

  update(dt) {
    this.phaseTime += dt;
    this.anim.time += dt;
    this.evilFlash = Math.max(0, this.evilFlash - dt);

    // Floating damage numbers drift up and fade
    for (const p of this.popups) {
      p.time += dt;
      p.y -= 40 * dt;
    }
    this.popups = this.popups.filter((p) => p.time < 1);

    // Hit animation finished: back to idle
    if (this.anim.name === "hit" && this.anim.done) this.anim.play("idle");

    if (this.phase === "intro") {
      if (this.phaseTime >= 1.6) this.startEnemyTurn();
    } else if (this.phase === "enemy") {
      this.updateEnemyTurn(dt);
    } else if (this.phase === "attack") {
      this.updateAttack();
    } else if (this.phase === "won" || this.phase === "lost") {
      if (this.phaseTime >= 2) this.result = this.phase;
    }
    this.dodgeTime = Math.max(0, this.dodgeTime - dt);
  }

  startEnemyTurn() {
    this.shotsFired = 0;
    this.bullets = [];
    this.setPhase("enemy");
  }

  updateEnemyTurn(dt) {
    // Fire the next bullet every BULLET_GAP seconds (first one after a pause)
    const nextShotAt = 0.5 + this.shotsFired * BULLET_GAP;
    if (this.shotsFired < BULLETS_PER_TURN && this.phaseTime >= nextShotAt) {
      this.fireBullet();
    }

    // Move bullets; a bullet hits when it reaches our hampter's body
    const targetX = this.hamsterX + 20 * HAMSTER_SCALE; // middle of the body
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x <= targetX) {
        b.hit = true;
      
        if (this.dodgeTime > 0) {
          // Hamster is jumping, so the bullet misses!
          this.popup("DODGE!", targetX, b.y - 40, "#16A34A");
        } else {
          // Hamster didn't dodge, so it takes damage
          this.playerHp = Math.max(0, this.playerHp - BULLET_DAMAGE);
      
          this.anim.play("hit");
      
          this.popup(
            `-${BULLET_DAMAGE}`,
            targetX,
            b.y - 40,
            "#D62828"
          );
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.hit);

    // All shots fired and landed: our turn (or K.O.)
    if (this.shotsFired === BULLETS_PER_TURN && this.bullets.length === 0) {
      if (this.playerHp <= 0) {
        this.anim.play("death");
        this.setPhase("lost");
      } else if (this.phaseTime >= nextShotAt + 0.3) {
        this.setPhase("choose");
      }
    }
    
  }

  fireBullet() {
    // Aim from the gun at our hampter's chest
    const targetX = this.hamsterX + 20 * HAMSTER_SCALE;
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

  // Dash in -> attack animation -> dash back
  updateAttack() {
    const t = this.phaseTime;
    const attackTime = SHEETS[this.move].frames / SHEETS[this.move].fps;

    if (t < DASH_TIME) {
      // Dash in
      if (this.anim.name !== "run") this.anim.play("run");
      this.hamsterX = HAMSTER_HOME_X + (HAMSTER_STRIKE_X - HAMSTER_HOME_X) * (t / DASH_TIME);
    } else if (t < DASH_TIME + attackTime) {
      // Attack
      this.hamsterX = HAMSTER_STRIKE_X;
      if (this.anim.name !== this.move) this.anim.play(this.move);

      // Damage lands halfway through the swing
      if (!this.damageDone && t >= DASH_TIME + attackTime / 2) {
        this.damageDone = true;
        this.applyAttack();
      }
    } else if (t < DASH_TIME * 2 + attackTime) {
      // Dash back
      if (this.anim.name !== "run") this.anim.play("run");
      const back = (t - DASH_TIME - attackTime) / DASH_TIME;
      this.hamsterX = HAMSTER_STRIKE_X + (HAMSTER_HOME_X - HAMSTER_STRIKE_X) * back;
    } else {
      // Back home: K.O. or the evil hampter's turn
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

    if (this.move === "slash" && Math.random() > SLASH_HIT_CHANCE) {
      this.popup("MISS!", popX, EVIL_Y - 10, "#555555");
      return;
    }

    this.evilHp = Math.max(0, this.evilHp - SLASH_DAMAGE);
    this.evilFlash = 0.4;
    this.popup(`-${SLASH_DAMAGE}`, popX, EVIL_Y - 10, "#D62828");
  }

  popup(text, x, y, color) {
    this.popups.push({ text, x, y, time: 0, color });
  }

  // ---- Draw ----

  draw(ctx) {
    ctx.imageSmoothingEnabled = false;

    // Forest bridge background (plain white if it failed to load)
    if (this.images.background) {
      ctx.drawImage(this.images.background, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    this.drawEvil(ctx);
    this.drawHamster(ctx);
    this.drawBullets(ctx);
    this.drawHealthBars(ctx);
    this.drawPopups(ctx);
    this.drawPhaseText(ctx);

    if (this.phase === "choose") this.drawButtons(ctx);
  }

  drawHamster(ctx) {
    const img = this.images[this.anim.name];
    const size = 48 * HAMSTER_SCALE;
    // Feet are about 2 rows above the bottom of each 48px frame
    let y = FLOOR_Y - 46 * HAMSTER_SCALE;

    if (this.dodgeTime > 0) {
      const progress =
        1 - this.dodgeTime / this.dodgeDuration;
    
      // Move up and then come back down
      const jumpHeight = Math.sin(progress * Math.PI) * 90;
    
      y -= jumpHeight;
    }

    if (img) {
      ctx.drawImage(img, this.anim.frame * 48, 0, 48, 48, Math.round(this.hamsterX), y, size, size);
    } else {
      ctx.fillStyle = "#D9A066";
      ctx.fillRect(this.hamsterX + 70, FLOOR_Y - 110, 100, 110);
    }
  }

  drawEvil(ctx) {
    // Flicker after being hit; fall over and fade out when K.O.'d
    if (this.evilFlash > 0 && Math.floor(this.evilFlash * 20) % 2 === 0) return;

    const shake = this.evilFlash > 0 ? (Math.random() - 0.5) * 12 : 0;
    const fade = this.phase === "won" ? Math.max(0, 1 - this.phaseTime) : 1;

    ctx.save();
    ctx.globalAlpha = fade;
    // Flip horizontally so the evil hampter (and its gun) face left at us
    ctx.translate(EVIL_X + EVIL_W + shake, EVIL_Y);
    ctx.scale(-1, 1);
    if (this.images.evil) {
      ctx.drawImage(this.images.evil, 0, 0, EVIL_W, EVIL_H);
    } else {
      ctx.fillStyle = "#8B0000";
      ctx.fillRect(0, 0, EVIL_W, EVIL_H);
    }
    ctx.restore();
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.fillStyle = "#F4A100";
      ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) - 3, 16, 6);
      ctx.fillStyle = "#FFE066";
      ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) - 1, 6, 2);
    }
  }

  // Street Fighter style: two bars at the top that drain toward the outside
  drawHealthBars(ctx) {
    const barW = 340;
    const barH = 22;
    const y = 30;
    const leftX = GAME_WIDTH / 2 - 40 - barW;
    const rightX = GAME_WIDTH / 2 + 40;

    const bar = (x, hp, alignRight) => {
      ctx.fillStyle = "#B00020"; // lost health
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = "#FFD23F"; // remaining health
      const w = (barW * hp) / MAX_HP;
      ctx.fillRect(alignRight ? x + barW - w : x, y, w, barH);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, barW, barH);
    };

    bar(leftX, this.playerHp, true);
    bar(rightX, this.evilHp, false);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("HAMPTER", leftX, y + barH + 22);
    ctx.textAlign = "right";
    ctx.fillText("EVIL HAMPTER", rightX + barW, y + barH + 22);

    ctx.textAlign = "center";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("VS", GAME_WIDTH / 2, y + barH - 2);
    ctx.textAlign = "left";
  }

  drawPopups(ctx) {
    ctx.textAlign = "center";
    ctx.font = "bold 28px sans-serif";
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.time;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  drawPhaseText(ctx) {
    let text = null;
    let size = 64;

    if (this.phase === "intro") {
      text = this.phaseTime < 0.8 ? "ROUND 1" : "FIGHT!";
    } else if (this.phase === "won" || this.phase === "lost") {
      text = "K.O.!";
      size = 80;
    } else if (this.phase === "enemy" && this.phaseTime < 0.5) {
      text = "EVIL HAMPTER'S TURN";
      size = 30;
    } else if (this.phase === "choose") {
      text = "YOUR TURN!";
      size = 30;
    }
    if (!text) return;

    ctx.textAlign = "center";
    ctx.font = `bold ${size}px sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(text, GAME_WIDTH / 2, 170);
    ctx.fillStyle = this.phase === "lost" ? "#D62828" : "#FFD23F";
    ctx.fillText(text, GAME_WIDTH / 2, 170);
    ctx.textAlign = "left";
  }

  drawButtons(ctx) {
    ctx.textAlign = "center";
    for (const b of BUTTONS) {
      ctx.fillStyle = "#1E5BB8";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(`[${b.key}] ${b.label}`, b.x + b.w / 2, b.y + 24);
      ctx.font = "13px sans-serif";
      ctx.fillText(b.info, b.x + b.w / 2, b.y + 43);
    }
    ctx.textAlign = "left";
  }
}
