import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { examQuestions, examVisuals } from "@/server/exam-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matchesSecret(input: string, expected: string): boolean {
  const inputDigest = createHash("sha256").update(input, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" },
  });
}

export async function POST(request: Request) {
  const expected = process.env.HOMEWORK_PASSWORD;
  if (!expected) return privateJson({ ok: false, message: "Homework access is not configured yet." }, 503);

  let payload: { homeworkPassword?: unknown };
  try {
    payload = await request.json();
  } catch {
    return privateJson({ ok: false, message: "Enter the Homework Password to continue." }, 400);
  }

  const supplied = typeof payload.homeworkPassword === "string" ? payload.homeworkPassword : "";
  if (supplied.length > 256 || !matchesSecret(supplied, expected)) {
    return privateJson({ ok: false, message: "That Homework Password was not accepted." }, 401);
  }

  const questions = [
    ...examQuestions.filter((question) => question.section === "Core"),
    ...examQuestions.filter((question) => question.section === "Extended"),
  ];
  const coreMarks = questions.filter((question) => question.section === "Core").reduce((sum, question) => sum + question.marks, 0);
  const extendedMarks = questions.filter((question) => question.section === "Extended").reduce((sum, question) => sum + question.marks, 0);

  return privateJson({
    ok: true,
    questions,
    visuals: examVisuals,
    totals: { questionCount: questions.length, marks: coreMarks + extendedMarks, coreMarks, extendedMarks },
  });
}
