import { groundY } from "./world.js";

// Spike sprites (files in /public are served from the site root)
const DIR = "/assets/backgrounds/interactive";
export const SPIKE_IMAGES = {
  spikes1: `${DIR}/spikes-1.png`,
  spikes2: `${DIR}/spikes-2.png`,
};

// Sprite sizes for each spike image
const SPIKE_SIZES = {
  spikes1: { width: 24, height: 57 },
  spikes2: { width: 52, height: 55 },
};

const SINK_SPEED = 40; // pixels per second a spike sinks after hitting

// A spike sitting on the ground path. Its position is in world coordinates, so
// it doesn't move on its own: the camera scrolling past it moves it on screen.
//   centerX = middle of the spike, image = "spikes1" or "spikes2"
//   surfaceY = height of whatever it stands on (defaults to the ground path)
export class Obstacle {
  constructor(centerX, image, surfaceY = groundY(centerX)) {
    this.image = image;
    this.width = SPIKE_SIZES[image].width;
    this.height = SPIKE_SIZES[image].height;

    this.x = centerX - this.width / 2;
    this.ground = surfaceY; // spike sinks down to (and is clipped at) this line
    this.y = this.ground - this.height; // stand on the grass

    // Once an obstacle hits the player, it can't hit again
    this.hasHit = false;
  }

  // Smaller than the sprite so near-misses feel fair
  get hitbox() {
    return {
      x: this.x + this.width * 0.2,
      y: this.y + this.height * 0.3,
      width: this.width * 0.6,
      height: this.height * 0.7,
    };
  }

  update(dt) {
    // After hitting the player, sink into the ground
    if (this.hasHit && this.y < this.ground) {
      this.y += SINK_SPEED * dt;
    }
  }

  // Drawn in world coordinates (inside the camera translate)
  draw(ctx, images, showHitbox) {
    // Clip to above the ground line so a sinking spike disappears into the dirt
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x, 0, this.width, this.ground);
    ctx.clip();

    const img = images[this.image];
    if (img) {
      ctx.drawImage(img, Math.round(this.x), Math.round(this.y), this.width, this.height);
    } else {
      // Placeholder if the image is missing
      ctx.fillStyle = "#000000";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
    ctx.restore();

    if (showHitbox) {
      const b = this.hitbox;
      ctx.strokeStyle = "cyan";
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    }
  }
}
