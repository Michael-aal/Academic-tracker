const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedOrigin } = require("../src/config");

test("allows the configured primary and current Vercel deployment origins", () => {
  assert.equal(isAllowedOrigin("https://academic-tracker-nu.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-iota.vercel.app"), true);
});

test("allows project preview URLs but rejects unrelated Vercel sites", () => {
  assert.equal(isAllowedOrigin("https://academic-tracker-git-fix-ui-michael-aals-projects.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-8k0zy4bud-michael-aals-projects.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-1amavfniy-michael-aals-projects.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://unrelated-project.vercel.app"), false);
  assert.equal(isAllowedOrigin("http://academic-tracker-iota.vercel.app"), false);
});
