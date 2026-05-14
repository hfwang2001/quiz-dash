export const POSE_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index'
];

export const POSE_INDEX = Object.freeze(
  POSE_NAMES.reduce((result, name, index) => ({ ...result, [name]: index }), {})
);

export const POSE_EDGES = Object.freeze([
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_foot_index'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_foot_index']
]);

const BODY_CENTER_NAMES = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];
const MIN_JUMP_UP = 0.01;
const JUMP_TORSO_RATIO = 0.034;
const JUMP_VELOCITY_LIMIT = -0.009;
const MIN_SQUAT_DOWN = 0.026;
const SQUAT_TORSO_RATIO = 0.085;

export function createMotionTracker({ smoothing = 0.42 } = {}) {
  const smoothed = new Map();
  const previous = new Map();

  function reset() {
    smoothed.clear();
    previous.clear();
  }

  function update(rawLandmarks, timestampMs) {
    const nodes = {};
    (rawLandmarks || []).forEach((rawPoint, index) => {
      if (!rawPoint || !Number.isFinite(rawPoint.x) || !Number.isFinite(rawPoint.y)) return;

      const name = POSE_NAMES[index] || `point_${index}`;
      const previousSmooth = smoothed.get(name);
      const node = {
        id: index,
        name,
        x: smooth(previousSmooth?.x, rawPoint.x, smoothing),
        y: smooth(previousSmooth?.y, rawPoint.y, smoothing),
        z: smooth(previousSmooth?.z, normalizedNumber(rawPoint.z, 0), smoothing),
        visibility: normalizedNumber(rawPoint.visibility, 1),
        presence: normalizedNumber(rawPoint.presence, 1)
      };
      node.confidence = Math.min(node.visibility, node.presence);
      smoothed.set(name, node);
      nodes[name] = {
        ...node,
        ...motionFor(`pose:${name}`, node, timestampMs)
      };
    });

    return {
      nodes,
      body: buildBody(nodes, timestampMs)
    };
  }

  function motionFor(key, point, timestampMs) {
    const previousPoint = previous.get(key);
    previous.set(key, {
      timestampMs,
      x: point.x,
      y: point.y,
      z: Number.isFinite(point.z) ? point.z : null
    });

    if (!previousPoint) return {};

    const dt = (timestampMs - previousPoint.timestampMs) / 1000;
    if (dt <= 0) return {};

    const velocityNorm = [(point.x - previousPoint.x) / dt, (point.y - previousPoint.y) / dt];
    const velocityZ =
      previousPoint.z !== null && Number.isFinite(point.z) ? (point.z - previousPoint.z) / dt : null;
    return {
      velocity_norm_s: velocityNorm,
      velocity_z_s: velocityZ,
      speed_norm_s: vectorLength(velocityNorm)
    };
  }

  function buildBody(nodes, timestampMs) {
    const centerPoints = BODY_CENTER_NAMES.map((name) => nodes[name]).filter((node) => isUsable(node, 0.28));
    const centerNorm = mean2(centerPoints);
    const zValues = centerPoints.map((point) => point.z).filter(Number.isFinite);
    const bodyZ = zValues.length ? median(zValues) : null;

    const leftShoulder = nodes.left_shoulder;
    const rightShoulder = nodes.right_shoulder;
    const leftHip = nodes.left_hip;
    const rightHip = nodes.right_hip;
    const bodyPoints = [
      nodes.nose,
      leftShoulder,
      rightShoulder,
      leftHip,
      rightHip,
      nodes.left_knee,
      nodes.right_knee,
      nodes.left_ankle,
      nodes.right_ankle
    ].filter((node) => isUsable(node, 0.28));
    const bodyBox = boxForPoints(bodyPoints);
    const shoulderWidth =
      isUsable(leftShoulder, 0.28) && isUsable(rightShoulder, 0.28) ? distance(leftShoulder, rightShoulder) : null;
    const shoulderY =
      isUsable(leftShoulder, 0.28) && isUsable(rightShoulder, 0.28)
        ? (leftShoulder.y + rightShoulder.y) / 2
        : null;
    const hipY =
      isUsable(leftHip, 0.28) && isUsable(rightHip, 0.28) ? (leftHip.y + rightHip.y) / 2 : null;
    const torso = shoulderY !== null && hipY !== null ? Math.abs(hipY - shoulderY) : null;

    const motion = centerNorm
      ? motionFor('body:center', { x: centerNorm[0], y: centerNorm[1], z: bodyZ }, timestampMs)
      : {};

    return {
      center_norm: centerNorm,
      body_z: bodyZ,
      body_scale_proxy: shoulderWidth && shoulderWidth > 0.001 ? 1 / shoulderWidth : null,
      velocity_norm_s: motion.velocity_norm_s || null,
      velocity_z_s: motion.velocity_z_s ?? null,
      speed_norm_s: motion.speed_norm_s ?? null,
      forward_backward: forwardBackward(motion.velocity_z_s),
      shoulder_width: shoulderWidth,
      shoulder_y: shoulderY,
      hip_y: hipY,
      torso,
      bbox_norm: bodyBox
    };
  }

  return { reset, update };
}

