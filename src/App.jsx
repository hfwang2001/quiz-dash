import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Atom,
  BookOpen,
  BrainCircuit,
  Clapperboard,
  Compass,
  Dna,
  Flag,
  Gamepad2,
  Globe2,
  Landmark,
  Mountain,
  Music,
  Orbit,
  Palette,
  PawPrint,
  Radar,
  Rocket,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  Apple,
  Sigma,
  Zap
} from 'lucide-react';
import MultiPlayerCamera from './components/MultiPlayerCamera.jsx';
import AnimalAvatar from './components/AnimalAvatar.jsx';
import { fetchQuestionImageSession, generateQuizQuestions } from './api/quiz.js';
import { PLAYERS, QUESTIONS as FALLBACK_QUESTIONS } from './questions.js';
import blueBackgroundAsset from './assets/generated/quizdash-blue-background.png';
import monsterForegroundAsset from './assets/generated/quizdash-monster-foreground.png';
import raiseHandsGuideAsset from './assets/generated/quizdash-raise-hands-guide.png';
import quizBgmAsset from './assets/audio/quiz_recurrent.mov';
import tickTockSoundAsset from './assets/audio/tick_tock_clock_timer_mixkit_1045.wav';
import roundEndSoundAsset from './assets/audio/conference_audience_clapping_mixkit_476.wav';

const ROUND_SECONDS = 5;
const REVEAL_SECONDS = 4.5;
const POINTS = [25, 20, 15, 15];
const MAX_SELECTED_TYPES = 3;
const ARCADE_RETURN_CLOSE_MS = 560;
const ARCADE_RETURN_HOLD_MS = 420;
const QUIZ_ENTRY_OPEN_MS = 420;
const ARCADE_LOADING_IMAGE = blueBackgroundAsset;
const QUIZ_BGM_SRC = quizBgmAsset;
const TICK_TOCK_SOUND_SRC = tickTockSoundAsset;
const ROUND_END_SOUND_SRC = roundEndSoundAsset;
const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  audio: false
};
const QUESTION_TYPES = [
  { id: 'art', label: '艺术', icon: Palette, color: '#ff6ec7', glow: 'rgba(255, 110, 199, 0.34)' },
  { id: 'history', label: '历史', icon: Landmark, color: '#f7b955', glow: 'rgba(247, 185, 85, 0.34)' },
  { id: 'sports', label: '体育', icon: Trophy, color: '#00e5ff', glow: 'rgba(0, 229, 255, 0.32)' },
  { id: 'animals', label: '动物', icon: PawPrint, color: '#7dffb3', glow: 'rgba(125, 255, 179, 0.3)' },
  { id: 'literature', label: '文学', icon: BookOpen, color: '#9f8cff', glow: 'rgba(159, 140, 255, 0.3)' },
  { id: 'movie-tv', label: '影视', icon: Clapperboard, color: '#ff8a5b', glow: 'rgba(255, 138, 91, 0.3)' },
  { id: 'world-culture', label: '世界文化', icon: Globe2, color: '#36d6a8', glow: 'rgba(54, 214, 168, 0.3)' },
  { id: 'earth-science', label: '地球科学', icon: Mountain, color: '#4fc3ff', glow: 'rgba(79, 195, 255, 0.3)' },
  { id: 'music', label: '音乐', icon: Music, color: '#ff5bca', glow: 'rgba(255, 91, 202, 0.32)' },
  { id: 'space', label: '太空', icon: Orbit, color: '#7cb8ff', glow: 'rgba(124, 184, 255, 0.3)' },
  { id: 'countries', label: '国家', icon: Flag, color: '#ffd166', glow: 'rgba(255, 209, 102, 0.3)' },
  { id: 'computers-games', label: '计算机与游戏', icon: Gamepad2, color: '#00f0b5', glow: 'rgba(0, 240, 181, 0.3)' },
  { id: 'human-biology', label: '人体生物学', icon: Dna, color: '#ff7ad9', glow: 'rgba(255, 122, 217, 0.32)' },
  { id: 'food', label: '食物', icon: Apple, color: '#ff8f70', glow: 'rgba(255, 143, 112, 0.3)' },
  { id: 'math', label: '数学', icon: Sigma, color: '#6fd3ff', glow: 'rgba(111, 211, 255, 0.3)' }
];
const KEYS = {
  q: [1, 'left'],
  w: [1, 'right'],
  r: [2, 'left'],
  t: [2, 'right'],
  u: [3, 'left'],
  i: [3, 'right'],
  o: [4, 'left'],
  p: [4, 'right']
};

