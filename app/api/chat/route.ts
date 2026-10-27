import { TAYLOR_CORE, liveContextBlock, type LiveContext } from "@/lib/persona";
import { authorise } from "@/lib/server-auth";
import { prepare } from "@/lib/server/agent";
import { BusyError, engine, runAgent, type ChatMsg } from "@/lib/server/llm";
import { runTool } from "@/lib/server/tools";
import { DashFilter } from "@/lib/style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GENERIC_ERROR = "Taylor is having trouble connecting right now. Please try again in a moment.";
const MAX_HISTORY = 40;
const MAX_CHARS = 12000;

const validTz = (tz?: string) => {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-GB", { timeZone: tz });
      return tz;
    }
  } catch {}
  return "Africa/Johannesburg";
};

// Response: newline-delimited JSON events
//   {"type":"text","text":"..."}
//   {"type":"status","status":"searching"|"thinking"|"working","label"?:"..."}
//   {"type":"action","action":{token,title,lines}}
//   {"type":"error","message":"..."}
export async function POST(req: Request) {
  const auth = await authorise(req);
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 403 ? "This account doesn't have access to Taylor yet." : "Please sign in again." },
      { status: auth.status },
    );
  }
  if (!engine()) {
    console.error("[taylor] no AI engine configured (set GROQ_API_KEY or AI_API_KEY)");
    return Response.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  let messages: ChatMsg[];
  let context: LiveContext | undefined;
  try {
    const body = await req.json();
    context = body?.context && typeof body.context === "object" ? body.context : undefined;
    messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: ChatMsg) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m: ChatMsg) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "Bad request" }, { status: 400 });

  const tz = validTz(context?.timeZone);
  const { ctx, tools, connected } = await prepare(auth.userId, auth.email, tz, "app");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const style = new DashFilter();
      const emit = (t: string) => t && send({ type: "text", text: t });
      try {
        await runAgent({
          core: TAYLOR_CORE,
          live: liveContextBlock({ ...context, timeZone: tz }, new Date(), connected),
          messages,
          tools,
          run: async (name, args) => {
            const r = await runTool(name, args, ctx);
            if (r.action) send({ type: "action", action: r.action });
            return r;
          },
          events: {
            text: (t) => emit(style.push(t)),
            status: (status, label) => send({ type: "status", status, label }),
          },
        });
        emit(style.flush());
      } catch (err) {
        console.error("[taylor] chat error", err);
        emit(style.flush());
        send({
          type: "error",
          message:
            err instanceof BusyError
              ? `I've hit my thinking limit for the moment. Give me about ${err.waitSeconds < 90 ? "a minute" : "a few minutes"} and ask again.`
              : GENERIC_ERROR,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
