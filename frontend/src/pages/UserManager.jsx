import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { api, getUser, saveSession } from '../services/api.js';

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/users');
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function changeRole(id, role) {
    const { data } = await api.patch('/api/users/' + id + '/role', { role });
    const current = getUser();
    if (current?.id === data.id) saveSession({ token: localStorage.getItem('quiz-token'), user: data });
    await load();
  }

  async function deleteUser(id) {
    if (!window.confirm('Hapus akun pemain ini?')) return;
    await api.delete('/api/users/' + id);
    await load();
  }

  return (
    <section className="dashboard">
      <div className="topline">
        <div>
          <span className="eyebrow">Admin only</span>
          <h1>Kelola Users</h1>
        </div>
        <button className="icon-action" title="Refresh" onClick={load}><RefreshCw className={loading ? 'spin' : ''} size={18} /></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Points</th><th>Aksi</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.role}</td>
                <td>{user.points}</td>
                <td>
                  <select value={user.role} onChange={(e) => changeRole(user.id, e.target.value)}>
                    <option value="root_admin">root_admin</option>
                    <option value="admin">admin</option>
                    <option value="instructor">instructor</option>
                    <option value="user">user</option>
                  </select>
                  <button className="danger compact-action" onClick={() => deleteUser(user.id)} disabled={user.role === 'root_admin'}><Trash2 size={16} /> Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
