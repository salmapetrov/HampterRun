import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";

// ---- Lives images: each one is a full 900x500 canvas (files in /public are served from the site root) ----
const UI_DIR = "/assets/ui";

// The "Lives" word image. Set to null if the word is already inside each number image.
const LIVES_LABEL_FILE = `${UI_DIR}/Lives.png`;

// One image per lives count: 3.png, 2.png, 1.png, 0.png
const numberFile = (n) => `${UI_DIR}/${n}.png`;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("HUD image not found:", src);
      resolve(null);
    };
    img.src = encodeURI(src);
  });
}

export class LivesDisplay {
  constructor() {
    this.label = null;
    this.numbers = {};
    this.load();
  }

  async load() {
    if (LIVES_LABEL_FILE) {
      this.label = await loadImage(LIVES_LABEL_FILE);
    }

    // No image for 0 lives: the number is simply left off
    for (let n = 1; n <= 3; n++) {
      this.numbers[n] = await loadImage(numberFile(n));
    }
  }

  draw(ctx, lives) {
    const count = Math.max(0, lives);
    const numberImage = count > 0 ? this.numbers[count] : null;

    // Fallback to plain text if an image that should exist is missing
    if ((count > 0 && !numberImage) || (LIVES_LABEL_FILE && !this.label)) {
      ctx.fillStyle = "#000000";
      ctx.font = "20px sans-serif";
      ctx.fillText(count > 0 ? `Lives: ${count}` : "Lives:", 20, 30);
      return;
    }

    ctx.imageSmoothingEnabled = false; // keeps pixel art crisp

    // Both images already have their position baked in, so draw them over the whole canvas.
    // The "Lives" word always shows; at 0 lives there's no number on top of it.
    if (this.label) {
      ctx.drawImage(this.label, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
    if (numberImage) {
      ctx.drawImage(numberImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  }
}