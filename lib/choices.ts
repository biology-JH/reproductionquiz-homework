import type { PublicQuestion } from "@/lib/types";

export interface ChoiceOption {
  letter: string;
  text: string;
}

export function parseChoiceOptions(prompt: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  for (const rawLine of prompt.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-D])\.\s*(.+)$/);
    if (match) options.push({ letter: match[1], text: match[2] });
  }
  return options;
}

export function questionStem(question: PublicQuestion): string {
  const options = parseChoiceOptions(question.prompt);
  if (!options.length) return question.prompt;
  const firstOption = question.prompt.search(/(?:^|\n)\s*A\.\s/);
  return firstOption < 0 ? question.prompt : question.prompt.slice(0, firstOption).trim();
}
