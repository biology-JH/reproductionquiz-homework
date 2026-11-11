import "server-only";

import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { examQuestions } from "@/server/exam-content";
import { encryptedMasterKey } from "@/server/master_key";
import type { Tier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function markQuestion(question: MasterQuestion, responseValue: unknown): { score: number; note: string } {
  const response = typeof responseValue === "string" ? responseValue : "";
  const maximum = question.marks;
  if (!response.trim()) return { score: 0, note: "No response submitted." };

  if (question.id === "C02u") {
    const requiredLabels = [["stigma"], ["style"], ["ovary"], ["ovule"], ["anther"], ["filament"]];
    const hits = requiredLabels.filter((aliases) => containsAlias(response, aliases)).length;
    return {
      score: Math.floor((hits * maximum) / requiredLabels.length),
      note: "The instant check awards marks for the six named labels only; a teacher should still inspect the drawing itself.",
    };
  }

  if (question.type === "choice" || question.type === "exact") {
    const accepted = Array.isArray(question.accept)
      ? question.accept
      : typeof question.accept === "string"
        ? [question.accept]
        : question.answer
          ? [question.answer]
          : [];
    const normalized = normalize(response);
    const correct = accepted.some((value) => normalize(value) === normalized);
    return { score: correct ? maximum : 0, note: "Exact/accepted-answer rule." };
  }

  if (question.type === "numeric") {
    const submitted = Number(response.replace(/%/g, "").trim());
    const expected = Number(question.answer);
    const correct = Number.isFinite(submitted) && Number.isFinite(expected) && submitted === expected;
    return { score: correct ? maximum : 0, note: "Numeric-answer rule." };
  }

  if (question.type === "contains") {
    const groups = Array.isArray(question.groups) ? question.groups : [];
    if (!groups.length) return { score: 0, note: "No automatic marking rule was available." };
    const hits = groups.filter((group) => containsAlias(response, Array.isArray(group) ? group : [group])).length;
    const score = groups.length > maximum ? Math.floor((hits * maximum) / groups.length) : Math.min(maximum, hits);
    return { score, note: "Keyword-rule self-check; review unusual valid wording with a teacher." };
  }

  return { score: 0, note: "This response needs teacher review." };
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

export async function POST(request: Request) {
  const expectedPassword = process.env.MARKING_PASSWORD;
  if (!expectedPassword) return privateJson({ ok: false, message: "Marking is not configured yet." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ ok: false, message: "Submit the answers and Marking Password to continue." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ ok: false, message: "The marking request must be a JSON object." }, 400);
  }
  const payload = body as { markingPassword?: unknown; answers?: unknown };

  const supplied = typeof payload.markingPassword === "string" ? payload.markingPassword : "";
  if (supplied.length > 256 || !matchesSecret(supplied, expectedPassword)) {
    return privateJson({ ok: false, message: "That Marking Password was not accepted. No score or corrections were released." }, 401);
  }

  let masterQuestions: MasterQuestion[];
  try {
    masterQuestions = decryptMasterQuestions(expectedPassword);
  } catch {
    return privateJson({ ok: false, message: "The protected answer key could not be loaded." }, 503);
  }

  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return privateJson({ ok: false, message: "Answers were missing or invalid." }, 400);
  }
  const responses = payload.answers as Record<string, unknown>;
  const publicById = new Map(examQuestions.map((question) => [question.id, question]));
  let score = 0;
  let coreScore = 0;
  let extendedScore = 0;
  let coreMax = 0;
  let extendedMax = 0;
  const incorrect: Array<{
    id: string;
    section: Tier;
    prompt: string;
    submittedAnswer: string;
    awardedMarks: number;
    availableMarks: number;
    correctAnswer: string;
    correction: string;
  }> = [];

  for (const question of masterQuestions) {
    const publicQuestion = publicById.get(question.id);
    if (!publicQuestion) continue;
    const response = typeof responses[question.id] === "string" ? String(responses[question.id]).slice(0, 8000) : "";
    const result = markQuestion(question, response);
    score += result.score;
    if (question.section === "Core") {
      coreScore += result.score;
      coreMax += question.marks;
    } else {
      extendedScore += result.score;
      extendedMax += question.marks;
    }

    if (result.score < question.marks) {
      const accepted = Array.isArray(question.accept) ? question.accept[0] : question.accept;
      incorrect.push({
        id: question.id,
        section: question.section,
        prompt: question.prompt,
        submittedAnswer: response.trim() || "No response",
        awardedMarks: result.score,
        availableMarks: question.marks,
        correctAnswer: String(question.answer ?? accepted ?? "Review the correction below."),
        correction: String(question.rubric ?? result.note),
      });
    }
  }

  const maxMarks = coreMax + extendedMax;
  const percent = maxMarks ? Math.round((score / maxMarks) * 1000) / 10 : 0;
  return privateJson({
    ok: true,
    score,
    maxMarks,
    percent,
    gradeEstimate: gradeEstimate(percent),
    coreScore,
    coreMax,
    extendedScore,
    extendedMax,
    incorrect,
    completedAt: new Date().toISOString(),
    drawingNote: "Question C02u is automatically checked for its six typed labels. The sketch stays in the browser and its drawing quality is not evaluated by the auto-marker.",
  });
}
