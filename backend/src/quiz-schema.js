"use strict";

const OPTION_IDS = ["A", "B", "C", "D"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
}

function validateQuiz(input, expectedCount) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Quiz must be a JSON object.");
  if (typeof input.title !== "string" || input.title.trim().length < 2 || input.title.trim().length > 120) throw new Error("Quiz title is missing or invalid.");
  if (!Array.isArray(input.questions) || input.questions.length !== expectedCount) throw new Error("Quiz question count does not match the request.");

  const questionIds = new Set();
  const questionTexts = new Set();
  const questions = input.questions.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Question " + (index + 1) + " is invalid.");
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const question = typeof raw.question === "string" ? raw.question.trim() : "";
    const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
    const hint = raw.hint == null ? "" : typeof raw.hint === "string" ? raw.hint.trim() : null;
    if (!id || id.length > 64 || questionIds.has(id)) throw new Error("Question IDs must be unique and valid.");
    if (question.length < 12 || question.length > 1200 || questionTexts.has(normalizeText(question))) throw new Error("Questions must be complete, distinct, and meaningful.");
    if (explanation.length < 8 || explanation.length > 1200 || hint === null || hint.length > 500) throw new Error("Question explanation or hint is invalid.");
    if (!Array.isArray(raw.options) || raw.options.length !== 4) throw new Error("Each question must have exactly four options.");
    const optionIds = new Set();
    const optionTexts = new Set();
    const options = raw.options.map(option => {
      if (!option || typeof option !== "object") throw new Error("Option is invalid.");
      const optionId = typeof option.id === "string" ? option.id.trim() : "";
      const text = typeof option.text === "string" ? option.text.trim() : "";
      if (!OPTION_IDS.includes(optionId) || optionIds.has(optionId) || text.length < 1 || text.length > 500 || optionTexts.has(normalizeText(text))) {
        throw new Error("Each question needs four distinct options with IDs A, B, C, and D.");
      }
      optionIds.add(optionId);
      optionTexts.add(normalizeText(text));
      return { id: optionId, text };
    });
    if (OPTION_IDS.some(optionId => !optionIds.has(optionId))) throw new Error("Options must include A, B, C, and D.");
    if (typeof raw.correctAnswer !== "string" || !optionIds.has(raw.correctAnswer)) throw new Error("Correct answer must reference one of the four option IDs.");
    questionIds.add(id);
    questionTexts.add(normalizeText(question));
    return { id, question, options, correctAnswer: raw.correctAnswer, explanation, hint };
  });
  return { title: input.title.trim(), questions };
}

function publicQuiz(quiz) {
  return {
    title: quiz.title,
    questions: quiz.questions.map(({ correctAnswer, ...question }) => question)
  };
}

function markQuiz(quiz, submittedAnswers) {
  if (!Array.isArray(submittedAnswers)) throw new Error("Answers must be an array.");
  const questionIds = new Set(quiz.questions.map(question => question.id));
  const answerMap = new Map();
  for (const answer of submittedAnswers) {
    if (!answer || typeof answer.questionId !== "string" || typeof answer.optionId !== "string" ||
        !questionIds.has(answer.questionId) || answerMap.has(answer.questionId)) {
      throw new Error("Submitted answers contain an invalid or duplicate question.");
    }
    const question = quiz.questions.find(item => item.id === answer.questionId);
    if (!question.options.some(option => option.id === answer.optionId)) throw new Error("An answer references an invalid option.");
    answerMap.set(answer.questionId, answer.optionId);
  }
  const review = quiz.questions.map(question => {
    const selected = answerMap.get(question.id) || null;
    const correct = selected === question.correctAnswer;
    return {
      questionId: question.id,
      question: question.question,
      selectedAnswer: selected,
      selectedText: question.options.find(option => option.id === selected)?.text || null,
      correctAnswer: question.correctAnswer,
      correctText: question.options.find(option => option.id === question.correctAnswer).text,
      explanation: question.explanation,
      isCorrect: correct
    };
  });
  const total = quiz.questions.length;
  const correct = review.filter(item => item.isCorrect).length;
  const unanswered = review.filter(item => item.selectedAnswer === null).length;
  return {
    totalQuestions: total,
    correctAnswers: correct,
    incorrectAnswers: total - correct - unanswered,
    unanswered,
    score: correct,
    percentage: Math.round((correct / total) * 100),
    review
  };
}

module.exports = { validateQuiz, publicQuiz, markQuiz };
