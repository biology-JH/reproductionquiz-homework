"use client";

import { useState } from "react";
import type { MarkResult, PublicQuestion } from "@/lib/types";

interface Props {
  studentName: string;
  result: MarkResult;
  questions: PublicQuestion[];
  answers: Record<string, string>;
}

async function imageAsPngDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const response = await fetch(src, { credentials: "same-origin", cache: "force-cache" });
  if (!response.ok) throw new Error("A figure could not be loaded for the marked script.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not prepare a figure.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ReportDownload({ studentName, result, questions, answers }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ format: "a4", unit: "mm", compress: true });
      const left = 17;
      const right = 193;
      const contentWidth = right - left;
      const lineHeight = 6;
      const pageBottom = 279;
      let y = 20;
      const embeddedFigures = new Set<string>();
      const markById = new Map(result.markScheme.map((item) => [item.id, item]));

      function newPage() {
        pdf.addPage();
        y = 20;
      }

      function write(text: string, options: { bold?: boolean; gap?: number; color?: [number, number, number] } = {}) {
        const { bold = false, gap = 2, color = [33, 42, 34] } = options;
        pdf.setTextColor(...color);
        pdf.setFont("times", bold ? "bold" : "normal");
        pdf.setFontSize(12);
        const safeText = text.trim() || "—";
        const lines = pdf.splitTextToSize(safeText, contentWidth) as string[];
        for (const line of lines) {
          if (y + lineHeight > pageBottom) newPage();
          pdf.text(line, left, y);
          y += lineHeight;
        }
        y += gap;
      }

      async function embedFigure(figure: NonNullable<PublicQuestion["figuresToDisplay"]>[number]) {
        if (embeddedFigures.has(figure.id)) return;
        embeddedFigures.add(figure.id);
        write(figure.caption, { bold: true, gap: 2, color: [33, 78, 52] });
        const image = await imageAsPngDataUrl(figure.src);
        const maxWidth = contentWidth;
        const maxHeight = 70;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        if (y + height > pageBottom) newPage();
        pdf.addImage(image.dataUrl, "PNG", left, y, width, height, undefined, "FAST");
        y += height + 4;
      }

      pdf.setProperties({
        title: `IGCSE Biology 0610 Chapter 16 marked script — ${studentName || "Student"}`,
        subject: "Unofficial teacher-created practice report",
        author: "Reproduction Mastery",
      });
      write("REPRODUCTION MASTERY · IGCSE BIOLOGY 0610", { bold: true, color: [33, 78, 52], gap: 3 });
      write("Chapter 16 marked script", { bold: true, gap: 3 });
      write(`Student: ${studentName || "Student"}`, { bold: true });
      write(`Completed: ${new Date(result.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`);
      write(`Track: ${result.track} · Questions: ${questions.length}`);
      write(`Total score: ${result.score} / ${result.maxMarks} (${result.percent.toFixed(1)}%)`, { bold: true });
      write(`Core objectives: ${result.coreScore} / ${result.coreMax}`);
      if (result.track === "Extended") write(`Supplement objectives: ${result.extendedScore} / ${result.extendedMax}`);
      for (const paper of result.paperBreakdown) {
        write(`${paper.paperLabel}: ${paper.score} / ${paper.maxMarks}`);
      }
      write(`Informal practice estimate: ${result.gradeEstimate}. This is not an official Cambridge grade boundary or grade prediction.`);
      write("Unofficial practice mark scheme: questions, accepted answers and marking guidance are teacher-created from the supplied Chapter 16 lesson material. They are not official Cambridge International mark-scheme text.", { gap: 4 });

      for (const question of questions) {
        const marked = markById.get(question.id);
        if (!marked) throw new Error(`The mark breakdown is incomplete for ${question.id}.`);
        if (y + lineHeight * 3 > pageBottom) newPage();
        pdf.setDrawColor(214, 168, 75);
        pdf.line(left, y, right, y);
        y += 4;
        write(`${question.id} · ${question.paper} · ${question.section} objective · ${marked.awardedMarks}/${marked.marks} marks`, { bold: true, color: [33, 78, 52], gap: 2 });
        write(`Question: ${question.prompt}`, { gap: 2 });
        if (marked.figureRefs.length) write(`Figure reference${marked.figureRefs.length === 1 ? "" : "s"}: ${marked.figureRefs.join(", ")}`, { gap: 2 });
        for (const figure of question.figuresToDisplay ?? []) await embedFigure(figure);
        write(`Student answer: ${answers[question.id]?.trim() || "No response"}`, { gap: 2 });
        write(`Accepted answer / correct response: ${marked.correctAnswer}`, { gap: 2 });
        write(`Mark-scheme points / correction: ${marked.markPoints}`, { gap: 3 });
        if (marked.aiGraded) {
          write("AI written-response rubric breakdown (unofficial practice feedback)", { bold: true, color: [33, 78, 52], gap: 2 });
          write(`AI feedback: ${marked.feedback || "See the individual criterion results below."}`, { gap: 2 });
          for (const criterion of marked.criteria ?? []) {
            write(`Criterion ${criterion.id}: ${criterion.awardedMarks}/${criterion.maxMarks} · ${criterion.criterion}`, { bold: true, gap: 2 });
            write(`Rationale: ${criterion.feedback}`, { gap: 2 });
            if (criterion.evidenceQuote) write(`Exact evidence quoted from the student's answer: “${criterion.evidenceQuote}”`, { gap: 2 });
          }
        }
      }

      write("End of marked script", { bold: true, color: [33, 78, 52] });
      const safeName = (studentName || "student").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "student";
      pdf.save(`igcse-0610-ch16-${result.track.toLowerCase()}-marked-script-${safeName}.pdf`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The report could not be created in this browser. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-action">
      <button className="primary-button download-button" type="button" onClick={download} disabled={busy}>
        {busy ? "Preparing marked script…" : "Download Marked Script (PDF)"}<span aria-hidden="true">↓</span>
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
