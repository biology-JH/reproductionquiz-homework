import "server-only";

import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { TRACK_COOKIE_NAME, verifyTrackSessionToken } from "@/lib/track-session";
import type { MarkSchemeItem, PaperScore, Tier } from "@/lib/types";
import { encryptedMasterKey } from "@/server/master_key";
import { buildTrackExam } from "@/server/track-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface MasterQuestion {
  id: string;
  section: Tier;
  marks: number;
  type: string;
  prompt: string;
  answer?: string;
  accept?: string[] | string;
  groups?: Array<string[] | string>;
  rubric?: string;
}

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
    return { score: correct ? maximum : 0, note: "The response is checked against the teacher-authored accepted answer." };
  }

  if (question.type === "numeric") {
    const submitted = Number(response.replace(/%/g, "").trim());
    const expected = Number(question.answer);
    const correct = Number.isFinite(submitted) && Number.isFinite(expected) && submitted === expected;
    return { score: correct ? maximum : 0, note: "The response is checked against the teacher-authored numerical answer." };
  }

  if (question.type === "contains") {
    const groups = Array.isArray(question.groups) ? question.groups : [];
    if (!groups.length) return { score: 0, note: "No automatic marking rule was available." };
    const hits = groups.filter((group) => containsAlias(response, Array.isArray(group) ? group : [group])).length;
    const score = groups.length > maximum ? Math.floor((hits * maximum) / groups.length) : Math.min(maximum, hits);
    return { score, note: "Keyword-rule practice self-check; valid alternative wording may need teacher review." };
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ ok: false, message: "The marking request must be a JSON object." }, 400);
  }
  const payload = body as { markingPassword?: unknown; answers?: unknown; track?: unknown };
  if (payload.track !== sessionTrack) return privateJson({ ok: false, message: "The selected track does not match this browser session." }, 403);

  const supplied = typeof payload.markingPassword === "string" ? payload.markingPassword : "";
  if (supplied.length > 256 || !matchesSecret(supplied, expectedPassword)) {
    return privateJson({ ok: false, message: "That Marking Password was not accepted. No score or corrections were released." }, 401);
  }

  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return privateJson({ ok: false, message: "Answers were missing or invalid." }, 400);
  }
  const responses = payload.answers as Record<string, unknown>;
  let exam;
  try {
    exam = buildTrackExam(sessionTrack);
  } catch {
    return privateJson({ ok: false, message: "This exam track is being updated and cannot be marked right now." }, 503);
  }
  const publicQuestions = exam.questions;
  const publicById = new Map(publicQuestions.map((question) => [question.id, question]));
  if (Object.keys(responses).some((id) => !publicById.has(id))) {
    return privateJson({ ok: false, message: "The answer set contains questions outside this track." }, 400);
  }

  let decryptedQuestions: MasterQuestion[];
  try {
    decryptedQuestions = decryptMasterQuestions(expectedPassword);
  } catch {
    return privateJson({ ok: false, message: "The protected answer key could not be loaded." }, 503);
  }
  const masterById = new Map(decryptedQuestions.map((question) => [question.id, question]));
  const masterQuestions = publicQuestions.map((question) => masterById.get(question.id));
  if (masterQuestions.some((question) => !question)) {
    return privateJson({ ok: false, message: "The protected marking data does not match this exam track." }, 503);
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
  }> = [];
  const markScheme: MarkSchemeItem[] = [];
  const paperScores = new Map<number, PaperScore>();

  for (let index = 0; index < publicQuestions.length; index += 1) {
    const publicQuestion = publicQuestions[index];
    const question = masterQuestions[index] as MasterQuestion;
    const response = typeof responses[question.id] === "string" ? String(responses[question.id]).slice(0, 8000) : "";
    const result = markQuestion(question, response);
    const correctAnswer = canonicalAnswer(question);
    const points = markingPoints(question);
    const correction = question.rubric?.trim() || `A full-credit response should include: ${points}`;
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
        correction: `${correction}\n\nAuto-marker note: ${result.note}`,
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