export function classifyHandRaise(frame) {
  const { nodes, body } = frame;
  const leftShoulder = nodes.left_shoulder;
  const rightShoulder = nodes.right_shoulder;
  const leftWrist = nodes.left_wrist;
  const rightWrist = nodes.right_wrist;

  if (![leftShoulder, rightShoulder, leftWrist, rightWrist].every((point) => isUsable(point))) {
    return null;
  }

  const shoulderWidth = Math.max(0.08, body.shoulder_width || distance(leftShoulder, rightShoulder));
  const torso = Math.max(0.16, body.torso || Math.abs(body.hip_y - body.shoulder_y) || shoulderWidth * 1.8);
  const raiseLimit = Math.max(0.065, shoulderWidth * 0.34, torso * 0.18);
  const separationLimit = shoulderWidth * 0.11;
  const leftRaise = leftShoulder.y - leftWrist.y;
  const rightRaise = rightShoulder.y - rightWrist.y;
  const leftClear = leftRaise - Math.max(0, rightRaise);
  const rightClear = rightRaise - Math.max(0, leftRaise);

  const leftHigh = leftRaise > raiseLimit;
  const rightHigh = rightRaise > raiseLimit;
  if (leftHigh && rightHigh && Math.abs(leftRaise - rightRaise) < shoulderWidth * 0.16) {
    return null;
  }

  if (leftHigh && leftClear > separationLimit) {
    return {
      action: 'left',
      confidence: clamp(0.52 + leftRaise / (raiseLimit * 2.2))
    };
  }

  if (rightHigh && rightClear > separationLimit) {
    return {
      action: 'right',
      confidence: clamp(0.52 + rightRaise / (raiseLimit * 2.2))
    };
  }

  return null;
}

export function updateBodyBaseline(frame, previousBaseline) {
  const { body } = frame;
  if (!body.center_norm || body.shoulder_y === null || body.hip_y === null || !body.torso) {
    return previousBaseline;
  }

  const current = {
    bodyY: body.center_norm[1],
    hipY: body.hip_y,
    shoulderY: body.shoulder_y,
    torso: Math.max(0.12, body.torso),
    noseY: isUsable(frame.nodes.nose, 0.28) ? frame.nodes.nose.y : null,
    ankleY: averageVisibleY([frame.nodes.left_ankle, frame.nodes.right_ankle]),
    samples: (previousBaseline?.samples || 0) + 1
  };

  if (!previousBaseline) return current;

  const bodyDelta = current.bodyY - previousBaseline.bodyY;
  const hipDelta = current.hipY - previousBaseline.hipY;
  const isNeutral = Math.abs(bodyDelta) < current.torso * 0.075 && Math.abs(hipDelta) < current.torso * 0.09;

  if (!isNeutral) {
    return { ...previousBaseline, samples: Math.min(30, previousBaseline.samples + 1) };
  }

  return {
    bodyY: previousBaseline.bodyY * 0.985 + current.bodyY * 0.015,
    hipY: previousBaseline.hipY * 0.985 + current.hipY * 0.015,
    shoulderY: previousBaseline.shoulderY * 0.985 + current.shoulderY * 0.015,
    torso: previousBaseline.torso * 0.985 + current.torso * 0.015,
    noseY: blendOptional(previousBaseline.noseY, current.noseY, 0.015),
    ankleY: blendOptional(previousBaseline.ankleY, current.ankleY, 0.015),
    samples: Math.min(30, previousBaseline.samples + 1)
  };
}

