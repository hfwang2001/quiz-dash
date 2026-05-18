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
  Play,
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

const ROUND_SECONDS = 8;
const REVEAL_SECONDS = 4.5;
const POINTS = [25, 20, 15, 15];
const MAX_SELECTED_TYPES = 3;
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
  const [playerCount, setPlayerCount] = useState(4);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([]);
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [generatedSelectionKey, setGeneratedSelectionKey] = useState('');
  const [imageSessionId, setImageSessionId] = useState('');
  const [questionImageStates, setQuestionImageStates] = useState({});
  const [imageSessionStatus, setImageSessionStatus] = useState('idle');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState('start');
  const [scores, setScores] = useState(() => Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
  const [choices, setChoices] = useState({});
  const [correctSince, setCorrectSince] = useState({});
  const [roundRanks, setRoundRanks] = useState([]);
  const [calibrated, setCalibrated] = useState(false);
  const [showFaceBadges, setShowFaceBadges] = useState(false);
  const revealLockRef = useRef(false);
  const generationRequestRef = useRef(0);

  const question = questions[questionIndex] ?? questions[0] ?? FALLBACK_QUESTIONS[0];
  const activePlayers = PLAYERS.slice(0, playerCount);
  const roundNumber = questionIndex + 1;

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    setShowFaceBadges(false);
    const tick = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(tick);
          revealRound();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase, questionIndex, playerCount, choices, correctSince]);

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
    const timer = window.setTimeout(() => {
      nextRound();
    }, REVEAL_SECONDS * 1000);
    return () => window.clearTimeout(timer);
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
    const nextCorrectSince = { ...correctSince };

    activePlayers.forEach((player) => {
      const answer = nextChoices[player.id];
      if (answer === question.correct) {
        nextCorrectSince[player.id] ??= now;
      } else {
        delete nextCorrectSince[player.id];
      }
    });

    setChoices(nextChoices);
    setCorrectSince(nextCorrectSince);
  }

  function applySingleChoice(playerId, answer) {
    const now = performance.now();
    setChoices((currentChoices) => {
      const nextChoices = { ...currentChoices, [playerId]: answer };
      setCorrectSince((currentCorrectSince) => {
        const nextCorrectSince = { ...currentCorrectSince };
        if (answer === question.correct) {
          nextCorrectSince[playerId] ??= now;
        } else {
          delete nextCorrectSince[playerId];
        }
        return nextCorrectSince;
      });
      return nextChoices;
    });
  }

  function revealRound() {
    if (revealLockRef.current) return;
    revealLockRef.current = true;
    setPhase('reveal');
    setShowFaceBadges(false);
    const ranking = activePlayers
      .filter((player) => choices[player.id] === question.correct)
      .map((player) => ({ ...player, answeredAt: correctSince[player.id] ?? Number.MAX_SAFE_INTEGER }))
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

  function nextRound() {
    revealLockRef.current = false;
    if (questionIndex >= questions.length - 1) {
      setTimeLeft(0);
      setPhase('results');
      setChoices({});
      setCorrectSince({});
      setRoundRanks([]);
      setShowFaceBadges(false);
      return;
    }

    setQuestionIndex(questionIndex + 1);
    setTimeLeft(ROUND_SECONDS);
    setPhase('playing');
    setChoices({});
    setCorrectSince({});
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function startGame() {
    revealLockRef.current = false;
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('playing');
    setChoices({});
    setCorrectSince({});
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function startCalibration() {
    revealLockRef.current = false;
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('setup');
    setCalibrated(false);
    setScores(Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
    setChoices({});
    setCorrectSince({});
    setRoundRanks([]);
    setShowFaceBadges(false);
  }

  function restartGame(nextCount = playerCount) {
    revealLockRef.current = false;
    generationRequestRef.current += 1;
    setQuestions(FALLBACK_QUESTIONS);
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setIsGeneratingQuestions(false);
    setGenerationError('');
    setPlayerCount(nextCount);
    setSelectedQuestionTypes([]);
    setQuestionIndex(0);
    setTimeLeft(ROUND_SECONDS);
    setPhase('start');
    setCalibrated(false);
    setScores(Object.fromEntries(PLAYERS.map((player) => [player.id, 0])));
    setChoices({});
    setCorrectSince({});
    setRoundRanks([]);
    setShowFaceBadges(false);
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

  function returnToStart() {
    generationRequestRef.current += 1;
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setGenerationError('');
    setIsGeneratingQuestions(false);
    setPhase('start');
  }

  function returnToCategorySelection() {
    generationRequestRef.current += 1;
    setGeneratedSelectionKey('');
    setImageSessionId('');
    setQuestionImageStates({});
    setImageSessionStatus('idle');
    setGenerationError('');
    setIsGeneratingQuestions(false);
    setPhase('category');
  }

  function returnToCountSelection() {
    revealLockRef.current = false;
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
      setGenerationError(error instanceof Error ? error.message : '题目生成失败，请稍后再试。');
    } finally {
      if (generationRequestRef.current !== requestId) return;
      setIsGeneratingQuestions(false);
    }
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
  const correctOptionText = question.options[question.correct === 'left' ? 0 : 1];
  const roundRankMap = new Map(roundRanks.map((player) => [player.id, player]));
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
    <main className={`game-app phase-${phase}`}>
      {phase === 'start' && (
        <section className="start-stage" aria-label="QuizDash 开始界面">
          <div className="subject-cloud" aria-hidden="true">
            <SubjectBadge className="subject-astronomy" icon={<Orbit size={44} />} />
            <SubjectBadge className="subject-geography" icon={<Compass size={44} />} />
            <SubjectBadge className="subject-sports" icon={<Zap size={44} />} />
            <SubjectBadge className="subject-math" icon={<Atom size={44} />} />
            <SubjectBadge className="subject-chinese" icon={<BrainCircuit size={44} />} />
            <SubjectBadge className="subject-english" icon={<Radar size={44} />} />
            <SubjectBadge className="subject-rocket" icon={<Rocket size={44} />} />
            <SubjectBadge className="subject-gamepad" icon={<Gamepad2 size={44} />} />
            <SubjectBadge className="subject-spark" icon={<Sparkles size={44} />} />
          </div>

          <div className="quizdash-logo" aria-label="QuizDash">
            <span className="logo-word" data-text="QuizDash">QuizDash</span>
            <span className="logo-slash" />
          </div>

          <button className="start-button" type="button" onClick={() => setPhase('category')}>
            <Play size={28} />
            开始游戏
          </button>
        </section>
      )}

      {phase === 'category' && (
        <section className="category-stage" aria-label="选择题目类型">
          <button className="back-button" type="button" onClick={returnToStart} aria-label="返回开始页">
            <ArrowLeft size={22} />
          </button>

          <div className="category-copy">
            <h1>选择题目类型</h1>
            <p>可多选，最多选择 {MAX_SELECTED_TYPES} 个知识主题。</p>
          </div>

          <div className="category-picker" aria-label="题目类型">
            {QUESTION_TYPES.map((type) => (
              <button
                key={type.id}
                className={selectedQuestionTypes.includes(type.id) ? 'is-active' : ''}
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
                <span className="category-icon" aria-hidden="true">
                  <type.icon size={30} />
                </span>
                <strong>{type.label}</strong>
                <span className="category-state">
                  {selectedQuestionTypes.includes(type.id) ? '已加入' : isTypeLimitReached ? '已满 3 项' : '点击选择'}
                </span>
              </button>
            ))}
          </div>

          <div className="category-footer">
            <div className="category-summary">
              <p>已选择 {selectedQuestionTypes.length}/{MAX_SELECTED_TYPES}</p>
              {!!selectedTypeLabels.length && (
                <div className="category-tags" aria-label="已选题型">
                  {selectedTypeLabels.map((label) => (
                    <span className="category-tag" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              className="count-next"
              type="button"
              onClick={handleProceedToCount}
              disabled={!selectedQuestionTypes.length}
            >
              <Play size={24} />
              继续选择人数
            </button>
          </div>
        </section>
      )}

      {phase === 'count' && (
        <section className="count-stage">
          <button className="back-button" type="button" onClick={returnToCategorySelection} aria-label="返回题型选择">
            <ArrowLeft size={22} />
          </button>

          <h1>选择玩家人数</h1>
          <div className="count-selected-topic" aria-label="已选题型">
            <strong>已选题型</strong>
            <div className="category-tags">
              {selectedTypeLabels.map((label) => (
                <span className="category-tag" key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="count-picker" aria-label="玩家人数">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={count}
                className={count === playerCount ? 'is-active' : ''}
                onClick={() => setPlayerCount(count)}
                type="button"
              >
                <strong>{count}</strong>
                <span>{count === 1 ? '单人' : `${count} 人`}</span>
              </button>
            ))}
          </div>
          <div className="generation-status" aria-live="polite">
            {generationError ? (
              <p className="generation-status is-error">{generationError}</p>
            ) : (
              <p>
                {isGeneratingQuestions
                  ? '正在根据已选题型生成适合 3-6 岁儿童的题目，请先选人数…'
                  : isQuestionSetReady
                    ? '题目已准备好，选完人数后可以直接进入站位锁定。'
                    : '进入本页时会自动开始生成题目。'}
              </p>
            )}
          </div>
          <button
            className="count-next"
            type="button"
            onClick={isQuestionSetReady ? startCalibration : handleRetryGeneration}
            disabled={isGeneratingQuestions}
          >
            <Play size={24} />
            {isGeneratingQuestions
              ? '正在生成题目...'
              : isQuestionSetReady
                ? '进入站位锁定'
                : '重新生成题目'}
          </button>
        </section>
      )}

      {phase !== 'start' && phase !== 'category' && phase !== 'count' && phase !== 'results' && (
        <section className={`camera-surface ${phase === 'setup' ? 'is-calibration' : 'is-side'}`}>
          {phase === 'setup' && (
            <button
              className="back-button back-button-floating"
              type="button"
              onClick={returnToCountSelection}
              aria-label="返回人数选择"
            >
              <ArrowLeft size={22} />
            </button>
          )}

          <MultiPlayerCamera
            playerCount={playerCount}
            disabled={phase !== 'playing'}
            statusText={phase === 'setup' ? '站位准备中' : undefined}
            autoStart={phase === 'setup'}
            roundKey={phase === 'playing' ? questionIndex : null}
            showFaceBadges={showFaceBadges}
            players={activePlayers}
            onChoices={(nextChoices) => applyChoices(nextChoices)}
            onCalibrationChange={setCalibrated}
          />

          <div className="game-buttons">
            {phase === 'setup' ? (
              <button type="button" onClick={startGame} disabled={!calibrated}>
                <Play size={18} />
                {calibrated ? '即将开始' : '等待锁定'}
              </button>
            ) : (
            <button type="button" onClick={nextRound}>
              <SkipForward size={18} />
              下一题
            </button>
            )}
            <button type="button" onClick={() => restartGame()}>
              <RotateCcw size={18} />
              重新开始
            </button>
          </div>

          {phase !== 'setup' && (
            <div className="keyboard-help">
              P1 Q/W{playerCount >= 2 ? ' · P2 R/T' : ''}
              {playerCount >= 3 ? ' · P3 U/I' : ''}
              {playerCount >= 4 ? ' · P4 O/P' : ''}
            </div>
          )}
        </section>
      )}

      {phase !== 'start' && phase !== 'category' && phase !== 'count' && phase !== 'setup' && phase !== 'results' && (
        <section className="stage-frame">
          <header className="top-corners" aria-label="游戏状态">
            <div className="round-badge">
              <strong>{roundNumber}</strong>
              <span>of {questions.length}</span>
            </div>
            <div className="topic-badge">{question.category}</div>
          </header>

          <section className="question-board">
            <p>{question.prompt}</p>
          </section>

          <section className="answer-lanes" aria-label="两个选项">
            <button
              className={`answer-card left ${phase === 'reveal' && question.correct === 'left' ? 'is-correct' : ''} ${
                phase === 'reveal' && question.correct !== 'left' ? 'is-dimmed' : ''
              }`}
            >
              <ChoiceAvatars players={leftChoicePlayers} />
              <OptionImage state={currentQuestionImages?.left} label={question.options[0]} />
              <span>左手</span>
              <strong>{question.options[0]}</strong>
            </button>
            <button
              className={`answer-card right ${phase === 'reveal' && question.correct === 'right' ? 'is-correct' : ''} ${
                phase === 'reveal' && question.correct !== 'right' ? 'is-dimmed' : ''
              }`}
            >
              <ChoiceAvatars players={rightChoicePlayers} />
              <OptionImage state={currentQuestionImages?.right} label={question.options[1]} />
              <span>右手</span>
              <strong>{question.options[1]}</strong>
            </button>
          </section>

	          <section className="timer-line" aria-label="剩余时间">
	            <span style={{ width: progress }} />
	            <strong>{timeLeft}s</strong>
	          </section>

	          {phase === 'reveal' && (
	            <section className="reveal-panel" aria-live="polite">
	              <strong>正确答案：{correctOptionText}</strong>
	              <div className="reveal-scores">
	                {activePlayers.map((player) => {
	                  const result = roundRankMap.get(player.id);
	                  return (
	                    <span key={player.id} className={result ? 'has-points' : ''}>
	                      {player.name} {result ? `#${result.rank} +${result.points}` : '+0'}
	                    </span>
	                  );
	                })}
	              </div>
	            </section>
	          )}

	          <section className={`player-row players-${playerCount}`} aria-label="玩家记分牌">
	            {activePlayers.map((player) => (
	              <PlayerDesk
                key={player.id}
                player={player}
                score={scores[player.id]}
                choice={choices[player.id]}
                correct={question.correct}
                phase={phase}
                rank={roundRanks.find((item) => item.id === player.id)}
	                onChoose={(answer) => phase === 'playing' && applySingleChoice(player.id, answer)}
	              />
	            ))}
	          </section>
	        </section>
	      )}

      {phase === 'results' && (
        <section className="results-stage" aria-label="本局结算">
          <div className="results-copy">
            <p>游戏结束</p>
            <h1>{champions.length > 1 ? '并列冠军' : '本局冠军'}</h1>
          </div>

          <section className="results-champion-card" aria-label="冠军信息">
            <div className="results-champion-avatar">
              <AnimalAvatar
                type={champions[0]?.avatar || activePlayers[0]?.avatar}
                color={champions[0]?.color || activePlayers[0]?.color}
                accent={champions[0]?.accent || activePlayers[0]?.accent}
              />
            </div>
            <strong>{championNames}</strong>
            <span>{topScore} 分</span>
          </section>

          <section className="results-rank-list" aria-label="最终排名">
            {finalRanking.map((player, index) => (
              <article className={`results-rank-item ${index === 0 ? 'is-winner' : ''}`} key={player.id}>
                <span className="results-rank-index">#{index + 1}</span>
                <div className="results-rank-avatar">
                  <AnimalAvatar type={player.avatar} color={player.color} accent={player.accent} />
                </div>
                <strong>{player.name}</strong>
                <span className="results-rank-score">{player.score} 分</span>
              </article>
            ))}
          </section>

          <div className="results-actions">
            <button className="count-next" type="button" onClick={returnToCategorySelection}>
              <Play size={24} />
              再来一局
            </button>
            <button className="count-next count-next-secondary" type="button" onClick={() => restartGame()}>
              <ArrowLeft size={22} />
              返回首页
            </button>
          </div>
        </section>
      )}
    </main>
  );
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

function PlayerDesk({ player, score, choice, correct, phase, rank, onChoose }) {
  const isCorrect = phase === 'reveal' && choice === correct;

  return (
    <article className={`player-desk ${choice ? `choice-${choice}` : ''} ${isCorrect ? 'is-correct' : ''}`}>
      <AnimalAvatar type={player.avatar} color={player.color} accent={player.accent} />
      <div className="score-plate">
        <strong>{score}</strong>
        <span>{player.name}</span>
      </div>
      <div className="desk-actions">
        <button className={choice === 'left' ? 'is-picked' : ''} onClick={() => onChoose('left')} type="button">
          L
        </button>
        <button className={choice === 'right' ? 'is-picked' : ''} onClick={() => onChoose('right')} type="button">
          R
        </button>
      </div>
      {rank && <span className="rank-ribbon">#{rank.rank} +{rank.points}</span>}
    </article>
  );
}
