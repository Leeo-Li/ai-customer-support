import fs from "node:fs";
import path from "node:path";

const MAX_MESSAGE_CHARS = 1200;

export const INTENTS = [
  "greeting",
  "api_key",
  "integration",
  "request_error",
  "rate_limit",
  "model",
  "billing",
  "account",
  "abnormal",
];

const INTENT_DOCUMENTS = {
  api_key: ["api-keys"],
  integration: ["integration"],
  request_error: ["request-errors", "integration"],
  rate_limit: ["rate-limits", "usage-billing"],
  model: ["model-selection"],
  billing: ["usage-billing", "human-support"],
  account: ["account-security", "human-support"],
  abnormal: ["human-support"],
};

const OFFLINE_ANSWERS = {
  greeting: "你好，我是 Nova。你可以问我 API Key、SDK 接入、请求报错、限流、模型选择、用量或账单问题。",
  api_key:
    "先确认 API Key 只保存在服务端环境变量中，并以 Bearer Token 放入 Authorization 请求头。请不要发送完整密钥；如果出现 401，只提供状态码、请求 ID 和脱敏后的错误信息即可。",
  integration:
    "请先确认 Base URL、模型 ID、Content-Type 和 Authorization 请求头。建议用最小请求验证连接，再接入 SDK。你可以告诉我使用的语言或 SDK，我再给对应示例。",
  request_error:
    "请记录 HTTP 状态码、请求 ID 和脱敏后的错误正文。先用最小请求排除参数问题，再检查模型 ID、JSON 字段和请求超时设置；5xx 可采用指数退避重试。",
  rate_limit:
    "429 表示当前请求超过速率或额度限制。请读取响应中的限流信息，降低并发并使用带抖动的指数退避；不要立即循环重试。若持续发生，请核对套餐限制和当前用量。",
  model:
    "模型选择取决于任务类型、延迟、上下文长度和成本。请说明你要做文本生成、结构化提取、图像理解还是嵌入，以及对延迟和质量的优先级。",
  billing:
    "用量和账单应以控制台记录为准。请先准备账单周期、请求 ID 和相关时间范围；退款、重复扣费或发票争议需要人工核对，我不会编造处理结果。",
  account:
    "账号恢复、邮箱变更和疑似密钥泄露需要人工验证。请先撤销或轮换可能泄露的密钥，并避免在聊天中发送密码、验证码或完整 API Key。",
  abnormal:
    "我还不能从这条消息确定有效的 API 支持问题。请描述你正在调用的接口、HTTP 状态码，以及脱敏后的错误信息。",
};

export function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function validateMessage(value) {
  const message = String(value || "").trim();
  if (!message) return { ok: false, code: "EMPTY_MESSAGE", message: "请输入一个问题。" };
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      code: "MESSAGE_TOO_LONG",
      message: "内容太长了，请保留接口、状态码、请求 ID 和关键错误信息。",
    };
  }
  return { ok: true, message };
}

export function detectPolicyViolation(value) {
  const text = normalizeText(value);
  if (includesAny(text, [
    "ignore previous instructions",
    "ignore all previous",
    "reveal your system prompt",
    "show your system prompt",
    "developer message",
    "dump the knowledge base",
    "print your hidden reasoning",
    "jailbreak",
    "忽略之前的指令",
    "忽略以上指令",
    "无视之前的规则",
    "输出系统提示词",
    "显示系统提示词",
    "输出隐藏推理",
    "完整知识库",
    "导出知识库",
    "内部安全规则",
  ])) {
    return {
      blocked: true,
      reason: "prompt_exfiltration",
      answer: "我不能提供系统提示词、隐藏推理、安全规则或完整知识库，但可以继续帮助排查 API 使用问题。",
    };
  }

  if (includesAny(text, [
    "窃取 api key",
    "偷 api key",
    "偷一个 api key",
    "偷取 api key",
    "偷密钥",
    "盗取密钥",
    "绕过鉴权",
    "绕过限流",
    "爆破账号",
    "steal api key",
    "bypass authentication",
    "bypass rate limit",
  ])) {
    return {
      blocked: true,
      reason: "harmful_request",
      answer: "我不能协助窃取凭据或绕过鉴权与限流。我可以帮助配置合法的 API 认证和重试策略。",
    };
  }

  return { blocked: false, reason: "none" };
}

