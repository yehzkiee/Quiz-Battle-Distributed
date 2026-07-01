import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Send, Trophy, Wifi, WifiOff } from 'lucide-react';
import { api, getUser, saveSession } from '../services/api.js';
import { connectSignaling, sendSignal } from '../services/websocket.js';
import QuestionCard from '../components/QuestionCard.jsx';
import Timer from '../components/Timer.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import { QUIZ_QUESTION_SECONDS } from '../config/quiz.js';

const QUESTION_SECONDS = QUIZ_QUESTION_SECONDS;
const FEEDBACK_DELAY_MS = 1800;

const FALLBACK_QUESTIONS = [
  { id: 0, question_text: 'Bahasa pemrograman yang sering dipakai bersama React?', option_a: 'Python', option_b: 'JavaScript', option_c: 'Go', option_d: 'PHP', correct_option: 'B', points: 10, difficulty: 'easy' },
  { id: -1, question_text: 'Protokol untuk komunikasi service-to-service cepat?', option_a: 'SMTP', option_b: 'FTP', option_c: 'gRPC', option_d: 'DNS', correct_option: 'C', points: 10, difficulty: 'normal' }
];

function seedFromText(text) {
  return [...text].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 2166136261);
}

function seededQuestions(items, seedText) {
  let seed = Math.abs(seedFromText(seedText)) || 1;
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const swapIndex = seed % (index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function displayName(player) {
  return player?.display_name || player?.username || 'Player';
}

function readSessionJson(key, fallback = null) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null') || fallback;
  } catch {
    return fallback;
  }
}

