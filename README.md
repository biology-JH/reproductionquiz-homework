# Reproduction Mastery — IGCSE Biology 0610

Single-page Next.js homework app for an original Chapter 16 Reproduction practice exam built from five supplied biology slide decks.

## Local development

Use Node.js 22 and the pinned pnpm version in `package.json`:

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `HOMEWORK_PASSWORD` and `MARKING_PASSWORD` in `.env.local` for local testing. Never commit `.env.local` or share its values. The answer key in `server/master_key.ts` is ciphertext, imported only by the server marking route and decrypted only after the marking gate accepts the password.

## Production deployment

Deploy the private GitHub repository as a Next.js project. Configure `HOMEWORK_PASSWORD` and `MARKING_PASSWORD` as sensitive server-side environment values for the target deployment environment. Do not add a `NEXT_PUBLIC_` prefix, and do not use development/test values in production.

The UI receives question text and diagrams only after the first server-side gate. The answer-key ciphertext remains outside the client bundle; only the Node marking route can decrypt it after validating the second password. API responses use `Cache-Control: private, no-store`. Typed answers and the flower sketch are saved only in browser LocalStorage; they are not written to a database or server file, and the sketch is never sent to the grading endpoint.

## Assessment notes

The auto-marker uses deterministic accepted-answer and keyword rules. Teachers should review unusual valid wording. The flower drawing pad is local-only and never uploaded; the instant mark checks its six typed labels, not sketch quality or placement. All typed text in the print exam and student workbook is at least 24 pt; the website and marked-report PDF also enforce a minimum 24 px/pt respectively. Biology visuals are original image objects extracted from the uploaded PowerPoint decks, not generated replacement diagrams; the printable exam captions identify their source deck and slide.

The grade band shown is an informal chapter-practice indicator, not an official Cambridge grade boundary or final-grade prediction. Corrections are teacher-created practice guidance, not Cambridge's official mark-scheme text. This app is not affiliated with or endorsed by Cambridge International.

## Student progress storage

After a student passes Gate 1, typed answers and the flower sketch are written to browser LocalStorage as they change, under keys separated by the entered student name. On a later visit, the app restores that student's saved answers and sketch after Gate 1 is accepted again. “Clear My Progress” removes both for the current student. Neither password is included in LocalStorage; the sketch is never uploaded or sent for marking. Students on shared devices should clear progress when finished.
