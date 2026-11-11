import type { ExamVisual, PublicQuestion } from "@/lib/types";
import { parseChoiceOptions, questionStem } from "@/lib/choices";
import DrawingPad from "@/components/DrawingPad";
import FigureGallery from "@/components/FigureGallery";

interface Props {
  question: PublicQuestion;
  answer: string;
  onChange: (questionId: string, value: string) => void;
  visual?: ExamVisual;
  progressStorageKey: string;
  drawingResetSignal: number;
}

export default function QuestionCard({ question, answer, onChange, visual, progressStorageKey, drawingResetSignal }: Props) {
  const choices = question.type === "choice" ? parseChoiceOptions(question.prompt) : [];
  const isChoice = choices.length > 0;

  return (
    <article className="question-card" id={`question-${question.id}`}>
      <div className="question-meta">
        <span className="question-code">{question.id}</span>
        <span>{question.paper}</span>
        <strong>{question.marks} {question.marks === 1 ? "mark" : "marks"}</strong>
      </div>
      <div className="question-prompt">{isChoice ? questionStem(question) : question.prompt}</div>
      {visual && <FigureGallery visual={visual} />}

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
          {question.id === "C02u" && <DrawingPad storageKey={`${progressStorageKey}:drawing:${question.id}`} resetSignal={drawingResetSignal} />}
          {question.id === "C02u" && (
            <p className="auto-mark-note">
              For the instant self-check, list the six labels used in your drawing below. The automatic mark checks label terms only; it cannot judge line quality, proportions or label placement, so have a teacher review the sketch.
            </p>
          )}
          <label htmlFor={`answer-${question.id}`}>
            {question.id === "C02u" ? "Labels shown in your drawing" : "Your answer"}
          </label>
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
              rows={question.id === "C02u" ? 2 : question.marks >= 3 ? 4 : 3}
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
