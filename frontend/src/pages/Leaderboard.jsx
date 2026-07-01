import { useEffect, useState } from 'react';
import { Award, Medal, RefreshCw, ShieldCheck, Trash2, Trophy } from 'lucide-react';
import { api, getUser } from '../services/api.js';

function initials(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase();
}

function badgeFor(row) {
  if (row.rank === 1) return 'Champion';
  if (row.rank === 2) return 'Top 2';
  if (row.rank === 3) return 'Top 3';
  return 'Player';
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const currentUser = getUser();
  const isRootAdmin = currentUser?.role === 'root_admin';

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/users/leaderboard');
      const rankingRows = Array.isArray(data) ? data : [];
      const hasCurrent = rankingRows.some((row) => Number(row.userId) === Number(currentUser?.id));
      const merged = hasCurrent || !currentUser
        ? rankingRows
        : [
            ...rankingRows,
            {
              rank: rankingRows.length + 1,
              userId: currentUser.id,
              username: currentUser.display_name || currentUser.username,
              points: currentUser.points || 0
            }
          ];
      setRows(merged);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deletePlayer(row) {
    if (!window.confirm('Hapus akun pemain ' + row.username + '?')) return;
    await api.delete('/api/users/' + row.userId);
    await load();
  }

  return (
    <section className="dashboard ranking-page">
      <div className="toolbar-row">
        <button className="icon-action" title="Refresh" onClick={load}>
          <RefreshCw className={loading ? 'spin' : ''} size={18} />
        </button>
      </div>

      <div className="ranking-list">
        {rows.map((row) => {
          const isMe = Number(row.userId) === Number(currentUser?.id);
          return (
            <article key={row.userId} className={'ranking-card ' + (isMe ? 'me' : '')}>
              <div className="rank-number">{row.rank === 1 ? <Trophy size={22} /> : '#' + row.rank}</div>
              <div className="avatar-circle">{initials(row.username)}</div>
              <div className="rank-main">
                <strong>{row.username}</strong>
                <span>{isMe ? 'Akun kamu' : 'Player'}</span>
              </div>
              <div className="badge"><Award size={15} /> {badgeFor(row)}</div>
              <div className="rank-points"><Medal size={16} /> {row.points || 0} pts</div>
              {isRootAdmin && (
                <button className="danger compact-action" onClick={() => deletePlayer(row)} disabled={row.role === 'root_admin' || Number(row.userId) === Number(currentUser.id)}>
                  <Trash2 size={16} /> Hapus
                </button>
              )}
              {isMe && <ShieldCheck className="me-icon" size={18} />}
            </article>
          );
        })}
        {!rows.length && <div className="empty-state">Ranking masih kosong. Mainkan quiz untuk mengisi papan skor.</div>}
      </div>
    </section>
  );
}
