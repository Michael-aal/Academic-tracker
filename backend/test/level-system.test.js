const test = require("node:test");
const assert = require("node:assert/strict");
const { levelForXp, DAILY_XP_CAP } = require("../src/level-system");
const { categories, makeChallenge } = require("../src/english-question-bank");

test("level progression uses cumulative XP thresholds", () => {
  assert.equal(levelForXp(0).level, 1);
  assert.equal(levelForXp(99).level, 1);
  assert.equal(levelForXp(100).level, 2);
  assert.equal(levelForXp(250).level, 3);
  assert.equal(levelForXp(450).level, 4);
  assert.equal(levelForXp(100).xpToNextLevel, 150);
});

test("level progress remains bounded for large XP totals", () => {
  const level = levelForXp(100000);
  assert.ok(level.level > 10);
  assert.ok(level.progressPercent >= 0 && level.progressPercent <= 100);
  assert.ok(level.xpToNextLevel >= 0);
});

test("daily XP cap is configured and positive", () => {
  assert.equal(DAILY_XP_CAP, 100);
});

test("English bank exposes all planned practice categories", () => {
  assert.deepEqual(categories(), ["vocabulary", "spelling", "grammar", "partsOfSpeech", "figuresOfSpeech", "comprehension", "oralEnglish", "writingSkills", "idiomsAndPhrases", "sentenceCorrection"]);
});

test("English challenges contain valid answer keys and four options", () => {
  for (const category of categories()) {
    const questions = makeChallenge(category, 5);
    assert.ok(questions.length > 0);
    for (const question of questions) {
      assert.equal(question.options.length, 4);
      assert.ok(Number.isInteger(question.answer));
      assert.ok(question.answer >= 0 && question.answer < 4);
      assert.ok(question.explanation.length > 0);
    }
  }
});
