# Project plan — Reproduction Mastery

## Product and implementation approach

Continue the existing Next.js App Router application in `/home/ubuntu/biochapter16`. The website is a single-page IGCSE Biology 0610 Chapter 16 practice exam based on the five supplied PowerPoint decks. The question bank and original-figure metadata remain in server-only modules. The Core track presents Paper 1-style multiple choice, Paper 3-style structured/data analysis and Paper 6-style practical questions. The Extended track presents Paper 2-style multiple choice, Paper 4-style structured/data analysis and Paper 6-style practical questions; it includes all Core-labelled questions first, followed by Supplement-only questions. Track assembly is server-side, session-bound and remaps Core paper numbers for the Extended variant.

Gate 1 validates the Homework Password on the server, enforces a single selected track and sets a short-lived signed HttpOnly, Secure, SameSite=None cookie. Its signature uses a distinct random 256-bit `TRACK_SESSION_SECRET`, never the shared Homework Password. Gate 2 validates the separate Marking Password before the marker decrypts the AES-256-GCM protected teacher answer key. The existing final-submit flow and results layout remain in place: after Gate 2, the client posts the selected track and answers to `/api/grade`, which returns the existing results summary with per-question feedback. Objective choices and exact numeric responses remain deterministically checked; constructed responses are graded by the OpenRouter free router in small paper/tier batches. The API reads the canonical question and rubric/model answer from the server-only decrypted key; it never trusts a client-provided mark scheme. Each model request uses temperature 0, a strict JSON Schema, per-criterion scoring and exact student-work evidence quotes. The server validates evidence and criterion IDs, computes totals itself, and returns the requested score string, correctness flag and feedback for single-question grading. Student answers are escaped and delimited as untrusted input; model instructions explicitly ignore embedded commands. No student name is sent to OpenRouter.

OpenRouter is called only from the server using `OPENROUTER_API_KEY`; the `openrouter/free` model is reached at `https://openrouter.ai/api/v1/chat/completions`. The backend strips accidental Markdown fences before parsing and rejects invalid or incomplete schema output. The API retains the existing 60-second Vercel function limit and exposes clear retryable errors for provider, quota or timeout failures. Passwords and answer-key plaintext are never included in client modules, static assets, logs, LocalStorage or repository history. Typed student responses autosave in browser LocalStorage under a student-and-track key; passwords are never stored and drawing/sketch functionality is removed. A browser-generated PDF includes the entire selected-track script, student responses, original figures, accepted answers and score breakdown, clearly labelled unofficial practice guidance.

The website and printable student deliverables use original diagrams and images extracted from the five PowerPoints for question content. Within either track, each question-source image appears once; later question parts point to its figure reference. Separately, the user-supplied blossom/pollen/seedling artwork from the attached assessment PDF is the welcome-page hero and appears on each track booklet's front cover without cropping or alteration. The question bank uses distinct stems and contexts within each track and targets application, analysis or evaluation. Coverage is mapped to the Cambridge 0610 Section 16 syllabus for 2026–2028. Student-produced drawing is deliberately omitted per the user's instruction; relevant structures are assessed using supplied slide figures instead.

Build and deploy the Next.js application from the user's private GitHub repository `biology-JH/reproductionquiz-homework` to its already-linked Vercel project. Store `HOMEWORK_PASSWORD`, `MARKING_PASSWORD`, `TRACK_SESSION_SECRET` and `OPENROUTER_API_KEY` as server-only Vercel environment secrets. Keep the Webdev Preview/project configuration separate from Vercel production. The final handoff includes the deployed site only after the Vercel deployment reports success, plus separate large-print Core/Extended exam PDFs and matching answer sheets.

## Project structure

- `app/page.tsx`: single public page shell and metadata.
- `app/api/exam/route.ts`: Homework Password validation, track lock and signed session cookie.
- `app/api/mark/route.ts`: shared protected handler for final-submit and single-question marking, including Marking Password validation, encrypted answer-key loading, OpenRouter grading and server-side score assembly.
- `app/api/grade/route.ts`: public `/api/grade` Next.js/Vercel route alias to the same protected handler; the client uses this route for the final-submit payload.
- `server/openrouter-grading.ts`: server-only prompt construction, structured-response parsing, evidence validation and code-calculated rubric totals.
- `components/HomeworkApp.tsx`: existing track picker, password gates, autosave, final-submit/loading state, exam flow and results.
- `components/QuestionCard.tsx`: large-print question, figure-reference and response controls.
- `components/ReportDownload.tsx`: complete marked-script PDF with selected-track content, original images, criteria evidence and scores.
- `lib/types.ts`, `lib/choices.ts`, `lib/track-session.ts`: shared data types, accessible choice parsing and separate-secret track-session signing.
- `server/exam-content.ts`: public question stems and attribution metadata for source PowerPoint figures (server-only).
- `server/track-content.ts`: Core/Extended assembly, paper remapping, stable figure numbering and within-track image de-duplication.
- `server/master_key.ts`: AES-GCM ciphertext only; the decryption key is derived server-side from the Marking Password after validation.
- `public/figures/`: original PowerPoint figures, with no AI-generated biology diagrams.
- `public/hero/reproduction-front-page.png`: the user-supplied image extracted from the assessment PDF for the welcome page and printable covers.
- `public/manus-routes.json`: page-route manifest required by the Webdev Preview.
- `scripts/validate_exam_bank.py`: answer-free checks for track order, question/image uniqueness, no drawing prompts and paper mark totals.
- `/home/ubuntu/biology0610_reproduction_exam/scripts/build_revised_deliverables.py` and the protected teacher package: reproducible printable materials and offline marking workflow, kept separate from student-facing output.

## Design system

The existing **Specimen Notebook** visual direction is retained. It pairs the precision of a laboratory field notebook with the calm, legible structure of a botanical reference book.

- **Core principles:** large-print clarity; evidence before answer; restrained scientific annotation; no decorative imagery that competes with source figures.
- **Color philosophy:** deep specimen green communicates biological subject matter; warm paper and muted gold separate headings, question groups and figure references without lowering contrast.
- **Layout paradigm:** a vertically sequenced exam booklet with persistent paper navigation and evidence figures embedded at their first track-local use. Avoid dense card grids.
- **Signature elements:** numbered specimen-style figure captions; thin gold rules separating major parts; a progress strip styled as a notebook rule.
- **Interaction philosophy:** one unambiguous track choice, visible save status, keyboard-accessible response controls and explicit password gates; no hidden track switches.
- **Animation:** limited to short, reduced-motion-aware transitions for section entry and progress feedback; no motion on essential reading content.
- **Typography:** system serif for question reading paired with a clean sans-serif for controls and navigation. Browser text is at least 24 px. Printed exam/workbook/report text is at least 24 pt.
- **Hero artwork:** on the welcome screen, scale the existing uncropped flower/reproduction image to a much more prominent width (up to about 840 px on desktop), preserve its natural aspect ratio, and keep the title and gate controls clear at every breakpoint.
- **Brand essence:** original, visual Chapter 16 practice for IGCSE learners; precise, calm, demanding.
- **Brand voice:** direct and evidence-centred. Example lines: “Use the figure and the data to support your conclusion.” “Choose one track; your session stays on that track.”
- **Wordmark and mark:** the existing “Reproduction Mastery” wordmark with the project’s compact plant/specimen emblem; preserve the authored SVG rather than default text-only branding.
- **Signature brand color:** specimen green.
