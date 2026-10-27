// Taylor's "brain" engines. Switch with AI_PROVIDER = "groq" | "anthropic".
// Both run the same tool-calling loop so connectors work on either. Server-only.
import Anthropic from "@anthropic-ai/sdk";
import type { ToolDef, ToolResult } from "./tools";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type Engine = "groq" | "anthropic";

export function engine(): Engine | null {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p === "groq" && process.env.GROQ_API_KEY) return "groq";
  if (p === "anthropic" && process.env.AI_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.AI_API_KEY) return "anthropic";
  return null;
}

type Events = {
  text: (t: string) => void;
  status: (s: "searching" | "thinking" | "working", label?: string) => void;
};
type Runner = (name: string, args: any) => Promise<ToolResult>;

export type AgentInput = {
  core: string; // static system prompt (cacheable)
  live: string; // per-request context
  messages: ChatMsg[];
  tools: ToolDef[];
  run: Runner;
  events: Events;
};

const MAX_ROUNDS = 8;

const LABELS: Record<string, string> = {
  web_search: "Searching the web",
  email_search: "Checking your email",
  email_read: "Reading the email",
  calendar_list: "Checking your calendar",
  social_activity: "Checking your socials",
  whatsapp_inbox: "Checking WhatsApp",
  create_document: "Writing your document",
  leads_find: "Finding businesses without websites",
  leads_list: "Pulling up your leads",
  lead_update: "Updating the lead",
  social_today: "Preparing today's post",
  briefing: "Pulling your briefing",
  open_app: "Opening that",
};
export const labelFor = (name: string) => LABELS[name] || "Preparing that";

/* ======================= Anthropic ======================= */
async function runAnthropic(i: AgentInput) {
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY! });
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: i.core, cache_control: { type: "ephemeral" } },
    { type: "text", text: i.live },
  ];
  const custom = i.tools.filter((t) => t.name !== "web_search");
  const tools: Anthropic.ToolUnion[] = [
    ...custom.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
    ...(process.env.WEB_SEARCH !== "off"
      ? [
          {
            type: "web_search_20250305" as const,
            name: "web_search" as const,
            max_uses: Number(process.env.WEB_SEARCH_MAX_USES || 3),
            user_location: { type: "approximate" as const, country: "ZA", timezone: "Africa/Johannesburg" },
          },
        ]
      : []),
  ];
  let convo: Anthropic.MessageParam[] = i.messages.map((m) => ({ role: m.role, content: m.content }));
  let wrote = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const s = client.messages.stream({
      model: process.env.AI_MODEL || "claude-sonnet-5-5",
      max_tokens: 2048,
      system,
      messages: convo,
      ...(tools.length ? { tools } : {}),
    });
    let fresh = true;
    for await (const ev of s) {
      if (ev.type === "content_block_start") {
        fresh = true;
        if (ev.content_block.type === "server_tool_use") i.events.status("searching", "Searching the web");
        if (ev.content_block.type === "tool_use") i.events.status("working", labelFor(ev.content_block.name));
      } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        if (fresh && wrote) i.events.text(" ");
        fresh = false;
        wrote = true;
        i.events.text(ev.delta.text);
      }
    }
    const final = await s.finalMessage();
    if (final.stop_reason === "pause_turn") {
      convo = [...convo, { role: "assistant", content: final.content as Anthropic.ContentBlockParam[] }];
      continue;
    }
    if (final.stop_reason !== "tool_use") return;
    const uses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await i.run(u.name, u.input);
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.content });
    }
    convo = [...convo, { role: "assistant", content: final.content as Anthropic.ContentBlockParam[] }, { role: "user", content: results }];
    i.events.status("thinking");
  }
}

/* ======================= Groq (OpenAI-compatible) ======================= */
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";

async function groqFetch(body: Record<string, any>) {
  const extra: Record<string, any> = {};
  if (process.env.GROQ_REASONING_EFFORT) extra.reasoning_effort = process.env.GROQ_REASONING_EFFORT;
  return fetch(GROQ, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...extra, ...body }),
  });
}

