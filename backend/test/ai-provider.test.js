"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChatCompletion, getCompletionText } = require("../src/services/ai-provider");

test("provider rejects missing server-side credentials before making a request", async () => {
  const original = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    await assert.rejects(
      createChatCompletion({ model: "test-model", prompt: "Explain fractions" }),
      error => error.code === "AI_NOT_CONFIGURED"
    );
  } finally {
    if (original !== undefined) process.env.OPENROUTER_API_KEY = original;
  }
});

test("provider sends structured completion options and parses JSON responses", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENROUTER_API_KEY = "test-key";
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return { json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Hello learner" } }], model: "test-model" }) };
  };
  try {
    const { response, data } = await createChatCompletion({
      model: "test-model", prompt: "Teach me fractions", temperature: 0.2,
      responseFormat: { type: "json_object" }, maxTokens: 900
    });
    assert.equal(response.ok, undefined);
    assert.equal(captured.body.model, "test-model");
    assert.deepEqual(captured.body.response_format, { type: "json_object" });
    assert.equal(captured.body.max_tokens, 900);
    assert.equal(captured.body.messages[0].content, "Teach me fractions");
    assert.equal(getCompletionText(data).text, "Hello learner");
    assert.equal(getCompletionText(data).finishReason, "stop");
  } finally {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.OPENROUTER_API_KEY = originalKey;
    else delete process.env.OPENROUTER_API_KEY;
  }
});

test("completion parser handles missing or malformed provider choices safely", () => {
  assert.deepEqual(getCompletionText({}), { text: "", finishReason: null, model: null });
});
