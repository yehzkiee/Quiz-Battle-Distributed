import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, DoorOpen, LoaderCircle, LogOut, Play, Plus, Search, Swords } from 'lucide-react';
import { api, getUser } from '../services/api.js';
import { connectSignaling, sendSignal } from '../services/websocket.js';

export default function Matchmaking() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [user, setUser] = useState(getUser());
  const canChooseQuestionBank = user?.role === 'root_admin';
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('Pilih quick match atau buat room dengan kode unik.');
  const [joinCode, setJoinCode] = useState(params.get('roomCode') || '');
  const [room, setRoom] = useState(null);
  const [publicRooms, setPublicRooms] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [createForm, setCreateForm] = useState({ title: 'Live Quiz Room', visibility: 'public', maxPlayers: 4, questionIds: [] });
  const pollRef = useRef(null);
  const lobbySocketRef = useRef(null);

  const hasJoinedRoom = room?.members?.some((member) => Number(member.id) === Number(user.id));
  const isHost = room && Number(room.host_user_id) === Number(user.id);
  const canStart = hasJoinedRoom && isHost && room.members?.length >= 2 && !['started', 'playing'].includes(room.status);
  const roomMembers = [...(room?.members || [])].sort((a, b) => {
    if (Number(a.id) === Number(room?.host_user_id)) return -1;
    if (Number(b.id) === Number(room?.host_user_id)) return 1;
    return String(a.display_name || a.username).localeCompare(String(b.display_name || b.username));
  });

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function closeLobbySocket() {
    lobbySocketRef.current?.close();
    lobbySocketRef.current = null;
  }

  async function loadQuestions() {
    if (!canChooseQuestionBank) return;
    const { data } = await api.get('/api/questions?limit=50');
    setQuestions(data);
    if (!createForm.questionIds.length) setCreateForm((current) => ({ ...current, questionIds: data.slice(0, 10).map((q) => q.id) }));
  }

  async function loadPublicRooms() {
    const { data } = await api.get('/api/rooms').catch(() => ({ data: [] }));
    setPublicRooms(Array.isArray(data) ? data.filter((item) => item.status === 'waiting' && (item.members?.length || 0) < (item.max_players || 4)) : []);
  }

  useEffect(() => {
    loadQuestions();
    loadPublicRooms();
  }, []);

  useEffect(() => {
    const refreshUser = () => setUser(getUser());
    window.addEventListener('quiz-user-updated', refreshUser);
    window.addEventListener('focus', refreshUser);
    return () => {
      window.removeEventListener('quiz-user-updated', refreshUser);
      window.removeEventListener('focus', refreshUser);
    };
  }, []);

  useEffect(() => {
    if (!room?.code) return;
    stopPolling();
    pollRef.current = setInterval(() => refreshRoom(room.code), 1200);
    return stopPolling;
  }, [room?.code]);

  useEffect(() => {
    closeLobbySocket();
    if (!room?.code || !hasJoinedRoom) return undefined;
    const socket = connectSignaling({
      roomId: 'custom-' + room.code,
      userId: user.id,
      onMessage: (message) => {
        if (message.type === 'peer-joined' || message.type === 'player-left' || (message.type === 'quiz-event' && message.event === 'room-updated')) {
          refreshRoom(room.code).catch(() => null);
        }
        if (message.type === 'quiz-event' && message.event === 'quiz-started') {
          enterQuiz(message.room || room);
        }
      }
    });
    lobbySocketRef.current = socket;
    return closeLobbySocket;
  }, [room?.code, hasJoinedRoom, user.id]);

  async function refreshRoom(code) {
    const { data } = await api.get('/api/rooms/' + code);
    setRoom(data);
    if (data.status === 'started' || data.status === 'playing') enterQuiz(data);
  }

  function enterQuiz(roomData) {
    const startedAt = roomData.started_at ? new Date(roomData.started_at).getTime() : Date.now();
    const match = {
      status: 'matched',
      roomId: 'custom-' + roomData.code,
      roomCode: roomData.code,
      visibility: roomData.visibility || 'public',
      quizSessionId: `${roomData.code}-${startedAt}`,
      questionIds: roomData.question_ids || [],
      players: roomData.members || [],
      startedAt
    };
    sessionStorage.setItem('quiz-match', JSON.stringify(match));
    sessionStorage.setItem('quiz-active-session', JSON.stringify({
      roomId: match.roomId,
      roomCode: match.roomCode,
      quizSessionId: match.quizSessionId,
      status: 'playing',
      updatedAt: Date.now()
    }));
    stopPolling();
    closeLobbySocket();
    navigate('/room/' + match.roomId);
  }

  async function quickMatch() {
    stopPolling();
    setRoom(null);
    setStatus('waiting');
    setMessage('Mencari lawan yang berbeda...');
    await api.post('/api/matchmaking/clear', { userId: user.id }).catch(() => null);
    const { data } = await api.post('/api/matchmaking/join', { userId: user.id });
    handleMatchState(data);
    pollRef.current = setInterval(async () => {
      const response = await api.get('/api/matchmaking/status/' + user.id);
      handleMatchState(response.data);
    }, 1500);
  }

  function handleMatchState(data) {
    if (data.status === 'matched') {
      const startedAt = Number(data.startedAt || data.createdAt || Date.now());
      const match = {
        ...data,
        startedAt,
        quizSessionId: data.quizSessionId || `${data.roomId}-${startedAt}`
      };
      sessionStorage.setItem('quiz-match', JSON.stringify(match));
      sessionStorage.setItem('quiz-active-session', JSON.stringify({
        roomId: match.roomId,
        roomCode: match.roomCode || match.roomId,
        quizSessionId: match.quizSessionId,
        status: 'playing',
        updatedAt: Date.now()
      }));
      stopPolling();
      closeLobbySocket();
      navigate('/room/' + match.roomId);
      return;
    }
    setStatus(data.status || 'idle');
    if (data.status === 'waiting') setMessage('Waiting for Players...');
  }

  async function leaveQueue() {
    stopPolling();
    await api.post('/api/matchmaking/leave', { userId: user.id });
    setStatus('idle');
    setMessage('Kamu sudah keluar.');
  }

  function toggleQuestion(id) {
    if (!canChooseQuestionBank) return;
    setCreateForm((current) => {
      const exists = current.questionIds.includes(id);
      const next = exists ? current.questionIds.filter((item) => item !== id) : [...current.questionIds, id];
      return { ...current, questionIds: next };
    });
  }

  async function createRoom(event) {
    event.preventDefault();
    const payload = canChooseQuestionBank ? createForm : { ...createForm, questionIds: [] };
    const { data } = await api.post('/api/rooms', payload);
    setRoom(data);
    setJoinCode(data.code);
    setMessage(data.visibility === 'public' ? 'Public room dibuat dan muncul di daftar. Tekan Join untuk masuk sebagai host.' : 'Private room dibuat. Bagikan kode dan tekan Join untuk masuk sebagai host.');
    await loadPublicRooms();
  }

  async function joinRoom(codeValue = joinCode) {
    const code = String(codeValue || '').trim().toUpperCase();
    if (!code) return;
    stopPolling();
    const { data } = await api.post('/api/rooms/' + code + '/join', { userId: user.id });
    setRoom(data.room);
    setJoinCode(data.room.code);
    setStatus('room');
    setMessage('Waiting for Players...');
    await loadPublicRooms();
    setTimeout(() => sendSignal(lobbySocketRef.current, {
      type: 'quiz-event',
      event: 'room-updated',
      roomId: 'custom-' + data.room.code,
      userId: user.id
    }), 100);
  }

  async function leaveRoom() {
    if (room?.code) await api.post('/api/rooms/' + room.code + '/leave', { userId: user.id }).catch(() => null);
    stopPolling();
    closeLobbySocket();
    setRoom(null);
    setStatus('idle');
    setMessage('Kamu keluar dari room.');
    await loadPublicRooms();
  }

  async function startRoom() {
    if (!canStart) return;
    const { data } = await api.post('/api/rooms/' + room.code + '/start');
    sendSignal(lobbySocketRef.current, {
      type: 'quiz-event',
      event: 'quiz-started',
      roomId: 'custom-' + data.room.code,
      userId: user.id,
      room: data.room,
      startedAt: Date.now()
    });
    enterQuiz(data.room);
  }

  function copyCode() {
    navigator.clipboard?.writeText(room?.code || joinCode);
  }

  if (room) {
    return (
      <section className="matchmaking-modern">
        <div className="room-lobby-header">
          <div>
            <span className="eyebrow">Room Code</span>
            <h2>{room.code}</h2>
            <p>{room.title} - {room.visibility}</p>
          </div>
          <button onClick={copyCode}><Copy size={18} /> Copy</button>
        </div>

        <div className="lobby-status">
          <LoaderCircle className={room.status === 'started' ? '' : 'spin'} size={28} />
          <strong>{hasJoinedRoom ? ((room.status === 'started' || room.status === 'playing') ? 'Starting quiz...' : 'Waiting for Players') : 'Room dibuat. Tekan Join untuk masuk.'}</strong>
          <span>{room.members?.length || 0}/{room.max_players || 4} pemain siap</span>
        </div>

        <div className="player-lobby-list">
          {roomMembers.map((member) => (
            <div key={member.id} className="lobby-player">
              <span className="avatar-circle">{(member.display_name || member.username).slice(0, 1).toUpperCase()}</span>
              <div><strong>{member.display_name || member.username}</strong><small>{Number(room.host_user_id) === Number(member.id) ? 'Host/Admin' : 'Player'}</small></div>
            </div>
          ))}
        </div>

        <div className="action-row">
          {!hasJoinedRoom && <button className="primary" onClick={() => joinRoom(room.code)}><DoorOpen size={18} /> Join</button>}
          {hasJoinedRoom && isHost && <button className="primary" onClick={startRoom} disabled={!canStart}><Play size={18} /> Start Quiz</button>}
          {hasJoinedRoom ? <button onClick={leaveRoom}><LogOut size={18} /> Keluar</button> : <button onClick={leaveRoom}><LogOut size={18} /> Batalkan</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="matchmaking-modern">
      <div className="match-hero">
        <div className="arena-mark"><Swords size={54} /></div>
        <div>
          <span className="eyebrow">Quizizz-style live play</span>
          <h2>Mulai permainan</h2>
          <p>{message}</p>
        </div>
        <button className="primary big-action" onClick={quickMatch} disabled={status === 'waiting'}>
          {status === 'waiting' ? <LoaderCircle className="spin" size={20} /> : <Search size={20} />} Cari Lawan
        </button>
        {status === 'waiting' && <button onClick={leaveQueue}><LogOut size={18} /> Keluar</button>}
      </div>

      <div className="room-action-grid">
        <form className="manager-form" onSubmit={createRoom}>
          <h2>Create Room</h2>
          <label>Nama room<input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} /></label>
          <label>Visibility<select value={createForm.visibility} onChange={(e) => setCreateForm({ ...createForm, visibility: e.target.value })}><option value="public">public</option><option value="private">private</option></select></label>
          <label>Kapasitas pemain<select value={createForm.maxPlayers} onChange={(e) => setCreateForm({ ...createForm, maxPlayers: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value} pemain</option>)}</select></label>
          <span className="muted-text">{createForm.visibility === 'public' ? 'Public room muncul di daftar matchmaking dan bisa di-join langsung.' : 'Private room hanya bisa di-join dengan kode unik.'}</span>
          {canChooseQuestionBank && (
            <>
              <span className="muted-text">Pilih bank soal. Quiz hanya menampilkan 5 soal acak.</span>
              <div className="question-picker compact-picker">
                {questions.map((question) => (
                  <label key={question.id} className="picker-item">
                    <input type="checkbox" checked={createForm.questionIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
                    <span>{question.question_text}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <button className="primary"><Plus size={18} /> Create Room</button>
        </form>

        <div className="manager-form">
          <h2>Join Room</h2>
          <span className="muted-text">Untuk private room, masukkan kode unik dari host.</span>
          <label>Kode unik<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" /></label>
          <button className="primary" onClick={() => joinRoom()}><DoorOpen size={18} /> Join</button>
        </div>

        <div className="manager-form wide">
          <h2>Public Rooms</h2>
          <div className="public-room-list">
            {publicRooms.map((item) => (
              <article key={item.code} className="public-room-row">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.members?.length || 0}/{item.max_players || 4} pemain{canChooseQuestionBank ? ' - ' + (item.question_ids?.length || 0) + ' soal dipilih' : ''}</span>
                </div>
                <button className="primary" onClick={() => joinRoom(item.code)}><DoorOpen size={18} /> Join Public</button>
              </article>
            ))}
            {!publicRooms.length && <p className="muted-text">Belum ada public room yang menunggu pemain.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
