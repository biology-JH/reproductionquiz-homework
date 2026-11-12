import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Tier } from "@/lib/types";

export const TRACK_COOKIE_NAME = "reproduction-track-session";
export const TRACK_SESSION_MAX_AGE = 4 * 60 * 60;

interface TrackSessionPayload {
  version: 1;
  track: Tier;
  expiresAt: number;
  nonce: string;
}

function signingKey(): Buffer {
  const sessionSecret = process.env.TRACK_SESSION_SECRET;
  if (!sessionSecret || Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("Track-session signing is not configured with a 256-bit secret.");
  }
  return createHmac("sha256", "igcse0610-track-session-key-v1")
    .update(sessionSecret, "utf8")
    .digest();
}

function signature(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload, "utf8").digest("base64url");
}

export function createTrackSessionToken(track: Tier): string {
  const payload: TrackSessionPayload = {
    version: 1,
    track,
    expiresAt: Date.now() + TRACK_SESSION_MAX_AGE * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyTrackSessionToken(token: string | undefined): Tier | null {
  if (!token || token.length > 2048) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return null;

  try {
    const expectedSignature = Buffer.from(signature(encoded), "base64url");
    const actualSignature = Buffer.from(suppliedSignature, "base64url");
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TrackSessionPayload>;
    if (payload.version !== 1 || (payload.track !== "Core" && payload.track !== "Extended")) return null;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) return null;
    if (typeof payload.nonce !== "string" || payload.nonce.length < 8) return null;
    return payload.track;
  } catch {
    return null;
  }
}

export const trackCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
  maxAge: TRACK_SESSION_MAX_AGE,
};
