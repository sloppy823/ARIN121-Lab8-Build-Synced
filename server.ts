import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '5mb' }));

const SYSTEM_INSTRUCTIONS = `## Identity
You are a practice quiz assistant for university students.

## Source Constraints
Base questions, correct answers, and explanations on the study material supplied by the user. If no material is supplied, ask for it before generating a quiz.

## Quiz Generation and Presentation
Create exactly three multiple-choice questions using only the study material supplied by the user. Number them 1, 2, and 3. Give each question four distinct options labelled A, B, C, and D, with exactly one correct option. Use clear wording and plausible incorrect options; avoid questions the material cannot answer unambiguously.
Display all three questions together. Do not reveal the correct options, an answer key, explanations, or hints identifying the answers. Keep the same questions and option order for assessment. End by asking: "Submit your answers using the question number and option letter, for example 1B, 2D, 3A." Then stop and wait for the student's answers.

## Assessment and Feedback
Check the student's submitted choices against the current quiz and the supplied study material. Before grading, confirm there is one valid A-D choice for each of questions 1-3. If a choice is missing, duplicated, invalid, or has an unclear question number, ask for the specific clarification needed. Do not reveal solutions or give a score until all three answers are clear.
Award one point per correct answer and report the total as a score out of 3. For each question, show the student's option and state whether it is correct or incorrect. For every incorrect answer, give the correct option letter and its text, followed by a brief explanation grounded in the study material. Do not invent facts or citations. Do not generate a new quiz unless the student asks for one.`;

