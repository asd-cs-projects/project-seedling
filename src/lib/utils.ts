import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type QuestionAnswerRef = {
  id?: string | null;
  order_index?: number | null;
  correct_answer?: string | null;
};

const normalizeAnswerValue = (value: unknown) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || undefined;
};

export const getStoredAnswer = (
  answers: unknown,
  question?: QuestionAnswerRef,
  index?: number,
) => {
  if (Array.isArray(answers)) {
    return index === undefined ? undefined : normalizeAnswerValue(answers[index]);
  }

  if (!answers || typeof answers !== "object") {
    return undefined;
  }

  const record = answers as Record<string, unknown>;
  const keys = [question?.id, index, question?.order_index]
    .flatMap((key) => [key, key == null ? undefined : String(key)])
    .filter((key): key is string | number => key !== undefined && key !== null && String(key).trim() !== "");

  for (const key of keys) {
    const value = record[String(key)];
    const normalized = normalizeAnswerValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

export const calculateResultMetrics = <T extends QuestionAnswerRef>(questions: T[], answers: unknown) => {
  const totalQuestions = questions.length;

  const correctAnswers = questions.reduce((total, question, index) => {
    const studentAnswer = getStoredAnswer(answers, question, index);
    const correctAnswer = normalizeAnswerValue(question.correct_answer);
    return studentAnswer && correctAnswer && studentAnswer === correctAnswer ? total + 1 : total;
  }, 0);

  const wrongAnswers = Math.max(totalQuestions - correctAnswers, 0);
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  return {
    correctAnswers,
    wrongAnswers,
    totalQuestions,
    score,
  };
};
