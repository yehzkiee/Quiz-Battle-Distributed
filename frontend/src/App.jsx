import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Home, LogOut, Medal, Search, Settings as SettingsIcon, Shield, Swords } from 'lucide-react';
import { api, clearSession, getUser, saveSession } from './services/api.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Lobby from './pages/Lobby.jsx';
import Matchmaking from './pages/Matchmaking.jsx';
import QuizRoom from './pages/QuizRoom.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import QuestionManager from './pages/QuestionManager.jsx';
import UserManager from './pages/UserManager.jsx';
import Settings from './pages/Settings.jsx';

const navItems = [
  { path: '/lobby', label: 'Lobby', icon: Home },
  { path: '/matchmaking', label: 'Matchmaking', icon: Search },
  { path: '/leaderboard', label: 'Ranking', icon: Medal },
  { path: '/settings', label: 'Settings', icon: SettingsIcon }
];

function pageTitle(pathname) {
  if (pathname.startsWith('/leaderboard')) return 'Ranking';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/room/')) return 'Quiz Room';
  if (pathname.startsWith('/questions')) return 'Kelola Soal';
  if (pathname.startsWith('/users')) return 'Kelola Users';
  if (pathname.startsWith('/matchmaking')) return 'Matchmaking';
  return 'Lobby';
}

function getActiveQuizSession() {
  try {
    return JSON.parse(sessionStorage.getItem('quiz-active-session') || 'null');
  } catch {
    return null;
  }
}

function Shell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getUser());

  async function refreshUser() {
    const current = getUser();
    if (!current?.id) return;
    try {
      const { data } = await api.get('/api/users/' + current.id);
      const next = { ...current, ...data };
      saveSession({ token: localStorage.getItem('quiz-token'), user: next });
      setUser(next);
    } catch {
      setUser(current);
    }
  }

  useEffect(() => {
    refreshUser();
    const onFocus = () => refreshUser();
    const onStorage = () => setUser(getUser());
    window.addEventListener('focus', onFocus);
    window.addEventListener('quiz-user-updated', onStorage);
    const timer = setInterval(refreshUser, 10000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('quiz-user-updated', onStorage);
      clearInterval(timer);
    };
  }, []);

  function guardedNavigate(path) {
    const activeQuiz = getActiveQuizSession();
    const insideQuiz = location.pathname.startsWith('/room/');
    const sameQuiz = activeQuiz?.roomId && path === '/room/' + activeQuiz.roomId;
    if (insideQuiz && activeQuiz?.status === 'playing' && !sameQuiz) {
      const confirmed = window.confirm('Quiz sedang berlangsung.\nApakah Anda yakin ingin meninggalkan pertandingan?');
      if (!confirmed) return;
      sessionStorage.setItem('quiz-active-session', JSON.stringify({ ...activeQuiz, status: 'left', updatedAt: Date.now() }));
    }
    navigate(path);
  }

  function logout() {
    const activeQuiz = getActiveQuizSession();
    if (activeQuiz?.status === 'playing') {
      const confirmed = window.confirm('Quiz sedang berlangsung.\nApakah Anda yakin ingin meninggalkan pertandingan?');
      if (!confirmed) return;
    }
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => guardedNavigate('/lobby')}>
          <Swords size={22} />
          <span>Quiz Battle</span>
        </button>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.path);
            return <button key={item.path} className={active ? 'active' : ''} onClick={() => guardedNavigate(item.path)}><Icon size={17} /> {item.label}</button>;
          })}
        </nav>
        {user && (
          <div className="profile-strip">
            <strong>{user.display_name || user.username}</strong>
            <span><Shield size={13} /> {user.role || 'user'} - {user.points || 0} pts</span>
            <button className="icon-action" title="Keluar" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        )}
      </aside>
      <main>
        <header className="page-header"><span className="eyebrow">Quiz Battle</span><h1>{pageTitle(location.pathname)}</h1></header>
        {children}
      </main>
    </div>
  );
}

function Protected({ children, roles }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/lobby" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/lobby" element={<Protected><Lobby /></Protected>} />
      <Route path="/matchmaking" element={<Protected><Matchmaking /></Protected>} />
      <Route path="/room/:roomId" element={<Protected><QuizRoom /></Protected>} />
      <Route path="/leaderboard" element={<Protected><Leaderboard /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/questions" element={<Protected roles={['root_admin', 'admin', 'instructor']}><QuestionManager /></Protected>} />
      <Route path="/users" element={<Protected roles={['root_admin']}><UserManager /></Protected>} />
      <Route path="*" element={<Navigate to={getUser() ? '/lobby' : '/login'} replace />} />
    </Routes>
  );
}
