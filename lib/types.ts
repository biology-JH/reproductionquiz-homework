export type Tier = "Core" | "Extended";

export interface PublicQuestion {
  id: string;
  section: Tier;
  paper: string;
  marks: number;
  type: string;
  prompt: string;
  topic?: string;
  main?: string;
  part?: string;
}

export interface ExamVisual {
  src: string;
  alt: string;
}

export interface ExamPayload {
  ok: true;
  questions: PublicQuestion[];
  visuals: Record<string, ExamVisual>;
  totals: {
    questionCount: number;
    marks: number;
    coreMarks: number;
    extendedMarks: number;
  };
}

export interface IncorrectAnswer {
  id: string;
  section: Tier;
  prompt: string;
  submittedAnswer: string;
  awardedMarks: number;
  availableMarks: number;
  correctAnswer: string;
  correction: string;
}

export interface MarkResult {
  ok: true;
  score: number;
  maxMarks: number;
  percent: number;
  gradeEstimate: string;
  coreScore: number;
  coreMax: number;
  extendedScore: number;
  extendedMax: number;
  incorrect: IncorrectAnswer[];
  completedAt: string;
  drawingNote: string;
}
