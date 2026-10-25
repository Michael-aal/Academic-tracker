"use strict";

const OPTION_KEYS = ["A", "B", "C", "D"];

function stripQuizMarkdown(value) {
  return String(value ?? "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function validateQuizPayload(raw, expectedCount) {
  let parsed;
  try {
    if (typeof raw === "string") {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } else {
      parsed = raw;
    }
  } catch {
    throw new Error("The AI returned invalid quiz data.");
  }

  const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw new Error("The AI did not return the requested number of questions.");
  }

  const normalized = questions.map((item, index) => {
    if (!item || typeof item !== "object" || typeof item.question !== "string") {
      throw new Error("Question " + (index + 1) + " is incomplete.");
    }

    const rawOptions = item.options;
    let options;
    if (Array.isArray(rawOptions)) {
      if (rawOptions.length !== 4) throw new Error("Question " + (index + 1) + " must have four options.");
      options = rawOptions.map((value, i) => [OPTION_KEYS[i], value]);
    } else if (rawOptions && typeof rawOptions === "object") {
      options = OPTION_KEYS.map(key => [key, rawOptions[key]]);
      if (Object.keys(rawOptions).length !== 4 || Object.keys(rawOptions).some(key => !OPTION_KEYS.includes(key))) {
        throw new Error("Question " + (index + 1) + " must use options A, B, C and D only.");
      }
    } else {
      throw new Error("Question " + (index + 1) + " has no valid options.");
    }

    const cleanedOptions = options.map(([key, value]) => ({
      key,
      text: stripQuizMarkdown(value)
    }));
    if (cleanedOptions.some(option => !option.text)) {
      throw new Error("Question " + (index + 1) + " has an empty option.");
    }
    if (new Set(cleanedOptions.map(option => option.key)).size !== 4) {
      throw new Error("Question " + (index + 1) + " has duplicate options.");
    }

    const rawAnswer = String(item.answer ?? item.correctAnswer ?? "").trim();
    const answer = /^[A-D]$/i.test(rawAnswer)
      ? rawAnswer.toUpperCase()
      : (cleanedOptions.find(option => option.text.toLowerCase() === stripQuizMarkdown(rawAnswer).toLowerCase()) || {}).key;
    if (!answer || !cleanedOptions.some(option => option.key === answer)) {
      throw new Error("Question " + (index + 1) + " has no valid correct answer.");
    }

    const question = stripQuizMarkdown(item.question);
    if (!question) throw new Error("Question " + (index + 1) + " has no question text.");
    return {
      question,
      options: Object.fromEntries(cleanedOptions.map(option => [option.key, option.text])),
      answer,
      explanation: stripQuizMarkdown(item.explanation || "Review this topic in your notes for more detail.")
    };
  });

  return { questions: normalized };
}

module.exports = { stripQuizMarkdown, validateQuizPayload };
