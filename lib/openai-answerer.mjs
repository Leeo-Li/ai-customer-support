import crypto from "node:crypto";

import { buildModelInstructions, redactSensitiveText, sanitizeModelOutput } from "./support-pipeline.mjs";

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

export function createOpenAIAnswerer({ apiKey, model, promptTemplate, timeoutMs = 20000, maxOutputTokens = 500 }) {
  if (!apiKey || !model) throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required in openai mode.");

  return async ({ message, intent, action, documents }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: buildModelInstructions(promptTemplate, documents),
          input: JSON.stringify({
            USER_MESSAGE: redactSensitiveText(message, 1200),
            ROUTING_RESULT: { intent, action },
          }),
          max_output_tokens: maxOutputTokens,
          store: false,
          safety_identifier: crypto.createHash("sha256").update("api-support-cli").digest("hex"),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenAI response status ${response.status}`);
      const answer = extractResponseText(await response.json());
      if (!answer) throw new Error("OpenAI response contained no text.");
      return sanitizeModelOutput(answer);
    } finally {
      clearTimeout(timeout);
    }
  };
}
