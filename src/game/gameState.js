// Overall game part
export const GameState = Object.freeze({
  MENU: "menu",
  STARTING: "starting",
  PLAYING: "playing",
  DYING: "dying",
  GAME_OVER: "gameover"
});

// Type of gameplay
export const GameMode = Object.freeze({
  RUNNER: "runner",
  FIGHT: "fight"
});