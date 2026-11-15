"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("AI generation route does not depend on a wallet, credits, or premium access", () => {
  const ai = read("backend/src/routes/ai.js");
  assert.doesNotMatch(ai, /aiCreditGate|ai-credit-gate|INSUFFICIENT_AI_CREDITS|creditUsage/);
  assert.match(ai, /router\.post\("\/",\s*validateAiRequest,\s*aiUsageAudit,/);
  assert.match(ai, /creditsCharged:\s*0/);
});

test("premium and payment API is not mounted", () => {
  const app = read("backend/src/app.js");
  assert.doesNotMatch(app, /routes\/premium|\/api\/premium/);
});

test("student-facing AI and navigation contain no credit wallet or subscription UI", () => {
  const learning = read("ai-learning.js");
  const navigation = read("global-navigation.js");
  assert.doesNotMatch(learning, /api\/premium|creditBalance|creditCosts|creditUsage|credits available|wallet/);
  assert.doesNotMatch(navigation, /premium\.html|Subscription/);
});

test("the PWA shell does not precache removed payment pages", () => {
  const worker = read("sw.js");
  assert.doesNotMatch(worker, /premium\.html|premium-page\.css|premium-page\.js/);
});
