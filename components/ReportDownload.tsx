"use client";

import { useState } from "react";
import type { MarkResult } from "@/lib/types";

interface Props {
  studentName: string;
  result: MarkResult;
}

export default function ReportDownload({ studentName, result }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ format: "a4", unit: "mm" });
      const left = 18;
      const right = 192;
      let y = 20;
      const lineHeight = 9.5;

      function write(text: string, options: { size?: number; bold?: boolean; gap?: number } = {}) {
        const { size = 10, bold = false, gap = 2.5 } = options;
        pdf.setFont("times", bold ? "bold" : "normal");
        pdf.setFontSize(Math.max(24, size));
        const lines = pdf.splitTextToSize(text, right - left);
        const height = lines.length * lineHeight;
        if (y + height > 276) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(lines, left, y);
        y += height + gap;
      }

      pdf.setTextColor(33, 78, 52);
      write("REPRODUCTION MASTERY | IGCSE BIOLOGY 0610", { size: 10, bold: true, gap: 4 });
      pdf.setTextColor(25, 35, 29);
      write("Chapter 16 marked practice report", { size: 21, bold: true, gap: 3 });
      write(`Student: ${studentName || "Student"}`, { size: 12, bold: true });
      write(`Date: ${new Date(result.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`);
      write(`Total score: ${result.score} / ${result.maxMarks} (${result.percent.toFixed(1)}%)`, { size: 13, bold: true, gap: 2 });
      write(`Core: ${result.coreScore} / ${result.coreMax}  |  Extended: ${result.extendedScore} / ${result.extendedMax}`);
      write(`Informal practice estimate: ${result.gradeEstimate}. This is not an official Cambridge grade boundary or grade prediction.`, { size: 9, gap: 4 });
      pdf.setDrawColor(214, 168, 75);
      pdf.line(left, y, right, y);
      y += 8;

      write("Corrections to review", { size: 16, bold: true, gap: 4 });
      if (result.incorrect.length === 0) {
        write("No automatically marked responses needed correction. Ask a teacher to inspect the biological drawing itself.");
      }
      for (const item of result.incorrect) {
        write(`${item.id} · ${item.section} · ${item.awardedMarks}/${item.availableMarks} marks`, { size: 12, bold: true, gap: 2 });
        write(`Question: ${item.prompt}`, { size: 10, gap: 1.5 });
        write(`Your response: ${item.submittedAnswer}`, { size: 10, gap: 1.5 });
        write(`Accepted answer: ${item.correctAnswer}`, { size: 10, gap: 1.5 });
        write(`Correction / mark guidance: ${item.correction}`, { size: 10, gap: 5 });
      }
      write(`Drawing note: ${result.drawingNote}`, { size: 9, gap: 3 });
      write("Unofficial practice feedback: the questions, accepted answers and correction notes are teacher-created from the supplied lesson material. They are not official Cambridge mark-scheme text and do not reproduce or claim endorsement by Cambridge International.", { size: 9, gap: 2 });
      write("Written-response matching uses automated rules. A teacher should review valid alternative wording and drawing quality before using this report for consequential assessment.", { size: 9 });

      const safeName = (studentName || "student").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "student";
      pdf.save(`reproduction-mastery-${safeName}.pdf`);
    } catch {
      setError("The report could not be created in this browser. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-action">
      <button className="primary-button download-button" type="button" onClick={download} disabled={busy}>
        {busy ? "Preparing PDF…" : "Download marked report PDF"}<span aria-hidden="true">↓</span>
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
