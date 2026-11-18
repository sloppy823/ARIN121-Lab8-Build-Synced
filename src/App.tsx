/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCw,
  HelpCircle,
  FileText,
  Trash2,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';
import { SAMPLE_LECTURE_NOTES } from './data/sampleNotes.ts';
import type { QuizQuestion, AssessmentResult, StudentAnswers } from './types.ts';

export default function App() {
  const [notes, setNotes] = useState<string>('');
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [promptMessage, setPromptMessage] = useState<string>('');
  const [selectedAnswers, setSelectedAnswers] = useState<StudentAnswers>({});
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);

  // Loading states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Validation & Error states
  const [notesError, setNotesError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [unansweredList, setUnansweredList] = useState<number[]>([]);

  // Refs for scrolling and focus
  const quizSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load sample notes
  const handleLoadSampleNotes = () => {
    setNotes(SAMPLE_LECTURE_NOTES);
    setNotesError(null);
    setGenerationError(null);
  };

  // Clear notes
  const handleClearNotes = () => {
    setNotes('');
    setNotesError(null);
  };

  // Generate Quiz
  const handleGenerateQuiz = async () => {
    // 1. Validation: check if empty
    if (!notes || notes.trim().length === 0) {
      setNotesError('Please enter or paste your study notes before generating a quiz.');
      notesTextareaRef.current?.focus();
      return;
    }

    // 2. Validation: check if too brief
    if (notes.trim().length < 50) {
      setNotesError(
        'There is too little material in your study notes to generate three clear multiple-choice questions. Please provide more detailed notes from Lecture 1: History of AI.'
      );
      notesTextareaRef.current?.focus();
      return;
    }

    setNotesError(null);
    setGenerationError(null);
    setIsGenerating(true);
    setSubmissionError(null);
    setUnansweredList([]);

    // Clear old selections and results when explicitly generating a quiz
    setSelectedAnswers({});
    setAssessment(null);

    try {
      const response = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'EMPTY_NOTES' || data.code === 'INSUFFICIENT_MATERIAL') {
          setNotesError(data.error);
        } else {
          setGenerationError(data.error || 'Failed to generate quiz. Please try again.');
        }
        return;
      }

      setQuestions(data.questions);
      setPromptMessage(data.promptMessage || 'Submit your answers using the question number and option letter, for example 1B, 2D, 3A.');

      // Smooth scroll to questions
      setTimeout(() => {
        quizSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      console.error('Quiz Generation failed:', err);
      setGenerationError(
        'Unable to connect to the quiz service. Please check your network and try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle student selecting a radio option
  const handleSelectOption = (questionId: number, optionLetter: string) => {
    // Don't allow changing answers if already assessed
    if (assessment) return;

    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionLetter,
    }));

    // Clear unanswered flag for this question if it was flagged
    if (unansweredList.includes(questionId)) {
      setUnansweredList((prev) => prev.filter((id) => id !== questionId));
      if (unansweredList.length <= 1) {
        setSubmissionError(null);
      }
    }
  };

  // Submit answers for assessment
  const handleSubmitAnswers = async () => {
    if (!questions || questions.length !== 3) return;

    // Check for unanswered questions
    const missing: number[] = [];
    questions.forEach((q) => {
      if (!selectedAnswers[q.id]) {
        missing.push(q.id);
      }
    });

    if (missing.length > 0) {
      setUnansweredList(missing);
      const errorMsg =
        missing.length === 1
          ? `Question ${missing[0]} is unanswered. Please select an option for Question ${missing[0]} before submitting.`
          : `Questions ${missing.join(' and ')} are unanswered. Please select an option for each question before submitting.`;
      setSubmissionError(errorMsg);

      // Scroll to the first unanswered question
      const targetElement = document.getElementById(`question-card-${missing[0]}`);
      targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmissionError(null);
    setUnansweredList([]);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/quiz/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          questions,
          studentAnswers: selectedAnswers,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        if (resData.code === 'UNANSWERED_QUESTIONS' && resData.unanswered) {
          setUnansweredList(resData.unanswered);
        }
        setSubmissionError(resData.error || 'Failed to assess answers. Please try again.');
        return;
      }

      setAssessment(resData.data);

      // Scroll to results
      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      console.error('Submission error:', err);
      setSubmissionError(
        'A network error occurred while grading your quiz. Please try submitting again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to find feedback for a specific question
  const getFeedbackForQuestion = (qNum: number) => {
    if (!assessment || !assessment.results) return null;
    return assessment.results.find((r) => r.questionNumber === qNum);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar following 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <GraduationCap className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Interactive Quiz Generator
            </span>
          </div>

          {/* Zone 2: Lecture / Topic Single-Line Nav Context */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Lecture 1</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-800 font-semibold">History of AI</span>
            <span aria-hidden="true">·</span>
            <span>University Practice</span>
          </div>

          {/* Zone 3: Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadSampleNotes}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none whitespace-nowrap"
              title="Fill text box with sample notes on Lecture 1: History of AI"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              Load Sample Notes
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Intro Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Lecture 1: History of AI Practice Quiz
              </h1>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed max-w-2xl">
                Paste your course notes or readings below to generate three practice multiple-choice
                questions. Questions, options, and explanations are derived strictly from your supplied
                material.
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <BookOpen className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>3 Questions · 4 Options (A–D)</span>
            </div>
          </div>
        </section>

        {/* Section 1: Study Notes Input */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <label
              htmlFor="study-notes-input"
              className="text-sm font-semibold text-slate-900 flex items-center gap-2"
            >
              <span>Study Material Notes</span>
              <span className="text-xs font-normal text-slate-500">(Lecture 1: History of AI)</span>
            </label>

            <div className="flex items-center gap-3">
              {notes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearNotes}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none rounded px-1"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Clear
                </button>
              )}
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {notes.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
          </div>

          <div className="relative">
            <textarea
              id="study-notes-input"
              ref={notesTextareaRef}
              rows={9}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (notesError) setNotesError(null);
              }}
              placeholder="Paste your study notes for Lecture 1 here (e.g. Alan Turing 1950 Computing Machinery and Intelligence, 1956 Dartmouth Workshop, Logic Theorist, ELIZA, Perceptrons XOR limitation, Lighthill report, Expert systems, LISP machines, Deep Blue 1997)..."
              className={`w-full rounded-lg border p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all font-sans leading-relaxed resize-y ${
                notesError
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 bg-white'
              }`}
              aria-describedby={notesError ? 'notes-error-message' : undefined}
            />
          </div>

          {/* Validation Error Message for Notes */}
          {notesError && (
            <div
              id="notes-error-message"
              role="alert"
              className="mt-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-medium text-red-900">{notesError}</p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLoadSampleNotes}
                    className="text-xs font-semibold text-red-700 underline hover:text-red-900 focus-visible:outline-none"
                  >
                    Click to load verified Lecture 1 sample notes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generation Error Display with Retry */}
          {generationError && (
            <div
              role="alert"
              className="mt-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>{generationError}</span>
                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <RotateCw className="w-3 h-3" aria-hidden="true" />
                  Retry Generation
                </button>
              </div>
            </div>
          )}

          {/* Generate Button Container */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {questions
                ? 'Generating again will clear current selections and results.'
                : 'Generates 3 multiple-choice questions with 4 options (A–D).'}
            </p>

            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGenerating || isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Generating Questions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>{questions ? 'Generate New Quiz' : 'Generate Quiz'}</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Loading Banner during Generation */}
        {isGenerating && (
          <div
            role="status"
            aria-live="polite"
            className="p-8 rounded-xl bg-blue-50/60 border border-blue-200 text-center space-y-3"
          >
            <RotateCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-blue-950">
                Synthesizing Lecture 1 Practice Quiz
              </h3>
              <p className="text-sm text-blue-800 max-w-md mx-auto">
                Analyzing your study material and crafting exactly three multiple-choice questions
                with plausible options based strictly on your notes...
              </p>
            </div>
          </div>
        )}

        {/* Section 2: Questions Display (Questions 1 to 3) */}
        {questions && questions.length === 3 && (
          <section
            ref={quizSectionRef}
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6"
            aria-label="Practice Quiz Section"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-2">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  Practice Quiz (Questions 1–3)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Answer all three questions. Solutions and explanations will be shown after submission.
                </p>
              </div>

              {assessment && (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Attempt Graded</span>
                </div>
              )}
            </div>

            {/* Unanswered Questions Alert */}
            {submissionError && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-950">{submissionError}</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Select an option for every question before submitting. Correct answers are not
                    revealed until all answers are recorded.
                  </p>
                </div>
              </div>
            )}

            {/* Questions List */}
            <div className="space-y-6">
              {questions.map((q) => {
                const isUnanswered = unansweredList.includes(q.id);
                const feedback = getFeedbackForQuestion(q.id);
                const currentSelection = selectedAnswers[q.id];

                return (
                  <fieldset
                    key={q.id}
                    id={`question-card-${q.id}`}
                    className={`p-5 rounded-xl border transition-all ${
                      isUnanswered
                        ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-200'
                        : feedback
                        ? feedback.isCorrect
                          ? 'border-emerald-200 bg-emerald-50/15'
                          : 'border-red-200 bg-red-50/15'
                        : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                    }`}
                  >
                    <legend className="sr-only">Question {q.id}</legend>

                    {/* Question Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 w-7 h-7 rounded-md bg-slate-900 text-white text-xs font-bold font-mono flex items-center justify-center">
                          0{q.id}
                        </span>
                        <h3 className="text-base font-semibold text-slate-900 leading-snug">
                          {q.question}
                        </h3>
                      </div>

                      {/* Post-Assessment Status Tag */}
                      {feedback && (
                        <div
                          className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md ${
                            feedback.isCorrect
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {feedback.isCorrect ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              <span>Correct</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
                              <span>Incorrect</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Four Radio Options A-D */}
                    <div className="space-y-2.5" role="radiogroup" aria-label={`Options for Question ${q.id}`}>
                      {q.options.map((opt) => {
                        const isSelected = currentSelection === opt.letter;
                        const isCorrectOption = feedback?.correctOption === opt.letter;
                        const isStudentIncorrectChoice = feedback && !feedback.isCorrect && isSelected;

                        let optionStyle =
                          'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50';

                        if (feedback) {
                          // Results state styling
                          if (isCorrectOption) {
                            optionStyle =
                              'border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500 font-medium';
                          } else if (isStudentIncorrectChoice) {
                            optionStyle =
                              'border-red-400 bg-red-50 text-red-950 ring-1 ring-red-400 line-through opacity-90';
                          } else {
                            optionStyle = 'border-slate-200 bg-white text-slate-500 opacity-60';
                          }
                        } else if (isSelected) {
                          // Pre-submission selected styling: distinct selection highlight without revealing answer key
                          optionStyle =
                            'border-blue-600 bg-blue-50/70 text-blue-950 ring-1 ring-blue-600 font-medium shadow-xs';
                        }

                        return (
                          <label
                            key={opt.letter}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${optionStyle} ${
                              assessment ? 'cursor-default' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name={`question-${q.id}`}
                              value={opt.letter}
                              checked={isSelected}
                              disabled={!!assessment}
                              onChange={() => handleSelectOption(q.id, opt.letter)}
                              className="mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                              aria-label={`Option ${opt.letter}: ${opt.text}`}
                            />
                            <div className="flex-1 text-sm leading-relaxed">
                              <span className="font-bold mr-2 text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {opt.letter}
                              </span>
                              <span>{opt.text}</span>

                              {/* Correct answer indicator tag in results mode */}
                              {feedback && isCorrectOption && (
                                <span className="ml-2 text-xs font-semibold text-emerald-700">
                                  (Correct Option)
                                </span>
                              )}
                              {feedback && isStudentIncorrectChoice && (
                                <span className="ml-2 text-xs font-semibold text-red-700">
                                  (Your Choice)
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Feedback Callout for Question (Shown after submission) */}
                    {feedback && (
                      <div
                        className={`mt-4 p-4 rounded-lg text-sm border ${
                          feedback.isCorrect
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                            : 'bg-red-50/50 border-red-200 text-red-950'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {feedback.isCorrect ? (
                            <CheckCircle2
                              className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          )}
                          <div className="space-y-1">
                            <p className="font-semibold">
                              {feedback.isCorrect
                                ? 'Your answer is correct!'
                                : `Incorrect. The correct option is ${feedback.correctOption}: "${feedback.correctOptionText}"`}
                            </p>
                            <p className="text-xs leading-relaxed text-slate-700">
                              <span className="font-semibold text-slate-900">Notes-Based Explanation: </span>
                              {feedback.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>

            {/* Prompt Instruction Message */}
            {!assessment && promptMessage && (
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <span>{promptMessage}</span>
              </div>
            )}

            {/* Submit Answers Button (Only before assessment) */}
            {!assessment && (
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {Object.keys(selectedAnswers).length} of 3 questions answered
                </p>

                <button
                  type="button"
                  onClick={handleSubmitAnswers}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Grading Answers...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Answers</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Section 3: Assessment Results Area */}
        {assessment && (
          <section
            ref={resultsSectionRef}
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6"
            aria-label="Quiz Results and Performance Feedback"
          >
            {/* Header and Score summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
              <div>
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  Assessment Results
                </span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                  Performance Summary
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {assessment.summaryFeedback ||
                    `You answered ${assessment.score} out of ${assessment.total} questions correctly based on your study material.`}
                </p>
              </div>

              {/* Score Display Card */}
              <div className="shrink-0 flex items-center gap-4 bg-slate-50 border border-slate-200 px-5 py-3 rounded-xl">
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
                    {assessment.score} <span className="text-slate-400 text-xl font-normal">/ {assessment.total}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Final Score
                  </div>
                </div>

                <div className="h-10 w-px bg-slate-200" aria-hidden="true" />

                <div className="text-xs text-slate-600 font-medium space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Correct: {assessment.score}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span>Incorrect: {assessment.total - assessment.score}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Natural Formatted Report from System Instructions */}
            {assessment.formattedReport && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                <div className="font-sans font-bold text-slate-900 mb-1 text-sm">
                  Official Assistant Assessment
                </div>
                {assessment.formattedReport}
              </div>
            )}

            {/* Actions for current attempt */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Notes, quiz, selections, and feedback are retained for this attempt.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    notesTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    notesTextareaRef.current?.focus();
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Review Notes
                </button>
                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Generate Another Quiz
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>
            Interactive Quiz Generator · Lecture 1: History of AI Study Assistant
          </p>
          <p className="text-slate-400">
            Source-grounded multiple choice practice adhering to university assessment constraints.
          </p>
        </div>
      </footer>
    </div>
  );
}
