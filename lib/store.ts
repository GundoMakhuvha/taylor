// Conversation history: Supabase (cloud, synced across devices) when accounts are on,
// otherwise this device's local storage.
import { sb } from "./supabase";

export type Msg = { role: "user" | "assistant"; content: string };
export type ConvMeta = { id: string; title: string; updated_at: string };

export interface HistoryStore {
  kind: "cloud" | "device";
  list(): Promise<ConvMeta[]>;
  load(id: string): Promise<Msg[]>;
  create(title: string): Promise<string>;
  append(id: string, msgs: Msg[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export const titleFrom = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57).trimEnd() + "…" : t || "New conversation";
};

/* ---------------- Cloud (Supabase) ---------------- */
function cloudStore(): HistoryStore {
  const c = sb()!;
  return {
    kind: "cloud",
    async list() {
      const { data, error } = await c
        .from("conversations")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ConvMeta[];
    },
    async load(id) {
      const { data, error } = await c
        .from("messages")
        .select("role,content")
        .eq("conversation_id", id)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    async create(title) {
      const { data, error } = await c.from("conversations").insert({ title }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    async append(id, msgs) {
      const rows = msgs.filter((m) => m.content.trim()).map((m) => ({ conversation_id: id, role: m.role, content: m.content }));
      if (rows.length) {
        const { error } = await c.from("messages").insert(rows);
        if (error) throw error;
      }
      await c.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
    },
    async remove(id) {
      const { error } = await c.from("conversations").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

/* ---------------- Device (localStorage) ---------------- */
type LocalConv = ConvMeta & { messages: Msg[] };
const KEY = "taylor.history.v1";
const MAX_CONVS = 60;

function readLocal(): LocalConv[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeLocal(convs: LocalConv[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(convs.slice(0, MAX_CONVS)));
  } catch {
    /* storage full or blocked: history just won't persist */
  }
}
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

function deviceStore(): HistoryStore {
  return {
    kind: "device",
    async list() {
      return readLocal()
        .map(({ id, title, updated_at }) => ({ id, title, updated_at }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async load(id) {
      return readLocal().find((c) => c.id === id)?.messages ?? [];
    },
    async create(title) {
      const id = newId();
      writeLocal([{ id, title, updated_at: new Date().toISOString(), messages: [] }, ...readLocal()]);
      return id;
    },
    async append(id, msgs) {
      const convs = readLocal();
      const c = convs.find((x) => x.id === id);
      if (!c) return;
      c.messages.push(...msgs.filter((m) => m.content.trim()));
      c.updated_at = new Date().toISOString();
      writeLocal([c, ...convs.filter((x) => x.id !== id)]);
    },
    async remove(id) {
      writeLocal(readLocal().filter((c) => c.id !== id));
    },
  };
}

export function getStore(): HistoryStore {
  return sb() ? cloudStore() : deviceStore();
}
