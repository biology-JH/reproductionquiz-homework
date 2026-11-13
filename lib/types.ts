export type Tier = "Core" | "Extended";
export type PaperNumber = 1 | 2 | 3 | 4 | 6;

export interface ExamFigure {
  id: string;
  src: string;
  alt: string;
  caption: string;
}

export interface PublicQuestion {
  id: string;
  section: Tier;
  paper: string;
  paperNumber?: PaperNumber;
  marks: number;
  type: string;
  prompt: string;
  topic?: string;
  main?: string;
  part?: string;
  figureRefs?: string[];
  figuresToDisplay?: ExamFigure[];
}

export interface ExamVisual {
  images: Array<{ src: string; alt: string; caption: string }>;
}

export interface PaperScore {
  paperNumber: PaperNumber;
  paperLabel: string;
  score: number;
  maxMarks: number;
}

export interface ExamPayload {
  ok: true;
  track: Tier;
  questions: PublicQuestion[];
  totals: {
    questionCount: number;
    marks: number;
    coreMarks: number;
    extendedMarks: number;
    paperBreakdown: Array<{ paperNumber: PaperNumber; paperLabel: string; maxMarks: number }>;
  };
}

export interface MarkingCriterion {
  id: string;
  criterion: string;
  maxMarks: number;
  awardedMarks: number;
  evidenceQuote: string;
  feedback: string;
}

export interface IncorrectAnswer {
  id: string;
  section: Tier;
  paper: string;
  topic: string;
  prompt: string;
  submittedAnswer: string;
  awardedMarks: number;
  availableMarks: number;
  correctAnswer: string;
  correction: string;
  feedback?: string;
  criteria?: MarkingCriterion[];
}

export interface MarkSchemeItem {
  id: string;
  section: Tier;
  paper: string;
  topic: string;
  prompt: string;
  marks: number;
  submittedAnswer: string;
  awardedMarks: number;
  correctAnswer: string;
  markPoints: string;
  figureRefs: string[];
  aiGraded?: boolean;
  feedback?: string;
  criteria?: MarkingCriterion[];
}

export interface MarkResult {
  ok: true;
  track: Tier;
  score: number;
  maxMarks: number;
  percent: number;
  gradeEstimate: string;
  coreScore: number;
  coreMax: number;
  extendedScore: number;
  extendedMax: number;
  paperBreakdown: PaperScore[];
  incorrect: IncorrectAnswer[];
  markScheme: MarkSchemeItem[];
  completedAt: string;
}
