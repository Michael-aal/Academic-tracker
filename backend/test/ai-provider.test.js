const test = require("node:test");
const assert = require("node:assert/strict");
const { requestChatCompletion, configuredProviders } = require("../src/ai-provider");

function restoreEnv(names, previous) {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}

test("AI gateway falls back from a rate-limited OpenRouter to xAI", async () => {
  const names = ["AI_PROVIDER_ORDER", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "XAI_API_KEY", "XAI_MODEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const calls = [];
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    process.env.OPENROUTER_API_KEY = "test-openrouter";
    process.env.OPENROUTER_MODEL = "test-openrouter-model";
    process.env.XAI_API_KEY = "test-xai";
    process.env.XAI_MODEL = "test-grok-model";
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (String(url).includes("openrouter.ai")) {
        return { ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ready" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    };

    const usage = [];
    const result = await requestChatCompletion({ messages: [{ role: "user", content: "hello" }] }, {
      onUsage: (value, provider) => usage.push({ value, provider })
    });

    assert.equal(result.provider, "xai");
    assert.equal(result.model, "test-grok-model");
    assert.equal(result.data.choices[0].message.content, "ready");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.model, "test-grok-model");
    assert.equal(usage.length, 2);
    assert.equal(usage[0].provider, "openrouter");
    assert.equal(usage[0].model, "test-openrouter-model");
    assert.equal(usage[1].provider, "xai");
    assert.equal(usage[1].model, "test-grok-model");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(names, previous);
  }
});

test("AI gateway reports only configured providers without exposing keys", () => {
  const names = ["AI_PROVIDER_ORDER", "OPENROUTER_API_KEY", "XAI_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    process.env.OPENROUTER_API_KEY = "secret-one";
    delete process.env.XAI_API_KEY;
    const status = configuredProviders();
    assert.deepEqual(status.map(item => [item.id, item.configured]), [["openrouter", true], ["xai", false]]);
    assert.equal(JSON.stringify(status).includes("secret-one"), false);
  } finally {
    restoreEnv(names, previous);
  }
});
