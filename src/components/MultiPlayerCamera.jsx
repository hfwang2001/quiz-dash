import React, { useEffect, useRef, useState } from 'react';
import { Camera, Lock, RefreshCcw, Unlock, VideoOff } from 'lucide-react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { classifyHandRaise, createMotionTracker, isUsable, POSE_EDGES } from '../shared/mocapMotion.js';

const assetBaseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
const WASM_URL = new URL('mediapipe/wasm', assetBaseUrl).toString().replace(/\/$/, '');
const POSE_MODEL_URL = new URL('mediapipe/models/pose_landmarker_full.task', assetBaseUrl).toString();

const ACTION_TEXT = {
  left: '左手',
  right: '右手'
};

const STABLE_MS = 90;
const LOCK_STABLE_MS = 700;
const LOCK_MATCH_LIMIT = 0.28;
const CALIBRATION_SLOT_TOLERANCE = 0.9;

export default function MultiPlayerCamera({
  playerCount,
  disabled,
  statusText,
  autoStart,
  initialStream,
  roundKey,
  showFaceBadges = false,
  players = [],
  onChoices,
  onCalibrationChange,
  onPlayerViews
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const frameRef = useRef(0);
  const trackersRef = useRef(Array.from({ length: 4 }, () => createMotionTracker({ smoothing: 0.52 })));
  const candidateRef = useRef(Array.from({ length: 4 }, () => ({ action: null, since: 0 })));
  const choicesRef = useRef({});
  const lockSinceRef = useRef(0);
  const calibrationLocksRef = useRef(Array.from({ length: 4 }, () => ({ locked: false, since: 0, slot: null })));
  const lockedSlotsRef = useRef(null);
  const startPromiseRef = useRef(null);
  const disabledRef = useRef(disabled);
  const showFaceBadgesRef = useRef(showFaceBadges);
  const playersRef = useRef(players);
  const onChoicesRef = useRef(onChoices);
  const onCalibrationChangeRef = useRef(onCalibrationChange);
  const onPlayerViewsRef = useRef(onPlayerViews);

  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('摄像头未开启');
  const [seenPlayers, setSeenPlayers] = useState(0);
  const [latestGesture, setLatestGesture] = useState('');
  const [lockedSlots, setLockedSlots] = useState(null);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    showFaceBadgesRef.current = showFaceBadges;
  }, [showFaceBadges]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    onChoicesRef.current = onChoices;
  }, [onChoices]);

  useEffect(() => {
    onCalibrationChangeRef.current = onCalibrationChange;
  }, [onCalibrationChange]);

  useEffect(() => {
    onPlayerViewsRef.current = onPlayerViews;
  }, [onPlayerViews]);

  useEffect(() => {
    unlockPositions();
  }, [playerCount]);

  useEffect(() => {
    if (roundKey === undefined || roundKey === null) return;
    resetRecognition();
  }, [roundKey]);

  useEffect(() => {
    if (autoStart && (phase === 'idle' || phase === 'error')) {
      startCamera();
    }
  }, [autoStart, phase]);

  useEffect(() => {
    if (!initialStream || streamRef.current === initialStream) return;
    startCamera(initialStream);
  }, [initialStream]);

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, []);

  async function startCamera(existingStream = null) {
    if (startPromiseRef.current) return startPromiseRef.current;
    if (streamRef.current && phase !== 'error') return Promise.resolve();

    const startTask = (async () => {
      try {
        setPhase('loading');
        setMessage('正在打开摄像头和姿态模型');
        const stream =
          existingStream ||
          (await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          }));

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        onPlayerViewsRef.current?.({ stream, crops: {} });

        if (!landmarkerRef.current) {
          landmarkerRef.current = await createPoseLandmarker();
        }

        resetRecognition();
        setPhase('ready');
        setMessage('按分割区站好，所有人双手举高来锁定位置');
        frameRef.current = window.requestAnimationFrame(readFrame);
      } catch (error) {
        console.error('Failed to start camera', error);
        stopCamera();
        setPhase('error');
        setMessage(describeCameraError(error));
      } finally {
        startPromiseRef.current = null;
      }
    })();

    startPromiseRef.current = startTask;
    return startTask;
  }

  async function createPoseLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const common = {
      runningMode: 'VIDEO',
      numPoses: 4,
      minPoseDetectionConfidence: 0.26,
      minPosePresenceConfidence: 0.2,
      minTrackingConfidence: 0.2
    };

    try {
      return await PoseLandmarker.createFromOptions(vision, {
        ...common,
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'GPU'
        }
      });
    } catch {
      return PoseLandmarker.createFromOptions(vision, {
        ...common,
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'CPU'
        }
      });
    }
  }

  function stopCamera() {
    startPromiseRef.current = null;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearCanvas();
    setSeenPlayers(0);
    setLatestGesture('');
    lockedSlotsRef.current = null;
    setLockedSlots(null);
    onCalibrationChangeRef.current?.(false);
    onPlayerViewsRef.current?.({ stream: null, crops: {} });
    setPhase('idle');
    setMessage('摄像头未开启');
  }

  function resetRecognition() {
    trackersRef.current.forEach((tracker) => tracker.reset());
    candidateRef.current = Array.from({ length: 4 }, () => ({ action: null, since: 0 }));
    choicesRef.current = {};
    setLatestGesture('');
    onChoicesRef.current?.({});
  }

  function unlockPositions() {
    lockSinceRef.current = 0;
    calibrationLocksRef.current = Array.from({ length: 4 }, () => ({ locked: false, since: 0, slot: null }));
    lockedSlotsRef.current = null;
    setLockedSlots(null);
    resetRecognition();
    onCalibrationChangeRef.current?.(false);
    if (phase === 'ready') {
      setMessage('按分割区站好，所有人双手举高来锁定位置');
    }
  }

  function readFrame(now) {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      frameRef.current = window.requestAnimationFrame(readFrame);
      return;
    }

    const result = landmarker.detectForVideo(video, now);
    const detections = (result.landmarks || [])
      .map((landmarks, index) => {
        const rawCenterX = centerXFor(landmarks);
        const centerY = centerYFor(landmarks);
        return { landmarks, sourceIndex: index, rawCenterX, visualX: 1 - rawCenterX, centerY };
      })
      .filter((item) => Number.isFinite(item.rawCenterX) && Number.isFinite(item.centerY));

    const frames = lockedSlotsRef.current
      ? framesFromLockedSlots(detections, now)
      : framesFromCalibration(detections, now);

    setSeenPlayers(frames.length);
    drawPose(frames, detections);
    publishPlayerViews(frames);
    if (lockedSlotsRef.current) {
      updateChoices(frames, now);
    }
    frameRef.current = window.requestAnimationFrame(readFrame);
  }

  function framesFromCalibration(detections, now) {
    const slots = Array.from({ length: playerCount }, (_, index) => ({
      playerId: index + 1,
      x0: index / playerCount,
      x1: (index + 1) / playerCount,
      centerX: (index + 0.5) / playerCount,
      detection: null
    }));

    const assignments = bestAssignment(
      slots,
      detections,
      (slot, detection) => Math.abs(detection.visualX - slot.centerX),
      slotTolerance()
    );
    assignments.forEach(({ slot, detection }) => {
      slot.detection = detection;
    });

    const readySlots = slots.filter((slot) => {
      if (!slot.detection) return false;
      const frame = trackersRef.current[slot.playerId - 1].update(slot.detection.landmarks, now);
      slot.frame = frame;
      const lock = calibrationLocksRef.current[slot.playerId - 1];
      if (lock.locked) return true;

      if (!classifyBothHandsHigh(frame)) {
        lock.since = 0;
        return false;
      }

      if (!lock.since) lock.since = now;
      if (now - lock.since < LOCK_STABLE_MS) return false;

      lock.locked = true;
      lock.slot = {
        playerId: slot.playerId,
        rawCenterX: slot.detection.rawCenterX,
        visualX: slot.detection.visualX,
        centerY: slot.detection.centerY,
        lastSeenAt: now
      };
      return true;
    });

    const frames = slots
      .filter((slot) => slot.frame)
      .map((slot) => ({ playerId: slot.playerId, frame: slot.frame, detection: slot.detection, calibrating: true }));

    const locked = calibrationLocksRef.current.slice(0, playerCount).filter((lock) => lock.locked);
    if (locked.length === playerCount) {
      const lockedSlots = calibrationLocksRef.current
        .slice(0, playerCount)
        .map((lock) => lock.slot)
        .filter(Boolean);
      lockedSlotsRef.current = lockedSlots;
      setLockedSlots(lockedSlots);
      onCalibrationChangeRef.current?.(true);
      resetRecognition();
      setMessage('准备开始');
    } else {
      setMessage('双手举高');
    }

    return frames;
  }

  function framesFromLockedSlots(detections, now) {
    const assignments = bestAssignment(
      lockedSlotsRef.current,
      detections,
      (slot, detection) => lockedMatchCost(slot, detection),
      lockedMatchLimit()
    );

    return assignments
      .map(({ slot, detection }) => {
        slot.rawCenterX = blend(slot.rawCenterX, detection.rawCenterX, 0.08);
        slot.visualX = blend(slot.visualX, detection.visualX, 0.08);
        slot.centerY = blend(slot.centerY, detection.centerY, 0.05);
        slot.lastSeenAt = now;
        return {
          playerId: slot.playerId,
          frame: trackersRef.current[slot.playerId - 1].update(detection.landmarks, now),
          detection
        };
      })
      .filter(Boolean);
  }

  function lockedMatchCost(slot, detection) {
    const xCost = Math.abs(detection.visualX - slot.visualX);
    const yCost = Math.abs(detection.centerY - slot.centerY) * 0.35;
    return xCost + yCost;
  }

  function slotTolerance() {
    return (1 / playerCount) * CALIBRATION_SLOT_TOLERANCE;
  }

  function lockedMatchLimit() {
    return Math.min(LOCK_MATCH_LIMIT, Math.max(0.12, 0.46 / playerCount));
  }

  function publishPlayerViews(frames) {
    const crops = {};
    frames.forEach(({ playerId, frame }) => {
      const crop = cropForFrame(frame);
      if (crop) crops[playerId] = crop;
    });
    onPlayerViewsRef.current?.({ stream: streamRef.current, crops });
  }

  function cropForFrame(frame) {
    const box = frame?.body?.bbox_norm;
    if (!box) return null;
    const padX = Math.max(0.08, (box.x1 - box.x0) * 0.55);
    const padTop = Math.max(0.12, (box.y1 - box.y0) * 0.45);
    const padBottom = Math.max(0.08, (box.y1 - box.y0) * 0.22);
    const rawX0 = clamp01(box.x0 - padX);
    const rawX1 = clamp01(box.x1 + padX);
    const y0 = clamp01(box.y0 - padTop);
    const y1 = clamp01(box.y1 + padBottom);
    return {
      x: clamp01(1 - rawX1),
      y: y0,
      width: Math.max(0.12, clamp01(1 - rawX0) - clamp01(1 - rawX1)),
      height: Math.max(0.18, y1 - y0)
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function updateChoices(frames, now) {
    const nextChoices = { ...choicesRef.current };
    const seenGestures = [];
    let changed = false;

    frames.forEach(({ playerId, frame }) => {
      const pose = classifyLooseHandRaise(frame) || classifyHandRaise(frame);
      const slot = playerId - 1;
      if (!pose?.action) {
        candidateRef.current[slot] = { action: null, since: 0 };
        return;
      }

      seenGestures.push(`P${playerId}: ${ACTION_TEXT[pose.action]}`);
      if (disabledRef.current) return;

      const candidate = candidateRef.current[slot];
      if (candidate.action !== pose.action) {
        candidateRef.current[slot] = { action: pose.action, since: now };
        return;
      }

      if (now - candidate.since < STABLE_MS) return;
      if (nextChoices[playerId] === pose.action) return;

      nextChoices[playerId] = pose.action;
      changed = true;
    });

    setLatestGesture(seenGestures.join(' · '));

    if (changed) {
      choicesRef.current = nextChoices;
      onChoicesRef.current?.(nextChoices);
    }
  }

  function centerXFor(landmarks) {
    const points = [landmarks[11], landmarks[12], landmarks[23], landmarks[24]].filter(
      (point) => point && Number.isFinite(point.x)
    );
    if (!points.length) return null;
    return points.reduce((sum, point) => sum + point.x, 0) / points.length;
  }

  function centerYFor(landmarks) {
    const points = [landmarks[11], landmarks[12], landmarks[23], landmarks[24]].filter(
      (point) => point && Number.isFinite(point.y)
    );
    if (!points.length) return null;
    return points.reduce((sum, point) => sum + point.y, 0) / points.length;
  }

  function drawPose(frames, detections) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.videoWidth || 960;
    const height = video.videoHeight || 540;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawSlotGuide(ctx, width, height, detections);

    frames.forEach(({ playerId, frame }) => {
      const player = playersRef.current.find((item) => item.id === playerId);
      const hue = [36, 205, 350, 225][playerId - 1];
      ctx.strokeStyle = `hsl(${hue} 72% 58%)`;
      ctx.fillStyle = `hsl(${hue} 82% 96%)`;
      ctx.lineWidth = 6;

      drawPlayerBox(ctx, frame, playerId, width, height, hue);

      POSE_EDGES.forEach(([from, to]) => {
        const a = frame.nodes[from];
        const b = frame.nodes[to];
        if (!isUsable(a, 0.28) || !isUsable(b, 0.28)) return;
        ctx.beginPath();
        ctx.moveTo((1 - a.x) * width, a.y * height);
        ctx.lineTo((1 - b.x) * width, b.y * height);
        ctx.stroke();
      });

      ['nose', 'left_wrist', 'right_wrist', 'left_shoulder', 'right_shoulder'].forEach((name) => {
        const point = frame.nodes[name];
        if (!isUsable(point, 0.28)) return;
        ctx.beginPath();
        ctx.arc((1 - point.x) * width, point.y * height, name.includes('wrist') ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      const center = frame.body.center_norm;
      if (center) {
        ctx.font = 'bold 38px system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(31, 47, 69, 0.72)';
        ctx.lineWidth = 7;
        const label = `P${playerId}`;
        const x = (1 - center[0]) * width - 24;
        const y = Math.max(44, center[1] * height - 96);
        ctx.strokeText(label, x, y);
        ctx.fillText(label, x, y);
      }

      if (showFaceBadgesRef.current && player) {
        drawFaceBadge(ctx, frame, player, width, height);
      }
    });
  }

  function drawPlayerBox(ctx, frame, playerId, width, height, hue) {
    const crop = cropForFrame(frame);
    if (!crop) return;
    const x = crop.x * width;
    const y = crop.y * height;
    const boxWidth = crop.width * width;
    const boxHeight = crop.height * height;

    ctx.save();
    ctx.lineWidth = Math.max(5, width * 0.0045);
    ctx.strokeStyle = `hsl(${hue} 86% 62%)`;
    ctx.fillStyle = `hsla(${hue} 86% 62% / 0.12)`;
    ctx.setLineDash([]);
    roundRect(ctx, x, y, boxWidth, boxHeight, Math.max(14, width * 0.014));
    ctx.fill();
    ctx.stroke();

    const labelWidth = Math.max(58, width * 0.055);
    const labelHeight = Math.max(36, height * 0.052);
    roundRect(ctx, x + 10, Math.max(10, y - labelHeight * 0.5), labelWidth, labelHeight, labelHeight / 2);
    ctx.fillStyle = `hsl(${hue} 86% 48%)`;
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    ctx.font = `900 ${Math.max(18, height * 0.032)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${playerId}`, x + 10 + labelWidth / 2, Math.max(10, y - labelHeight * 0.5) + labelHeight / 2);
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawFaceBadge(ctx, frame, player, width, height) {
    const anchor = isUsable(frame.nodes.nose, 0.18) ? frame.nodes.nose : null;
    const center = frame.body.center_norm;
    if (!anchor && !center) return;

    const x = anchor ? (1 - anchor.x) * width : (1 - center[0]) * width;
    const y = anchor ? anchor.y * height : center[1] * height - height * 0.16;
    const radius = Math.max(20, Math.min(42, width * 0.045));
    const peekY = Math.max(radius + 10, y - radius * 0.45);

    ctx.save();
    ctx.lineWidth = Math.max(4, radius * 0.12);
    ctx.strokeStyle = player.accent || '#40566c';
    ctx.fillStyle = player.color || '#f4b86a';

    if (player.avatar === 'dog') {
      drawEar(ctx, x - radius * 0.72, peekY - radius * 0.1, radius * 0.34, player.color, player.accent);
      drawEar(ctx, x + radius * 0.72, peekY - radius * 0.1, radius * 0.34, player.color, player.accent);
    }

    if (player.avatar === 'hippo') {
      drawCircle(ctx, x - radius * 0.66, peekY - radius * 0.45, radius * 0.24, player.color, player.accent);
      drawCircle(ctx, x + radius * 0.66, peekY - radius * 0.45, radius * 0.24, player.color, player.accent);
    }

    ctx.beginPath();
    ctx.arc(x, peekY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (player.avatar === 'penguin') {
      ctx.fillStyle = player.accent || '#305777';
      ctx.beginPath();
      ctx.ellipse(x - radius * 0.42, peekY, radius * 0.22, radius * 0.76, 0.16, 0, Math.PI * 2);
      ctx.ellipse(x + radius * 0.42, peekY, radius * 0.22, radius * 0.76, -0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    if (player.avatar === 'hedgehog') {
      ctx.strokeStyle = player.accent || '#7a3f46';
      ctx.lineWidth = Math.max(3, radius * 0.08);
      for (let index = 0; index < 9; index += 1) {
        const angle = Math.PI * 1.05 + index * (Math.PI * 0.9 / 8);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * radius * 0.82, peekY + Math.sin(angle) * radius * 0.82);
        ctx.lineTo(x + Math.cos(angle) * radius * 1.24, peekY + Math.sin(angle) * radius * 1.24);
        ctx.stroke();
      }
    }

    ctx.fillStyle = player.accent || '#40566c';
    drawCircle(ctx, x - radius * 0.28, peekY - radius * 0.08, radius * 0.07, player.accent, player.accent, false);
    drawCircle(ctx, x + radius * 0.28, peekY - radius * 0.08, radius * 0.07, player.accent, player.accent, false);
    ctx.lineWidth = Math.max(3, radius * 0.08);
    ctx.beginPath();
    ctx.arc(x, peekY + radius * 0.18, radius * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.font = `900 ${Math.max(14, radius * 0.42)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillStyle = player.accent || '#40566c';
    ctx.strokeText(`P${player.id}`, x, peekY + radius * 0.9);
    ctx.fillText(`P${player.id}`, x, peekY + radius * 0.9);
    ctx.restore();
  }

  function drawSlotGuide(ctx, width, height, detections) {
    const locked = Boolean(lockedSlotsRef.current);
    const partialLocks = calibrationLocksRef.current;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px system-ui';
    for (let index = 0; index < playerCount; index += 1) {
      const x = (width / playerCount) * index;
      const slotWidth = width / playerCount;
      const centerX = x + slotWidth / 2;
      const hasPerson = detections.some((detection) => {
        const slotIndex = Math.min(playerCount - 1, Math.max(0, Math.floor(detection.visualX * playerCount)));
        return slotIndex === index;
      });
      const isLocked =
        lockedSlotsRef.current?.some((slot) => slot.playerId === index + 1) || partialLocks[index]?.locked;
      ctx.fillStyle = hasPerson || isLocked ? 'rgba(234, 247, 255, 0.22)' : 'rgba(255, 255, 255, 0.12)';
      ctx.strokeStyle = locked ? 'rgba(73, 167, 115, 0.72)' : 'rgba(255, 255, 255, 0.76)';
      ctx.setLineDash(locked ? [] : [14, 12]);
      ctx.beginPath();
      ctx.rect(x + 5, 7, slotWidth - 10, height - 14);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = locked ? 'rgba(73, 167, 115, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = 'rgba(31, 47, 69, 0.6)';
      ctx.lineWidth = 6;
      ctx.strokeText(`P${index + 1}`, centerX, 38);
      ctx.fillText(`P${index + 1}`, centerX, 38);
    }
    ctx.restore();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const running = phase === 'ready' || phase === 'loading';
  const isLocked = Boolean(lockedSlots);
  const showCameraPlaceholder = phase === 'idle' || phase === 'error';

  return (
    <section className={`camera-strip camera-${phase}`}>
      <div className="camera-status">
        <strong>{message}</strong>
        <span>
          已看到 {seenPlayers}/{playerCount} 位玩家 · {statusText || (disabled ? '等待下一题' : '答题中')}
          {isLocked ? ' · 已锁定位置' : ' · 未锁定位置'}
        </span>
      </div>

      <div className="camera-feed">
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} aria-hidden="true" />
        {!isLocked && (
          <div className={`camera-pose-guide slots-${playerCount}`} aria-hidden="true">
            {Array.from({ length: playerCount }, (_, index) => (
              <div className="pose-slot" key={index}>
                <span className="pose-player">P{index + 1}</span>
                <span className="pose-body">
                  <svg className="pose-character" viewBox="0 0 260 360" role="img" aria-label="双手举高的卡通人物">
                    <defs>
                      <linearGradient id={`poseShirt-${index}`} x1="62" y1="146" x2="196" y2="262" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#6bd8f5" />
                        <stop offset="0.55" stopColor="#8ab8f2" />
                        <stop offset="1" stopColor="#ff7bd5" />
                      </linearGradient>
                    </defs>
                    <path className="pose-character-glow" d="M53 72 C64 22 104 12 130 16 C158 10 198 25 207 72 C229 90 233 124 216 149 C225 184 207 220 175 226 L85 226 C53 218 35 184 44 149 C27 124 31 90 53 72 Z" />
                    <path className="pose-character-arm pose-character-arm-left" d="M98 150 C77 126 56 97 40 57" />
                    <path className="pose-character-arm pose-character-arm-right" d="M162 150 C183 126 204 97 220 57" />
                    <circle className="pose-character-hand" cx="33" cy="43" r="22" />
                    <circle className="pose-character-hand" cx="227" cy="43" r="22" />
                    <path className="pose-character-leg" d="M102 238 L93 319" />
                    <path className="pose-character-leg" d="M158 238 L167 319" />
                    <path className="pose-character-shoe" d="M75 322 C91 314 105 315 119 324 L119 341 L73 341 C67 334 68 327 75 322 Z" />
                    <path className="pose-character-shoe" d="M185 322 C169 314 155 315 141 324 L141 341 L187 341 C193 334 192 327 185 322 Z" />
                    <path className="pose-character-body" fill={`url(#poseShirt-${index})`} d="M82 156 C92 139 110 131 130 131 C150 131 168 139 178 156 L193 246 C178 265 82 265 67 246 Z" />
                    <path className="pose-character-shirt-shine" d="M92 165 C104 151 120 146 138 148 C115 168 101 194 95 230 C88 214 84 181 92 165 Z" />
                    <circle className="pose-character-head" cx="130" cy="92" r="58" />
                    <path className="pose-character-hair" d="M75 82 C79 39 111 22 135 25 C164 22 190 42 193 82 C172 64 148 61 129 69 C108 57 88 63 75 82 Z" />
                    <circle className="pose-character-eye" cx="108" cy="96" r="6" />
                    <circle className="pose-character-eye" cx="152" cy="96" r="6" />
                    <path className="pose-character-mouth" d="M113 119 C124 130 137 130 148 119" />
                    <circle className="pose-character-cheek" cx="93" cy="114" r="9" />
                    <circle className="pose-character-cheek" cx="167" cy="114" r="9" />
                  </svg>
                  <span className="pose-hand-label pose-hand-label-left">左</span>
                  <span className="pose-hand-label pose-hand-label-right">右</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {showCameraPlaceholder && <span className="camera-empty">Camera</span>}
      </div>

      <div className="camera-buttons" aria-label="摄像头控制">
        {!running && (
          <button type="button" onClick={startCamera} title="开启摄像头">
            <Camera size={20} />
          </button>
        )}
        {running && (
          <button type="button" onClick={stopCamera} title="关闭摄像头">
            <VideoOff size={20} />
          </button>
        )}
        <button type="button" onClick={resetRecognition} title="清空当前识别">
          <RefreshCcw size={20} />
        </button>
        <button type="button" onClick={unlockPositions} title="重新锁定站位" disabled={!running}>
          {isLocked ? <Unlock size={20} /> : <Lock size={20} />}
        </button>
      </div>

      <p className="camera-legend">
        {latestGesture ||
          Object.entries(choicesRef.current)
            .map(([id, action]) => `P${id}: ${ACTION_TEXT[action]}`)
            .join(' · ') ||
          '抬左手或右手开始选择'}
      </p>
    </section>
  );
}

function describeCameraError(error) {
  const name = error?.name || '';

  if (name === 'NotAllowedError') return '摄像头权限没有打开，请在浏览器地址栏里允许摄像头';
  if (name === 'NotReadableError') return '摄像头可能正被其他应用或标签页占用';
  if (name === 'NotFoundError') return '没有检测到可用摄像头设备';
  if (name === 'SecurityError') return '当前页面的浏览器安全设置阻止了摄像头';
  if (name === 'AbortError') return '摄像头启动被中断了，请再试一次';
  if (name === 'OverconstrainedError') return '当前摄像头分辨率约束不兼容设备';

  return `摄像头或模型启动失败：${name || '未知错误'}`;
}

function drawCircle(ctx, x, y, radius, fill, stroke, withStroke = true) {
  ctx.save();
  ctx.fillStyle = fill || '#ffffff';
  ctx.strokeStyle = stroke || fill || '#40566c';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (withStroke) ctx.stroke();
  ctx.restore();
}

function drawEar(ctx, x, y, radius, fill, stroke) {
  ctx.save();
  ctx.fillStyle = fill || '#f4b86a';
  ctx.strokeStyle = stroke || '#7b4d24';
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.72, radius, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function bestAssignment(slots, detections, costFor, maxCost) {
  if (!slots?.length || !detections?.length) return [];

  const candidates = slots.map((slot) =>
    detections
      .map((detection, detectionIndex) => ({
        slot,
        detection,
        detectionIndex,
        cost: costFor(slot, detection)
      }))
      .filter((item) => Number.isFinite(item.cost) && item.cost <= maxCost)
      .sort((a, b) => a.cost - b.cost)
  );

  let best = { cost: Number.POSITIVE_INFINITY, items: [] };

  function search(slotIndex, used, items, totalCost) {
    if (totalCost >= best.cost) return;
    if (slotIndex >= slots.length) {
      const missingPenalty = (slots.length - items.length) * maxCost * 2.5;
      const finalCost = totalCost + missingPenalty;
      if (
        items.length > best.items.length ||
        (items.length === best.items.length && finalCost < best.cost)
      ) {
        best = { cost: finalCost, items };
      }
      return;
    }

    candidates[slotIndex].forEach((candidate) => {
      if (used.has(candidate.detectionIndex)) return;
      used.add(candidate.detectionIndex);
      search(slotIndex + 1, used, [...items, candidate], totalCost + candidate.cost);
      used.delete(candidate.detectionIndex);
    });

    search(slotIndex + 1, used, items, totalCost + maxCost * 1.4);
  }

  search(0, new Set(), [], 0);
  return best.items;
}

function blend(previous, current, amount) {
  if (!Number.isFinite(previous)) return current;
  if (!Number.isFinite(current)) return previous;
  return previous * (1 - amount) + current * amount;
}

function classifyLooseHandRaise(frame) {
  const { nodes, body } = frame;
  const leftShoulder = nodes.left_shoulder;
  const rightShoulder = nodes.right_shoulder;
  const leftWrist = nodes.left_wrist;
  const rightWrist = nodes.right_wrist;

  const shoulderWidth =
    isUsable(leftShoulder, 0.2) && isUsable(rightShoulder, 0.2)
      ? Math.max(0.08, Math.abs(leftShoulder.x - rightShoulder.x))
      : 0.12;
  const torso = Math.max(0.12, body.torso || shoulderWidth * 1.7);
  const raiseLimit = Math.max(0.04, shoulderWidth * 0.2, torso * 0.11);

  const leftRaise = isUsable(leftShoulder, 0.2) && isUsable(leftWrist, 0.2) ? leftShoulder.y - leftWrist.y : null;
  const rightRaise =
    isUsable(rightShoulder, 0.2) && isUsable(rightWrist, 0.2) ? rightShoulder.y - rightWrist.y : null;

  const leftHigh = Number.isFinite(leftRaise) && leftRaise > raiseLimit;
  const rightHigh = Number.isFinite(rightRaise) && rightRaise > raiseLimit;
  if (!leftHigh && !rightHigh) return null;

  if (leftHigh && rightHigh) {
    const gap = Math.abs(leftRaise - rightRaise);
    if (gap < shoulderWidth * 0.06) return null;
    return leftRaise > rightRaise
      ? { action: 'left', confidence: confidenceFor(leftRaise, raiseLimit) }
      : { action: 'right', confidence: confidenceFor(rightRaise, raiseLimit) };
  }

  if (leftHigh) return { action: 'left', confidence: confidenceFor(leftRaise, raiseLimit) };
  return { action: 'right', confidence: confidenceFor(rightRaise, raiseLimit) };
}

function classifyBothHandsHigh(frame) {
  const { nodes, body } = frame;
  const leftShoulder = nodes.left_shoulder;
  const rightShoulder = nodes.right_shoulder;
  const leftWrist = nodes.left_wrist;
  const rightWrist = nodes.right_wrist;

  if (![leftShoulder, rightShoulder].every((point) => isUsable(point, 0.14))) {
    return false;
  }

  if (![leftWrist, rightWrist].every((point) => isUsable(point, 0.1))) {
    return false;
  }

  const shoulderWidth = Math.max(0.08, Math.abs(leftShoulder.x - rightShoulder.x));
  const torso = Math.max(0.12, body.torso || shoulderWidth * 1.7);
  const raiseLimit = Math.max(0.032, shoulderWidth * 0.16, torso * 0.085);
  return leftShoulder.y - leftWrist.y > raiseLimit && rightShoulder.y - rightWrist.y > raiseLimit;
}

function confidenceFor(raise, limit) {
  return Math.max(0.52, Math.min(1, 0.56 + raise / (limit * 3.4)));
}
