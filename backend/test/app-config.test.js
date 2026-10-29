const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "production";
const { app } = require("../src/app");

test("production trusts exactly one reverse proxy for accurate IP-based rate limiting", () => {
  assert.equal(app.get("trust proxy"), 1);
});
