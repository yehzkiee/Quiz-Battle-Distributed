import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { api, saveSession } from '../services/api.js';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/api/auth/register', form);
      saveSession(data);
      navigate('/lobby');
    } catch (err) {
      setError(err.response?.data?.message || 'Register gagal');
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-box" onSubmit={submit}>
        <h1>Buat Akun</h1>
        <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary"><UserPlus size={18} /> Daftar</button>
        <Link to="/login">Sudah punya akun</Link>
      </form>
    </main>
  );
}