/** Web search on Groq: a sub-call to a model with built-in browser search. */
export async function groqWebSearch(query: string): Promise<string> {
  const r = await groqFetch({
    model: process.env.GROQ_SEARCH_MODEL || "openai/gpt-oss-120b",
    messages: [
      {
        role: "user",
        content: `Search the web and give a concise, factual summary (with source names and dates) answering: ${query}\nToday is ${new Date().toDateString()}.`,
      },
    ],
    tools: [{ type: "browser_search" }],
    max_completion_tokens: 1200,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[taylor] groq search", r.status, JSON.stringify(j).slice(0, 300));
    return "Web search is unavailable right now.";
  }
  return j?.choices?.[0]?.message?.content || "No results found.";
}

type OAMsg = Record<string, any>;

/** Thrown when the AI provider's usage limit is hit, so Taylor can say so clearly. */
export class BusyError extends Error {
  constructor(public waitSeconds: number) {
    super("busy");
    this.name = "BusyError";
  }
}

const GROQ_HISTORY = Number(process.env.GROQ_MAX_HISTORY || 14);
const TOOL_RESULT_MAX = 6000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runGroq(i: AgentInput) {
  // Smaller requests: Groq's free tier limits tokens per minute.
  const history = i.messages.slice(-GROQ_HISTORY);
  while (history.length && history[0].role !== "user") history.shift();
  let msgs: OAMsg[] = [{ role: "system", content: `${i.core}\n\n${i.live}` }, ...history];
  let waited = false;
  let trimmed = false;
  const tools = i.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let wrote = false;
  let retried = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await groqFetch({
      model: groqModel(),
      messages: msgs,
      stream: true,
      temperature: 0.6,
      max_completion_tokens: 2048,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    });
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => "");
      console.error("[taylor] groq", res.status, err.slice(0, 400));
      // Usage limits: wait briefly once, or shrink the request, before giving up.
      if (res.status === 429 || res.status === 413 || /rate_limit|tokens per minute|Request too large/i.test(err)) {
        const retryAfter = Number(res.headers.get("retry-after")) || Number((err.match(/try again in ([\d.]+)s/i) || [])[1]) || 0;
        if ((res.status === 413 || /Request too large/i.test(err)) && !trimmed) {
          trimmed = true;
          msgs = [msgs[0], ...msgs.slice(1).slice(-4)];
          while (msgs.length > 1 && msgs[1].role !== "user") msgs.splice(1, 1);
          round--;
          continue;
        }
        if (!waited && retryAfter > 0 && retryAfter <= 12) {
          waited = true;
          await sleep(retryAfter * 1000 + 300);
          round--;
          continue;
        }
        throw new BusyError(Math.ceil(retryAfter || 60));
      }
      // Occasionally a model writes a malformed tool call; one retry usually fixes it.
      if (res.status === 400 && /tool_use_failed|tool call/i.test(err) && !retried) {
        retried = true;
        round--;
        continue;
      }
      throw new Error(`groq ${res.status}: ${err.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let fresh = true;
    const calls: { id: string; name: string; args: string }[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (data === "[DONE]") continue;
        let j: any;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) throw new Error(`groq stream: ${JSON.stringify(j.error).slice(0, 200)}`);
        const d = j.choices?.[0]?.delta || {};
        if (typeof d.content === "string" && d.content) {
          if (fresh && wrote) i.events.text(" ");
          fresh = false;
          wrote = true;
          text += d.content;
          i.events.text(d.content);
        }
        for (const tc of d.tool_calls || []) {
          const k = tc.index ?? calls.length;
          calls[k] = calls[k] || { id: "", name: "", args: "" };
          if (tc.id) calls[k].id = tc.id;
          if (tc.function?.name) {
            calls[k].name += tc.function.name;
            i.events.status(calls[k].name === "web_search" ? "searching" : "working", labelFor(calls[k].name));
          }
          if (tc.function?.arguments) calls[k].args += tc.function.arguments;
        }
      }
    }

    const real = calls.filter((c) => c && c.name);
    if (!real.length) return;
    msgs.push({
      role: "assistant",
      content: text || null,
      tool_calls: real.map((c, n) => ({ id: c.id || `call_${round}_${n}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
    });
    for (const [n, c] of real.entries()) {
      let args: any = {};
      try {
        args = c.args ? JSON.parse(c.args) : {};
      } catch {}
      const r = await i.run(c.name, args);
      msgs.push({ role: "tool", tool_call_id: c.id || `call_${round}_${n}`, content: r.content.slice(0, TOOL_RESULT_MAX) });
    }
    i.events.status("thinking");
  }
}

export async function runAgent(i: AgentInput) {
  const e = engine();
  if (e === "groq") return runGroq(i);
  if (e === "anthropic") return runAnthropic(i);
  throw new Error("No AI engine configured");
}

/** Web search summary on whichever engine is active (used by briefings). */
export async function webSummary(query: string): Promise<string> {
  const e = engine();
  if (process.env.WEB_SEARCH === "off" || !e) return "";
  if (e === "groq") return groqWebSearch(query);
  try {
    const client = new Anthropic({ apiKey: process.env.AI_API_KEY! });
    let msgs: Anthropic.MessageParam[] = [{ role: "user", content: `Search the web and give a concise factual summary with source names: ${query}` }];
    let text = "";
    for (let i = 0; i < 3; i++) {
      const r = await client.messages.create({
        model: process.env.AI_MODEL || "claude-sonnet-5-5",
        max_tokens: 1200,
        messages: msgs,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      });
      text += r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      if (r.stop_reason !== "pause_turn") break;
      msgs = [...msgs, { role: "assistant", content: r.content as Anthropic.ContentBlockParam[] }];
    }
    return text;
  } catch (err) {
    console.error("[taylor] web summary", err);
    return "";
  }
}

/** Simple one-shot reply (used for WhatsApp customer replies). */
export async function complete(system: string, messages: ChatMsg[], maxTokens = 600): Promise<string> {
  const e = engine();
  if (e === "groq") {
    const r = await groqFetch({ model: groqModel(), messages: [{ role: "system", content: system }, ...messages], temperature: 0.5, max_completion_tokens: maxTokens });
    const j = await r.json();
    if (!r.ok) throw new Error(`groq ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return j?.choices?.[0]?.message?.content || "";
  }
  if (e === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.AI_API_KEY! });
    const r = await client.messages.create({
      model: process.env.AI_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system,
      messages,
    });
    return r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
  throw new Error("No AI engine configured");
}

/** Ask for JSON and parse it leniently (models sometimes wrap it in prose or code fences). */
export async function completeJson<T = any>(system: string, user: string, maxTokens = 1500): Promise<T | null> {
  const raw = await complete(`${system}\n\nRespond with ONLY a valid JSON object. No markdown, no commentary.`, [{ role: "user", content: user }], maxTokens);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
