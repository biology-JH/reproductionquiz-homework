# Reproduction Mastery — IGCSE Biology 0610

Single-page Next.js homework app for an original Chapter 16 Reproduction practice exam built from five supplied biology slide decks.

## Local development

Use Node.js 22 and the pinned pnpm version in `package.json`:

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

For local testing, set `HOMEWORK_PASSWORD`, `MARKING_PASSWORD` and `MARKING_KEY_GZIP_B64` in `.env.local`. Never commit `.env.local` or share its values. The compressed key is generated from the teacher-only master key package; it must remain server-side.

## Vercel setup

Deploy the private GitHub repository as a Next.js project. Add these as **sensitive server-side environment variables** for Production and Preview:

- `HOMEWORK_PASSWORD` — exact password for the exam-access gate.
- `MARKING_PASSWORD` — separate exact password for the marking gate.
- `MARKING_KEY_GZIP_B64` — base64-encoded gzip archive of the master question/answer data.

Do not add a `NEXT_PUBLIC_` prefix. The UI receives only question text and diagrams after the first server-side gate; the answer key is loaded only inside the Node marking route after the second password is accepted. API responses use `Cache-Control: private, no-store`. Student answers are not written to a database or file.

## Assessment notes

Question text and visuals are served by a server API after homework-password validation. Accepted answers and rubrics are held in a Vercel environment variable and never shipped in a browser bundle. The auto-marker uses deterministic accepted-answer and keyword rules; teachers should review unusual valid wording. The flower drawing pad is local-only and never uploaded; its instant mark checks typed labels, not sketch quality or placement.

The grade band shown is an informal chapter-practice indicator, not an official Cambridge grade boundary or final-grade prediction. Corrections are teacher-created practice guidance, not Cambridge's official mark-scheme text. This app is not affiliated with or endorsed by Cambridge International.

## Student progress storage

After a student passes Gate 1, answer inputs are written to browser LocalStorage as they change, under a key separated by the entered student name. On a later visit, the app restores that student's saved answers after Gate 1 is accepted again. “Clear My Progress” removes the current student's saved answers. Neither password is included in this local record; students on shared devices should clear progress when finished.
