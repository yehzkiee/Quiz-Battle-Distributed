import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, LogOut, Save, UsersRound } from 'lucide-react';
import { api, clearSession, getUser, saveSession } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());
  const [displayName, setDisplayName] = useState(user.display_name || user.username);
  const [message, setMessage] = useState('');
  const canManageQuestions = ['root_admin', 'admin', 'instructor'].includes(user?.role);
  const isRootAdmin = user?.role === 'root_admin';

  async function renameProfile(event) {
    event.preventDefault();
    setMessage('');
    try {
      const { data } = await api.patch('/api/users/' + user.id + '/profile', { display_name: displayName });
      const nextUser = { ...user, ...data };
      saveSession({ token: localStorage.getItem('quiz-token'), user: nextUser });
      setUser(nextUser);
      window.dispatchEvent(new Event('quiz-user-updated'));
      setMessage('Nama berhasil disimpan.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Gagal menyimpan nama.');
    }
  }

  function logout() {
    clearSession();
    navigate('/login');
  }

  return (
    <section className="settings-layout">
      <article className="settings-card">
        <h2>Profil pemain</h2>
        <form onSubmit={renameProfile} className="settings-form">
          <label>Nama tampil<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={user.rename_used && user.role !== 'root_admin'} /></label>
          <button className="primary" disabled={user.rename_used && user.role !== 'root_admin'}><Save size={18} /> Simpan</button>
        </form>
        <p className="muted-text">{user.rename_used ? 'Nama tampil sudah pernah diubah. Batas rename adalah 1 kali per akun.' : 'Nama tampil bisa diubah 1 kali.'}</p>
        {message && <p className="success">{message}</p>}
      </article>

      <article className="settings-card">
        <h2>Data akun</h2>
        <dl className="account-list">
          <div><dt>Username</dt><dd>{user.username}</dd></div>
          <div><dt>Role</dt><dd>{user.role}</dd></div>
          <div><dt>Total poin</dt><dd>{user.points || 0}</dd></div>
          <div><dt>User ID</dt><dd>{user.id}</dd></div>
        </dl>
      </article>

      <article className="settings-card">
        <h2>Pengaturan akun</h2>
        <div className="workbench compact">
          {canManageQuestions && <button onClick={() => navigate('/questions')}><BookOpenCheck size={18} /> Kelola Soal</button>}
          {isRootAdmin && <button onClick={() => navigate('/users')}><UsersRound size={18} /> Kelola Users</button>}
          <button className="danger" onClick={logout}><LogOut size={18} /> Logout</button>
        </div>
      </article>
    </section>
  );
}
