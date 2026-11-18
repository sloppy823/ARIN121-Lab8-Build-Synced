export interface QuizOption {
  letter: 'A' | 'B' | 'C' | 'D' | string;
  text: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: QuizOption[];
}

export interface QuestionFeedback {
  questionNumber: number;
  studentChoice: string;
  isCorrect: boolean;
  correctOption: string;
  correctOptionText: string;
  explanation: string;
}

export interface AssessmentResult {
  score: number;
  total: number;
  summaryFeedback?: string;
  results: QuestionFeedback[];
  formattedReport?: string;
}

export type StudentAnswers = Record<number, string>;
