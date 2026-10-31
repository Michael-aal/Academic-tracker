const { execFileSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedOrigin } = require("../src/config");

test("allows the configured primary and current Vercel deployment origins", () => {
  assert.equal(isAllowedOrigin("https://academic-tracker-nu.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-iota.vercel.app"), true);
});

test("allows project preview URLs but rejects unrelated Vercel sites", () => {
  assert.equal(isAllowedOrigin("https://academic-tracker-git-fix-ui-michael-aals-projects.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-ah1jhkyoj-michael-aals-projects.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://academic-tracker-preview-123-other-team.vercel.app"), false);
  assert.equal(isAllowedOrigin("https://unrelated-project.vercel.app"), false);
  assert.equal(isAllowedOrigin("http://academic-tracker-iota.vercel.app"), false);
});


test("does not allow localhost origins by default in production", () => {
  const output = execFileSync(process.execPath, ["-e", 'const { isAllowedOrigin } = require("./src/config"); process.stdout.write(String(isAllowedOrigin("http://localhost:5173")));'], {
    cwd: require("node:path").resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", FRONTEND_ORIGIN: "" }
  });
  assert.equal(output.toString(), "false");
});
