import { UserRound } from 'lucide-react';

export default function PlayerCard({ label, player, score, active }) {
  return (
    <div className={'player-card ' + (active ? 'active' : '')}>
      <UserRound size={20} />
      <div>
        <span>{label}</span>
        <strong>{player?.username || 'Menunggu'}</strong>
      </div>
      <b>{score} pts</b>
    </div>
  );
}
