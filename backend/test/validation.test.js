const test = require("node:test");
const assert = require("node:assert/strict");
const { validPeriod, validateTarget, validateScores } = require("../src/validation");

test("accepts the supported academic terms and non-empty year", () => {
  assert.equal(validPeriod("2026–2027", "Term 1"), true);
  assert.equal(validPeriod("2026–2027", "Term 3"), true);
  assert.equal(validPeriod("", "Term 1"), false);
  assert.equal(validPeriod("2026–2027", "Summer"), false);
});

test("target percentage must be an integer from 0 to 100", () => {
  assert.equal(validateTarget(0), true);
  assert.equal(validateTarget(100), true);
  assert.equal(validateTarget(75), true);
  assert.equal(validateTarget(101), false);
  assert.equal(validateTarget(75.5), false);
  assert.equal(validateTarget("75"), false);
});

test("score validation keeps blank marks blank and supplies standard maximums", () => {
  const result = validateScores({ ca1: 8, ca2: null, ca3: "", exam: 61 });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    ca1: 8, ca1Max: 10,
    ca2: null, ca2Max: 10,
    ca3: null, ca3Max: 10,
    exam: 61, examMax: 70
  });
});

test("score validation rejects marks above maximum and invalid maximums", () => {
  assert.match(validateScores({ ca1: 11 }).error, /between 0 and 10/);
  assert.match(validateScores({ ca1: 5, ca1Max: 0 }).error, /ca1Max/);
  assert.match(validateScores({ exam: -1 }).error, /between 0 and 70/);
});