export default function App() {
  const initialQuizEntryTransition = useMemo(() => readQuizEntryTransition(), []);
  const [playerCount, setPlayerCount] = useState(4);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([]);
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [generatedSelectionKey, setGeneratedSelectionKey] = useState('');
  const [imageSessionId, setImageSessionId] = useState('');
  const [questionImageStates, setQuestionImageStates] = useState({});
  const [imageSessionStatus, setImageSessionStatus] = useState('idle');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generationNotice, setGenerationNotice] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState('category');
  const [scores, setScores] = useState(() => Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
  const [choices, setChoices] = useState({});
  const [correctSince, setCorrectSince] = useState({});
  const [roundRanks, setRoundRanks] = useState([]);
  const [calibrated, setCalibrated] = useState(false);
  const [showFaceBadges, setShowFaceBadges] = useState(false);
  const [arcadeTransition, setArcadeTransition] = useState(() =>
    initialQuizEntryTransition
      ? { active: true, held: true, center: initialQuizEntryTransition.center, radius: 0 }
      : { active: false, held: false, center: null, radius: null }
  );
  const [prestartedCameraStream, setPrestartedCameraStream] = useState(null);
  const [cameraPreflight, setCameraPreflight] = useState('idle');
  const [playerViews, setPlayerViews] = useState({ stream: null, streams: {}, crops: {} });
  const revealLockRef = useRef(false);
  const generationRequestRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const arcadeTransitionRef = useRef(null);
  const arcadeIrisAnimationFrameRef = useRef(0);
  const arcadeReturnInProgressRef = useRef(false);
  const bgmRef = useRef(null);
  const tickTockRef = useRef(null);
  const roundEndRef = useRef(null);
  const choicesRef = useRef({});
  const correctSinceRef = useRef({});
  const questionRef = useRef(null);
  const activePlayersRef = useRef([]);
  const audioContextRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const previousPhaseRef = useRef(phase);
  const roundEndPromiseRef = useRef(Promise.resolve());
  const tickTockStopTimerRef = useRef(0);

  const question = questions[questionIndex] ?? questions[0] ?? FALLBACK_QUESTIONS[0];
  const activePlayers = PLAYERS.slice(0, playerCount);
  const roundNumber = questionIndex + 1;
  questionRef.current = question;
  activePlayersRef.current = activePlayers;

  useEffect(() => {
    if (!initialQuizEntryTransition) return undefined;

    let cancelled = false;
    const center = initialQuizEntryTransition.center;
    const maxRadius = getMaxArcadeIrisRadius(center);
    const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    async function playEntryTransition() {
      await wait(180);
      if (cancelled) return;
      setArcadeTransition({ active: true, held: false, center, radius: 0 });
      await animateArcadeIris(center, 0, maxRadius, shouldReduceMotion ? 0 : QUIZ_ENTRY_OPEN_MS, easeOutCubic);
      if (cancelled) return;
      setArcadeTransition({ active: false, held: false, center: null, radius: null });
    }

    playEntryTransition();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(arcadeIrisAnimationFrameRef.current);
    };
  }, [initialQuizEntryTransition]);

  useEffect(() => {
    const bgm = new Audio(QUIZ_BGM_SRC);
    bgm.loop = true;
    bgm.volume = 0.28;
    bgm.preload = 'auto';
    bgmRef.current = bgm;
    const tickTock = new Audio(TICK_TOCK_SOUND_SRC);
    tickTock.volume = 0.42;
    tickTock.preload = 'auto';
    tickTockRef.current = tickTock;
    const roundEnd = new Audio(ROUND_END_SOUND_SRC);
    roundEnd.volume = 0.5;
    roundEnd.playbackRate = 2;
    roundEnd.preload = 'auto';
    roundEndRef.current = roundEnd;

    function unlockAudio() {
      audioUnlockedRef.current = true;
      getQuizAudioContext(audioContextRef)?.resume?.();
      bgm.play().catch(() => {});
    }

    function handleButtonClick(event) {
      if (!event.target?.closest?.('button, [role="button"]')) return;
      unlockAudio();
      playBubbleSound(audioContextRef);
    }

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('click', handleButtonClick, true);

    return () => {
      document.removeEventListener('click', handleButtonClick, true);
      bgm.pause();
      bgm.src = '';
      bgmRef.current = null;
      tickTock.pause();
      tickTock.src = '';
      tickTockRef.current = null;
      window.clearTimeout(tickTockStopTimerRef.current);
      roundEnd.pause();
      roundEnd.src = '';
      roundEndRef.current = null;
      audioContextRef.current?.close?.();
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioUnlockedRef.current) return;
    if (phase === 'results') {
      bgmRef.current?.pause();
    } else {
      bgmRef.current?.play().catch(() => {});
    }
  }, [phase]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    if (phase === 'results' && previousPhase !== 'results') {
      playCelebrationSound(audioContextRef);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    setShowFaceBadges(false);
    playTimedAudioClip(tickTockRef, ROUND_SECONDS * 1000, tickTockStopTimerRef);
    const tick = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(tick);
          stopTimedAudioClip(tickTockRef, tickTockStopTimerRef);
          roundEndPromiseRef.current = playAudioClip(roundEndRef);
          revealRound();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(tick);
      stopTimedAudioClip(tickTockRef, tickTockStopTimerRef);
    };
  }, [phase, questionIndex]);

  useEffect(() => {
    if (phase !== 'setup' || !calibrated) return undefined;
    const timer = window.setTimeout(() => {
      startGame();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [phase, calibrated]);

  useEffect(() => {
    if (phase !== 'reveal') {
      setShowFaceBadges(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setShowFaceBadges(true);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [phase, questionIndex]);

  useEffect(() => {
    if (phase !== 'reveal') return undefined;
    let cancelled = false;
    const revealDelay = wait(REVEAL_SECONDS * 1000);

    Promise.all([revealDelay, roundEndPromiseRef.current]).then(() => {
      if (cancelled) return;
      nextRound();
    });

    return () => {
      cancelled = true;
    };
  }, [phase, questionIndex]);

  useEffect(() => {
    function handleKeyDown(event) {
      const match = KEYS[event.key.toLowerCase()];
      if (!match || phase !== 'playing') return;
      const [playerId, answer] = match;
      if (playerId > playerCount) return;
      applySingleChoice(playerId, answer);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, playerCount, question?.correct]);

  useEffect(() => {
    if (!imageSessionId || imageSessionStatus === 'completed' || imageSessionStatus === 'failed') {
      return undefined;
    }

    let cancelled = false;

    async function pollImageSession() {
      try {
        const snapshot = await fetchQuestionImageSession(imageSessionId);
        if (cancelled) return;
        setImageSessionStatus(snapshot.status || 'running');
        setQuestionImageStates(indexQuestionImageStates(snapshot.questions));
      } catch (error) {
        if (cancelled) return;
        console.error(error);
      }
    }

    pollImageSession();
    const timer = window.setInterval(pollImageSession, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [imageSessionId, imageSessionStatus]);

  function applyChoices(nextChoices) {
    const now = performance.now();
    const currentQuestion = questionRef.current;
    const currentActivePlayers = activePlayersRef.current;
    const nextCorrectSince = { ...correctSinceRef.current };

    currentActivePlayers.forEach((player) => {
      const answer = nextChoices[player.id];
      if (answer === currentQuestion.correct) {
        nextCorrectSince[player.id] ??= now;
      } else {
        delete nextCorrectSince[player.id];
      }
    });

    choicesRef.current = nextChoices;
    correctSinceRef.current = nextCorrectSince;
    setChoices(nextChoices);
    setCorrectSince(nextCorrectSince);
  }

  function applySingleChoice(playerId, answer) {
    const now = performance.now();
    const currentQuestion = questionRef.current;
    const nextChoices = { ...choicesRef.current, [playerId]: answer };
    const nextCorrectSince = { ...correctSinceRef.current };

    if (answer === currentQuestion.correct) {
      nextCorrectSince[playerId] ??= now;
    } else {
      delete nextCorrectSince[playerId];
    }

    choicesRef.current = nextChoices;
    correctSinceRef.current = nextCorrectSince;
    setChoices(nextChoices);
    setCorrectSince(nextCorrectSince);
  }

  function revealRound() {
    if (revealLockRef.current) return;
    revealLockRef.current = true;
    setPhase('reveal');
    setShowFaceBadges(false);
    const currentQuestion = questionRef.current;
    const currentActivePlayers = activePlayersRef.current;
    const currentChoices = choicesRef.current;
    const currentCorrectSince = correctSinceRef.current;
    const ranking = currentActivePlayers
      .filter((player) => currentChoices[player.id] === currentQuestion.correct)
      .map((player) => ({ ...player, answeredAt: currentCorrectSince[player.id] ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.answeredAt - b.answeredAt)
      .map((player, index) => ({ ...player, points: POINTS[index] ?? 15, rank: index + 1 }));

    setRoundRanks(ranking);
    setScores((current) => {
      const next = { ...current };
      ranking.forEach((player) => {
        next[player.id] += player.points;
      });
      return next;
    });
  }

  function resetRoundChoices() {
    choicesRef.current = {};
    correctSinceRef.current = {};
    setChoices({});
    setCorrectSince({});
  }

  function nextRound() {
    revealLockRef.current = false;
    if (questionIndex >= questions.length - 1) {
      setTimeLeft(0);
      setPhase('results');
      resetRoundChoices();
      setRoundRanks([]);
      setShowFaceBadges(false);
      return;
    }

    setQuestionIndex(questionIndex + 1);
    setTimeLeft(ROUND_SECONDS);
    setPhase('playing');
    resetRoundChoices();
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function startGame() {
    revealLockRef.current = false;
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('playing');
    resetRoundChoices();
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  async function startCalibration() {
    revealLockRef.current = false;
    cameraRequestRef.current += 1;
    const requestId = cameraRequestRef.current;
    stopPrestartedCameraStream();
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('setup');
    setCalibrated(false);
    setCameraPreflight('starting');
    setScores(Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
    resetRoundChoices();
    setRoundRanks([]);
    setShowFaceBadges(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setPrestartedCameraStream(stream);
      setCameraPreflight('ready');
    } catch (error) {
      console.error('Failed to prestart camera from start button', error);
      if (cameraRequestRef.current === requestId) {
        setCameraPreflight('failed');
      }
    }
  }

  function restartGame(nextCount = playerCount) {
    revealLockRef.current = false;
    generationRequestRef.current += 1;
    cameraRequestRef.current += 1;
    stopPrestartedCameraStream();
    setCameraPreflight('idle');
    setQuestions(FALLBACK_QUESTIONS);
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setIsGeneratingQuestions(false);
    setGenerationError('');
    setGenerationNotice('');
    setPlayerCount(nextCount);
    setSelectedQuestionTypes([]);
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('category');
    setCalibrated(false);
    setScores(Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
    resetRoundChoices();
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function replaySameGame() {
    startCalibration();
  }

  function toggleQuestionType(typeId) {
    setSelectedQuestionTypes((current) => {
      if (current.includes(typeId)) {
        return current.filter((item) => item !== typeId);
      }

      if (current.length >= MAX_SELECTED_TYPES) {
        return current;
      }

      return [...current, typeId];
    });
  }

  function returnToCategoryHome() {
    generationRequestRef.current += 1;
    cameraRequestRef.current += 1;
    stopPrestartedCameraStream();
    setCameraPreflight('idle');
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setGenerationError('');
    setGenerationNotice('');
    setIsGeneratingQuestions(false);
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('category');
    setCalibrated(false);
    setScores(Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
    resetRoundChoices();
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function returnToCategorySelection() {
    generationRequestRef.current += 1;
    cameraRequestRef.current += 1;
    stopPrestartedCameraStream();
    setCameraPreflight('idle');
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setGenerationError('');
    setGenerationNotice('');
    setIsGeneratingQuestions(false);
    setPhase('category');
  }

  function setArcadeIrisMask(center, radius) {
    const overlay = arcadeTransitionRef.current;
    if (!overlay) return;
    overlay.style.setProperty('--iris-x', `${center.x.toFixed(2)}px`);
    overlay.style.setProperty('--iris-y', `${center.y.toFixed(2)}px`);
    overlay.style.setProperty('--iris-radius', `${Math.max(radius, 0).toFixed(2)}px`);
  }

  function getArcadeReturnCenter(event, target) {
    if (event?.detail > 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }

    const bounds = target?.getBoundingClientRect();
    if (bounds) {
      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2
      };
    }

    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
  }

  function getMaxArcadeIrisRadius(center) {
    const farthestX = Math.max(center.x, window.innerWidth - center.x);
    const farthestY = Math.max(center.y, window.innerHeight - center.y);
    return Math.hypot(farthestX, farthestY) + 16;
  }

  function animateArcadeIris(center, fromRadius, toRadius, durationMs, easing = easeInCubic) {
    window.cancelAnimationFrame(arcadeIrisAnimationFrameRef.current);

    if (durationMs <= 0) {
      setArcadeIrisMask(center, toRadius);
      return Promise.resolve();
    }

    const start = performance.now();
    setArcadeIrisMask(center, fromRadius);

    return new Promise((resolve) => {
      function tick(now) {
        const progress = clamp((now - start) / durationMs, 0, 1);
        const eased = easing(progress);
        setArcadeIrisMask(center, fromRadius + (toRadius - fromRadius) * eased);

        if (progress < 1) {
          arcadeIrisAnimationFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        arcadeIrisAnimationFrameRef.current = 0;
        resolve();
      }

      arcadeIrisAnimationFrameRef.current = window.requestAnimationFrame(tick);
    });
  }

  function buildArcadeReturnUrl(center) {
    const url = new URL('/', window.location.origin);
    const payload = {
      source: 'quiz',
      irisX: clamp(center.x / window.innerWidth, 0, 1),
      irisY: clamp(center.y / window.innerHeight, 0, 1)
    };

    try {
      window.sessionStorage.setItem('quizReturnTransition', JSON.stringify(payload));
    } catch {
      url.searchParams.set('returnTransition', 'quiz');
      url.searchParams.set('irisX', payload.irisX.toFixed(4));
      url.searchParams.set('irisY', payload.irisY.toFixed(4));
    }

    return `${url.pathname}${url.search}`;
  }

  async function returnToArcade(event) {
    event?.preventDefault();
    if (arcadeReturnInProgressRef.current) return;
    arcadeReturnInProgressRef.current = true;

    const target = event?.currentTarget;
    const center = getArcadeReturnCenter(event, target);
    const maxRadius = getMaxArcadeIrisRadius(center);
    const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setArcadeIrisMask(center, maxRadius);
    setArcadeTransition({ active: true, held: false });
    await wait(20);
    await animateArcadeIris(center, maxRadius, 0, shouldReduceMotion ? 0 : ARCADE_RETURN_CLOSE_MS);
    setArcadeTransition({ active: true, held: true });
    await wait(shouldReduceMotion ? 120 : ARCADE_RETURN_HOLD_MS);
    window.location.href = buildArcadeReturnUrl(center);
  }

  function returnToCountSelection() {
    revealLockRef.current = false;
    cameraRequestRef.current += 1;
    stopPrestartedCameraStream();
    setCameraPreflight('idle');
    setGenerationError('');
    setPhase('count');
    setCalibrated(false);
    setShowFaceBadges(false);
  }

  async function generateQuestionsForSelection(typeIds) {
    if (!typeIds.length) return;

    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    setIsGeneratingQuestions(true);
    setGenerationError('');
    setGenerationNotice('');
    setGeneratedSelectionKey('');

    try {
      const selectedCategories = QUESTION_TYPES.filter((item) => typeIds.includes(item.id)).map((item) => item.label);
      const result = await generateQuizQuestions({
        categories: selectedCategories,
        questionCount: FALLBACK_QUESTIONS.length
      });

      if (generationRequestRef.current !== requestId) return;
      setQuestions(result.questions);
      setGeneratedSelectionKey(createSelectionKey(typeIds));
      setImageSessionId(result.imageSession?.sessionId || '');
      setImageSessionStatus(result.imageSession?.status || 'idle');
      setQuestionImageStates(indexQuestionImageStates(result.imageSession?.questions || []));
    } catch (error) {
      if (generationRequestRef.current !== requestId) return;
      console.warn('Question generation unavailable, using fallback questions.', error);
      setQuestions(FALLBACK_QUESTIONS);
      setGeneratedSelectionKey(createSelectionKey(typeIds));
      setImageSessionId('');
      setQuestionImageStates({});
      setImageSessionStatus('unavailable');
      setGenerationError('');
      setGenerationNotice('在线题目生成暂不可用，已使用内置题库。');
    } finally {
      if (generationRequestRef.current !== requestId) return;
      setIsGeneratingQuestions(false);
    }
  }

  function stopPrestartedCameraStream() {
    setPrestartedCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }

  function handleProceedToCount() {
    if (!selectedQuestionTypes.length) return;
    setPhase('count');
    generateQuestionsForSelection(selectedQuestionTypes);
  }

  function handleRetryGeneration() {
    if (!selectedQuestionTypes.length || isGeneratingQuestions) return;
    generateQuestionsForSelection(selectedQuestionTypes);
  }

  const progress = useMemo(() => `${Math.max(0, (timeLeft / ROUND_SECONDS) * 100)}%`, [timeLeft]);
  const leftChoicePlayers = activePlayers.filter((player) => choices[player.id] === 'left');
  const rightChoicePlayers = activePlayers.filter((player) => choices[player.id] === 'right');
  const finalRanking = useMemo(
    () =>
      activePlayers
        .map((player) => ({
          ...player,
          score: scores[player.id] ?? 0
        }))
        .sort((a, b) => (b.score - a.score) || (a.id - b.id)),
    [activePlayers, scores]
  );
  const topScore = finalRanking[0]?.score ?? 0;
  const champions = finalRanking.filter((player) => player.score === topScore);
  const championNames = champions.map((player) => player.name).join(' / ');
  const selectedTypeLabels = QUESTION_TYPES.filter((item) => selectedQuestionTypes.includes(item.id)).map(
    (item) => item.label
  );
  const isTypeLimitReached = selectedQuestionTypes.length >= MAX_SELECTED_TYPES;
  const currentSelectionKey = createSelectionKey(selectedQuestionTypes);
  const isQuestionSetReady =
    generatedSelectionKey === currentSelectionKey && !isGeneratingQuestions && !generationError && questions.length > 0;
  const currentQuestionImages = questionImageStates[question.id] || null;

  return (
    <main className={`game-app paper-app phase-${phase}`}>
      {phase === 'category' && (
        <section className="paper-screen category-stage" aria-label="选择题目类型">
          <button className="back-button paper-back" type="button" onClick={returnToArcade} aria-label="返回乐园">
            <ArrowLeft size={22} />
          </button>

          <PaperMonster
            className="monster-choice"
            mouthClassName="mouth-cards"
            actions={
              <button
                className="paper-cta"
                type="button"
                onClick={handleProceedToCount}
                disabled={!selectedQuestionTypes.length}
                aria-label={
                  selectedTypeLabels.length
                    ? `选择题目类型，已选择 ${selectedTypeLabels.join('、')}`
                    : `选择题目类型，最多选择 ${MAX_SELECTED_TYPES} 个`
                }
              >
                选择题目类型
              </button>
            }
          >
            <div className="paper-card-rail topic-rail" aria-label="题目类型">
              {QUESTION_TYPES.map((type) => (
                <button
                  key={type.id}
                  className={`topic-card ${selectedQuestionTypes.includes(type.id) ? 'is-active' : ''}`}
                  disabled={isTypeLimitReached && !selectedQuestionTypes.includes(type.id)}
                  onClick={() => toggleQuestionType(type.id)}
                  style={
                    {
                      '--category-accent': type.color,
                      '--category-glow': type.glow
                    }
                  }
                  type="button"
                >
                  <span className="topic-illustration" aria-hidden="true">
                    <type.icon size={64} />
                  </span>
                  <strong>{type.label}</strong>
                </button>
              ))}
            </div>
          </PaperMonster>
        </section>
      )}

      {phase === 'count' && (
        <section className="paper-screen count-stage" aria-label="选择玩家人数">
          <button className="back-button paper-back" type="button" onClick={returnToCategorySelection} aria-label="返回题型选择">
            <ArrowLeft size={22} />
          </button>

          <PaperMonster
            className="monster-count"
            mouthClassName="mouth-cards"
            actions={
              <button
                className="paper-cta"
                type="button"
                onClick={isQuestionSetReady ? startCalibration : handleRetryGeneration}
                disabled={isGeneratingQuestions}
                aria-label={
                  generationError ||
                  generationNotice ||
                  (isGeneratingQuestions ? '正在生成题目' : isQuestionSetReady ? '题目已准备好，可以开始游戏' : '准备题目')
                }
              >
                {isGeneratingQuestions ? '正在生成题目' : isQuestionSetReady ? '开始游戏' : '重新生成题目'}
              </button>
            }
          >
            <div className="paper-card-rail player-count-rail" aria-label="玩家人数">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={`player-count-card ${count === playerCount ? 'is-active' : ''}`}
                  onClick={() => setPlayerCount(count)}
                  type="button"
                >
                  <PlayerCountIllustration count={count} />
                  <strong>{count} 人</strong>
                </button>
              ))}
            </div>
          </PaperMonster>
        </section>
      )}

      {phase !== 'category' && phase !== 'count' && phase !== 'results' && (
        <section className={`camera-surface ${phase === 'setup' ? 'is-calibration' : 'is-side camera-engine'}`}>
          {phase === 'setup' && (
            <>
              <img className="raise-guide-asset" src={raiseHandsGuideAsset} alt="" aria-hidden="true" />
              <button
                className="back-button paper-back"
                type="button"
                onClick={returnToCountSelection}
                aria-label="返回人数选择"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="raise-title-card">
                <h1>请双手举高开始游戏</h1>
                <span>检测到动作后自动开始</span>
              </div>
            </>
          )}

          <div className="motion-frame">
            <MultiPlayerCamera
              playerCount={playerCount}
              disabled={phase !== 'playing'}
              statusText={phase === 'setup' ? '站位准备中' : undefined}
              autoStart={phase === 'setup' && cameraPreflight !== 'starting' && !prestartedCameraStream}
              initialStream={prestartedCameraStream}
              roundKey={phase === 'playing' ? questionIndex : null}
              showFaceBadges={showFaceBadges}
              players={activePlayers}
              onChoices={(nextChoices) => applyChoices(nextChoices)}
              onCalibrationChange={setCalibrated}
              onPlayerViews={setPlayerViews}
            />
          </div>

          {phase === 'setup' && (
            <div className="game-buttons setup-actions">
              <button className="paper-cta" type="button" onClick={startGame} disabled={!calibrated}>
                {calibrated ? '即将开始' : '等待举手'}
              </button>
              <button className="paper-cta paper-cta-secondary" type="button" onClick={() => restartGame()}>
                <RotateCcw size={18} />
                重新开始
              </button>
            </div>
          )}
        </section>
      )}

      {phase !== 'category' && phase !== 'count' && phase !== 'setup' && phase !== 'results' && (
        <section className="paper-screen play-stage" aria-label="答题界面">
          <PaperMonster
            className="monster-play"
            mouthClassName="mouth-question"
            footer={
              <section className={`player-row paper-player-row players-${playerCount}`} aria-label="玩家镜头与分数">
                {activePlayers.map((player) => (
                  <PlayerDesk
                    key={player.id}
                    player={player}
                    score={scores[player.id]}
                    choice={choices[player.id]}
                    correct={question.correct}
                    phase={phase}
                    rank={roundRanks.find((item) => item.id === player.id)}
                    stream={playerViews.streams?.[player.id] || playerViews.stream}
                    crop={playerViews.crops[player.id]}
                    onChoose={(answer) => phase === 'playing' && applySingleChoice(player.id, answer)}
                  />
                ))}
              </section>
            }
          >
            <div className="question-flip-stack">
              <div className="question-side-card question-side-card-left" aria-hidden="true" />
              <div className="question-side-card question-side-card-right" aria-hidden="true" />
              <article className={`question-flip-card ${phase === 'reveal' ? 'is-revealed' : ''}`}>
                <div className="question-card-top">
                  <span>{question.category}</span>
                  <strong>第 {roundNumber} / {questions.length} 题</strong>
                  <em>{timeLeft}</em>
                </div>
                <h1>{question.prompt}</h1>
                <div className="answer-lanes" aria-label="两个选项">
                  <button
                    className={`answer-card left ${phase === 'reveal' && question.correct === 'left' ? 'is-correct' : ''} ${
                      phase === 'reveal' && question.correct !== 'left' ? 'is-dimmed' : ''
                    }`}
                    type="button"
                  >
                    <ChoiceAvatars players={leftChoicePlayers} />
                    <span>A</span>
                    <strong>{question.options[0]}</strong>
                  </button>
                  <button
                    className={`answer-card right ${phase === 'reveal' && question.correct === 'right' ? 'is-correct' : ''} ${
                      phase === 'reveal' && question.correct !== 'right' ? 'is-dimmed' : ''
                    }`}
                    type="button"
                  >
                    <ChoiceAvatars players={rightChoicePlayers} />
                    <span>B</span>
                    <strong>{question.options[1]}</strong>
                  </button>
                </div>
              </article>
            </div>
          </PaperMonster>

          <div className="paper-tools" aria-label="调试控制">
            <button type="button" onClick={nextRound} aria-label="下一题">
              <SkipForward size={18} />
            </button>
            <button type="button" onClick={() => restartGame()} aria-label="重新开始">
              <RotateCcw size={18} />
            </button>
          </div>
        </section>
      )}

      {phase === 'results' && (
        <section className="paper-screen results-stage" aria-label="本局结算">
          <PaperMonster
            className="monster-results"
            mouthClassName="mouth-results"
            actions={
              <div className="results-actions">
                <button className="paper-cta" type="button" onClick={replaySameGame}>
                  再玩一局
                </button>
                <button className="paper-cta paper-cta-secondary" type="button" onClick={returnToCategoryHome}>
                  不玩啦
                </button>
              </div>
            }
          >
            <div className="winner-video">
              <div className="winner-title">恭喜获胜！<span aria-hidden="true">♛</span></div>
              <div className="winner-video-frame">
                <span className="winner-badge">P{champions[0]?.id || activePlayers[0]?.id}</span>
                <AnimalAvatar
                  type={champions[0]?.avatar || activePlayers[0]?.avatar}
                  color={champions[0]?.color || activePlayers[0]?.color}
                  accent={champions[0]?.accent || activePlayers[0]?.accent}
                />
                <span className="winner-score">{topScore} 分</span>
              </div>
            </div>
          </PaperMonster>
        </section>
      )}

      <div
        className={`arcade-return-overlay ${arcadeTransition.active ? 'is-active' : ''} ${
          arcadeTransition.held ? 'is-loading-held' : ''
        }`}
        ref={arcadeTransitionRef}
        style={
          arcadeTransition.center && arcadeTransition.radius !== null
            ? {
                '--iris-x': `${arcadeTransition.center.x.toFixed(2)}px`,
                '--iris-y': `${arcadeTransition.center.y.toFixed(2)}px`,
                '--iris-radius': `${Math.max(arcadeTransition.radius, 0).toFixed(2)}px`
              }
            : undefined
        }
        aria-hidden="true"
      >
        <img className="arcade-return-background" src={ARCADE_LOADING_IMAGE} alt="" />
        <div className="arcade-return-copy">
          <div className="arcade-return-title">加载中</div>
          <div className="arcade-return-indicator">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}

function readQuizEntryTransition() {
  try {
    const savedTransition = window.sessionStorage.getItem('quizEntryTransition');
    if (!savedTransition) return null;

    window.sessionStorage.removeItem('quizEntryTransition');
    const payload = JSON.parse(savedTransition);
    if (payload?.source !== 'main-menu') return null;

    const xRatio = Number(payload.irisX);
    const yRatio = Number(payload.irisY);
    return {
      center: {
        x: clamp(Number.isFinite(xRatio) ? xRatio : 0.5, 0, 1) * window.innerWidth,
        y: clamp(Number.isFinite(yRatio) ? yRatio : 0.5, 0, 1) * window.innerHeight
      }
    };
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInCubic(value) {
  return value * value * value;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getQuizAudioContext(audioContextRef) {
  if (typeof window === 'undefined') return null;
  if (!audioContextRef.current) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContextRef.current = new AudioContextClass();
  }
  return audioContextRef.current;
}

function createGainNode(audioContext, volume, startTime, endTime) {
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
  gain.connect(audioContext.destination);
  return gain;
}

function playTone(audioContextRef, { frequency, type = 'sine', volume = 0.16, delay = 0, duration = 0.18, bendTo = null }) {
  const audioContext = getQuizAudioContext(audioContextRef);
  if (!audioContext) return;

  const startTime = audioContext.currentTime + delay;
  const endTime = startTime + duration;
  const oscillator = audioContext.createOscillator();
  const gain = createGainNode(audioContext, volume, startTime, endTime);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (bendTo) {
    oscillator.frequency.exponentialRampToValueAtTime(bendTo, endTime);
  }

  oscillator.connect(gain);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
}

function playBubbleSound(audioContextRef) {
  playTone(audioContextRef, { frequency: 560, bendTo: 940, volume: 0.11, duration: 0.12 });
  playTone(audioContextRef, { frequency: 780, bendTo: 1240, volume: 0.08, delay: 0.045, duration: 0.1 });
}

function playAudioClip(audioRef) {
  const audio = audioRef.current;
  if (!audio) return Promise.resolve();
  audio.currentTime = 0;
  return new Promise((resolve) => {
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      resolve();
    }

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    audio.play().catch(finish);
  });
}

function stopAudioClip(audioRef) {
  const audio = audioRef.current;
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function playTimedAudioClip(audioRef, durationMs, stopTimerRef) {
  stopTimedAudioClip(audioRef, stopTimerRef);
  playAudioClip(audioRef);
  stopTimerRef.current = window.setTimeout(() => {
    stopTimedAudioClip(audioRef, stopTimerRef);
  }, durationMs);
}

function stopTimedAudioClip(audioRef, stopTimerRef) {
  window.clearTimeout(stopTimerRef.current);
  stopTimerRef.current = 0;
  stopAudioClip(audioRef);
}

function playCelebrationSound(audioContextRef) {
  [392, 523, 659, 784, 1046, 1318].forEach((frequency, index) => {
    playTone(audioContextRef, {
      frequency,
      type: 'triangle',
      volume: 0.13,
      delay: index * 0.065,
      duration: 0.32,
      bendTo: frequency * 1.16
    });
  });
}

function createSelectionKey(typeIds) {
  return [...typeIds].sort().join('|');
}

function indexQuestionImageStates(questions) {
  const next = {};
  for (const question of Array.isArray(questions) ? questions : []) {
    next[question.id] = {
      left: question.left || null,
      right: question.right || null
    };
  }
  return next;
}

function PaperMonster({ className = '', mouthClassName = '', children, actions = null, footer = null }) {
  return (
    <div className={`paper-monster ${className}`}>
      <div className="mouth-black-layer" aria-hidden="true" />
      <div className={`monster-mouth ${mouthClassName}`}>{children}</div>
      <img className="monster-foreground-asset" src={monsterForegroundAsset} alt="" aria-hidden="true" />
      {actions && <div className="monster-button-layer">{actions}</div>}
      {footer && <div className="monster-footer">{footer}</div>}
    </div>
  );
}

function PlayerCountIllustration({ count }) {
  return (
    <span className={`player-count-illustration count-${count}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span className="kid-face" key={index}>
          <span className="kid-hair" />
          <span className="kid-eye kid-eye-left" />
          <span className="kid-eye kid-eye-right" />
          <span className="kid-smile" />
        </span>
      ))}
    </span>
  );
}

function SubjectBadge({ icon, className = '' }) {
  return (
    <span className={`subject-badge ${className}`}>
      {icon}
    </span>
  );
}

function ChoiceAvatars({ players }) {
  if (!players.length) return null;

  return (
    <div className="choice-avatars" aria-hidden="true">
      {players.map((player) => (
        <span className="choice-avatar" key={player.id}>
          <AnimalAvatar type={player.avatar} color={player.color} accent={player.accent} />
        </span>
      ))}
    </div>
  );
}

function OptionImage({ state, label }) {
  if (state?.status === 'ready' && state.imageUrl) {
    return (
      <div className="answer-image-shell" aria-hidden="true">
        <img className="answer-image" src={state.imageUrl} alt="" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="answer-image-shell is-placeholder" aria-hidden="true">
        <div className="answer-image-placeholder">
          <span>{label}</span>
        </div>
      </div>
    );
  }

  const statusText =
    state?.status === 'error'
      ? '图片生成失败'
      : state?.status === 'generating'
        ? '正在生成图片'
        : '等待生成图片';

  return (
    <div className={`answer-image-shell is-placeholder ${state?.status === 'error' ? 'is-error' : ''}`} aria-hidden="true">
      <div className="answer-image-placeholder">
        <span>{label}</span>
        <strong>{statusText}</strong>
      </div>
    </div>
  );
}

function PlayerDesk({ player, score, choice, correct, phase, rank, stream, crop, onChoose }) {
  const isCorrect = phase === 'reveal' && choice === correct;

  return (
    <article className={`player-desk ${choice ? `choice-${choice}` : ''} ${isCorrect ? 'is-correct' : ''}`}>
      <span className="player-badge">P{player.id}</span>
      <PlayerCameraCrop player={player} stream={stream} crop={crop} />
      <div className="score-plate">
        <strong>{score} 分</strong>
      </div>
      <div className="desk-actions">
        <button className={choice === 'left' ? 'is-picked' : ''} onClick={() => onChoose('left')} type="button">
          A
        </button>
        <button className={choice === 'right' ? 'is-picked' : ''} onClick={() => onChoose('right')} type="button">
          B
        </button>
      </div>
      {rank && <span className="rank-ribbon">+{rank.points}</span>}
    </article>
  );
}

function PlayerCameraCrop({ player, stream, crop }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play?.().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  if (!stream || !crop) {
    return (
      <div className="player-video-avatar is-placeholder">
        <AnimalAvatar type={player.avatar} color={player.color} accent={player.accent} />
        <span className="hand-glow hand-glow-left" />
        <span className="hand-glow hand-glow-right" />
      </div>
    );
  }

  const videoStyle = {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`
  };

  return (
    <div className="player-camera-crop">
      <video ref={videoRef} muted playsInline style={videoStyle} />
    </div>
  );
}