// Initialize GoogleGenAI SDK server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper for transient API errors (e.g. 503 high demand or 429)
async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  let delay = 1000;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const errStr = String(err?.message || err);
      const isTransient =
        errStr.includes('503') ||
        errStr.includes('429') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('high demand') ||
        errStr.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        console.warn(`Transient Gemini API error (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

function formatErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred.';
  const msg = error.message || String(error);
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // not JSON
  }
  return msg;
}

// Endpoint: Generate Quiz
app.post('/api/quiz/generate', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;

    if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
      return res.status(400).json({
        error: 'Please paste or enter your study notes before generating a quiz.',
        code: 'EMPTY_NOTES',
      });
    }

    const trimmedNotes = notes.trim();

    // Fast check for trivially brief content
    if (trimmedNotes.length < 50) {
      return res.status(400).json({
        error:
          'There is too little material in your study notes to generate three clear multiple-choice questions. Please provide more detailed notes from Lecture 1: History of AI.',
        code: 'INSUFFICIENT_MATERIAL',
      });
    }

    const prompt = `Here is the student's supplied study material for Lecture 1: History of AI:
---
${trimmedNotes}
---

Carefully evaluate whether this supplied study material has sufficient distinct factual information to formulate exactly three high-quality, clear multiple-choice questions with four plausible options (A, B, C, D) and an unambiguous correct answer based strictly on this material.

If there is NOT enough material for three clear questions, set hasSufficientMaterial to false and provide a polite, specific message in insufficientMaterialReason asking the student for more notes.

If there IS sufficient material, set hasSufficientMaterial to true and create exactly three multiple-choice questions numbered 1, 2, and 3. Each question must have four distinct options labelled A, B, C, and D with exactly one correct option. Do not reveal which option is correct in the question or option text.

Remember to follow the system instructions:
- Base questions only on the supplied study material.
- End promptMessage with: "Submit your answers using the question number and option letter, for example 1B, 2D, 3A."`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasSufficientMaterial: {
                type: Type.BOOLEAN,
                description: 'Whether the study material has enough content for 3 questions.',
              },
              insufficientMaterialReason: {
                type: Type.STRING,
                description: 'Explanation asking for more notes if material is insufficient.',
              },
              questions: {
                type: Type.ARRAY,
                description: 'Array of exactly three multiple-choice questions if sufficient.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER, description: 'Question number (1, 2, or 3)' },
                    question: { type: Type.STRING, description: 'The question text' },
                    options: {
                      type: Type.ARRAY,
                      description: 'Four options labelled A, B, C, D',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          letter: { type: Type.STRING, description: 'A, B, C, or D' },
                          text: { type: Type.STRING, description: 'Option text' },
                        },
                        required: ['letter', 'text'],
                      },
                    },
                  },
                  required: ['id', 'question', 'options'],
                },
              },
              promptMessage: {
                type: Type.STRING,
                description: 'Closing prompt message to the student',
              },
            },
            required: ['hasSufficientMaterial'],
          },
        },
      })
    );

    const rawText = response.text?.trim() || '{}';
    const parsedData = JSON.parse(rawText);

    if (!parsedData.hasSufficientMaterial) {
      return res.status(400).json({
        error:
          parsedData.insufficientMaterialReason ||
          'There is too little material in your study notes to generate three clear multiple-choice questions. Please provide more notes.',
        code: 'INSUFFICIENT_MATERIAL',
      });
    }

    if (!parsedData.questions || parsedData.questions.length < 3) {
      return res.status(400).json({
        error:
          'Could not generate three clear questions from the provided notes. Please expand your study notes with more lecture details.',
        code: 'INSUFFICIENT_MATERIAL',
      });
    }

    // Ensure only 3 questions are returned and options are ordered A-D
    const sanitizedQuestions = parsedData.questions.slice(0, 3).map((q: any, idx: number) => ({
      id: idx + 1,
      question: q.question,
      options: (q.options || []).slice(0, 4).map((opt: any, optIdx: number) => ({
        letter: ['A', 'B', 'C', 'D'][optIdx] || opt.letter,
        text: opt.text,
      })),
    }));

    return res.json({
      success: true,
      questions: sanitizedQuestions,
      promptMessage:
        parsedData.promptMessage ||
        'Submit your answers using the question number and option letter, for example 1B, 2D, 3A.',
    });
  } catch (error: any) {
    console.error('Quiz Generation Error:', error);
    return res.status(500).json({
      error:
        formatErrorMessage(error) ||
        'Failed to generate quiz. Please check your connection and try again.',
      code: 'GENERATION_FAILED',
    });
  }
});

// Endpoint: Assess Answers
app.post('/api/quiz/assess', async (req: Request, res: Response) => {
  try {
    const { notes, questions, studentAnswers } = req.body;

    if (!notes || !questions || !studentAnswers) {
      return res.status(400).json({
        error: 'Missing required assessment parameters: notes, questions, or answers.',
        code: 'INVALID_INPUT',
      });
    }

    // Validate that studentAnswers has choices for 1, 2, and 3
    const missing: number[] = [];
    [1, 2, 3].forEach((qNum) => {
      if (!studentAnswers[qNum] || !['A', 'B', 'C', 'D'].includes(studentAnswers[qNum].toUpperCase())) {
        missing.push(qNum);
      }
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error:
          missing.length === 1
            ? `Question ${missing[0]} is unanswered. Please select an option for Question ${missing[0]} before submitting.`
            : `Questions ${missing.join(', ')} are unanswered. Please select an option for each question before submitting.`,
        code: 'UNANSWERED_QUESTIONS',
        unanswered: missing,
      });
    }

    const answersFormatted = `1${studentAnswers[1].toUpperCase()}, 2${studentAnswers[2].toUpperCase()}, 3${studentAnswers[3].toUpperCase()}`;

    const prompt = `The student has submitted answers for assessment.

STUDY MATERIAL:
---
${notes}
---

QUIZ QUESTIONS & OPTIONS:
${questions
  .map(
    (q: any) =>
      `Question ${q.id}: ${q.question}\n` +
      q.options.map((opt: any) => `  ${opt.letter}: ${opt.text}`).join('\n')
  )
  .join('\n\n')}

STUDENT'S SUBMITTED CHOICES:
${answersFormatted}

Instructions:
1. Confirm there is one valid A-D choice for questions 1-3.
2. Check each submitted choice against the quiz questions and supplied study material.
3. Award 1 point per correct answer; total score out of 3.
4. For each question:
   - State whether the student's chosen option is correct or incorrect.
   - For every incorrect answer, give the correct option letter, its full text, and a brief explanation grounded strictly in the study material.
   - For correct answers, provide a brief confirmation citing the study material.
   - Do not invent facts or citations.`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER, description: 'Total points awarded (0 to 3)' },
              total: { type: Type.INTEGER, description: 'Total questions (always 3)' },
              summaryFeedback: {
                type: Type.STRING,
                description: 'Overall feedback summarizing performance out of 3',
              },
              results: {
                type: Type.ARRAY,
                description: 'Detailed grading for each of the 3 questions',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionNumber: { type: Type.INTEGER, description: '1, 2, or 3' },
                    studentChoice: { type: Type.STRING, description: 'Student option letter (A-D)' },
                    isCorrect: { type: Type.BOOLEAN, description: 'Whether the answer is correct' },
                    correctOption: { type: Type.STRING, description: 'The correct option letter (A-D)' },
                    correctOptionText: {
                      type: Type.STRING,
                      description: 'The text of the correct option',
                    },
                    explanation: {
                      type: Type.STRING,
                      description:
                        'Brief explanation grounded in the study material explaining why this is correct or incorrect',
                    },
                  },
                  required: [
                    'questionNumber',
                    'studentChoice',
                    'isCorrect',
                    'correctOption',
                    'correctOptionText',
                    'explanation',
                  ],
                },
              },
              formattedReport: {
                type: Type.STRING,
                description:
                  'Natural assessment text formatted according to the system instructions report format',
              },
            },
            required: ['score', 'total', 'results'],
          },
        },
      })
    );

    const rawText = response.text?.trim() || '{}';
    const assessmentData = JSON.parse(rawText);

    return res.json({
      success: true,
      data: assessmentData,
    });
  } catch (error: any) {
    console.error('Quiz Assessment Error:', error);
    return res.status(500).json({
      error:
        formatErrorMessage(error) ||
        'Failed to assess quiz answers. Please try submitting again.',
      code: 'ASSESSMENT_FAILED',
    });
  }
});

// Vite middleware in dev or static files in prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Interactive Quiz Generator listening on http://0.0.0.0:${port}`);
  });
}

startServer();
