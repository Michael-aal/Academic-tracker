"use strict";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function getProviderHeaders() {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("AI provider is not configured.");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }
  return {
    Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.AI_SITE_URL || "https://academic-tracker-nu.vercel.app",
    "X-Title": "Academic Tracker"
  };
}

async function createChatCompletion({ model, prompt, signal, temperature = 0.4, responseFormat, maxTokens = 1800 }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: getProviderHeaders(),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      max_tokens: maxTokens
    })
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function getCompletionText(data) {
  const choice = data?.choices?.[0];
  return {
    text: typeof choice?.message?.content === "string" ? choice.message.content : "",
    finishReason: choice?.finish_reason || null,
    model: data?.model || null
  };
}

module.exports = { createChatCompletion, getCompletionText };
