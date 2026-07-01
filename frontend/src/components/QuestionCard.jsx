export default function QuestionCard({ question, selected, setSelected, onSubmit, disabled, feedback }) {
  const options = [
    ['A', question.option_a],
    ['B', question.option_b],
    ['C', question.option_c],
    ['D', question.option_d]
  ];

  function optionClass(key) {
    let value = selected === key ? 'choice selected' : 'choice';
    if (feedback) {
      if (key === question.correct_option) value += ' correct';
      if (feedback.selected === key && key !== question.correct_option) value += ' wrong';
    }
    return value;
  }

  return (
    <section className="question-panel">
      <div className="question-meta">
        <span>Soal {question.index + 1}</span>
        <span>{question.points || 10} pts · {question.difficulty}</span>
      </div>
      <h2>{question.question_text}</h2>
      <form onSubmit={onSubmit} className="choice-form">
        <div className="choice-grid">
          {options.map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={optionClass(key)}
              onClick={() => setSelected(key)}
              disabled={disabled}
            >
              <b>{key}</b>
              <span>{text}</span>
            </button>
          ))}
        </div>
        {feedback && (
          <p className={feedback.correct ? 'answer-feedback good' : 'answer-feedback bad'}>
            {feedback.timeout ? 'Waktu habis.' : feedback.correct ? 'Benar!' : 'Salah.'} Jawaban benar: {question.correct_option}
          </p>
        )}
        <button className="primary" type="submit" disabled={disabled || !selected}>Kirim Jawaban</button>
      </form>
    </section>
  );
}