export function classifyPatternAction(frame, baseline) {
  if (!baseline || baseline.samples < 8) return null;

  const { nodes, body } = frame;
  const leftWrist = nodes.left_wrist;
  const rightWrist = nodes.right_wrist;
  const leftHand = averagePoint([nodes.left_wrist, nodes.left_index, nodes.left_thumb, nodes.left_pinky]);
  const rightHand = averagePoint([nodes.right_wrist, nodes.right_index, nodes.right_thumb, nodes.right_pinky]);
  const leftShoulder = nodes.left_shoulder;
  const rightShoulder = nodes.right_shoulder;
  const leftHip = nodes.left_hip;
  const rightHip = nodes.right_hip;
  const nose = nodes.nose;
  const ankleY = averageVisibleY([nodes.left_ankle, nodes.right_ankle]);

  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((point) => isUsable(point))) {
    return null;
  }

  const shoulderY = body.shoulder_y ?? (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = body.hip_y ?? (leftHip.y + rightHip.y) / 2;
  const bodyY = body.center_norm?.[1] ?? (shoulderY + hipY) / 2;
  const torso = Math.max(0.12, body.torso || baseline.torso);
  const shoulderWidth = Math.max(0.08, body.shoulder_width || distance(leftShoulder, rightShoulder));
  const bodyVelocityY = body.velocity_norm_s?.[1] || 0;
  const bodyDelta = bodyY - baseline.bodyY;
  const hipDelta = hipY - baseline.hipY;
  const shoulderDelta = shoulderY - baseline.shoulderY;

  if (leftHand && rightHand && isUsable(leftWrist) && isUsable(rightWrist)) {
    const wristDistance = distance(leftWrist, rightWrist);
    const handDistance = distance(leftHand, rightHand);
    const clapDistance = Math.min(wristDistance, handDistance);
    const handY = (leftHand.y + rightHand.y) / 2;
    const wristYSpread = Math.abs(leftWrist.y - rightWrist.y);
    const wristSpeed = (leftWrist.speed_norm_s || 0) + (rightWrist.speed_norm_s || 0);
    const closeLimit = Math.max(0.16, shoulderWidth * 1.05);
    const headLine = isUsable(nose, 0.28) ? nose.y + torso * 0.2 : shoulderY - torso * 0.34;
    const handsOverHead =
      leftHand.y < headLine &&
      rightHand.y < headLine &&
      handY < shoulderY - torso * 0.12 &&
      wristYSpread < torso * 0.95;

    if (handsOverHead && clapDistance < closeLimit) {
      return {
        action: 'red',
        confidence: clamp(0.56 + (closeLimit - clapDistance) / closeLimit + wristSpeed * 0.12)
      };
    }
  }

  const jumpLimit = Math.max(MIN_JUMP_UP, baseline.torso * JUMP_TORSO_RATIO);
  const bodyUp = baseline.bodyY - bodyY;
  const hipUp = baseline.hipY - hipY;
  const shoulderUp = baseline.shoulderY - shoulderY;
  const noseUp =
    baseline.noseY !== null && baseline.noseY !== undefined && isUsable(nose, 0.28) ? baseline.noseY - nose.y : null;
  const ankleUp =
    baseline.ankleY !== null && baseline.ankleY !== undefined && ankleY !== null ? baseline.ankleY - ankleY : null;
  const coreMovedUp =
    bodyUp > jumpLimit &&
    hipUp > jumpLimit * 0.24 &&
    shoulderUp > -jumpLimit * 0.22 &&
    (bodyVelocityY < JUMP_VELOCITY_LIMIT || bodyUp > jumpLimit * 1.35);
  const shapeConfirmsJump =
    (noseUp === null || noseUp > -jumpLimit * 0.16) &&
    (ankleUp === null || ankleUp > -jumpLimit * 0.26);

  if (coreMovedUp && shapeConfirmsJump) {
    return {
      action: 'blue',
      confidence: clamp(
        0.48 +
          Math.max(bodyUp / (jumpLimit * 2.4), hipUp / (jumpLimit * 2), shoulderUp / (jumpLimit * 2)) +
          Math.abs(bodyVelocityY) * 0.35
      )
    };
  }

  const squatLimit = Math.max(MIN_SQUAT_DOWN, baseline.torso * SQUAT_TORSO_RATIO);
  const bodyDown = bodyY - baseline.bodyY;
  const hipDown = hipY - baseline.hipY;
  const shoulderDown = shoulderY - baseline.shoulderY;
  const noseDown =
    baseline.noseY !== null && baseline.noseY !== undefined && isUsable(nose, 0.28) ? nose.y - baseline.noseY : null;
  const ankleDown =
    baseline.ankleY !== null && baseline.ankleY !== undefined && ankleY !== null ? ankleY - baseline.ankleY : null;
  const hipAnkleCompression =
    baseline.ankleY !== null && baseline.ankleY !== undefined && ankleY !== null
      ? baseline.ankleY - baseline.hipY - (ankleY - hipY)
      : null;
  const coreMovedDown =
    bodyDown > squatLimit &&
    hipDown > squatLimit * 0.34 &&
    shoulderDown > -squatLimit * 0.18;
  const headConfirmsSquat = noseDown === null || noseDown > -squatLimit * 0.18;
  const legsConfirmSquat = hipAnkleCompression === null || hipAnkleCompression > -squatLimit * 0.28;

  if (coreMovedDown && headConfirmsSquat && legsConfirmSquat) {
    return {
      action: 'yellow',
      confidence: clamp(
        0.5 +
          Math.max(bodyDown / (squatLimit * 2.4), hipDown / (squatLimit * 2), shoulderDown / (squatLimit * 2.2))
      )
    };
  }

  return null;
}