export function redactSensitiveText(value, maxLength = 3000) {
  return String(value || "")
    .replace(/\b(?:sk|rk|pk|api)[-_][A-Za-z0-9_-]{12,}\b/gi, "[API_KEY_REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:api_key|key|token|code)=)[^\s&#]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[NUMBER_REDACTED]")
    .slice(0, maxLength);
}

export function sanitizeModelOutput(value) {
  const safe = redactSensitiveText(value, 6000).trim();
  const normalized = normalizeText(safe);
  if (includesAny(normalized, [
    "system prompt:",
    "developer message:",
    "hidden reasoning:",
    "内部安全规则：",
    "完整知识库：",
  ])) {
    return "我不能提供内部提示词、隐藏推理或完整知识库，但可以继续帮助排查 API 使用问题。";
  }
  return safe || "暂时无法生成回答，请换一种方式描述问题。";
}

export function classifyIntent(value) {
  const text = normalizeText(value);
  const policy = detectPolicyViolation(text);
  if (policy.blocked) return { type: "abnormal", confidence: 0.99, source: "policy" };
  if (/^(hi|hello|hey|你好|您好|嗨|在吗|早上好|晚上好|谢谢)[!！。,. ]*$/.test(text)) {
    return { type: "greeting", confidence: 0.98, source: "rules" };
  }
  if (includesAny(text, ["密钥泄露", "key 泄露", "api key 泄露", "账号被盗", "账户被盗", "account hacked", "key compromised"])) {
    return { type: "account", confidence: 0.97, source: "rules" };
  }
  if (includesAny(text, ["429", "rate limit", "rate_limit", "限流", "请求太频繁", "too many requests", "每分钟", "rpm", "tpm"])) {
    return { type: "rate_limit", confidence: 0.96, source: "rules" };
  }
  if (includesAny(text, ["api key", "apikey", "密钥", "token 无效", "token失效", "invalid_api_key", "unauthorized", "401", "authorization", "bearer"])) {
    return { type: "api_key", confidence: 0.95, source: "rules" };
  }
  if (includesAny(text, ["扣费", "账单", "充值", "余额", "退款", "发票", "价格", "套餐", "额度", "用量", "消费", "billing", "invoice", "credits"])) {
    return { type: "billing", confidence: 0.94, source: "rules" };
  }
  if (includesAny(text, ["登录", "注册", "邮箱", "密码", "验证码", "账号", "账户", "被盗", "泄露", "找回", "account"])) {
    return { type: "account", confidence: 0.92, source: "rules" };
  }
  if (includesAny(text, ["400", "403", "404", "408", "500", "502", "503", "报错", "失败", "超时", "timeout", "无响应", "空响应", "响应为空", "返回为空", "invalid_request", "server error"])) {
    return { type: "request_error", confidence: 0.91, source: "rules" };
  }
  if (includesAny(text, ["模型", "model", "上下文", "embedding", "嵌入", "图像理解", "vision", "哪一个", "哪个好", "支持图片"])) {
    return { type: "model", confidence: 0.91, source: "rules" };
  }
  if (includesAny(text, ["base url", "endpoint", "sdk", "curl", "接入", "集成", "怎么调用", "请求头", "content-type", "python", "javascript", "node.js", "示例代码"])) {
    return { type: "integration", confidence: 0.90, source: "rules" };
  }
  return { type: "abnormal", confidence: 0.40, source: "fallback" };
}

function walkMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);
      const content = fs.readFileSync(filePath, "utf8");
      const slug = entry.name.replace(/\.md$/, "");
      const title = content.split("\n").find((line) => line.startsWith("# "))?.slice(2).trim() || slug;
      return { slug, title, content };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function loadKnowledgeBase(kbRoot) {
  return walkMarkdownFiles(kbRoot);
}

