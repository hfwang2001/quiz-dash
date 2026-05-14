import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Atom,
  BrainCircuit,
  Compass,
  Gamepad2,
  Orbit,
  Play,
  Radar,
  Rocket,
  RotateCcw,
  SkipForward,
  Sparkles,
  Zap
} from 'lucide-react';
import MultiPlayerCamera from './components/MultiPlayerCamera.jsx';
import AnimalAvatar from './components/AnimalAvatar.jsx';
import { PLAYERS, QUESTIONS } from './questions.js';

const ROUND_SECONDS = 8;
const REVEAL_SECONDS = 4.5;
const POINTS = [25, 20, 15, 15];
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

  const question = QUESTIONS[questionIndex];
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
  }, [phase, playerCount, question.correct]);

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
    const nextIndex = (questionIndex + 1) % QUESTIONS.length;
    revealLockRef.current = false;
    setQuestionIndex(nextIndex);
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
    setPlayerCount(nextCount);
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

  const progress = useMemo(() => `${Math.max(0, (timeLeft / ROUND_SECONDS) * 100)}%`, [timeLeft]);
  const correctOptionText = question.options[question.correct === 'left' ? 0 : 1];
  const roundRankMap = new Map(roundRanks.map((player) => [player.id, player]));
  const leftChoicePlayers = activePlayers.filter((player) => choices[player.id] === 'left');
  const rightChoicePlayers = activePlayers.filter((player) => choices[player.id] === 'right');

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

          <button className="start-button" type="button" onClick={() => setPhase('count')}>
            <Play size={28} />
            开始游戏
          </button>
        </section>
      )}

      {phase === 'count' && (
        <section className="count-stage">
          <h1>选择玩家人数</h1>
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
          <button className="count-next" type="button" onClick={startCalibration}>
            <Play size={24} />
            进入站位锁定
          </button>
        </section>
      )}

      {phase !== 'start' && phase !== 'count' && (
        <section className={`camera-surface ${phase === 'setup' ? 'is-calibration' : 'is-side'}`}>
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

      {phase !== 'start' && phase !== 'count' && phase !== 'setup' && (
        <section className="stage-frame">
          <header className="top-corners" aria-label="游戏状态">
            <div className="round-badge">
              <strong>{roundNumber}</strong>
              <span>of {QUESTIONS.length}</span>
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
              <span>左手</span>
              <strong>{question.options[0]}</strong>
            </button>
            <button
              className={`answer-card right ${phase === 'reveal' && question.correct === 'right' ? 'is-correct' : ''} ${
                phase === 'reveal' && question.correct !== 'right' ? 'is-dimmed' : ''
              }`}
            >
              <ChoiceAvatars players={rightChoicePlayers} />
              <span>右手</span>
              <strong>{question.options[1]}</strong>
            </button>
          </section>

          <section className="timer-line" aria-label="剩余时间">
            <span style={{ width: progress }} />
            <strong>{timeLeft}s</strong>
          </section>

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
        </section>
      )}
    </main>
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
