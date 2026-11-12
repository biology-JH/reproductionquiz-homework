import type { ExamFigure } from "@/lib/types";

interface Props {
  figures: ExamFigure[];
}

export default function FigureGallery({ figures }: Props) {
  if (!figures.length) return null;
  return (
    <figure className="exam-figure">
      <div className="exam-figure-grid">
        {figures.map((figure) => (
          <figure className="exam-figure-item" key={figure.id}>
            <img src={figure.src} alt={figure.alt} loading="lazy" decoding="async" />
            <figcaption>{figure.caption}</figcaption>
          </figure>
        ))}
      </div>
    </figure>
  );
}
