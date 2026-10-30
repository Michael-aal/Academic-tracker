const test = require("node:test");
const assert = require("node:assert/strict");
const { validateQuiz, publicQuiz, markQuiz } = require("../src/quiz-schema");

function sampleQuiz() {
  return {
    title: "JavaScript Basics",
    questions: [
      {
        id: "q1",
        question: "What is the output of console.log(2 + 3)?",
        options: [
          { id: "A", text: "23" },
          { id: "B", text: "5" },
          { id: "C", text: "6" },
          { id: "D", text: "undefined" }
        ],
        correctAnswer: "B",
        explanation: "The plus operator adds the two numeric values, producing 5.",
        hint: "Evaluate the addition of two numeric values."
      }
    ]
  };
}

test("validates a structured quiz and hides the answer key from the learner payload", () => {
  const quiz = validateQuiz(sampleQuiz(), 1);
  assert.equal(quiz.questions.length, 1);
  assert.equal(publicQuiz(quiz).questions[0].correctAnswer, undefined);
  assert.equal(publicQuiz(quiz).questions[0].options.length, 4);
});

test("rejects wrong question counts, duplicate questions, and duplicate option text", () => {
  assert.throws(() => validateQuiz(sampleQuiz(), 2), /count/);
  const duplicateQuestion = sampleQuiz();
  duplicateQuestion.questions.push({ ...duplicateQuestion.questions[0], id: "q2" });
  assert.throws(() => validateQuiz(duplicateQuestion, 2), /distinct/);
  const duplicateOption = sampleQuiz();
  duplicateOption.questions[0].options[3].text = "5";
  assert.throws(() => validateQuiz(duplicateOption, 1), /distinct options/);
});

test("rejects invalid correct-answer references and missing explanations", () => {
  const invalidAnswer = sampleQuiz();
  invalidAnswer.questions[0].correctAnswer = "E";
  assert.throws(() => validateQuiz(invalidAnswer, 1), /Correct answer/);
  const invalidExplanation = sampleQuiz();
  invalidExplanation.questions[0].explanation = "";
  assert.throws(() => validateQuiz(invalidExplanation, 1), /explanation/);
});

test("server-side marking handles correct, incorrect, unanswered, and duplicate submission data", () => {
  const quiz = validateQuiz(sampleQuiz(), 1);
  assert.deepEqual(markQuiz(quiz, [{ questionId: "q1", optionId: "B" }]).percentage, 100);
  const wrong = markQuiz(quiz, [{ questionId: "q1", optionId: "A" }]);
  assert.equal(wrong.correctAnswers, 0);
  assert.equal(wrong.incorrectAnswers, 1);
  assert.equal(wrong.percentage, 0);
  const blank = markQuiz(quiz, []);
  assert.equal(blank.unanswered, 1);
  assert.equal(blank.incorrectAnswers, 0);
  assert.throws(() => markQuiz(quiz, [{ questionId: "q1", optionId: "A" }, { questionId: "q1", optionId: "B" }]), /duplicate/);
});


test("preserves the selected per-question timer in the learner-facing quiz payload", () => {
  const quiz = validateQuiz(sampleQuiz(), 1);
  quiz.timePerQuestionSeconds = 15;
  assert.equal(publicQuiz(quiz).timePerQuestionSeconds, 15);
  assert.equal(publicQuiz(validateQuiz(sampleQuiz(), 1)).timePerQuestionSeconds, 0);
});
