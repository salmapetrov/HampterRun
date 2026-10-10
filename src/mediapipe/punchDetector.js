
export class PunchDetector {
  constructor() {
    this.leftPunching = false;
    this.rightPunching = false;
  }

  detectPunch(landmarks) {
    // Left arm landmarks
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];

    // Right arm landmarks
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];

    // Calculate distance between two landmarks
    const distance = (a, b) => {
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    // Distance from shoulder to wrist
    const leftExtension = distance(leftShoulder, leftWrist);
    const rightExtension = distance(rightShoulder, rightWrist);

    // Total length of each arm
    const leftArmLength =
      distance(leftShoulder, leftElbow) +
      distance(leftElbow, leftWrist);

    const rightArmLength =
      distance(rightShoulder, rightElbow) +
      distance(rightElbow, rightWrist);

    // Calculate how straight each arm is
    const leftRatio =
      leftArmLength > 0
        ? leftExtension / leftArmLength
        : 0;

    const rightRatio =
      rightArmLength > 0
        ? rightExtension / rightArmLength
        : 0;

    // Check whether arms are extended
    const leftExtended = leftRatio > 0.85;
    const rightExtended = rightRatio > 0.85;

    // Trigger only when arm becomes extended
    const leftPunch =
      leftExtended && !this.leftPunching;

    const rightPunch =
      rightExtended && !this.rightPunching;

    // Save current arm states
    this.leftPunching = leftExtended;
    this.rightPunching = rightExtended;

    return {
      leftPunch,
      rightPunch
    };
  }

  update(landmarks) {
    const important = [11, 12, 13, 14, 15, 16];

    // Make sure landmarks are visible
    if (!landmarks || important.some(i =>
      !landmarks[i] ||
      (landmarks[i].visibility ?? 1) < 0.6
    )) {
      this.leftPunching = false;
      this.rightPunching = false;

      return {
        leftPunch: false,
        rightPunch: false
      };
    }

    return this.detectPunch(landmarks);
  }
}
