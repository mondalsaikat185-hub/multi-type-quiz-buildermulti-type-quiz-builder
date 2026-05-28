export type QuizType =
  | "GK"
  | "Passage"
  | "Vocabulary"
  | "Parajumble"
  | "Cloze"
  | "Error Correction"
  | "Math"
  | "Reasoning";

export interface QuizConfig {
  title: string;
  subtitle: string;
  totalTime: number;
  marksCorrect: number;
  marksWrong: number;
  maxQuestions: number;
  gsUrl: string;
  defaultLang?: "en" | "bn";
}
