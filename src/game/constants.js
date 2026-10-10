export const GAME_WIDTH = 900;
export const GAME_HEIGHT = 500;

export const GROUND_Y = 400;

export const PLAYER_X = 25; // hamster's fixed screen x (left edge of its hitbox)
export const PLAYER_WIDTH = 55;
export const PLAYER_HEIGHT = 45;

export const GRAVITY = 1000; // lower = floatier, longer jumps
export const JUMP_VELOCITY = -440; // more negative = higher jump (~97px tall, 0.9s in the air: stays under the sky blocks)

// Launch speed when the hamster touches a blue gem (~340px tall: high enough to
// fly up through a gap and land on the floating blocks)
export const SUPER_JUMP_VELOCITY = -825;

export const BASE_SPEED = 250;

// Width of background.png. The level repeats every WORLD_WIDTH pixels.
export const WORLD_WIDTH = 1920;

// How many copies of the background in a row make up the level
export const MAX_LAPS = 3;

// How fast the screen scrolls, in pixels per second
export const SCROLL_SPEED = 180; // fast enough that the low jump can clear a spike
