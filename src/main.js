
import {
  createPoseTracker,
  drawPose
} from "./mediapipe/poseTracker.js";

import { Game } from "./game/game.js";

const video = document.querySelector("#webcam");
const canvas = document.querySelector("#overlay");
const status = document.querySelector("#status");
const start = document.querySelector("#start");

const gameCanvas = document.querySelector("#gameCanvas");
const game = new Game(gameCanvas);

game.start();

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    game.jump();
  }
});

let tracker;
let lastVideoTime = -1;

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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    status.textContent = "Tracking!";
    requestAnimationFrame(trackFrame);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    start.disabled = false;
  }
});

function trackFrame() {
  if (video.readyState >= 2 &&
      video.currentTime !== lastVideoTime) {

    lastVideoTime = video.currentTime;

    const result = tracker.detectForVideo(
      video,
      performance.now()
    );

    const landmarks = result.landmarks[0];

    drawPose(canvas, landmarks);

    if (landmarks) {
      status.textContent = "Body detected!";
    } else {
      status.textContent = "Stand in front of camera";
    }
  }

  requestAnimationFrame(trackFrame);
}
