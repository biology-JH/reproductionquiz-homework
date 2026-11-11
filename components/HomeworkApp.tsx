"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "@/components/QuestionCard";
import ReportDownload from "@/components/ReportDownload";
import type { ExamPayload, MarkResult, PublicQuestion, Tier } from "@/lib/types";

interface QuestionGroup {
  id: string;
  title: string;
  questions: PublicQuestion[];
}

function groupQuestions(questions: PublicQuestion[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  for (const question of questions) {
    const id = question.main || question.id;
    let group = groups[groups.length - 1];
    if (!group || group.id !== id) {
      group = { id, title: question.topic || id, questions: [] };
      groups.push(group);
    }
    group.questions.push(question);
  }
  return groups;
}

function brandMark(size = 34) {
  return <img className="brand-mark" src="/reproduction-mark.svg" width={size} height={size} alt="" />;
}

const PROGRESS_KEY_PREFIX = "reproduction-mastery-0610-progress-v1";

function progressKeyFor(name: string) {
  const studentKey = name.trim().toLocaleLowerCase().replace(/\s+/g, "-");
  return `${PROGRESS_KEY_PREFIX}:${studentKey}`;
}

export default function HomeworkApp() {
  const [studentName, setStudentName] = useState("");
  const [homeworkPassword, setHomeworkPassword] = useState("");
  const [markingPassword, setMarkingPassword] = useState("");
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MarkResult | null>(null);
  const [gateError, setGateError] = useState("");
  const [markError, setMarkError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [marking, setMarking] = useState(false);
  const [progressStatus, setProgressStatus] = useState("Your answers save locally on this device as you work.");
  const skipNextAutosave = useRef(false);

  const coreQuestions = useMemo(() => exam?.questions.filter((question) => question.section === "Core") ?? [], [exam]);
  const extendedQuestions = useMemo(() => exam?.questions.filter((question) => question.section === "Extended") ?? [], [exam]);
  const answeredCount = useMemo(
    () => Object.values(answers).filter((answer) => answer.trim().length > 0).length,
    [answers],
  );

  useEffect(() => {
    if (!exam || !studentName.trim()) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(progressKeyFor(studentName), JSON.stringify({
        version: 1,
        studentName: studentName.trim(),
        answers,
        savedAt: new Date().toISOString(),
      }));
      setProgressStatus("Progress saved on this device. Passwords are never saved.");
    } catch {
      setProgressStatus("Local saving is unavailable in this browser. Keep this page open to avoid losing work.");
    }
  }, [exam, studentName, answers]);

  async function unlockExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGateError("");
    if (!studentName.trim()) {
      setGateError("Enter your name before opening the assignment.");
      return;
    }
    setUnlocking(true);
    try {
      const response = await fetch("/api/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ homeworkPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The exam could not be opened.");
      const nextExam = data as ExamPayload;
      let restoredAnswers: Record<string, string> = {};
      try {
        const saved = window.localStorage.getItem(progressKeyFor(studentName));
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; answers?: unknown };
          if (parsed.version === 1 && parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
            const validIds = new Set(nextExam.questions.map((question) => question.id));
            restoredAnswers = Object.fromEntries(
              Object.entries(parsed.answers as Record<string, unknown>)
                .filter(([id, value]) => validIds.has(id) && typeof value === "string")
                .map(([id, value]) => [id, String(value).slice(0, 8000)]),
            );
          }
        }
      } catch {
        setProgressStatus("Saved progress could not be read; a fresh attempt is ready.");
      }
      setAnswers(restoredAnswers);
      setProgressStatus(Object.values(restoredAnswers).some((answer) => answer.trim())
        ? "Previous progress restored from this device."
        : "Autosave is ready. Passwords are never saved.");
      setExam(nextExam);
      setHomeworkPassword("");
      setGateError("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setGateError(error instanceof Error ? error.message : "The exam could not be opened. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  function changeAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setResult(null);
    setMarkError("");
  }

  function clearMyProgress() {
    if (!window.confirm("Clear this student's saved answers and restart the exam? This cannot be undone. Passwords are not saved.")) return;
    try {
      window.localStorage.removeItem(progressKeyFor(studentName));
      skipNextAutosave.current = true;
      setAnswers({});
      setResult(null);
      setMarkingPassword("");
      setMarkError("");
      setProgressStatus("Saved answers cleared. New answers will save locally as you work.");
    } catch {
      setProgressStatus("The browser could not clear LocalStorage. You can remove this site's data in browser settings.");
    }
  }

  async function requestMarking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMarkError("");
    setMarking(true);
    try {
      const response = await fetch("/api/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ markingPassword, answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Marking could not be completed.");
      setResult(data as MarkResult);
      setMarkingPassword("");
      setMarkError("");
      window.setTimeout(() => document.getElementById("results-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (error) {
      setMarkError(error instanceof Error ? error.message : "Marking could not be completed. Try again.");
    } finally {
      setMarking(false);
    }
  }

  if (!exam) {
    return (
      <main className="welcome-page">
        <header className="topbar welcome-topbar">
          <a className="brand" href="#top" aria-label="Reproduction Mastery home">
            {brandMark()}
            <span><strong>Reproduction</strong><small>MASTERY · 0610</small></span>
          </a>
          <span className="topbar-note">BIOLOGY · CHAPTER 16</span>
        </header>
        <div className="welcome-layout" id="top">
          <section className="welcome-story">
            <p className="eyebrow"><span className="eyebrow-rule" /> CAMBRIDGE IGCSE BIOLOGY 0610</p>
            <h1>Reproduction,<br /><em>under the microscope.</em></h1>
            <p className="welcome-copy">
              A rigorous Chapter 16 practice paper built from your class slides: reproduction in plants and humans, hormonal control, STIs and practical reasoning.
            </p>
            <div className="welcome-facts">
              <div><strong>132</strong><span>questions</span></div>
              <div><strong>156</strong><span>available marks</span></div>
              <div><strong>Core → Extended</strong><span>in that order</span></div>
            </div>
            <p className="welcome-note">Original teacher-created practice. Paper styles are modelled on the syllabus, not copied from Cambridge papers.</p>
          </section>
          <form className="gate-card" onSubmit={unlockExam}>
            <p className="eyebrow">GATE 01 <span className="gate-line" /></p>
            <h2>Open the assignment</h2>
            <p className="form-intro">Enter your name and the Homework Password from your teacher.</p>
            <label htmlFor="student-name">Student name</label>
            <input
              id="student-name"
              name="student-name"
              className="text-field"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              required
            />
            <label htmlFor="homework-password">Homework Password</label>
            <input
              id="homework-password"
              name="homework-password"
              className="text-field"
              type="password"
              value={homeworkPassword}
              onChange={(event) => setHomeworkPassword(event.target.value)}
              autoComplete="off"
              maxLength={256}
              required
            />
            {gateError && <p className="form-error" role="alert">{gateError}</p>}
            <button className="primary-button" type="submit" disabled={unlocking}>
              {unlocking ? "Checking access…" : "Unlock the exam"}<span aria-hidden="true">→</span>
            </button>
            <p className="privacy-note">The Homework Password is checked by the server and is never saved. Answers are autosaved locally only after access is granted.</p>
          </form>
        </div>
        <footer className="site-footer welcome-footer">
          <span>REPRODUCTION MASTERY</span><span>Independent practice · Not an official Cambridge assessment</span>
        </footer>
      </main>
    );
  }

  const markValue = (questions: PublicQuestion[]) => questions.reduce((sum, question) => sum + question.marks, 0);
  const progress = exam.questions.length ? Math.round((answeredCount / exam.questions.length) * 100) : 0;
  const renderSection = (tier: Tier, questions: PublicQuestion[], anchor: string, index: string) => {
    const groups = groupQuestions(questions);
    return (
      <section className={`exam-section ${tier.toLowerCase()}-section`} id={anchor} aria-labelledby={`${anchor}-title`}>
        <header className="tier-heading">
          <span className="tier-index">{index} / 02</span>
          <div>
            <p className="eyebrow">{tier.toUpperCase()} TIER</p>
            <h2 id={`${anchor}-title`}>{tier}</h2>
          </div>
          <p className="tier-count">{questions.length} questions<br /><strong>{markValue(questions)} marks</strong></p>
        </header>
        <p className="tier-intro">
          {tier === "Core"
            ? "Build from clear biological knowledge and apply it carefully to the evidence."
            : "Extended items are intentionally more demanding: connect ideas, interpret unfamiliar evidence and justify conclusions."}
        </p>
        {groups.map((group, groupIndex) => {
          const visual = exam.visuals[group.id];
          return (
            <div className="question-group" key={`${tier}-${group.id}`}>
              <header className="group-heading">
                <span className="group-index">{String(groupIndex + 1).padStart(2, "0")}</span>
                <div><h3>{group.title}</h3><p>{group.id} · {group.questions.length} question parts</p></div>
                <span className="group-paper">{group.questions[0]?.paper}</span>
              </header>
              {visual && (
                <figure className="exam-figure">
                  <img src={visual.src} alt={visual.alt} />
                  <figcaption>{visual.alt} Refer to labels where the question directs you to do so.</figcaption>
                </figure>
              )}
              <div className="question-list">
                {group.questions.map((question) => (
                  <QuestionCard key={question.id} question={question} answer={answers[question.id] || ""} onChange={changeAnswer} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <main className="exam-page" id="top">
      <header className="topbar exam-topbar">
        <a className="brand" href="#top" aria-label="Back to top">
          {brandMark()}
          <span><strong>Reproduction</strong><small>MASTERY · 0610</small></span>
        </a>
        <nav className="exam-nav" aria-label="Exam sections">
          <a href="#core-section">Core</a>
          <a href="#extended-section">Extended</a>
          <a className="nav-mark" href="#marking-gate">Mark my work ↓</a>
          <button className="clear-progress" type="button" onClick={clearMyProgress}>Clear My Progress</button>
        </nav>
        <span className="student-chip">{studentName.trim()}</span>
      </header>

      <div className="exam-shell">
        <section className="exam-hero">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" /> CHAPTER 16 · REPRODUCTION</p>
            <h1>Your practice paper.</h1>
            <p>Take your time. Answer in your own words, show reasoning where asked, and use the data rather than guessing.</p>
          </div>
          <div className="exam-overview">
            <div><span>Questions</span><strong>{exam.totals.questionCount}</strong></div>
            <div><span>Total marks</span><strong>{exam.totals.marks}</strong></div>
            <div><span>Answered</span><strong>{answeredCount}<small> / {exam.totals.questionCount}</small></strong></div>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-caption">{progress}% answered · Core questions come first; Extended questions follow.</p>
          <p className="autosave-status" role="status">{progressStatus} Use Clear My Progress on a shared device when finished.</p>
        </section>

        {renderSection("Core", coreQuestions, "core-section", "01")}
        {renderSection("Extended", extendedQuestions, "extended-section", "02")}

        <section className="marking-gate" id="marking-gate" aria-labelledby="marking-title">
          {!result ? (
            <>
              <div className="marking-copy">
                <p className="eyebrow">GATE 02 <span className="gate-line" /></p>
                <h2 id="marking-title">Ready for your feedback?</h2>
                <p>Submit your answers with the separate Marking Password. The server checks responses and returns corrections only after that password is accepted.</p>
                <p className="unofficial-note">Written answers use transparent keyword rules, so ask your teacher to review any valid alternative wording that the automatic check may not recognise.</p>
              </div>
              <form className="marking-form" onSubmit={requestMarking}>
                <label htmlFor="marking-password">Marking Password</label>
                <input
                  id="marking-password"
                  name="marking-password"
                  className="text-field"
                  type="password"
                  value={markingPassword}
                  onChange={(event) => setMarkingPassword(event.target.value)}
                  autoComplete="off"
                  maxLength={256}
                  required
                />
                {markError && <p className="form-error" role="alert">{markError}</p>}
                <button className="primary-button" type="submit" disabled={marking}>
                  {marking ? "Marking your answers…" : "Unlock marking & score"}<span aria-hidden="true">→</span>
                </button>
                <p className="privacy-note">Answers are processed for this request and are not saved to a student account.</p>
              </form>
            </>
          ) : (
            <section className="results-panel" id="results-panel" aria-live="polite">
              <div className="result-heading">
                <div>
                  <p className="eyebrow">MARKING COMPLETE</p>
                  <h2 id="marking-title">Your result, {studentName.trim()}.</h2>
                </div>
                <div className="score-stamp"><strong>{result.score}<small> / {result.maxMarks}</small></strong><span>{result.percent.toFixed(1)}%</span></div>
              </div>
              <div className="result-facts">
                <div><span>Core</span><strong>{result.coreScore} / {result.coreMax}</strong></div>
                <div><span>Extended</span><strong>{result.extendedScore} / {result.extendedMax}</strong></div>
                <div><span>Practice estimate</span><strong>{result.gradeEstimate}</strong></div>
              </div>
              <p className="grade-disclaimer">Informal Chapter 16 practice indicator only. This is not a Cambridge grade boundary or a prediction of a final qualification grade.</p>
              <p className="drawing-disclaimer">{result.drawingNote}</p>
              <ReportDownload studentName={studentName.trim()} result={result} />
              <div className="corrections-heading">
                <div><p className="eyebrow">FEEDBACK</p><h3>Corrections to review</h3></div>
                <span>{result.incorrect.length} item{result.incorrect.length === 1 ? "" : "s"}</span>
              </div>
              {result.incorrect.length === 0 ? (
                <p className="no-errors">All automatically marked responses matched the answer rules. Ask your teacher to inspect the drawing itself.</p>
              ) : (
                <div className="correction-list">
                  {result.incorrect.map((item) => (
                    <article className="correction-card" key={item.id}>
                      <div className="correction-meta"><strong>{item.id}</strong><span>{item.section}</span><span>{item.awardedMarks} / {item.availableMarks} marks</span></div>
                      <p className="correction-prompt">{item.prompt}</p>
                      <p><span className="feedback-label">Your response</span>{item.submittedAnswer}</p>
                      <p><span className="feedback-label">Accepted answer</span>{item.correctAnswer}</p>
                      <p><span className="feedback-label">Correction / mark guidance</span>{item.correction}</p>
                    </article>
                  ))}
                </div>
              )}
              <p className="unofficial-note final-note">These explanations are teacher-created, unofficial practice feedback. They are not copied from or endorsed as official Cambridge mark-scheme text.</p>
            </section>
          )}
        </section>
      </div>
      <footer className="site-footer">
        <span>REPRODUCTION MASTERY · CHAPTER 16</span>
        <span>Original practice material · Not affiliated with Cambridge International</span>
      </footer>
    </main>
  );
}
