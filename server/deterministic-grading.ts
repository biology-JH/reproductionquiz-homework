import "server-only";

import type {
  AiGradeInput,
  AiGradeResult,
  CriterionResult,
  MasterQuestionRule,
} from "@/server/openrouter-grading";

type KeywordCriterion = {
  id: string;
  maxMarks: number;
  guidance: string;
  phraseOptions?: string[];
  requiredTerms?: string[];
};

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "for", "and", "or", "to", "from", "in", "into", "on", "with", "by", "at", "as",
  "is", "are", "be", "been", "being", "this", "that", "which", "when", "where", "their", "its", "it", "they",
  "them", "then", "there", "some", "more", "one", "two", "each", "any", "all", "can", "could", "will", "would",
  "may", "might", "must", "should", "has", "have", "had", "do", "does", "did", "than", "if", "because", "before",
  "after", "near", "towards", "toward", "through", "during", "onto", "over", "under", "while", "but", "also",
  "mark", "marks", "award", "awarded", "credit", "point", "points", "response", "answer", "accept", "accepted",
]);

const IRREGULAR_WORDS: Record<string, string> = {
  bacteria: "bacterium",
  fungi: "fungus",
  leaves: "leaf",
  nuclei: "nucleus",
  stomata: "stoma",
  teeth: "tooth",
  children: "child",
};

function tokenize(value: string): string[] {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .replaceAll("ß", "ss")
    .toLowerCase();
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function wordVariants(word: string): Set<string> {
  const variants = new Set<string>([word]);
  const irregular = IRREGULAR_WORDS[word];
  if (irregular) variants.add(irregular);

  if (word.endsWith("ies") && word.length > 4) variants.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ves") && word.length > 4) variants.add(`${word.slice(0, -3)}f`);
  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    variants.add(stem);
    variants.add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) variants.add(stem.slice(0, -1));
  }
  if (word.endsWith("ed") && word.length > 4) {
    const stem = word.slice(0, -2);
    variants.add(stem);
    variants.add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) variants.add(stem.slice(0, -1));
  }
  if (word.endsWith("es") && word.length > 4) variants.add(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) variants.add(word.slice(0, -1));
  return variants;
}

function significantTerms(value: string): string[] {
  const all = tokenize(value);
  const significant = all.filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return [...new Set(significant.length ? significant : all)];
}

function groupValues(group: string[] | string): string[] {
  const values = Array.isArray(group) ? group : [group];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*(?:(?:\(?\d+[a-z]?\)?[.)])|(?:\(?[a-z][.)])|[-*•])\s*/i, "").trim();
}

function rubricBullets(rubric: string): string[] {
  const lines = rubric.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines
    .filter((line) => /^\s*(?:(?:\(?\d+[a-z]?\)?[.)])|(?:\(?[a-z][.)])|[-*•])\s+/i.test(line))
    .map(stripBulletPrefix)
    .filter(Boolean);
}

function distributeMarks(total: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    Math.floor(((index + 1) * total) / count) - Math.floor((index * total) / count),
  );
}

function criteriaFor(question: MasterQuestionRule): KeywordCriterion[] {
  const marks = Math.max(1, Math.trunc(question.marks));
  const groups = Array.isArray(question.groups) ? question.groups : [];
  const bullets = rubricBullets(question.rubric?.trim() ?? "");
  const criteria: KeywordCriterion[] = [];
  const pushPhraseCriterion = (index: number, maxMarks: number, options: string[], guidance: string) => {
    criteria.push({
      id: `${question.id}-C${index + 1}`,
      maxMarks,
      guidance,
      phraseOptions: options,
    });
  };
  const pushBulletCriterion = (index: number, maxMarks: number, bullet: string) => {
    criteria.push({
      id: `${question.id}-C${index + 1}`,
      maxMarks,
      guidance: bullet,
      requiredTerms: significantTerms(bullet),
    });
  };

  if (groups.length === marks) {
    groups.forEach((group, index) => {
      const options = groupValues(group);
      pushPhraseCriterion(index, 1, options, options.join(" / "));
    });
    return criteria;
  }

  if (bullets.length === marks) {
    bullets.forEach((bullet, index) => pushBulletCriterion(index, 1, bullet));
    return criteria;
  }

  if (groups.length > marks) {
    for (let index = 0; index < marks; index += 1) {
      const start = Math.floor((index * groups.length) / marks);
      const end = Math.max(start + 1, Math.floor(((index + 1) * groups.length) / marks));
      const options = groups.slice(start, end).flatMap(groupValues);
      pushPhraseCriterion(index, 1, options, options.join(" OR "));
    }
    return criteria;
  }

  if (groups.length) {
    const weights = distributeMarks(marks, groups.length);
    groups.forEach((group, index) => {
      const options = groupValues(group);
      pushPhraseCriterion(index, weights[index], options, options.join(" / "));
    });
    return criteria;
  }

  if (bullets.length) {
    const weights = distributeMarks(marks, bullets.length);
    bullets.forEach((bullet, index) => pushBulletCriterion(index, weights[index], bullet));
    return criteria;
  }

  const answers = [
    ...(Array.isArray(question.accept) ? question.accept : typeof question.accept === "string" ? [question.accept] : []),
    ...(question.answer ? [question.answer] : []),
  ].map((value) => value.trim()).filter(Boolean);
  const fallback = answers.length ? [...new Set(answers)] : [question.rubric?.trim() || "Use the accepted teacher-key answer."];
  pushPhraseCriterion(0, marks, fallback, fallback.join(" / "));
  return criteria;
}

