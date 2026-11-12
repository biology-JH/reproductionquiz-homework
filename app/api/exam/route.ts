import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createTrackSessionToken, TRACK_COOKIE_NAME, trackCookieOptions, verifyTrackSessionToken } from "@/lib/track-session";
import type { Tier } from "@/lib/types";
import { buildTrackExam } from "@/server/track-content";

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

function isTier(value: unknown): value is Tier {
  return value === "Core" || value === "Extended";
}

export async function POST(request: NextRequest) {
  const expected = process.env.HOMEWORK_PASSWORD;
  if (!expected) return privateJson({ ok: false, message: "Homework access is not configured yet." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ ok: false, message: "Choose a track and enter the Homework Password to continue." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ ok: false, message: "The homework request must be a JSON object." }, 400);
  }

  const payload = body as { homeworkPassword?: unknown; track?: unknown };
  if (!isTier(payload.track)) return privateJson({ ok: false, message: "Select either the Core or Extended track before starting." }, 400);
  const track = payload.track;
  const supplied = typeof payload.homeworkPassword === "string" ? payload.homeworkPassword : "";
  if (supplied.length > 256 || !matchesSecret(supplied, expected)) {
    return privateJson({ ok: false, message: "That Homework Password was not accepted." }, 401);
  }

  const existingTrack = verifyTrackSessionToken(request.cookies.get(TRACK_COOKIE_NAME)?.value);
  if (existingTrack && existingTrack !== track) {
    return privateJson({ ok: false, message: `This browser session is locked to the ${existingTrack} track. The other track is unavailable until this session expires.` }, 409);
  }

  let exam;
  try {
    exam = buildTrackExam(track);
  } catch {
    return privateJson({ ok: false, message: "This exam track is being updated and cannot be opened right now. Please try again later." }, 503);
  }

  const response = privateJson(exam);
  if (!existingTrack) {
    try {
      response.cookies.set(TRACK_COOKIE_NAME, createTrackSessionToken(track), trackCookieOptions);
    } catch {
      return privateJson({ ok: false, message: "A secure student session could not be started. Please ask your teacher to check the site's session configuration." }, 503);
    }
  }
  return response;
}
