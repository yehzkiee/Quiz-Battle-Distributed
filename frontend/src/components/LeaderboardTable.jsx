export default function LeaderboardTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId}>
              <td>#{row.rank}</td>
              <td>{row.username}</td>
              <td>{row.points}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan="3">Leaderboard masih kosong.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
