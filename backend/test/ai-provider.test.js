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
  const names = ["AI_PROVIDER_ORDER", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "XAI_API_KEY", "XAI_MODEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const calls = [];
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    delete process.env.GROQ_API_KEY;
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
      onUsage: (value, provider, model) => usage.push({ value, provider, model })
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

test("AI gateway falls back when a provider rejects its model request", async () => {
  const names = ["AI_PROVIDER_ORDER", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "XAI_API_KEY", "XAI_MODEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const calls = [];
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    process.env.OPENROUTER_API_KEY = "test-openrouter";
    process.env.OPENROUTER_MODEL = "unsupported-openrouter-model";
    process.env.XAI_API_KEY = "test-xai";
    process.env.XAI_MODEL = "test-grok-model";
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (String(url).includes("openrouter.ai")) {
        return { ok: false, status: 400, json: async () => ({ error: { message: "model is not available" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "fallback ready" } }] }) };
    };
    const result = await requestChatCompletion({ messages: [{ role: "user", content: "generate a quiz" }] });
    assert.equal(result.provider, "xai");
    assert.equal(result.data.choices[0].message.content, "fallback ready");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(names, previous);
  }
});

test("AI gateway reports only configured providers without exposing keys", () => {
  const names = ["AI_PROVIDER_ORDER", "GROQ_API_KEY", "OPENROUTER_API_KEY", "XAI_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    delete process.env.GROQ_API_KEY;
    process.env.OPENROUTER_API_KEY = "secret-one";
    delete process.env.XAI_API_KEY;
    const status = configuredProviders();
    assert.deepEqual(status.map(item => [item.id, item.configured]), [["openrouter", true], ["xai", false]]);
    assert.equal(JSON.stringify(status).includes("secret-one"), false);
  } finally {
    restoreEnv(names, previous);
  }
});


test("AI gateway sends requests to Groq using its OpenAI-compatible endpoint", async () => {
  const names = ["AI_PROVIDER_ORDER", "GROQ_API_KEY", "GROQ_MODEL", "OPENROUTER_API_KEY", "XAI_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let call;
  try {
    process.env.AI_PROVIDER_ORDER = "groq,openrouter,xai";
    process.env.GROQ_API_KEY = "test-groq-secret";
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.XAI_API_KEY;
    global.fetch = async (url, options) => {
      call = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({
        model: "openai/gpt-oss-120b",
        choices: [{ message: { content: "Groq is ready" } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 }
      }) };
    };
    const result = await requestChatCompletion({ messages: [{ role: "user", content: "hello" }] });
    assert.equal(result.provider, "groq");
    assert.equal(result.model, "openai/gpt-oss-120b");
    assert.equal(result.data.choices[0].message.content, "Groq is ready");
    assert.equal(call.url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(call.headers.Authorization, "Bearer test-groq-secret");
    assert.equal(call.body.model, "openai/gpt-oss-120b");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(names, previous);
  }
});

test("Groq is the default first provider and its key is never exposed in status", () => {
  const names = ["AI_PROVIDER_ORDER", "GROQ_API_KEY", "GROQ_MODEL", "OPENROUTER_API_KEY", "XAI_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    delete process.env.AI_PROVIDER_ORDER;
    process.env.GROQ_API_KEY = "groq-private-test-key";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.XAI_API_KEY;
    const status = configuredProviders();
    assert.equal(status[0].id, "groq");
    assert.equal(status[0].configured, true);
    assert.equal(JSON.stringify(status).includes("groq-private-test-key"), false);
  } finally {
    restoreEnv(names, previous);
  }
});


test("provider preference is not an allow-list; fallback discovers any provider with a key", async () => {
  const names = ["AI_PROVIDER_ORDER", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "XAI_API_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const calls = [];
  try {
    process.env.AI_PROVIDER_ORDER = "groq";
    process.env.GROQ_API_KEY = " ";
    process.env.OPENROUTER_API_KEY = "available-openrouter-key";
    process.env.OPENROUTER_MODEL = "fallback-model";
    delete process.env.XAI_API_KEY;
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => ({
        choices: [{ message: { content: "fallback provider used" } }]
      }) };
    };
    const status = configuredProviders();
    assert.equal(status.find(item => item.id === "groq").configured, false);
    assert.equal(status.find(item => item.id === "openrouter").configured, true);
    const result = await requestChatCompletion({ messages: [{ role: "user", content: "test" }] });
    assert.equal(result.provider, "openrouter");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, "fallback-model");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(names, previous);
  }
});
