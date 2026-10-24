const test = require("node:test");
const assert = require("node:assert/strict");
const { gradeFor, summarizeResults, presentResult } = require("../src/university-grading");

test("maps the default 5-point percentage bands to grade points", () => {
  assert.deepEqual(gradeFor(70), { grade: "A", gradePoint: 5 });
  assert.deepEqual(gradeFor(69.99), { grade: "B", gradePoint: 4 });
  assert.deepEqual(gradeFor(60), { grade: "B", gradePoint: 4 });
  assert.deepEqual(gradeFor(50), { grade: "C", gradePoint: 3 });
  assert.deepEqual(gradeFor(45), { grade: "D", gradePoint: 2 });
  assert.deepEqual(gradeFor(40), { grade: "E", gradePoint: 1 });
  assert.deepEqual(gradeFor(39.99), { grade: "F", gradePoint: 0 });
});

test("calculates credit-weighted GPA and excludes incomplete results", () => {
  const results = [
    { caScore: 24, examScore: 56, course: { creditUnits: 3 } },
    { caScore: 18, examScore: 44, course: { creditUnits: 1 } },
    { caScore: 20, examScore: null, course: { creditUnits: 4 } }
  ];
  assert.deepEqual(summarizeResults(results), { gpa: 4.75, completedCourses: 2, completedUnits: 4 });
});

test("does not assign a grade before both assessment parts are recorded", () => {
  const result = presentResult({ caScore: 25, examScore: null, course: { creditUnits: 3 } });
  assert.equal(result.totalScore, null);
  assert.equal(result.grade, null);
  assert.equal(result.gradePoint, null);
});
