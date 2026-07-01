import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../services/api.js';

const emptyForm = {
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'A',
  points: 10,
  difficulty: 'normal'
};

export default function QuestionManager() {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const { data } = await api.get('/api/questions');
    setQuestions(data);
  }

  useEffect(() => { load(); }, []);

  function edit(question) {
    setEditingId(question.id);
    setForm({
      question_text: question.question_text,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      correct_option: question.correct_option,
      points: question.points,
      difficulty: question.difficulty
    });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    if (editingId) await api.patch('/api/questions/' + editingId, form);
    else await api.post('/api/questions', form);
    setForm(emptyForm);
    setEditingId(null);
    setMessage('Soal tersimpan.');
    await load();
  }

  async function remove(id) {
    await api.delete('/api/questions/' + id);
    await load();
  }

  return (
    <section className="dashboard manage-grid">
      <div className="topline wide">
        <div>
          <span className="eyebrow">Admin & instructor</span>
          <h1>Kelola Soal</h1>
        </div>
      </div>

      <form className="manager-form" onSubmit={submit}>
        <h2>{editingId ? 'Edit Soal' : 'Tambah Soal'}</h2>
        <label>Pertanyaan<textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} /></label>
        <div className="form-grid">
          <label>Opsi A<input value={form.option_a} onChange={(e) => setForm({ ...form, option_a: e.target.value })} /></label>
          <label>Opsi B<input value={form.option_b} onChange={(e) => setForm({ ...form, option_b: e.target.value })} /></label>
          <label>Opsi C<input value={form.option_c} onChange={(e) => setForm({ ...form, option_c: e.target.value })} /></label>
          <label>Opsi D<input value={form.option_d} onChange={(e) => setForm({ ...form, option_d: e.target.value })} /></label>
          <label>Jawaban Benar<select value={form.correct_option} onChange={(e) => setForm({ ...form, correct_option: e.target.value })}><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
          <label>Poin<input type="number" min="1" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></label>
          <label>Difficulty<select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>easy</option><option>normal</option><option>hard</option></select></label>
        </div>
        {message && <p className="success">{message}</p>}
        <div className="action-row left">
          <button className="primary"><Save size={18} /> Simpan</button>
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}><Plus size={18} /> Baru</button>
        </div>
      </form>

      <div className="manager-list">
        {questions.map((question) => (
          <article key={question.id} className="question-row">
            <div>
              <strong>{question.question_text}</strong>
              <span>{question.points} pts · benar {question.correct_option} · {question.difficulty}</span>
              <small>A. {question.option_a} | B. {question.option_b} | C. {question.option_c} | D. {question.option_d}</small>
            </div>
            <button onClick={() => edit(question)}>Edit</button>
            <button className="danger" title="Hapus" onClick={() => remove(question.id)}><Trash2 size={17} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}
