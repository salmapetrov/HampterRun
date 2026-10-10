
import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils
} from "@mediapipe/tasks-vision";

export async function createPoseTracker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  return await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "CPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

export function drawPose(canvas, landmarks) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!landmarks) return;

  const drawing = new DrawingUtils(ctx);

  drawing.drawConnectors(
    landmarks,
    PoseLandmarker.POSE_CONNECTIONS,
    { color: "#00FF88", lineWidth: 3 }
  );

  drawing.drawLandmarks(landmarks, {
    color: "#FF4444",
    radius: 3
  });
}
