"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "@/components/QuestionCard";
import ReportDownload from "@/components/ReportDownload";
import Image from "next/image";
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

const PROGRESS_KEY_PREFIX = "reproduction-mastery-0610-progress-v2";

function progressKeyFor(name: string, track: Tier) {
  const studentKey = name.trim().toLocaleLowerCase().replace(/\s+/g, "-");
  return `${PROGRESS_KEY_PREFIX}:${track}:${studentKey}`;
}

const TRACK_DETAILS: Record<Tier, { papers: string; detail: string }> = {
  Core: {
    papers: "Paper 1 · Paper 3 · Paper 6",
    detail: "Core syllabus objectives only, including application and practical reasoning.",
  },
  Extended: {
    papers: "Paper 2 · Paper 4 · Paper 6",
    detail: "Core plus Supplement objectives, with the Extended questions designed to be more demanding.",
  },
};

async function readApiResponse(response: Response, fallbackMessage: string): Promise<Record<string, unknown>> {
  let data: unknown = null;
  try {
    const text = await response.text();
    if (text.trim()) data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`The server returned an empty or unreadable response${status}. Refresh the page and try again. If this continues, ask your teacher to check the site configuration.`);
  }
  const payload = data as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : fallbackMessage);
  }
  return payload;
}

export default function HomeworkApp() {
  const [studentName, setStudentName] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<Tier | null>(null);
  const [homeworkPassword, setHomeworkPassword] = useState("");
  const [markingPassword, setMarkingPassword] = useState("");
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MarkResult | null>(null);
  const [gateError, setGateError] = useState("");
  const [markError, setMarkError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [marking, setMarking] = useState(false);
  const [progressStatus, setProgressStatus] = useState("Typed answers autosave on this device after the exam is opened. Passwords are never saved.");
  const skipNextAutosave = useRef(false);

  const answeredCount = useMemo(
    () => exam?.questions.filter((question) => Boolean(answers[question.id]?.trim())).length ?? 0,
    [exam, answers],
  );

  useEffect(() => {
    if (!exam || !studentName.trim()) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(progressKeyFor(studentName, exam.track), JSON.stringify({
        version: 2,
        track: exam.track,
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
    if (!selectedTrack) {
      setGateError("Select exactly one track before starting.");
      return;
    }
    const chosenTrack = selectedTrack;
    setUnlocking(true);
    try {
      const response = await fetch("/api/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ homeworkPassword, track: chosenTrack }),
      });
      const data = await readApiResponse(response, "The exam could not be opened.");
      const nextExam = data as unknown as ExamPayload;
      const savedKey = progressKeyFor(studentName, chosenTrack);
      let restoredAnswers: Record<string, string> = {};
      let hadSavedAnswers = false;
      try {
        const saved = window.localStorage.getItem(savedKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; track?: Tier; answers?: unknown };
          if ((parsed.version === 1 || parsed.version === 2) && parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
            const validIds = new Set(nextExam.questions.map((question) => question.id));
            restoredAnswers = Object.fromEntries(
              Object.entries(parsed.answers as Record<string, unknown>)
                .filter(([id, value]) => validIds.has(id) && typeof value === "string")
                .map(([id, value]) => [id, String(value).slice(0, 8000)]),
            );
            hadSavedAnswers = Object.values(restoredAnswers).some((answer) => answer.trim());
          }
        }
        // Remove legacy sketch data from the previous version; this app no longer stores drawings.
        window.localStorage.removeItem(`reproduction-mastery-0610-progress-v1:${studentName.trim().toLocaleLowerCase().replace(/\s+/g, "-")}:drawing:C02u`);
      } catch {
        setProgressStatus("Saved progress could not be read; a fresh attempt is ready.");
      }
      skipNextAutosave.current = false;
      setAnswers(restoredAnswers);
      setProgressStatus(hadSavedAnswers ? "Previous typed answers restored from this device." : "Autosave is ready. Passwords are never saved.");
      setExam(nextExam);
      setSelectedTrack(nextExam.track);
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
    if (!exam) return;
    if (!window.confirm("Clear this student's saved answers and restart the selected track? This cannot be undone. Passwords are not saved.")) return;
    try {
      window.localStorage.removeItem(progressKeyFor(studentName, exam.track));
      skipNextAutosave.current = true;
      setAnswers({});
      setResult(null);
      setMarkingPassword("");
      setMarkError("");
      setProgressStatus("Saved answers cleared. New typed answers will autosave locally as you continue.");
    } catch {
      setProgressStatus("The browser could not clear LocalStorage. You can remove this site's data in browser settings.");
    }
  }

  async function requestMarking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exam) return;
    setMarkError("");
    setMarking(true);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ markingPassword, answers, tier: exam.track }),
      });
      const data = await readApiResponse(response, "Marking could not be completed.");
      setResult(data as unknown as MarkResult);
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
            <figure className="welcome-visual">
              <Image
                className="welcome-art"
                src="/hero/reproduction-front-page.png"
                alt="A pink blossom releases pollen beside an open seed pod and seeds beginning to germinate in soil."
                width={1072}
                height={624}
                sizes="(max-width: 820px) 100vw, (max-width: 1440px) 62vw, 840px"
                priority
              />
              <figcaption>
                <span>FIELD NOTE · 16.3</span>
                <strong>From blossom to new growth</strong>
              </figcaption>
            </figure>
            <p className="eyebrow"><span className="eyebrow-rule" /> CAMBRIDGE IGCSE BIOLOGY 0610</p>
            <h1>Reproduction,<br /><em>under the microscope.</em></h1>
            <p className="welcome-copy">
              Challenging Chapter 16 practice based only on your class slides: asexual and sexual reproduction, flowering plants, human reproduction, hormones, STIs and practical reasoning.
            </p>
            <div className="welcome-facts">
              <div><strong>Chapter 16</strong><span>reproduction only</span></div>
              <div><strong>Two tracks</strong><span>choose one per session</span></div>
              <div><strong>HOTS</strong><span>apply · analyse · evaluate</span></div>
            </div>
            <p className="welcome-note">Original teacher-created practice in Cambridge-style formats. This is not an official Cambridge assessment.</p>
          </section>
          <form className="gate-card" onSubmit={unlockExam}>
            <p className="eyebrow">GATE 01 <span className="gate-line" /></p>
            <h2>Choose one track</h2>
            <p className="form-intro">Your choice is locked to this browser session. You cannot open both tracks in the same session.</p>
            <fieldset className="track-choice-set">
              <legend>Select your exam track</legend>
              {(["Core", "Extended"] as const).map((track) => (
                <label className={`track-choice-option${selectedTrack === track ? " selected" : ""}`} key={track}>
                  <input
                    type="radio"
                    name="exam-track"
                    value={track}
                    checked={selectedTrack === track}
                    onChange={() => setSelectedTrack(track)}
                  />
                  <span className="track-choice-copy">
                    <strong>{track}</strong>
                    <span>{TRACK_DETAILS[track].papers}</span>
                    <small>{TRACK_DETAILS[track].detail}</small>
                  </span>
                </label>
              ))}
            </fieldset>
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
            <button className="primary-button" type="submit" disabled={unlocking || !selectedTrack}>
              {unlocking ? "Checking access…" : "Unlock the selected track"}<span aria-hidden="true">→</span>
            </button>
            <p className="privacy-note">The Homework Password is checked by the server and is never saved. Answers autosave locally only after access is granted.</p>
          </form>
        </div>
        <footer className="site-footer welcome-footer">
          <span>REPRODUCTION MASTERY</span><span>Chapter 16 practice · Not an official Cambridge assessment</span>
        </footer>
      </main>
    );
  }

  const progress = exam.questions.length ? Math.round((answeredCount / exam.questions.length) * 100) : 0;
  const paperSections = ( ["Core", "Extended"] as const).flatMap((section) => {
    const questionsByPaper = new Map<number, PublicQuestion[]>();
    for (const question of exam.questions.filter((item) => item.section === section)) {
      const paperNumber = question.paperNumber ?? 0;
      const paperQuestions = questionsByPaper.get(paperNumber) ?? [];
      paperQuestions.push(question);
      questionsByPaper.set(paperNumber, paperQuestions);
    }
    return [...questionsByPaper.entries()]
      .sort(([left], [right]) => left - right)
      .map(([paperNumber, questions]) => ({ section, paperNumber, questions }));
  });
  const aiMarkedItems = result?.markScheme.filter((item) => item.aiGraded) ?? [];

  return (
    <main className="exam-page" id="top">
      <header className="topbar exam-topbar">
        <a className="brand" href="#top" aria-label="Back to top">
          {brandMark()}
          <span><strong>Reproduction</strong><small>MASTERY · 0610</small></span>
        </a>
        <nav className="exam-nav" aria-label="Selected exam sections">
          {paperSections.map(({ section, paperNumber }) => <a href={`#${section.toLowerCase()}-paper-${paperNumber}-section`} key={`${section}-${paperNumber}`}>{section === "Extended" ? "Supplement" : "Core"} · P{paperNumber}</a>)}
          <a className="nav-mark" href="#marking-gate">Mark my work ↓</a>
          <button className="clear-progress" type="button" onClick={clearMyProgress}>Clear My Progress</button>
        </nav>
        <span className="student-chip">{studentName.trim()}</span>
      </header>

      <div className="exam-shell">
        <section className="exam-hero">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" /> CHAPTER 16 · REPRODUCTION</p>
            <h1>{exam.track} track practice.</h1>
            <p>{TRACK_DETAILS[exam.track].papers}. Use evidence, connect biological ideas and show your reasoning. Only Chapter 16 content is included.</p>
          </div>
          <div className="exam-overview">
            <div><span>Questions</span><strong>{exam.totals.questionCount}</strong></div>
            <div><span>Total marks</span><strong>{exam.totals.marks}</strong></div>
            <div><span>Answered</span><strong>{answeredCount}<small> / {exam.totals.questionCount}</small></strong></div>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-caption">{progress}% answered · {exam.track} track selected for this session.</p>
          <p className="autosave-status" role="status">{progressStatus} Use Clear My Progress on a shared device when finished.</p>
        </section>

        {paperSections.map(({ section, paperNumber, questions }, paperIndex) => {
          const groups = groupQuestions(questions);
          const paperMax = questions.reduce((sum, question) => sum + question.marks, 0);
          const paperLabel = questions[0]?.paper ?? `Paper ${paperNumber}`;
          const sectionLabel = section === "Extended" ? "Supplement" : "Core";
          const sectionId = `${section.toLowerCase()}-paper-${paperNumber}-section`;
          return (
            <section className={`exam-section paper-section ${section.toLowerCase()}-section paper-${paperNumber}`} id={sectionId} aria-labelledby={`${sectionId}-title`} key={`${section}-${paperNumber}`}>
              <header className="tier-heading">
                <span className="tier-index">{String(paperIndex + 1).padStart(2, "0")} / {String(paperSections.length).padStart(2, "0")}</span>
                <div>
                  <p className="eyebrow">{exam.track.toUpperCase()} TRACK · {sectionLabel.toUpperCase()} QUESTIONS</p>
                  <h2 id={`${sectionId}-title`}>Paper {paperNumber}</h2>
                </div>
                <p className="tier-count">{questions.length} questions<br /><strong>{paperMax} marks</strong></p>
              </header>
              <p className="tier-intro">{paperLabel}. {sectionLabel} questions are grouped here; the Extended track presents all Core questions before Supplement questions.</p>
              {groups.map((group, groupIndex) => (
                <div className="question-group" key={`${paperNumber}-${group.id}`}>
                  <header className="group-heading">
                    <span className="group-index">{String(groupIndex + 1).padStart(2, "0")}</span>
                    <div><h3>{group.title}</h3><p>{group.id} · {group.questions.length} question parts</p></div>
                    <span className="group-paper">{group.questions[0]?.paper}</span>
                  </header>
                  <div className="question-list">
                    {group.questions.map((question) => (
                      <QuestionCard key={question.id} question={question} answer={answers[question.id] || ""} onChange={changeAnswer} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        <section className="marking-gate" id="marking-gate" aria-labelledby="marking-title">
          {!result ? (
            <>
              <div className="marking-copy">
                <p className="eyebrow">GATE 02 <span className="gate-line" /></p>
                <h2 id="marking-title">Ready for your feedback?</h2>
                <p>Submit your answers with the separate Marking Password. Only this session's selected track will be marked, and answers/corrections are returned only after the password is accepted.</p>
              </div>
              <form className="marking-form" onSubmit={requestMarking} aria-busy={marking}>
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
                  {marking ? "Marking written responses…" : "Unlock marking & score"}<span aria-hidden="true">→</span>
                </button>
              </form>
            </>
          ) : (
            <section className="results-panel" id="results-panel" aria-live="polite">
              <div className="result-heading">
                <div>
                  <p className="eyebrow">MARKING COMPLETE · {result.track.toUpperCase()} TRACK</p>
                  <h2 id="marking-title">Your result, {studentName.trim()}.</h2>
                </div>
                <div className="score-stamp"><strong>{result.score}<small> / {result.maxMarks}</small></strong><span>{result.percent.toFixed(1)}%</span></div>
              </div>
              <div className="result-facts">
                {result.paperBreakdown.map((paper) => (
                  <div key={paper.paperNumber}><span>Paper {paper.paperNumber}</span><strong>{paper.score} / {paper.maxMarks}</strong></div>
                ))}
                <div><span>Core objectives</span><strong>{result.coreScore} / {result.coreMax}</strong></div>
                {result.track === "Extended" && <div><span>Supplement objectives</span><strong>{result.extendedScore} / {result.extendedMax}</strong></div>}
                <div><span>Practice estimate</span><strong>{result.gradeEstimate}</strong></div>
              </div>
              <p className="grade-disclaimer">Informal Chapter 16 practice indicator only. This is not an official Cambridge grade boundary or a prediction of a final qualification grade.</p>
              <ReportDownload studentName={studentName.trim()} result={result} questions={exam.questions} answers={answers} />
              {aiMarkedItems.length > 0 && (
                <section className="ai-feedback-section" aria-label="Written-response rubric feedback">
                  <header className="ai-feedback-heading">
                    <div><p className="eyebrow">WRITTEN RESPONSE · RUBRIC</p><h3>Rubric points and evidence</h3></div>
                    <span>{aiMarkedItems.length} response{aiMarkedItems.length === 1 ? "" : "s"}</span>
                  </header>
                  <div className="ai-feedback-list">
                    {aiMarkedItems.map((item) => (
                      <article className="ai-feedback-card" key={item.id}>
                        <div className="correction-meta"><strong>{item.id}</strong><span>{item.paper}</span><span>{item.awardedMarks} / {item.marks} marks</span></div>
                        <p className="correction-prompt">{item.prompt}</p>
                        <p className="ai-feedback-summary"><span className="feedback-label">Feedback</span>{item.feedback}</p>
                        {item.criteria && item.criteria.length > 0 && (
                          <ol className="ai-criteria-list">
                            {item.criteria.map((criterion) => (
                              <li key={criterion.id}>
                                <span className="ai-criterion-score">{criterion.awardedMarks} / {criterion.maxMarks}</span>
                                <span>{criterion.criterion}</span>
                                <span className="ai-criterion-feedback">{criterion.feedback}</span>
                                {criterion.evidenceQuote && <blockquote>“{criterion.evidenceQuote}”</blockquote>}
                              </li>
                            ))}
                          </ol>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="corrections-heading">
                <div><p className="eyebrow">FEEDBACK</p><h3>Corrections to review</h3></div>
                <span>{result.incorrect.length} item{result.incorrect.length === 1 ? "" : "s"}</span>
              </div>
              {result.incorrect.length === 0 ? (
                <p className="no-errors">Every response received full credit under the teacher-provided practice marking criteria. Download the marked script for the complete question-by-question answer breakdown.</p>
              ) : (
                <div className="correction-list">
                  {result.incorrect.map((item) => (
                    <article className="correction-card" key={item.id}>
                      <div className="correction-meta"><strong>{item.id}</strong><span>{item.paper}</span><span>{item.section} objective</span><span>{item.awardedMarks} / {item.availableMarks} marks</span></div>
                      <p className="correction-prompt">{item.prompt}</p>
                      <p><span className="feedback-label">Your response</span>{item.submittedAnswer}</p>
                      <p><span className="feedback-label">Accepted answer</span>{item.correctAnswer}</p>
                      <p><span className="feedback-label">Correction / mark guidance</span>{item.correction}</p>
                    </article>
                  ))}
                </div>
              )}
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
