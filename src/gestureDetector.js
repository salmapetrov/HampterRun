
export class GestureDetector {
  constructor() {
    // Running detection
    this.previousWristY = null;
    this.previousTime = null;
    this.armMovement = 0;
    this.isRunning = false;

    // Jump detection
    this.standingHipY = null;
    this.isJumping = false;
    this.lastJumpTime = 0;
  }

  detectRun(landmarks, now) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    // Wrist height relative to shoulders
    const leftY = leftWrist.y - leftShoulder.y;
    const rightY = rightWrist.y - rightShoulder.y;

    if (this.previousWristY === null) {
      this.previousWristY = [leftY, rightY];
      this.previousTime = now;
      return false;
    }

    const dt = Math.max(
      (now - this.previousTime) / 1000,
      0.001
    );

    // Amount wrists moved since previous frame
    const movement =
      (Math.abs(leftY - this.previousWristY[0]) +
       Math.abs(rightY - this.previousWristY[1])) / 2;

    // Smooth the movement speed
    const speed = Math.min(movement / dt, 2);

    this.armMovement =
      this.armMovement * 0.85 + speed * 0.15;

    this.previousWristY = [leftY, rightY];
    this.previousTime = now;

    // Require repeated arm motion
    this.isRunning = this.armMovement > 0.12;

    return this.isRunning;
  }

  detectJump(landmarks, now) {
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const hipY = (leftHip.y + rightHip.y) / 2;

    // Calibrate standing position automatically
    if (this.standingHipY === null) {
      this.standingHipY = hipY;
      return false;
    }

    // Smaller Y means higher on the screen
    const rise = this.standingHipY - hipY;

    if (
      rise > 0.08 &&
      !this.isJumping &&
      now - this.lastJumpTime > 650
    ) {
      this.isJumping = true;
      this.lastJumpTime = now;
      return true;
    }

    // Reset when player lands
    if (rise < 0.035) {
      this.isJumping = false;

      // Gradually adjust neutral position
      this.standingHipY =
        0.98 * this.standingHipY + 0.02 * hipY;
    }

    return false;
  }

  update(landmarks, now) {
    if (!landmarks) {
      this.previousWristY = null;
      this.previousTime = null;
      this.armMovement = 0;
      this.isRunning = false;
      return { running: false, jump: false };
    }

    const important = [11, 12, 15, 16, 23, 24];

    if (important.some(i =>
      (landmarks[i]?.visibility ?? 1) < 0.6
    )) {
      this.previousWristY = null;
      this.previousTime = null;
      this.armMovement = 0;
      this.isRunning = false;
      return { running: false, jump: false };
    }

    return {
      running: this.detectRun(landmarks, now),
      jump: this.detectJump(landmarks, now)
    };
  }
}
