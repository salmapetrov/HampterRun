// ---- Gems and sad hampters placed along the level ----
// (Spikes are spawned by the ObstacleManager in collision.js.)
import { groundY, platforms, platformY } from "./world.js";
import { WORLD_WIDTH } from "./constants.js";

export const OBJECT_IMAGES = {
  gem: "/assets/backgrounds/interactive/blue-powerup.png", // 26 x 26
  sad: "/assets/hampter/hampter-sad.png", // 90 x 76
  evil: "/assets/hampter/hampter-evil.png", // 98 x 84
};

const GEM_SIZE = 26;
const GEM_FLOAT = 12; // gems hover this far above the ground

// Sad hampter size on the map (scaled down from the 90 x 76 image)
const SAD_HEIGHT = 50;
const SAD_WIDTH = Math.round((90 / 76) * SAD_HEIGHT);

// Floating blocks from world.js that sad hampters stand on
const FROG_BLOCK = platforms[2]; // C
const SKY_PATH = platforms[4]; // E, the long path with the bridges

// One object in the level.
//   type:  "gem" or "sad"
//   x, y:  top-left corner in world coordinates
//   w, h:  sprite size
//   state: gem -> "ready" | "collected"
//          sad -> "sad" | "evil" (just touched, battle starting) | "gone"
function makeGem(centerX) {
  const y = groundY(centerX) - GEM_SIZE - GEM_FLOAT;
  return { type: "gem", x: centerX - GEM_SIZE / 2, y, w: GEM_SIZE, h: GEM_SIZE, state: "ready" };
}

// surfaceY = height of what it stands on (ground path or a platform)
function makeSad(centerX, surfaceY = groundY(centerX)) {
  return {
    type: "sad",
    x: centerX - SAD_WIDTH / 2,
    y: surfaceY - SAD_HEIGHT,
    w: SAD_WIDTH,
    h: SAD_HEIGHT,
    state: "sad",
  };
}

// Two sad hampters per copy of the level (spikes: four), one up on the
// floating blocks and one on the bottom path, so players on either route
// run into one. The spots change from copy to copy.

// Up top: gem 1 launches most players onto the floating blocks
const SKY_SAD_SPOTS = [
  { x: 1205, surface: SKY_PATH }, // copy 1: long path, just after the first bridge
  { x: 630, surface: FROG_BLOCK }, // copy 2: the frog block
  { x: 1205, surface: SKY_PATH }, // copy 3: long path again
];

// Bottom path: for players who skipped gem 1 or fell off the blocks.
// Flat ground, clear of trees and spikes.
const GROUND_SAD_SPOTS = [
  700, // copy 1: flat after hill 3 (between the first two ground spikes)
  1166, // copy 2: flat after hill 5
  700, // copy 3: flat after hill 3 again
];

function skySadForLap(lap, offset) {
  const spot = SKY_SAD_SPOTS[lap % SKY_SAD_SPOTS.length];
  const x = spot.x + offset;
  return makeSad(x, platformY(spot.surface, x));
}

function groundSadForLap(lap, offset) {
  return makeSad(GROUND_SAD_SPOTS[lap % GROUND_SAD_SPOTS.length] + offset);
}

// Gems float over the ground path (x = center of each gem). Touching one
// launches the hamster up through a gap between the floating blocks, so each
// x was picked (by simulating the launch) to fly cleanly through that gap.
// lap = which copy of the repeating level (0 = first) the objects belong to.
export function createObjects(lap = 0) {
  const offset = lap * WORLD_WIDTH;
  return [
    makeGem(332 + offset), // hill 2: up through the gap between blocks A and B, lands on B
    makeGem(891 + offset), // flat after hill 4: up between hexagon D and the long path E, lands on E
    skySadForLap(lap, offset),
    groundSadForLap(lap, offset),
  ];
}

// The area that counts as touching. The sad hampter's box is a bit smaller
// than its picture so you have to really bump into it.
export function hitbox(obj) {
  if (obj.type === "sad") {
    return {
      x: obj.x + obj.w * 0.15,
      y: obj.y + obj.h * 0.2,
      width: obj.w * 0.7,
      height: obj.h * 0.8,
    };
  }
  return { x: obj.x, y: obj.y, width: obj.w, height: obj.h };
}

// Draw in world coordinates (inside the camera translate)
//   images = { gem, sad, evil }
//   shake  = pixels to jiggle an "evil" hampter by (during the transform)
export function drawObjects(ctx, objects, images, showHitboxes, shake = 0) {
  for (const obj of objects) {
    if (obj.state === "collected" || obj.state === "gone") continue;

    let img = images[obj.type];
    let x = Math.round(obj.x);
    let y = Math.round(obj.y);
    let w = obj.w;
    let h = obj.h;

    if (obj.state === "evil") {
      // Swap to the evil picture (slightly bigger), standing on the same spot
      img = images.evil;
      h = Math.round(obj.h * 1.1);
      w = Math.round((98 / 84) * h);
      x = Math.round(obj.x + obj.w / 2 - w / 2 + (Math.random() - 0.5) * shake);
      y = Math.round(obj.y + obj.h - h + (Math.random() - 0.5) * shake);
    }

    if (img) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      // Placeholder if the image is missing
      ctx.fillStyle = obj.type === "gem" ? "#3FA9F5" : "#777";
      ctx.fillRect(x, y, w, h);
    }

    if (showHitboxes) {
      const b = hitbox(obj);
      ctx.strokeStyle = "cyan";
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    }
  }
}