export default function QuizRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const sessionUser = getUser();
  const [currentUser, setCurrentUser] = useState(sessionUser);
  const user = currentUser || sessionUser;
  const match = useMemo(() => readSessionJson('quiz-match'), []);
  const roomCode = match?.roomCode || roomId.replace('custom-', '');
  const matchStartedAt = Number(match?.startedAt || Date.now());
  const quizSessionId = match?.quizSessionId || `${roomCode}-${matchStartedAt}`;
  const progressKey = `quiz-progress-${roomCode}`;
  const savedProgress = useMemo(() => readSessionJson(progressKey), [progressKey]);
  const initialPlayers = match?.players?.length ? match.players : [{ id: user.id, username: user.username, display_name: user.display_name }];
  const [players, setPlayers] = useState(initialPlayers);
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [questionIndex, setQuestionIndex] = useState(() => Number(savedProgress?.questionIndex || 0));
  const [selected, setSelected] = useState(savedProgress?.selected || '');
  const [time, setTime] = useState(savedProgress?.time || QUESTION_SECONDS);
  const [status, setStatus] = useState('connecting');
  const [finished, setFinished] = useState(!!savedProgress?.finished);
  const [feedback, setFeedback] = useState(savedProgress?.feedback || null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [liveScores, setLiveScores] = useState(() => savedProgress?.liveScores || Object.fromEntries(initialPlayers.map((player) => [player.id, 0])));
  const [serverResults, setServerResults] = useState(null);
  const socketRef = useRef(null);
  const answersRef = useRef(savedProgress?.answers || []);
  const scoreRef = useRef(Number(savedProgress?.score || 0));
  const correctRef = useRef(Number(savedProgress?.correctCount || 0));
  const questionStartRef = useRef(Number(savedProgress?.questionStartedAt || Date.now()));
  const restoredQuestionStartRef = useRef(savedProgress?.questionStartedAt ? Number(savedProgress.questionStartedAt) : null);
  const restoredFeedbackRef = useRef(!!savedProgress?.feedback && !savedProgress?.finished);
  const transitionLockedRef = useRef(false);
  const finishSentRef = useRef(false);
  const sagaSentRef = useRef(false);

  const activeQuestions = questions.slice(0, 5);
  const question = { ...activeQuestions[questionIndex], index: questionIndex };

  function writeActiveSession(nextStatus = finished ? 'finished' : 'playing') {
    sessionStorage.setItem('quiz-active-session', JSON.stringify({
      roomId,
      roomCode,
      quizSessionId,
      status: nextStatus,
      updatedAt: Date.now()
    }));
  }

  function addMessage(message) {
    setMessages((current) => [...current.slice(-40), { id: crypto.randomUUID(), at: new Date().toLocaleTimeString(), ...message }]);
  }

  useEffect(() => {
    writeActiveSession(finished ? 'finished' : 'playing');
    sessionStorage.setItem(progressKey, JSON.stringify({
      roomId,
      roomCode,
      quizSessionId,
      status: finished ? 'finished' : 'playing',
      questionIndex,
      selected,
      time,
      feedback,
      finished,
      answers: answersRef.current,
      score: scoreRef.current,
      correctCount: correctRef.current,
      liveScores,
      questionStartedAt: questionStartRef.current,
      updatedAt: Date.now()
    }));
  }, [feedback, finished, liveScores, progressKey, questionIndex, quizSessionId, roomCode, roomId, selected, time]);

  useEffect(() => {
    setLiveScores((current) => ({
      ...Object.fromEntries(players.map((player) => [player.id, current[player.id] || 0])),
      ...current
    }));
  }, [players]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/users/' + user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const next = { ...user, ...data };
        setCurrentUser(next);
        saveSession({ token: localStorage.getItem('quiz-token'), user: next });
        window.dispatchEvent(new Event('quiz-user-updated'));
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    async function refreshRoomPlayers() {
      const { data } = await api.get('/api/rooms/' + roomCode);
      if (cancelled) return;
      if (Array.isArray(data.members) && data.members.length) {
        setPlayers(data.members);
        sessionStorage.setItem('quiz-match', JSON.stringify({
          ...(match || {}),
          roomId,
          roomCode: data.code || roomCode,
          quizSessionId,
          questionIds: data.question_ids || match?.questionIds || [],
          players: data.members,
          startedAt: data.started_at ? new Date(data.started_at).getTime() : matchStartedAt
        }));
      }
    }

    refreshRoomPlayers().catch(() => null);
    const timer = setInterval(() => refreshRoomPlayers().catch(() => null), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [matchStartedAt, quizSessionId, roomCode, roomId]);

  async function syncMyServerScore(mine) {
    if (!mine || sagaSentRef.current) return;
    sagaSentRef.current = true;
    await api.post('/api/saga/match-finished', { userId: user.id, username: displayName(user), points: mine.score })
      .then(({ data: sagaData }) => {
        const current = getUser();
        if (sagaData?.user && current) {
          localStorage.setItem('quiz-user', JSON.stringify({ ...current, ...sagaData.user }));
          window.dispatchEvent(new Event('quiz-user-updated'));
        }
      })
      .catch(() => null);
  }

  async function loadResults() {
    const { data } = await api.get('/api/rooms/' + roomCode + '/results');
    setServerResults(data);
    await syncMyServerScore(data.results.find((row) => Number(row.user_id) === Number(user.id)));
  }

  useEffect(() => {
    api.get('/api/questions?limit=50').then(({ data }) => {
      if (!Array.isArray(data) || !data.length) return;
      const roomQuestionIds = Array.isArray(match?.questionIds) ? match.questionIds.map(Number) : [];
      const picked = roomQuestionIds.length ? data.filter((item) => roomQuestionIds.includes(Number(item.id))) : data;
      setQuestions(seededQuestions(picked.length ? picked : data, roomId));
    }).catch(() => setQuestions(seededQuestions(FALLBACK_QUESTIONS, roomId)));
  }, [roomId]);

  useEffect(() => {
    const socket = connectSignaling({
      roomId,
      userId: user.id,
      onMessage: async (message) => {
        if (message.type === 'joined-room') setStatus(message.peers?.length ? 'connected' : 'waiting-peer');
        if (message.type === 'peer-joined') setStatus('connected');
        if (message.type === 'player-left') setStatus('player-left');
        if (message.type === 'quiz-event' && message.event === 'chat-message') addMessage({ from: 'opponent', username: message.username || 'Player', text: message.text });
        if (message.type === 'quiz-event' && message.event === 'score-update') {
          setLiveScores((current) => ({ ...current, [message.userId]: Number(message.score || 0) }));
        }
        if (message.type === 'quiz-event' && message.event === 'result-submitted') {
          await loadResults().catch(() => null);
        }
      }
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [roomId]);

  useEffect(() => {
    if (!finished) return undefined;
    loadResults().catch(() => null);
    const timer = setInterval(() => loadResults().catch(() => null), 1500);
    return () => clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    if (finished || feedback) return undefined;
    transitionLockedRef.current = false;
    const restoredStart = restoredQuestionStartRef.current && Number(savedProgress?.questionIndex || 0) === questionIndex
      ? restoredQuestionStartRef.current
      : Date.now();
    restoredQuestionStartRef.current = null;
    questionStartRef.current = restoredStart;

    const remainingNow = () => Math.max(0, Math.min(QUESTION_SECONDS, QUESTION_SECONDS - Math.floor((Date.now() - questionStartRef.current) / 1000)));
    const initialRemaining = remainingNow();
    setTime(initialRemaining);
    if (initialRemaining <= 0) {
      setTimeout(() => handleTimeout(), 0);
      return undefined;
    }

    const tick = setInterval(() => {
      const remaining = remainingNow();
      setTime(() => {
        if (remaining <= 0) {
          clearInterval(tick);
          setTimeout(() => handleTimeout(), 0);
          return 0;
        }
        return remaining;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [finished, questionIndex, feedback]);

  useEffect(() => {
    if (!restoredFeedbackRef.current || !feedback || finished) return undefined;
    restoredFeedbackRef.current = false;
    const timer = setTimeout(() => advanceQuestion(), FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [feedback, finished]);

  function recordAnswer(value, correct, timeout = false) {
    answersRef.current = [
      ...answersRef.current.filter((answer) => answer.questionId !== question.id),
      {
        questionId: question.id,
        selected: value || '',
        elapsedMs: Math.max(0, Date.now() - questionStartRef.current),
        timeout
      }
    ];
    if (correct) {
      correctRef.current += 1;
      scoreRef.current += Number(question.points || 10);
    }
    setLiveScores((current) => ({ ...current, [user.id]: scoreRef.current }));
    sendSignal(socketRef.current, { type: 'quiz-event', event: 'score-update', roomId, userId: user.id, score: scoreRef.current });
  }

  function scheduleNext() {
    setTimeout(() => advanceQuestion(), FEEDBACK_DELAY_MS);
  }

  function advanceQuestion() {
    if (questionIndex >= activeQuestions.length - 1) {
      finishMatch();
      return;
    }
    setQuestionIndex((value) => value + 1);
    setSelected('');
    setFeedback(null);
    transitionLockedRef.current = false;
  }

  function handleTimeout() {
    if (transitionLockedRef.current || finished) return;
    transitionLockedRef.current = true;
    recordAnswer('', false, true);
    setFeedback({ selected: null, correct: false, timeout: true });
    scheduleNext();
  }

  async function submit(event) {
    event.preventDefault();
    if (transitionLockedRef.current || feedback) return;
    transitionLockedRef.current = true;
    const correct = selected === question.correct_option;
    recordAnswer(selected, correct, false);
    setFeedback({ selected, correct, timeout: false });
    scheduleNext();
  }

  function sendChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    addMessage({ from: 'me', username: displayName(user), text });
    sendSignal(socketRef.current, { type: 'quiz-event', event: 'chat-message', roomId, userId: user.id, username: displayName(user), text });
    setChatInput('');
  }

  async function finishMatch() {
    if (finishSentRef.current) return;
    finishSentRef.current = true;
    setFinished(true);
    setStatus('finished');
    writeActiveSession('finished');
    setFeedback(null);
    const elapsedMs = Math.max(0, Date.now() - matchStartedAt);
    const { data } = await api.post('/api/rooms/' + roomCode + '/results', {
      userId: user.id,
      answers: answersRef.current,
      elapsedMs
    }).catch(() => ({ data: null }));
    if (data) {
      setServerResults(data);
      await syncMyServerScore(data.me);
    }
    sendSignal(socketRef.current, { type: 'quiz-event', event: 'result-submitted', roomId, userId: user.id });
  }

  const resultRows = serverResults?.results || [];
  const waitingCount = Math.max(0, (serverResults?.expectedPlayers || players.length) - (serverResults?.completedPlayers || resultRows.length));
  const roomLabel = match?.roomCode ? `${match?.visibility === 'private' ? 'Private Room' : 'Public Room'} • Code` : 'Public Match';
  const visibleRoomCode = String(roomCode).replace(/^ROOM-/i, '');

  return (
    <section className="room-layout">
      <div className="room-header">
        <div>
          <span className="eyebrow">{roomLabel}</span>
          <h1>{visibleRoomCode}</h1>
        </div>
        <div className={'connection ' + status}>{status === 'connected' || status === 'finished' ? <Wifi size={18} /> : <WifiOff size={18} />}{status}</div>
      </div>

      <div className="multiplayer-grid">
        {players.map((player) => (
          <PlayerCard key={player.id} label={Number(player.id) === Number(user.id) ? 'Kamu' : 'Player'} player={{ ...player, username: displayName(player) }} score={liveScores[player.id] || 0} active={Number(player.id) === Number(user.id)} />
        ))}
      </div>

      <div className="room-content-grid">
        <div className="quiz-column">
          {!finished ? (
            <>
              <Timer value={time} max={QUESTION_SECONDS} />
              <QuestionCard question={question} selected={selected} setSelected={setSelected} onSubmit={submit} disabled={!!feedback} feedback={feedback} />
            </>
          ) : (
            <div className="result-panel final-score-panel">
              <Trophy size={34} />
              <h2>Hasil akhir</h2>
              <p>{serverResults?.allFinished ? 'Seluruh pemain sudah selesai.' : `Menunggu ${waitingCount} pemain selesai.`}</p>
              <div className="final-score-table">
                {resultRows.map((row) => (
                  <div key={row.user_id} className={Number(row.user_id) === Number(user.id) ? 'me' : ''}>
                    <strong>#{row.rank}</strong>
                    <span>{row.username}</span>
                    <span>{row.correct_count}/{row.total_questions} benar</span>
                    <b>{row.score} pts</b>
                  </div>
                ))}
                {!resultRows.length && <p className="muted-text">Mengirim hasil ke server...</p>}
              </div>
              <div className="action-row">
                <button className="primary" onClick={() => navigate('/leaderboard')}>Lihat Ranking</button>
                <button onClick={() => navigate('/lobby')}>Kembali Lobby</button>
              </div>
            </div>
          )}
        </div>

        <aside className="chat-panel">
          <div className="chat-title"><MessageCircle size={18} /><strong>Room Chat</strong></div>
          <div className="chat-messages">
            {messages.map((message) => (
              <div key={message.id} className={'chat-bubble ' + (message.from === 'me' ? 'mine' : '')}>
                <span>{message.username} - {message.at}</span>
                <p>{message.text}</p>
              </div>
            ))}
            {!messages.length && <p className="empty-chat">Belum ada chat.</p>}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ketik pesan" />
            <button className="primary" title="Kirim chat"><Send size={17} /></button>
          </form>
        </aside>
      </div>
    </section>
  );
}
