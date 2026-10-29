const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-only-secret-that-is-at-least-32-characters-long";
const { requireAuth } = require("../src/middleware/auth");

function invokeAuthorization(header) {
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const req = { get: (name) => name.toLowerCase() === "authorization" ? header : undefined };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  requireAuth(req, res, () => { nextCalled = true; });
  return { req, statusCode, body, nextCalled };
}

test("rejects requests without a bearer token", () => {
  const result = invokeAuthorization(undefined);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("rejects malformed bearer headers", () => {
  const result = invokeAuthorization("Basic abc123");
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("accepts a valid signed token and sets the authenticated user ID", () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: "student_123",
    algorithm: "HS256",
    issuer: "academic-tracker-api",
    audience: "academic-tracker-client",
    expiresIn: "5m"
  });
  const result = invokeAuthorization("Bearer " + token);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.userId, "student_123");
});

test("rejects expired tokens", () => {
  const token = jwt.sign({ sub: "student_123" }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: "academic-tracker-api",
    audience: "academic-tracker-client",
    expiresIn: -1
  });
  const result = invokeAuthorization("Bearer " + token);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("rejects tokens signed with an unexpected algorithm", () => {
  const token = jwt.sign({ sub: "student_123" }, process.env.JWT_SECRET, {
    algorithm: "HS512",
    issuer: "academic-tracker-api",
    audience: "academic-tracker-client",
    expiresIn: "5m"
  });
  const result = invokeAuthorization("Bearer " + token);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("rejects tokens with the wrong audience", () => {
  const token = jwt.sign({ sub: "student_123" }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: "academic-tracker-api",
    audience: "untrusted-client",
    expiresIn: "5m"
  });
  const result = invokeAuthorization("Bearer " + token);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});