function termIsPresent(answerTokens: Set<string>[], term: string): boolean {
  const expected = wordVariants(term);
  return answerTokens.some((tokenVariants) => [...expected].some((variant) => tokenVariants.has(variant)));
}

function quoteFor(answer: string, terms: string[]): string {
  const tokens = tokenize(answer);
  if (!tokens.length) return "";
  const foundIndexes = tokens
    .map((token, index) => termIsPresent([wordVariants(token)], terms.find((term) => {
      const variants = wordVariants(term);
      return [...variants].some((variant) => wordVariants(token).has(variant));
    }) ?? "") ? index : -1)
    .filter((index) => index >= 0);
  if (!foundIndexes.length) return "";
  const first = foundIndexes[0];
  const last = foundIndexes[foundIndexes.length - 1];
  const rawTokens = [...answer.matchAll(/[\p{L}\p{N}]+/gu)];
  const start = rawTokens[first]?.index ?? 0;
  const end = rawTokens[last] ? rawTokens[last].index + rawTokens[last][0].length : answer.length;
  return answer.slice(start, Math.min(end, start + 500));
}

function scorePhraseRule(answerTokens: Set<string>[], options: string[]): { matched: boolean; label: string; evidence: string } {
  for (const option of options) {
    const terms = significantTerms(option);
    if (terms.length && terms.every((term) => termIsPresent(answerTokens, term))) {
      return { matched: true, label: option, evidence: "" };
    }
  }
  return { matched: false, label: options.join(" / "), evidence: "" };
}

function scoreBulletRule(answerTokens: Set<string>[], requiredTerms: string[]): { matched: boolean; feedback: string; evidenceTerms: string[] } {
  const matchedTerms = requiredTerms.filter((term) => termIsPresent(answerTokens, term));
  const missedTerms = requiredTerms.filter((term) => !termIsPresent(answerTokens, term));
  const threshold = requiredTerms.length <= 2
    ? requiredTerms.length
    : Math.max(2, Math.ceil(requiredTerms.length * 0.75));
  const matched = requiredTerms.length > 0 && matchedTerms.length >= threshold;
  const details = [
    matchedTerms.length ? `Matched keywords: ${matchedTerms.join(", ")}.` : "No key rubric keywords were matched.",
    missedTerms.length ? `Missed keywords: ${missedTerms.join(", ")}.` : "No key rubric keywords were missed.",
  ].join(" ");
  return { matched, feedback: details, evidenceTerms: matchedTerms };
}

export function gradeDeterministically(
  input: AiGradeInput,
  reason: "AI unavailable" | "deterministic mode" = "AI unavailable",
): AiGradeResult {
  const answer = input.studentAnswer.trim();
  const question = input.question;
  const rules = criteriaFor(question);
  const answerTokens = tokenize(answer).map(wordVariants);
  const criteria: CriterionResult[] = rules.map((rule) => {
    if (rule.requiredTerms) {
      const scored = scoreBulletRule(answerTokens, rule.requiredTerms);
      const evidenceQuote = scored.matched ? quoteFor(answer, scored.evidenceTerms) : "";
      return {
        id: rule.id,
        criterion: rule.guidance,
        maxMarks: rule.maxMarks,
        awardedMarks: scored.matched ? rule.maxMarks : 0,
        evidenceQuote,
        feedback: `${scored.matched ? "Matched" : "Missed"} marking point. ${scored.feedback}`,
      };
    }

    const scored = scorePhraseRule(answerTokens, rule.phraseOptions ?? []);
    const evidenceQuote = scored.matched ? quoteFor(answer, significantTerms(scored.label)) : "";
    return {
      id: rule.id,
      criterion: rule.guidance,
      maxMarks: rule.maxMarks,
      awardedMarks: scored.matched ? rule.maxMarks : 0,
      evidenceQuote,
      feedback: scored.matched
        ? `Matched marking point: ${scored.label}.`
        : `Missed marking point: ${rule.guidance}.`,
    };
  });
  const score = criteria.reduce((total, criterion) => total + criterion.awardedMarks, 0);
  const maxMarks = Math.max(1, Math.trunc(question.marks));
  const note = reason === "AI unavailable"
    ? "Graded via automated keyword check (AI unavailable)."
    : "Graded via automated keyword check (deterministic mode).";
  const detail = criteria.map((criterion) => `${criterion.id}: ${criterion.awardedMarks}/${criterion.maxMarks}. ${criterion.feedback}`).join(" ");

  return {
    questionId: question.id,
    score,
    maxMarks,
    isCorrect: score === maxMarks,
    feedback: `${note} ${score}/${maxMarks} marks. ${detail}`.slice(0, 6_000),
    criteria,
  };
}