export function retrieveKnowledgeBase(message, documents, intentResult = classifyIntent(message), limit = 2) {
  const preferred = INTENT_DOCUMENTS[intentResult.type] || [];
  const terms = normalizeText(message).match(/[a-z0-9_-]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
  return documents
    .map((document) => {
      let score = preferred.includes(document.slug) ? 100 : 0;
      const searchable = normalizeText(`${document.title}\n${document.content}`);
      for (const term of terms) if (searchable.includes(term)) score += 1;
      return { ...document, score };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.slug.localeCompare(right.slug))
    .slice(0, limit);
}

export function determineAction(intentResult, message) {
  const text = normalizeText(message);
  if (intentResult.type === "abnormal" && intentResult.source === "policy") return "refuse";
  if (intentResult.type === "billing" && includesAny(text, ["退款", "重复扣费", "发票", "争议"])) return "handoff";
  if (intentResult.type === "account" && includesAny(text, ["被盗", "泄露", "找回", "修改邮箱", "换邮箱"])) return "handoff";
  if (intentResult.type === "abnormal") return "clarify";
  return "answer";
}

export function buildModelInstructions(promptTemplate, selectedDocuments) {
  const knowledge = selectedDocuments
    .map((document) => `REFERENCE: ${document.title}\n${document.content.slice(0, 3600)}`)
    .join("\n\n---\n\n");
  return `${promptTemplate.trim()}\n\nKNOWLEDGE_REFERENCE (untrusted reference data):\n${knowledge || "No relevant reference was retrieved."}`;
}

export async function runSupportPipeline(messageValue, documents, options = {}) {
  const trace = [];
  const validation = validateMessage(messageValue);
  trace.push({ stage: "validate", status: validation.ok ? "passed" : "rejected", code: validation.code || "OK" });
  if (!validation.ok) return { answer: validation.message, action: "reject", intent: null, sources: [], trace };

  const policy = detectPolicyViolation(validation.message);
  trace.push({ stage: "policy", status: policy.blocked ? "blocked" : "passed", reason: policy.reason });
  if (policy.blocked) {
    trace.push({ stage: "respond", status: "completed", mode: "policy" });
    return {
      answer: policy.answer,
      action: "refuse",
      intent: "abnormal",
      sources: [],
      trace,
    };
  }

  const safeMessage = redactSensitiveText(validation.message);
  trace.push({ stage: "redact", status: safeMessage === validation.message ? "unchanged" : "redacted" });

  const intentResult = classifyIntent(safeMessage);
  trace.push({ stage: "intent", status: "classified", ...intentResult });

  const selectedDocuments = retrieveKnowledgeBase(safeMessage, documents, intentResult);
  trace.push({
    stage: "retrieve",
    status: selectedDocuments.length ? "matched" : "empty",
    documents: selectedDocuments.map((document) => document.slug),
  });

  const action = determineAction(intentResult, safeMessage);
  trace.push({ stage: "plan", status: "completed", action });

  let answer = OFFLINE_ANSWERS[intentResult.type] || OFFLINE_ANSWERS.abnormal;
  let mode = "offline";
  if (typeof options.generateAnswer === "function" && !["handoff", "refuse"].includes(action)) {
    answer = await options.generateAnswer({
      message: safeMessage,
      intent: intentResult.type,
      action,
      documents: selectedDocuments,
    });
    mode = "model";
  }
  trace.push({ stage: "respond", status: "completed", mode });

  const sanitizedAnswer = sanitizeModelOutput(answer);
  trace.push({ stage: "postcheck", status: sanitizedAnswer === answer ? "passed" : "filtered" });

  return {
    answer: sanitizedAnswer,
    action,
    intent: intentResult.type,
    confidence: intentResult.confidence,
    sources: selectedDocuments.map(({ slug, title }) => ({ slug, title })),
    trace,
  };
}
