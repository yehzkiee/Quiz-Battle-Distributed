import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, Plus, RefreshCw } from 'lucide-react';
import { api, getUser } from '../services/api.js';

export default function Rooms() {
  const navigate = useNavigate();
  const user = getUser();
  const canCreate = ['admin', 'instructor'].includes(user?.role);
  const [rooms, setRooms] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ title: 'Live Quiz Room', visibility: 'public', questionIds: [] });

  const selectedCount = useMemo(() => form.questionIds.length, [form.questionIds]);

  async function load() {
    const [{ data: roomData }, { data: questionData }] = await Promise.all([
      api.get('/api/rooms').catch(() => ({ data: [] })),
      api.get('/api/questions?limit=50')
    ]);
    setRooms(roomData);
    setQuestions(questionData);
    if (!form.questionIds.length) setForm((current) => ({ ...current, questionIds: questionData.slice(0, 5).map((q) => q.id) }));
  }

  useEffect(() => { load(); }, []);

  function toggleQuestion(id) {
    setForm((current) => {
      const exists = current.questionIds.includes(id);
      const next = exists ? current.questionIds.filter((item) => item !== id) : [...current.questionIds, id];
      return { ...current, questionIds: next };
    });
  }

  async function createRoom(event) {
    event.preventDefault();
    setMessage('');
    const { data } = await api.post('/api/rooms', {
      title: form.title,
      visibility: form.visibility,
      questionIds: form.questionIds
    });
    setMessage('Room dibuat. Kode: ' + data.code);
    setJoinCode(data.code);
    await load();
  }

  async function joinRoom(codeInput = joinCode) {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setMessage('Masuk room ' + code + '...');
    const { data } = await api.post('/api/rooms/' + code + '/join');
    await api.post('/api/matchmaking/clear', { userId: user.id }).catch(() => null);
    const match = await api.post('/api/matchmaking/join-room', {
      userId: user.id,
      roomCode: data.room.code,
      questionIds: data.room.question_ids || []
    });
    if (match.data.status === 'matched') {
      sessionStorage.setItem('quiz-match', JSON.stringify(match.data));
      navigate('/room/' + match.data.roomId);
      return;
    }
    sessionStorage.setItem('quiz-room-waiting', JSON.stringify({ code: data.room.code, questionIds: data.room.question_ids || [] }));
    navigate('/matchmaking?roomCode=' + data.room.code);
  }

  return (
    <section className="dashboard manage-grid">
      <div className="topline wide">
        <div>
          <span className="eyebrow">Quizizz-style rooms</span>
          <h1>Rooms</h1>
        </div>
        <button className="icon-action" title="Refresh" onClick={load}><RefreshCw size={18} /></button>
      </div>

      <div className="manager-form">
        <h2>Join Room</h2>
        <label>Kode unik<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" /></label>
        <button className="primary" onClick={() => joinRoom()}><DoorOpen size={18} /> Join</button>
        {message && <p className="success">{message}</p>}
      </div>

      {canCreate && (
        <form className="manager-form" onSubmit={createRoom}>
          <h2>Buat Room</h2>
          <label>Nama room<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Visibility<select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}><option value="public">public</option><option value="private">private</option></select></label>
          <span className="muted-text">Soal terpilih: {selectedCount}. Kalau lebih dari 5, game tetap menampilkan 5 soal random dari pilihan ini.</span>
          <div className="question-picker">
            {questions.map((question) => (
              <label key={question.id} className="picker-item">
                <input type="checkbox" checked={form.questionIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
                <span>{question.question_text}</span>
              </label>
            ))}
          </div>
          <button className="primary"><Plus size={18} /> Buat Room</button>
        </form>
      )}

      <div className="manager-list wide">
        <h2>Public Rooms</h2>
        {rooms.map((room) => (
          <article key={room.code} className="question-row">
            <div>
              <strong>{room.title}</strong>
              <span>Kode {room.code} · {room.visibility} · {room.question_ids?.length || 0} soal dipilih</span>
            </div>
            <button onClick={() => joinRoom(room.code)}>Join</button>
          </article>
        ))}
        {!rooms.length && <p className="muted-text">Belum ada public room.</p>}
      </div>
    </section>
  );
}
