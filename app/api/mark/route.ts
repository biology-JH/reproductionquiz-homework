import "server-only";

import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { TRACK_COOKIE_NAME, verifyTrackSessionToken } from "@/lib/track-session";
import type { MarkSchemeItem, PaperScore, Tier } from "@/lib/types";
import { encryptedMasterKey } from "@/server/master_key";
import { buildTrackExam } from "@/server/track-content";
import {
  gradeOpenRouterBatch,
  OpenRouterGradeError,
  type AiGradeInput,
  type AiGradeResult,
  type MasterQuestionRule,
} from "@/server/openrouter-grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MasterQuestion = MasterQuestionRule;
type PendingAiGrade = { paperNumber: number; input: AiGradeInput };

type GradePayload = {
  markingPassword?: unknown;
  answers?: unknown;
  track?: unknown;
  tier?: unknown;
  question?: unknown;
  questionId?: unknown;
  studentAnswer?: unknown;
  // Intentionally accepted for compatibility with the documented payload, but never trusted.
  markScheme?: unknown;
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" },
  });
}

function matchesSecret(input: string, expected: string): boolean {
  const inputDigest = createHash("sha256").update(input, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

function decryptMasterQuestions(password: string): MasterQuestion[] {
  const ciphertextAndTag = Buffer.from(encryptedMasterKey.ciphertext, "base64");
  if (ciphertextAndTag.length < 17) throw new Error("Invalid encrypted key.");
  const ciphertext = ciphertextAndTag.subarray(0, -16);
  const tag = ciphertextAndTag.subarray(-16);
  const key = pbkdf2Sync(
    password,
    Buffer.from(encryptedMasterKey.salt, "base64"),
    encryptedMasterKey.iterations,
    32,
    "sha256",
  );
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encryptedMasterKey.nonce, "base64"));
  decipher.setAAD(Buffer.from("igcse0610-ch16-master-key-v1", "utf8"));
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const master = JSON.parse(raw) as { questions?: MasterQuestion[] };
  if (!Array.isArray(master.questions)) throw new Error("Invalid answer key.");
  return master.questions;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replace(/[^a-z0-9+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAlias(response: string, aliases: string[]): boolean {
  const normalized = ` ${normalize(response)} `;
  return aliases.some((alias) => normalized.includes(` ${normalize(alias)} `));
}

function acceptedValues(question: MasterQuestion): string[] {
  if (Array.isArray(question.accept)) return question.accept;
  if (typeof question.accept === "string") return [question.accept];
  return question.answer ? [question.answer] : [];
}

function markQuestion(question: MasterQuestion, responseValue: unknown): { score: number; note: string } {
  const response = typeof responseValue === "string" ? responseValue : "";
  const maximum = question.marks;
  if (!response.trim()) return { score: 0, note: "No response submitted." };

  if (question.type === "choice" || question.type === "exact") {
    const correct = acceptedValues(question).some((value) => normalize(value) === normalize(response));
    return { score: correct ? maximum : 0, note: "The response was checked against the teacher-authored accepted answer." };
  }

  if (question.type === "numeric") {
    const submitted = Number(response.replace(/%/g, "").trim());
    const expected = Number(question.answer);
    const correct = Number.isFinite(submitted) && Number.isFinite(expected) && submitted === expected;
    return { score: correct ? maximum : 0, note: "The response was checked against the teacher-authored numerical answer." };
  }

  if (question.type === "contains") {
    const groups = Array.isArray(question.groups) ? question.groups : [];
    if (!groups.length) return { score: 0, note: "No automatic marking rule was available." };
    const hits = groups.filter((group) => containsAlias(response, Array.isArray(group) ? group : [group])).length;
    const score = groups.length > maximum ? Math.floor((hits * maximum) / groups.length) : Math.min(maximum, hits);
    return { score, note: "Written response requires the protected AI grading path." };
  }

  return { score: 0, note: "This response needs teacher review." };
}

function canonicalAnswer(question: MasterQuestion): string {
  const first = acceptedValues(question)[0] ?? question.answer;
  if (question.type === "choice" && first && /^[A-D]$/i.test(first.trim())) {
    const letter = first.trim().toUpperCase();
    const option = question.prompt.match(new RegExp(`(?:^|\\n)\\s*${letter}[.)]\\s*([^\\n]+)`, "i"))?.[1]?.trim();
    return option ? `${letter}. ${option}` : letter;
  }
  if (first) return first;
  const groups = Array.isArray(question.groups) ? question.groups : [];
  const canonicalPoints = groups.map((group) => Array.isArray(group) ? group[0] : group).filter(Boolean);
  return canonicalPoints.length ? canonicalPoints.join("; ") : "Review the marking points below.";
}

function markingPoints(question: MasterQuestion): string {
  if (question.rubric?.trim()) return question.rubric.trim();
  const groups = Array.isArray(question.groups) ? question.groups : [];
  const canonicalPoints = groups.map((group) => Array.isArray(group) ? group[0] : group).filter(Boolean);
  if (canonicalPoints.length) return canonicalPoints.map((point, index) => `${index + 1}. ${point}`).join("\n");
  const accepted = acceptedValues(question);
  return accepted.length ? `Accepted response: ${accepted.join("; ")}` : "Use the accepted answer shown above.";
}

function gradeEstimate(percent: number): string {
  if (percent >= 85) return "A* practice band";
  if (percent >= 75) return "A practice band";
  if (percent >= 65) return "B practice band";
  if (percent >= 55) return "C practice band";
  if (percent >= 45) return "D practice band";
  if (percent >= 35) return "E practice band";
  if (percent >= 25) return "F practice band";
  if (percent >= 15) return "G practice band";
  return "Below G practice band";
}

function taskCharacters(input: AiGradeInput): number {
  return input.question.prompt.length
    + (input.question.rubric?.length ?? 0)
    + input.studentAnswer.length
    + JSON.stringify(input.question.groups ?? []).length
    + acceptedValues(input.question).join(";").length;
}

function makeAiBatches(pending: PendingAiGrade[]): AiGradeInput[][] {
  const byPaper = new Map<number, PendingAiGrade[]>();
  for (const item of pending) {
    const paperItems = byPaper.get(item.paperNumber) ?? [];
    paperItems.push(item);
    byPaper.set(item.paperNumber, paperItems);
  }

  const batches: AiGradeInput[][] = [];
  for (const paperItems of byPaper.values()) {
    let current: AiGradeInput[] = [];
    let chars = 0;
    for (const item of paperItems) {
      const size = taskCharacters(item.input);
      if (size > 24_000) throw new OpenRouterGradeError("A written response or rubric is too large to grade. Shorten the response and try again.");
      if (current.length >= 18 || (current.length > 0 && chars + size > 24_000)) {
        batches.push(current);
        current = [];
        chars = 0;
      }
      current.push(item.input);
      chars += size;
    }
    if (current.length) batches.push(current);
  }
  return batches;
}

async function gradeConstructedResponses(pending: PendingAiGrade[]): Promise<Map<string, AiGradeResult>> {
  const output = new Map<string, AiGradeResult>();
  if (!pending.length) return output;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterGradeError("OpenRouter grading is not configured. Ask your teacher to check the server settings.");

  const batches = makeAiBatches(pending);
  const settled = await Promise.allSettled(batches.map((batch) => gradeOpenRouterBatch(batch, apiKey)));
  const failure = settled.find((item): item is PromiseRejectedResult => item.status === "rejected");
  if (failure) {
    if (failure.reason instanceof OpenRouterGradeError) throw failure.reason;
    throw new OpenRouterGradeError("AI marking could not be completed. Your saved answers are unchanged; please retry shortly.");
  }
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    for (const grade of item.value) output.set(grade.questionId, grade);
  }
  if (output.size !== pending.length) throw new OpenRouterGradeError("AI marking returned an incomplete answer set. No partial score was released; please retry.");
  return output;
}

function parsePayload(value: unknown): GradePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GradePayload;
}

export async function POST(request: NextRequest) {
  const sessionTrack = verifyTrackSessionToken(request.cookies.get(TRACK_COOKIE_NAME)?.value);
  if (!sessionTrack) return privateJson({ ok: false, message: "Open the exam with the Homework Password before requesting marking." }, 401);

  const expectedPassword = process.env.MARKING_PASSWORD;
  if (!expectedPassword) return privateJson({ ok: false, message: "Marking is not configured yet." }, 503);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1_500_000) {
    return privateJson({ ok: false, message: "The submitted answer set is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ ok: false, message: "Submit the answers and Marking Password to continue." }, 400);
  }
  const payload = parsePayload(body);
  if (!payload) return privateJson({ ok: false, message: "The grading request must be a JSON object." }, 400);
  const requestedTrack = payload.tier ?? payload.track;
  if (requestedTrack !== sessionTrack) return privateJson({ ok: false, message: "The selected track does not match this browser session." }, 403);

  const supplied = typeof payload.markingPassword === "string" ? payload.markingPassword : "";
  if (supplied.length > 256 || !matchesSecret(supplied, expectedPassword)) {
    return privateJson({ ok: false, message: "That Marking Password was not accepted. No score or corrections were released." }, 401);
  }

  let exam;
  try {
    exam = buildTrackExam(sessionTrack);
  } catch {
    return privateJson({ ok: false, message: "This exam track is being updated and cannot be marked right now." }, 503);
  }

  let decryptedQuestions: MasterQuestion[];
  try {
    decryptedQuestions = decryptMasterQuestions(expectedPassword);
  } catch {
    return privateJson({ ok: false, message: "The protected answer key could not be loaded." }, 503);
  }
  const masterById = new Map(decryptedQuestions.map((question) => [question.id, question]));
  const publicById = new Map(exam.questions.map((question) => [question.id, question]));
  const masterQuestions = exam.questions.map((question) => masterById.get(question.id));
  if (masterQuestions.some((question) => !question)) {
    return privateJson({ ok: false, message: "The protected marking data does not match this exam track." }, 503);
  }

  const isSingleQuestionRequest = payload.question !== undefined || payload.questionId !== undefined || payload.studentAnswer !== undefined;
  if (isSingleQuestionRequest) {
    const reference = typeof payload.question === "string"
      ? payload.question.trim()
      : typeof payload.questionId === "string"
        ? payload.questionId.trim()
        : "";
    const publicQuestion = exam.questions.find((question) => question.id === reference || question.prompt.trim() === reference);
    if (!publicQuestion) return privateJson({ ok: false, message: "Question was not found in this selected track." }, 404);
    const masterQuestion = masterById.get(publicQuestion.id);
    if (!masterQuestion) return privateJson({ ok: false, message: "The protected marking data does not match this question." }, 503);
    const answer = typeof payload.studentAnswer === "string" ? payload.studentAnswer : "";
    if (answer.length > 8_000) return privateJson({ ok: false, message: "A written response is too long to grade. Shorten it and try again." }, 413);
    if (!answer.trim()) return privateJson({ score: `0/${masterQuestion.marks}`, isCorrect: false, feedback: "No response submitted." });

    if (masterQuestion.type === "contains") {
      try {
        const [grade] = await gradeOpenRouterBatch([{
          question: { ...masterQuestion, prompt: publicQuestion.prompt, section: publicQuestion.section },
          studentAnswer: answer,
          track: sessionTrack,
          paper: publicQuestion.paper,
        }], process.env.OPENROUTER_API_KEY?.trim() ?? "");
        return privateJson({ score: `${grade.score}/${grade.maxMarks}`, isCorrect: grade.isCorrect, feedback: grade.feedback });
      } catch (error) {
        const message = error instanceof OpenRouterGradeError
          ? error.message
          : "AI marking could not be completed. Your answers are unchanged; please retry shortly.";
        return privateJson({ ok: false, message }, 503);
      }
    }

    const result = markQuestion(masterQuestion, answer);
    const feedback = result.score === masterQuestion.marks
      ? `Correct: ${result.note}`
      : `${result.note} Accepted response: ${canonicalAnswer(masterQuestion)}`;
    return privateJson({ score: `${result.score}/${masterQuestion.marks}`, isCorrect: result.score === masterQuestion.marks, feedback });
  }

  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return privateJson({ ok: false, message: "Answers were missing or invalid." }, 400);
  }
  const responses = payload.answers as Record<string, unknown>;
  if (Object.keys(responses).some((id) => !publicById.has(id))) {
    return privateJson({ ok: false, message: "The answer set contains questions outside this track." }, 400);
  }
  if (Object.values(responses).some((value) => typeof value === "string" && value.length > 8_000)) {
    return privateJson({ ok: false, message: "A written response is too long to grade. Shorten it and submit again." }, 413);
  }

  const pending: PendingAiGrade[] = [];
  for (let index = 0; index < exam.questions.length; index += 1) {
    const publicQuestion = exam.questions[index];
    const question = masterQuestions[index] as MasterQuestion;
    const response = typeof responses[question.id] === "string" ? String(responses[question.id]) : "";
    if (question.type !== "contains" || !response.trim()) continue;
    pending.push({
      paperNumber: publicQuestion.paperNumber ?? 0,
      input: {
        question: { ...question, prompt: publicQuestion.prompt, section: publicQuestion.section },
        studentAnswer: response,
        track: sessionTrack,
        paper: publicQuestion.paper,
      },
    });
  }

  let aiGrades: Map<string, AiGradeResult>;
  try {
    aiGrades = await gradeConstructedResponses(pending);
  } catch (error) {
    const message = error instanceof OpenRouterGradeError
      ? error.message
      : "AI marking could not be completed. Your saved answers are unchanged; please retry shortly.";
    return privateJson({ ok: false, message }, 503);
  }

  let score = 0;
  let coreScore = 0;
  let extendedScore = 0;
  let coreMax = 0;
  let extendedMax = 0;
  const incorrect: Array<{
    id: string;
    section: Tier;
    paper: string;
    topic: string;
    prompt: string;
    submittedAnswer: string;
    awardedMarks: number;
    availableMarks: number;
    correctAnswer: string;
    correction: string;
    feedback?: string;
    criteria?: AiGradeResult["criteria"];
  }> = [];
  const markScheme: MarkSchemeItem[] = [];
  const paperScores = new Map<number, PaperScore>();

  for (let index = 0; index < exam.questions.length; index += 1) {
    const publicQuestion = exam.questions[index];
    const question = masterQuestions[index] as MasterQuestion;
    const response = typeof responses[question.id] === "string" ? String(responses[question.id]) : "";
    const aiGrade = aiGrades.get(question.id);
    const result = aiGrade
      ? { score: aiGrade.score, note: aiGrade.feedback }
      : markQuestion(question, response);
    const correctAnswer = canonicalAnswer(question);
    const points = markingPoints(question);
    const correction = aiGrade
      ? `${aiGrade.feedback}\n\nReview the accepted response and criterion-level evidence below.`
      : question.rubric?.trim() || `A full-credit response should include: ${points}`;
    score += result.score;

    if (question.section === "Core") {
      coreScore += result.score;
      coreMax += question.marks;
    } else {
      extendedScore += result.score;
      extendedMax += question.marks;
    }

    if (publicQuestion.paperNumber) {
      const existing = paperScores.get(publicQuestion.paperNumber) ?? {
        paperNumber: publicQuestion.paperNumber,
        paperLabel: publicQuestion.paper,
        score: 0,
        maxMarks: 0,
      };
      existing.score += result.score;
      existing.maxMarks += question.marks;
      paperScores.set(publicQuestion.paperNumber, existing);
    }

    markScheme.push({
      id: question.id,
      section: question.section,
      paper: publicQuestion.paper,
      topic: publicQuestion.topic ?? "Chapter 16 Reproduction",
      prompt: publicQuestion.prompt,
      marks: question.marks,
      submittedAnswer: response.trim() || "No response",
      awardedMarks: result.score,
      correctAnswer,
      markPoints: points,
      figureRefs: publicQuestion.figureRefs ?? [],
      aiGraded: Boolean(aiGrade),
      feedback: aiGrade?.feedback,
      criteria: aiGrade?.criteria,
    });

    if (result.score < question.marks) {
      incorrect.push({
        id: question.id,
        section: question.section,
        paper: publicQuestion.paper,
        topic: publicQuestion.topic ?? "Chapter 16 Reproduction",
        prompt: publicQuestion.prompt,
        submittedAnswer: response.trim() || "No response",
        awardedMarks: result.score,
        availableMarks: question.marks,
        correctAnswer,
        correction,
        feedback: aiGrade?.feedback,
        criteria: aiGrade?.criteria,
      });
    }
  }

  const maxMarks = coreMax + extendedMax;
  const percent = maxMarks ? Math.round((score / maxMarks) * 1000) / 10 : 0;
  const paperBreakdown: PaperScore[] = exam.totals.paperBreakdown.map((paper) => paperScores.get(paper.paperNumber) ?? {
    paperNumber: paper.paperNumber,
    paperLabel: paper.paperLabel,
    score: 0,
    maxMarks: paper.maxMarks,
  });

  return privateJson({
    ok: true,
    track: sessionTrack,
    score,
    maxMarks,
    percent,
    gradeEstimate: gradeEstimate(percent),
    coreScore,
    coreMax,
    extendedScore,
    extendedMax,
    paperBreakdown,
    incorrect,
    markScheme,
    completedAt: new Date().toISOString(),
  });
}
