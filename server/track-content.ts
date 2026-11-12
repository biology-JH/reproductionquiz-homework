import "server-only";

import { examQuestions, examVisuals } from "@/server/exam-content";
import type { ExamFigure, ExamPayload, PaperNumber, PublicQuestion, Tier } from "@/lib/types";

function paperNumberFor(question: PublicQuestion, track: Tier): PaperNumber {
  const match = question.paper.match(/^Paper\s+(\d+)/);
  const sourceNumber = match ? Number(match[1]) : 0;
  const targetNumber = track === "Extended"
    ? sourceNumber === 1 ? 2 : sourceNumber === 3 ? 4 : sourceNumber
    : sourceNumber;
  if (targetNumber !== 1 && targetNumber !== 2 && targetNumber !== 3 && targetNumber !== 4 && targetNumber !== 6) {
    throw new Error(`Unsupported paper style for question ${question.id}.`);
  }
  return targetNumber;
}

function paperLabelFor(question: PublicQuestion, track: Tier, paperNumber: PaperNumber): string {
  const label = question.paper.replace(/^Paper\s+\d+/, `Paper ${paperNumber}`);
  return label;
}

function assertTrackQuestionUniqueness(questions: PublicQuestion[], track: Tier): void {
  const ids = new Set<string>();
  const prompts = new Map<string, string>();
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error(`Duplicate question ID ${question.id} in ${track} track.`);
    ids.add(question.id);
    const normalized = question.prompt.toLowerCase().replace(/\s+/g, " ").trim();
    const previous = prompts.get(normalized);
    if (previous) throw new Error(`Duplicate question prompts ${previous} and ${question.id} in ${track} track.`);
    prompts.set(normalized, question.id);
  }
}

export function buildTrackExam(track: Tier): ExamPayload {
  const sourceQuestions = track === "Core"
    ? examQuestions.filter((question) => question.section === "Core")
    : examQuestions;

  const indexed = sourceQuestions.map((question, index) => ({ question, index }));
  indexed.sort((left, right) => {
    const leftPaper = paperNumberFor(left.question, track);
    const rightPaper = paperNumberFor(right.question, track);
    if (left.question.section !== right.question.section) return left.question.section === "Core" ? -1 : 1;
    if (leftPaper !== rightPaper) return leftPaper - rightPaper;
    return left.index - right.index;
  });

  const seenImages = new Map<string, string>();
  const groupFigureRefs = new Map<string, Set<string>>();
  let figureNumber = 0;
  const questions: PublicQuestion[] = indexed.map(({ question }) => {
    const paperNumber = paperNumberFor(question, track);
    const paper = paperLabelFor(question, track, paperNumber);
    const groupId = question.main || question.id;
    const figureRefs = new Set(groupFigureRefs.get(groupId) ?? []);
    const localImages = examVisuals[question.id]?.images ?? [];
    const sharedImages = question.main && question.main !== question.id
      ? examVisuals[question.main]?.images ?? []
      : [];
    const images = [...localImages, ...sharedImages];
    const figuresToDisplay: ExamFigure[] = [];

    for (const image of images) {
      let figureId = seenImages.get(image.src);
      if (!figureId) {
        figureNumber += 1;
        figureId = `F${String(figureNumber).padStart(2, "0")}`;
        seenImages.set(image.src, figureId);
        figuresToDisplay.push({
          id: figureId,
          src: image.src,
          alt: image.alt,
          caption: `${figureId} · ${image.caption}`,
        });
      }
      figureRefs.add(figureId);
    }

    if (sharedImages.length > 0) groupFigureRefs.set(groupId, new Set(figureRefs));
    return {
      ...question,
      paper,
      paperNumber,
      figureRefs: [...figureRefs],
      figuresToDisplay,
    };
  });

  assertTrackQuestionUniqueness(questions, track);

  const coreMarks = questions.filter((question) => question.section === "Core").reduce((sum, question) => sum + question.marks, 0);
  const extendedMarks = questions.filter((question) => question.section === "Extended").reduce((sum, question) => sum + question.marks, 0);
  const papers = new Map<PaperNumber, { paperLabel: string; maxMarks: number }>();
  for (const question of questions) {
    if (!question.paperNumber) continue;
    const current = papers.get(question.paperNumber) ?? { paperLabel: question.paper, maxMarks: 0 };
    current.maxMarks += question.marks;
    papers.set(question.paperNumber, current);
  }

  return {
    ok: true,
    track,
    questions,
    totals: {
      questionCount: questions.length,
      marks: questions.reduce((sum, question) => sum + question.marks, 0),
      coreMarks,
      extendedMarks,
      paperBreakdown: [...papers.entries()].map(([paperNumber, value]) => ({ paperNumber, ...value })),
    },
  };
}
