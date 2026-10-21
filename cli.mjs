#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenAIAnswerer } from "./lib/openai-answerer.mjs";
import { loadKnowledgeBase, runSupportPipeline } from "./lib/support-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const showTrace = args.includes("--trace");
const message = args.filter((arg) => arg !== "--trace").join(" ").trim() || "API key 一直提示 401 怎么办";
const documents = loadKnowledgeBase(path.join(__dirname, "kb"));
const promptTemplate = fs.readFileSync(path.join(__dirname, "prompts", "support-system.md"), "utf8");

let generateAnswer;
if (String(process.env.AI_MODE || "offline").toLowerCase() === "openai") {
  generateAnswer = createOpenAIAnswerer({
    apiKey: String(process.env.OPENAI_API_KEY || ""),
    model: String(process.env.OPENAI_MODEL || ""),
    promptTemplate,
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 500),
  });
}

const result = await runSupportPipeline(message, documents, { generateAnswer });
console.log(result.answer);
console.log(`\nintent=${result.intent || "none"} action=${result.action}`);
if (result.sources.length) console.log(`sources=${result.sources.map((source) => source.slug).join(",")}`);
if (showTrace) console.log(`\ntrace=${JSON.stringify(result.trace, null, 2)}`);