export function isUsable(point, threshold = 0.35) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.confidence ?? 1) > threshold);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(previous, current, smoothing) {
  if (!Number.isFinite(previous)) return current;
  return previous * (1 - smoothing) + current * smoothing;
}

function normalizedNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function vectorLength(value) {
  if (!Array.isArray(value)) return null;
  return Math.sqrt(value.reduce((sum, item) => sum + item * item, 0));
}

function mean2(points) {
  if (!points.length) return null;
  return [
    points.reduce((sum, point) => sum + point.x, 0) / points.length,
    points.reduce((sum, point) => sum + point.y, 0) / points.length
  ];
}

function boxForPoints(points) {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x0: Math.max(0, Math.min(...xs)),
    y0: Math.max(0, Math.min(...ys)),
    x1: Math.min(1, Math.max(...xs)),
    y1: Math.min(1, Math.max(...ys))
  };
}

function averageVisibleY(points) {
  const visible = points.filter((point) => isUsable(point, 0.28));
  if (!visible.length) return null;
  return visible.reduce((sum, point) => sum + point.y, 0) / visible.length;
}

function averagePoint(points) {
  const visible = points.filter((point) => isUsable(point, 0.28));
  if (!visible.length) return null;
  return {
    x: visible.reduce((sum, point) => sum + point.x, 0) / visible.length,
    y: visible.reduce((sum, point) => sum + point.y, 0) / visible.length
  };
}

function blendOptional(previous, current, amount) {
  if (!Number.isFinite(current)) return previous ?? null;
  if (!Number.isFinite(previous)) return current;
  return previous * (1 - amount) + current * amount;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function forwardBackward(velocityZ) {
  if (!Number.isFinite(velocityZ)) return 'unknown';
  if (velocityZ < -0.12) return 'forward';
  if (velocityZ > 0.12) return 'backward';
  return 'stable';
}
