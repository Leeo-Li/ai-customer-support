#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INTENTS, classifyIntent } from "../lib/support-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] || ""])));
}

function metric(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

const filePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "testset.csv");
const records = parseCsv(fs.readFileSync(filePath, "utf8"));
const results = records.map((record) => ({
  ...record,
  predicted_intent: classifyIntent(record.text).type,
}));

const correct = results.filter((row) => row.predicted_intent === row.expected_intent).length;
const rows = INTENTS.map((label) => {
  const truePositive = results.filter((row) => row.expected_intent === label && row.predicted_intent === label).length;
  const falsePositive = results.filter((row) => row.expected_intent !== label && row.predicted_intent === label).length;
  const falseNegative = results.filter((row) => row.expected_intent === label && row.predicted_intent !== label).length;
  const precision = metric(truePositive, truePositive + falsePositive);
  const recall = metric(truePositive, truePositive + falseNegative);
  return {
    intent: label,
    support: results.filter((row) => row.expected_intent === label).length,
    precision: precision.toFixed(3),
    recall: recall.toFixed(3),
    f1: metric(2 * precision * recall, precision + recall).toFixed(3),
  };
});

console.log(`Dataset: ${path.relative(process.cwd(), filePath)}`);
console.log(`Accuracy: ${correct}/${results.length} (${(metric(correct, results.length) * 100).toFixed(1)}%)`);
console.table(rows);

const errors = results.filter((row) => row.predicted_intent !== row.expected_intent);
if (errors.length) {
  console.log("Misclassified examples:");
  console.table(errors.map(({ id, text, expected_intent, predicted_intent }) => ({ id, text, expected_intent, predicted_intent })));
  process.exitCode = 1;
} else {
  console.log("All examples classified correctly.");
}
