
import {
  createPoseTracker,
  drawPose
} from "./mediapipe/poseTracker.js";

import { Game } from "./game/game.js";
import { GestureDetector } from "./mediapipe/gestureDetector.js";
import { PunchDetector } from "./mediapipe/punchDetector.js";

const punchDetector = new PunchDetector();
const gestures = new GestureDetector();

const video = document.querySelector("#webcam");
const canvas = document.querySelector("#overlay");
const status = document.querySelector("#status");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const cameraBox = document.querySelector(".camera");
const cameraPanel = document.querySelector(".camera-panel");

// Keep the webcam hidden until it is enabled.
cameraBox.style.display = "none";

function showPanel(show) {
  if (show) {
    cameraPanel.style.removeProperty("display");
  } else {
    cameraPanel.style.setProperty("display", "none", "important");
  }
}

showPanel(false);

window.addEventListener("hampter-start", () => {
  console.log("hampter-start");
  showPanel(true);
});

window.addEventListener("hampter-menu", () => {
  console.log("hampter-menu");
  showPanel(false);
});

window.addEventListener("hampter-gameover", () => {
  console.log("hampter-gameover");
  showPanel(false);
});

const gameCanvas = document.querySelector("#gameCanvas");
const game = new Game(gameCanvas);

// Wait for images to load before starting the game.
game.loadAssets().then(() => game.start());

// =====================================
// BATTLE SCENE - WEBCAM FOLLOWS OUR HAMPTER
// =====================================
// During the battle the webcam shrinks and floats above our hampter's head,
// following it as it dashes in to punch and jumps to dodge.

const BATTLE_CAM_WIDTH = 128; // in game pixels (the game canvas is 900 wide)
const BATTLE_CAM_GAP = 14; // game pixels between the webcam and the head

let followingHampter = false;

function followHampter() {
  const follow =
    cameraRunning &&
    game.state === "playing" &&
    game.scene === "battle" &&
    game.battle;

  if (follow) {
    cameraPanel.classList.add("battle-cam");
    followingHampter = true;

    // The canvas is stretched to fill the window, so convert game pixels
    // to screen pixels
    const rect = gameCanvas.getBoundingClientRect();
    const scaleX = rect.width / gameCanvas.width;
    const scaleY = rect.height / gameCanvas.height;
    const head = game.battle.hamsterHead;
    const width = BATTLE_CAM_WIDTH * scaleX;

    cameraPanel.style.width = `${width}px`;
    cameraPanel.style.left = `${rect.left + head.x * scaleX - width / 2}px`;
    cameraPanel.style.top =
      `${rect.top + (head.y - BATTLE_CAM_GAP) * scaleY - cameraPanel.offsetHeight}px`;

  } else if (followingHampter) {
    // Battle over (or camera off): back to the corner
    cameraPanel.classList.remove("battle-cam");
    cameraPanel.style.removeProperty("width");
    cameraPanel.style.removeProperty("left");
    cameraPanel.style.removeProperty("top");
    followingHampter = false;
  }

  requestAnimationFrame(followHampter);
}

requestAnimationFrame(followHampter);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    game.jump();
  }
});

let tracker;
let lastVideoTime = -1;
let cameraRunning = false;

// Body position detection for future movement controls
function detectBodyPosition(landmarks) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  const shoulderX =
    (leftShoulder.x + rightShoulder.x) / 2;

  const hipX =
    (leftHip.x + rightHip.x) / 2;

  const lean = shoulderX - hipX;

  let direction = "CENTER";

  if (lean < -0.08) {
    direction = "LEFT";
  } else if (lean > 0.08) {
    direction = "RIGHT";
  }

  return {
    bodyX: hipX,
    shoulderX,
    lean,
    direction
  };
}

// START WEBCAM
start.addEventListener("click", async () => {
  start.disabled = true;
  status.textContent = "Loading pose model...";

  try {
    tracker = await createPoseTracker();

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });

    video.srcObject = stream;
    await video.play();

    cameraBox.style.display = "";

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    lastVideoTime = -1;
    cameraRunning = true;

    status.textContent = "Tracking!";

    requestAnimationFrame(trackFrame);

  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    start.disabled = false;
  }
});

// STOP WEBCAM
stop.addEventListener("click", () => {
  cameraRunning = false;

  const stream = video.srcObject;

  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
    });
  }

  video.srcObject = null;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Stop sending running movement
  window.dispatchEvent(
    new CustomEvent("hampter-running", {
      detail: { running: false }
    })
  );

  status.textContent = "Camera off";

  cameraBox.style.display = "none";
  start.disabled = false;
});

// MEDIAPIPE TRACKING LOOP
function trackFrame() {

  if (!cameraRunning) return;

  if (
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;

    const now = performance.now();

    const result = tracker.detectForVideo(
      video,
      now
    );

    const landmarks = result.landmarks[0];

    // Draw body skeleton
    drawPose(canvas, landmarks);

    // =====================================
    // BATTLE SCENE - PUNCH DETECTION
    // =====================================

    if (game.scene === "battle") {

      const punches = punchDetector.update(landmarks);

      status.textContent =
        `LEFT: ${punches.leftPunch} | RIGHT: ${punches.rightPunch}`;

      // Either arm triggers SLASH
      if (punches.leftPunch || punches.rightPunch) {

        console.log("SLASH DETECTED!");

        window.dispatchEvent(
          new CustomEvent("hampter-action", {
            detail: {
              action: "SLASH"
            }
          })
        );

      }
      // Detect jumping during battle
const actions = gestures.update(landmarks, now);

      if (actions.jump) {
        console.log("Jump!");
        window.dispatchEvent(
        new CustomEvent("hampter-action", {
        detail: { action: "DODGE" }
        })
  );
}


    }

    // =====================================
    // RUNNER SCENE - RUNNING AND JUMPING
    // =====================================

    else if (game.state === "playing") {

      const actions = gestures.update(
        landmarks,
        now
      );

      // Send running movement
      window.dispatchEvent(
        new CustomEvent("hampter-running", {
          detail: {
            running: actions.running
          }
        })
      );

      // Send jump
      if (actions.jump) {

        console.log("JUMP DETECTED!");

        window.dispatchEvent(
          new CustomEvent("hampter-action", {
            detail: {
              action: "JUMP"
            }
          })
        );
      }

    } else {
      status.textContent = "Waiting for gameplay...";
    }
  }

  requestAnimationFrame(trackFrame);
}
