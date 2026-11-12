# Reproduction Mastery — IGCSE Biology 0610

A large-print, two-track Chapter 16 reproduction practice application built from five teacher-supplied PowerPoint decks. The welcome page and track-specific booklet covers feature the teacher-supplied blossom-to-seedling artwork from the attached assessment PDF; question figures remain original images extracted from the PowerPoint decks. The practice questions are teacher-authored and are not an official Cambridge International paper.

## Student experience

- Students select exactly one track before opening the exam: **Core** (Papers 1, 3 and 6) or **Extended** (Papers 2, 4 and 6).
- The Homework Password is checked by the server. A signed, HttpOnly, Secure, SameSite=None session cookie locks that browser session to its chosen track.
- Extended presents all Core questions first, followed by Supplement-only questions. Core and Extended may share subject matter or figures, but each selected track contains no duplicate question or repeated source image.
- The application uses at least 24px type. Typed/selected answers autosave in browser LocalStorage, separated by student and track; passwords are never stored there.
- A separate Marking Password is required before the server decrypts the teacher key and returns marks, corrections and the complete mark-scheme breakdown. The results include an explicitly informal practice estimate, not an official Cambridge grade boundary.
- The results screen provides **Download Marked Script (PDF)** with the full questions, original figures, submitted responses, accepted answers, teacher-authored marking guidance and score breakdown. PDF body text is 24pt or larger.
- No student drawing or sketch tasks are included.

## Content and coverage

The public, answer-free bank contains 104 Core questions and 33 Supplement-only questions (137 unique IDs; 178 marks across the Extended exam). Every prompt uses an application, analysis or evaluation context, including multiple-choice, structured/data-analysis and alternative-to-practical formats. The exact section-by-section syllabus map—and the explicitly requested exception for student-produced drawings—is in [Chapter16_Syllabus_Coverage.md](Chapter16_Syllabus_Coverage.md).

Original PowerPoint figures are stored in `public/figures/`. `server/track-content.ts` assembles each track, remaps Core paper styles for the Extended track, assigns figure IDs and enforces track-local question/source-image uniqueness.

## Password and answer-key handling

Set the following **server-only** environment variables for the target runtime:

- `HOMEWORK_PASSWORD` — opens the selected exam track.
- `MARKING_PASSWORD` — authorizes marking and is also the password-derived decryption key for the server-only AES-256-GCM answer-key ciphertext in `server/master_key.ts`.
- `TRACK_SESSION_SECRET` — signs the short-lived, HttpOnly selected-track cookie.

Never put secret values in source files, documentation, client components, public assets or Git. The public `server/exam-content.ts` contains question text and figure metadata only. The encrypted answer key is imported only by `app/api/mark/route.ts`, which checks the Marking Password before decryption and uses no-store response headers. The classroom password gate is a shared-password convenience, not a replacement for individual student identity controls.

## Local development

Use Node.js and pnpm from the included lockfile:

```bash
pnpm install
pnpm dev
```

Required variables should be supplied through the hosting platform's protected environment-variable interface or a private ignored `.env.local` for local work. Do not commit `.env.local`.

Useful checks:

```bash
pnpm typecheck
pnpm build
python3 scripts/validate_exam_bank.py
```

## Printable and offline teacher materials

Track-specific printable exams and student answer workbooks are generated separately for Core and Extended. The teacher-only offline marker package contains a password-encrypted master workbook and an AES-GCM encrypted key payload. The grader prompts for the Marking Password without echo and does not reveal results on a failed password check. See the deliverables in the sibling `biology0610_reproduction_exam` folder.
