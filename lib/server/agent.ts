// Shared "ask Taylor" plumbing for the app, your devices (phone/laptop) and your own WhatsApp. Server-only.
import { TAYLOR_CORE, liveContextBlock, type LiveContext } from "../persona";
import { isOwner } from "../server-auth";
import { admin } from "./admin";
import { PROVIDERS, connectorsReady, listConnections, type ProviderId } from "./connections";
import { unseal } from "./crypto";
import { BusyError, engine, groqWebSearch, runAgent, type ChatMsg } from "./llm";
import { OWNER_TZ, owner } from "./owner";
import { buildTools, executeAction, runTool, type ActionCard, type ToolCtx } from "./tools";
import { whatsappConfigured } from "./whatsapp";
import { noDashes } from "../style";

export type Channel = "app" | "phone" | "laptop" | "whatsapp";

export async function prepare(userId: string | undefined, email: string | undefined, tz: string, channel: Channel) {
  const linked = new Set<ProviderId>();
  const connected: string[] = [];
  if (userId && connectorsReady()) {
    try {
      for (const c of await listConnections(userId)) {
        linked.add(c.provider);
        connected.push(`${PROVIDERS[c.provider].covers} (${c.account})`);
      }
    } catch (err) {
      console.error("[taylor] connections", err);
    }
  }
  const own = isOwner(email);
  const waOwner = own && whatsappConfigured();
  if (waOwner) connected.push("WhatsApp Business number (send messages, read customer chats)");
  const groq = engine() === "groq";
  const ctx: ToolCtx = { userId, linked, waOwner, owner: own, tz, channel, groqSearch: groq ? groqWebSearch : undefined };
  const tools = buildTools(ctx, groq && process.env.WEB_SEARCH !== "off");
  return { ctx, tools, connected };
}

const CHANNEL_NOTE: Record<Channel, string> = {
  app: "",
  phone:
    "\n- CHANNEL: the user is talking to you hands-free through their phone (voice in, your reply is read aloud). Keep replies to 1–3 short spoken sentences. To open an app on their phone, use open_app.",
  laptop:
    "\n- CHANNEL: the user is talking to you hands-free through the Taylor companion on their laptop (voice in, reply read aloud). Keep replies short and spoken. To open an app or website on the laptop, use open_app.",
  whatsapp:
    "\n- CHANNEL: the owner is messaging you on WhatsApp. Reply in WhatsApp style: short, *bold* with single asterisks, bullets with •, no markdown headings or links in brackets.",
};

