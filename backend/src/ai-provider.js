const PROVIDERS = {
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "openai/gpt-4o-mini",
    url: "https://openrouter.ai/api/v1/chat/completions"
  },
  xai: {
    envKey: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    defaultModel: "grok-3-mini",
    url: "https://api.x.ai/v1/chat/completions"
  }
};

function providerOrder() {
  const requested = String(process.env.AI_PROVIDER_ORDER || "openrouter,xai")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return [...new Set(requested)].filter(name => Object.hasOwn(PROVIDERS, name));
}

function configuredProviders() {
  return providerOrder().map(name => {
    const config = PROVIDERS[name];
    return {
      id: name,
      configured: Boolean(process.env[config.envKey]),
      model: process.env[config.modelEnv] || config.defaultModel
    };
  });
}

function hasConfiguredProvider() {
  return configuredProviders().some(provider => provider.configured);
}

async function requestChatCompletion(payload, options = {}) {
  const { signal, onUsage } = options;
  const failures = [];
  const ordered = providerOrder();
  const candidates = options.preferredProvider && ordered.includes(options.preferredProvider)
    ? [options.preferredProvider, ...ordered.filter(name => name !== options.preferredProvider)]
    : ordered;
  for (const providerId of candidates) {
    const config = PROVIDERS[providerId];
    const key = process.env[config.envKey];
    if (!key) {
      failures.push(providerId + ": not configured");
      continue;
    }
    const model = process.env[config.modelEnv] || config.defaultModel;
    const headers = {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json"
    };
    if (providerId === "openrouter") {
      headers["HTTP-Referer"] = process.env.AI_SITE_URL || "https://academic-tracker-iota.vercel.app";
      headers["X-Title"] = "Academic Tracker";
    }
    try {
      const response = await fetch(config.url, {
        method: "POST",
        signal,
        headers,
        body: JSON.stringify({ ...payload, model })
      });
      const data = await response.json().catch(() => ({}));
      if (typeof onUsage === "function") {
        try { onUsage(data?.usage || {}, providerId, model, response.status, response.ok); } catch (_) { /* Usage logging must not trigger provider retries. */ }
      }
      if (response.ok && typeof data?.choices?.[0]?.message?.content === "string" && data.choices[0].message.content.trim()) {
        return { data, provider: providerId, model };
      }
      if (response.ok) {
        failures.push(providerId + ": empty or malformed completion response");
        continue;
      }
      const message = typeof data?.error?.message === "string"
        ? data.error.message.slice(0, 180)
        : "HTTP " + response.status;
      failures.push(providerId + ": " + response.status + " " + message);
      // Authentication, rate-limit and provider/server failures can be recovered
      // by another configured provider. Invalid client payloads should not be retried.
      if (![401, 403, 408, 429].includes(response.status) && response.status < 500) {
        const error = new Error("The AI request was rejected by the provider.");
        error.status = response.status;
        error.provider = providerId;
        throw error;
      }
    } catch (error) {
      if (typeof onUsage === "function") {
        try { onUsage({}, providerId, model, 0, false); } catch (_) { /* Ignore telemetry callback failures. */ }
      }
      if (error.name === "AbortError") throw error;
      if (error.status && error.status < 500 && ![401, 403, 408, 429].includes(error.status)) throw error;
      failures.push(providerId + ": " + (error.message || "connection failed").slice(0, 180));
    }
  }
  const error = new Error("No configured AI provider could complete the request.");
  error.failures = failures;
  error.status = 503;
  throw error;
}

module.exports = { requestChatCompletion, configuredProviders, hasConfiguredProvider, providerOrder };
