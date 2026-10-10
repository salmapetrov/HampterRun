import {
  createPoseTracker,
  drawPose
} from "./mediapipe/poseTracker.js";

import { Game } from "./game/game.js";

import { GestureDetector } from "./gestureDetector.js";

const gestures = new GestureDetector();
const video = document.querySelector("#webcam");
const canvas = document.querySelector("#overlay");
const status = document.querySelector("#status");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");

// The webcam view stays hidden until the camera is enabled
const cameraBox = document.querySelector(".camera");
cameraBox.style.display = "none";

// The whole camera panel stays hidden until Start is clicked on the game menu
const cameraPanel = document.querySelector(".camera-panel");

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

// Wait for the level images to load before starting the game loop
game.loadAssets().then(() => game.start());

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    game.jump();
  }
});

let tracker;
let lastVideoTime = -1;

function detectBodyPosition(landmarks) {
  // MediaPipe landmark indexes
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // Find horizontal center of shoulders
  const shoulderX =
    (leftShoulder.x + rightShoulder.x) / 2;

  // Find horizontal center of hips
  const hipX =
    (leftHip.x + rightHip.x) / 2;

  // Difference between upper body and hips
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

    status.textContent = "Tracking!";
    requestAnimationFrame(trackFrame);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    start.disabled = false;
  }
});

stop.addEventListener("click", () => {

  // get the current webcam stream
  const stream = video.srcObject;

  // stop every media track
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
    });
  }

  // disconnect the stream from the video
  video.srcObject = null;

  // clear drawing
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 5. Update the UI
  status.textContent = "Camera off";
  document.querySelector("#action").textContent = "Waiting for player...";
  cameraBox.style.display = "none";
  start.disabled = false;

});

function trackFrame() {
  if (
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;

    const result = tracker.detectForVideo(
      video,
      performance.now()
    );

    const landmarks = result.landmarks[0];

    // Draw the skeleton on the webcam
    drawPose(canvas, landmarks);

    // Run our gesture detection functions
    const actions = gestures.update(
      landmarks,
      performance.now()
    );

    // Show the results on screen
    status.textContent =
      `RUN: ${actions.running} | JUMP: ${actions.jump}`;

    // Show results in browser console
    console.log(
      "RUN:", actions.running,
      "| JUMP:", actions.jump
    );

    // Tell the game whether the player is running
    window.dispatchEvent(
      new CustomEvent("hampter-running", {
        detail: {
          running: actions.running
        }
      })
    );

    // Only send a jump event when a jump is detected
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
  }

  requestAnimationFrame(trackFrame);
}