const YES = /^(yes|yeah|yep|yup|sure|confirm(ed)?|send( it)?|post( it)?|publish( it)?|do it|go ahead|go for it|please do|book it|ok(ay)?|correct)\b/i;
const NO = /^(no|nope|cancel|don'?t|stop|never ?mind)\b/i;

type State = { key: string; user_id: string; conversation_id: string | null; pending: string | null; updated_at: string };

async function loadState(key: string, uid: string): Promise<State> {
  const { data } = await admin().from("assistant_channels").select("*").eq("key", key).maybeSingle();
  return (data as State) || { key, user_id: uid, conversation_id: null, pending: null, updated_at: new Date(0).toISOString() };
}
async function saveState(s: Partial<State> & { key: string; user_id: string }) {
  await admin().from("assistant_channels").upsert({ ...s, updated_at: new Date().toISOString() });
}

const LABEL: Record<Channel, string> = { app: "Taylor", phone: "Phone", laptop: "Laptop", whatsapp: "WhatsApp" };

/**
 * One turn of conversation outside the app (devices, owner WhatsApp).
 * Keeps a rolling conversation (new one after 6h idle) that also shows up in History.
 */
export async function askTaylor(a: { userId: string; email?: string; name?: string; text: string; channelKey: string; channel: Channel; context?: LiveContext }) {
  const tz = OWNER_TZ();
  const state = await loadState(a.channelKey, a.userId);
  const text = a.text.trim().slice(0, 4000);
  let opened: { app?: string } = {};

  // Answering a held action with yes/no.
  if (state.pending && text.split(/\s+/).length <= 6 && (YES.test(text) || NO.test(text))) {
    const p = unseal<{ uid: string; tool: string; args: any; tz: string }>(state.pending);
    await saveState({ key: a.channelKey, user_id: a.userId, pending: null });
    if (!p || p.uid !== a.userId) return { reply: "That request expired. Ask me again and I'll prepare it fresh.", open: opened };
    if (NO.test(text)) return { reply: "No problem, I've cancelled that.", open: opened };
    try {
      const { ctx } = await prepare(a.userId, a.email, tz, a.channel);
      const msg = await executeAction(p.tool, p.args, a.userId, p.tz || tz, ctx.linked, ctx.waOwner);
      await record(state, a, [{ role: "user", content: text }, { role: "assistant", content: `✓ ${msg}` }]);
      return { reply: `Done. ${msg}`, open: opened };
    } catch (err: any) {
      return { reply: `That didn't go through: ${String(err?.message || "").slice(0, 160)}`, open: opened };
    }
  }

  // Conversation memory for this channel.
  const fresh = !state.conversation_id || Date.now() - new Date(state.updated_at).getTime() > 6 * 3600 * 1000;
  let history: ChatMsg[] = [];
  if (!fresh && state.conversation_id) {
    const { data } = await admin()
      .from("messages")
      .select("role,content")
      .eq("conversation_id", state.conversation_id)
      .order("id", { ascending: false })
      .limit(12);
    history = ((data || []) as ChatMsg[]).reverse();
  } else state.conversation_id = null;

  const { ctx, tools, connected } = await prepare(a.userId, a.email, tz, a.channel);
  ctx.onOpen = (app) => (opened = { app });
  let reply = "";
  let action: ActionCard | null = null;
  try {
  await runAgent({
    core: TAYLOR_CORE + CHANNEL_NOTE[a.channel],
    live: liveContextBlock({ name: a.name, timeZone: tz, device: a.channel, ...a.context }, new Date(), connected),
    messages: [...history, { role: "user", content: text }],
    tools,
    run: async (name, args) => {
      const r = await runTool(name, args, ctx);
      if (r.action) action = r.action;
      return r;
    },
    events: { text: (t) => (reply += t), status: () => {} },
  });
  } catch (err) {
    if (err instanceof BusyError) return { reply: "I've hit my thinking limit for the moment. Try me again in a minute.", open: opened };
    throw err;
  }
  reply = noDashes(reply.trim()) || "Sorry, I didn't catch that.";
  const held = action as ActionCard | null;
  if (held) {
    const summary = held.lines.map((l) => `${l.label}: ${l.value}`).join("\n");
    if (a.channel === "whatsapp") reply += `\n\n*${held.title}*\n${summary}\n\nReply *yes* to go ahead or *no* to cancel.`;
    else reply += " Say yes to go ahead, or no to cancel.";
  }
  await record(state, a, [
    { role: "user", content: text },
    { role: "assistant", content: reply },
  ], held?.token ?? null);
  return { reply, open: opened };
}

async function record(state: State, a: { userId: string; channelKey: string; channel: Channel; text: string }, msgs: ChatMsg[], pending: string | null = null) {
  let cid = state.conversation_id;
  if (!cid) {
    const title = `${LABEL[a.channel]} · ${a.text.replace(/\s+/g, " ").slice(0, 48)}`;
    const { data } = await admin().from("conversations").insert({ user_id: a.userId, title }).select("id").single();
    cid = data?.id ?? null;
  }
  if (cid) {
    await admin().from("messages").insert(msgs.map((m) => ({ conversation_id: cid, user_id: a.userId, role: m.role, content: m.content })));
    await admin().from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
  }
  await saveState({ key: a.channelKey, user_id: a.userId, conversation_id: cid, pending });
}

/** The owner messaging the business WhatsApp number. */
export async function ownerChat(text: string, channelKey: string, channel: Channel) {
  const o = await owner();
  if (!o) return "I couldn't find your Taylor account. Set OWNER_EMAIL and sign in to Taylor once.";
  const r = await askTaylor({ userId: o.id, email: o.email, name: o.name, text, channelKey, channel });
  return r.reply;
}
