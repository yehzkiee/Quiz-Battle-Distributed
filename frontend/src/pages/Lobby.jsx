import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { DoorOpen, Medal, Play, Settings, Trophy, Zap } from 'lucide-react';
import { getUser } from '../services/api.js';

export default function Lobby() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());

  useEffect(() => {
    const refresh = () => setUser(getUser());
    window.addEventListener('quiz-user-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('quiz-user-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <section className="dashboard">
      <div className="topline">
        <div>
          <span className="eyebrow">Online arena</span>
          <h1>Siap duel, {user.display_name || user.username}?</h1>
        </div>
        <button className="primary" onClick={() => navigate('/matchmaking')}><Play size={18} /> Buka Matchmaking</button>
      </div>
      <div className="stat-grid">
        <article><Zap size={22} /><span>Mode</span><strong>1 vs 1</strong></article>
        <article><Trophy size={22} /><span>Poin Kamu</span><strong>{user.points || 0}</strong></article>
        <article><DoorOpen size={22} /><span>Role</span><strong>{user.role || 'user'}</strong></article>
      </div>

      <div className="workbench">
        <button onClick={() => navigate('/matchmaking')}><DoorOpen size={18} /> Quick Match / Room</button>
        <button onClick={() => navigate('/leaderboard')}><Medal size={18} /> Lihat Ranking</button>
        <button onClick={() => navigate('/settings')}><Settings size={18} /> Settings</button>
      </div>
    </section>
  );
}
