import { QUIZ_QUESTION_SECONDS } from '../config/quiz.js';

export default function Timer({ value, max = QUIZ_QUESTION_SECONDS }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="timer" aria-label="Timer">
      <strong>{value}s</strong>
      <span><i style={{ width: percent + '%' }} /></span>
    </div>
  );
}
