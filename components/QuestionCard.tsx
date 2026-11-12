import type { PublicQuestion } from "@/lib/types";
import { parseChoiceOptions, questionStem } from "@/lib/choices";
import FigureGallery from "@/components/FigureGallery";

interface Props {
  question: PublicQuestion;
  answer: string;
  onChange: (questionId: string, value: string) => void;
}

export default function QuestionCard({ question, answer, onChange }: Props) {
  const choices = question.type === "choice" ? parseChoiceOptions(question.prompt) : [];
  const isChoice = choices.length > 0;
  const displayedFigures = question.figuresToDisplay ?? [];
  const figureRefs = question.figureRefs ?? [];

  return (
    <article className="question-card" id={`question-${question.id}`}>
      <div className="question-meta">
        <span className="question-code">{question.id}</span>
        <span>{question.paper}</span>
        <span className="question-level">{question.section === "Core" ? "Core objective" : "Supplement objective"}</span>
        <strong>{question.marks} {question.marks === 1 ? "mark" : "marks"}</strong>
      </div>
      <div className="question-prompt">{isChoice ? questionStem(question) : question.prompt}</div>
      {figureRefs.length > 0 && <p className="figure-reference-note">Use {figureRefs.map((id) => `Figure ${id}`).join(", ")} for this question.</p>}
      {displayedFigures.length > 0 && <FigureGallery figures={displayedFigures} />}

      {isChoice ? (
        <fieldset className="choice-list">
          <legend className="sr-only">Select one answer for {question.id}</legend>
          {choices.map((choice) => (
            <label className={`choice-option${answer === choice.letter ? " selected" : ""}`} key={choice.letter}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={choice.letter}
                checked={answer === choice.letter}
                onChange={(event) => onChange(question.id, event.target.value)}
              />
              <span className="choice-letter">{choice.letter}</span>
              <span>{choice.text}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="written-answer">
          <label htmlFor={`answer-${question.id}`}>Your answer</label>
          {question.marks <= 1 && question.type !== "manual" ? (
            <input
              id={`answer-${question.id}`}
              className="answer-input"
              type="text"
              inputMode={question.type === "numeric" ? "decimal" : "text"}
              value={answer}
              onChange={(event) => onChange(question.id, event.target.value)}
              autoComplete="off"
            />
          ) : (
            <textarea
              id={`answer-${question.id}`}
              className="answer-input answer-textarea"
              rows={question.marks >= 3 ? 4 : 3}
              value={answer}
              onChange={(event) => onChange(question.id, event.target.value)}
              autoComplete="off"
            />
          )}
        </div>
      )}
    </article>
  );
}
