const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { prisma } = require("../src/prisma");
const { requireAuth } = require("../src/middleware/auth");

process.env.JWT_SECRET = "test-only-secret-that-is-longer-than-thirty-two-characters";

function makeRequest(token) {
  return {
    get(name) {
      return name.toLowerCase() === "authorization" ? (token ? "Bearer " + token : "") : "";
    }
  };
}

function makeResponse() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    set(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function token(payload = { sv: 0 }) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    subject: "student-123",
    algorithm: "HS256",
    issuer: "academic-tracker-api",
    audience: "academic-tracker-client",
    expiresIn: "5m"
  });
}

test("accepts a correctly formatted Bearer token and applies private cache headers", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ sessionVersion: 0 });
  try {
    const req = makeRequest(token());
    const res = makeResponse();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.userId, "student-123");
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.headers.Pragma, "no-cache");
  } finally {
    prisma.user.findUnique = original;
  }
});

test("rejects missing or malformed Bearer authorization headers", async () => {
  for (const header of ["", "Basic abc", "Bearer", "Bearer\\\\token"]) {
    const req = { get: () => header };
    const res = makeResponse();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  }
});

test("rejects revoked sessions whose token version no longer matches the database", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ sessionVersion: 1 });
  try {
    const res = makeResponse();
    await requireAuth(makeRequest(token({ sv: 0 })), res, () => {});
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /signed out/i);
  } finally {
    prisma.user.findUnique = original;
  }
});

test("rejects tokens without a valid session version", async () => {
  const res = makeResponse();
  await requireAuth(makeRequest(token({})), res, () => {});
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /invalid/i);
});
