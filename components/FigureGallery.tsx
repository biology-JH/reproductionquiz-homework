import type { ExamVisual } from "@/lib/types";

interface Props {
  visual: ExamVisual;
}

export default function FigureGallery({ visual }: Props) {
  if (!visual.images.length) return null;
  return (
    <figure className="exam-figure">
      <div className="exam-figure-grid">
        {visual.images.map((image) => (
          <figure className="exam-figure-item" key={image.src}>
            <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
            <figcaption>{image.caption}</figcaption>
          </figure>
        ))}
      </div>
    </figure>
  );
}
