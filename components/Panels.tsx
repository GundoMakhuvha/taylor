"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ConvMeta } from "@/lib/store";
import { accessToken, sb } from "@/lib/supabase";
import { I } from "./Icons";
import { Reactor } from "./Reactor";

/* ---------------- Drawer shell ---------------- */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Close">
            <I.close />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

/* ---------------- History ---------------- */
function groupOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t = d.getTime();
  if (t >= start) return "Today";
  if (t >= start - 86400000) return "Yesterday";
  if (t >= start - 6 * 86400000) return "This week";
  return "Earlier";
}

export function HistoryPanel({
  items,
  currentId,
  kind,
  onOpen,
  onDelete,
  onNew,
  onClose,
}: {
  items: ConvMeta[];
  currentId: string | null;
  kind: "cloud" | "device";
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const groups = ["Today", "Yesterday", "This week", "Earlier"]
    .map((g) => ({ g, list: items.filter((c) => groupOf(c.updated_at) === g) }))
    .filter((x) => x.list.length);
  return (
    <Drawer title="History" onClose={onClose}>
      <button type="button" className="btn-primary wide" onClick={onNew}>
        <I.plus /> New conversation
      </button>
      <p className="drawer-note">{kind === "cloud" ? "Synced to your account across devices." : "Saved on this device only."}</p>
      {!items.length && <p className="empty">No conversations yet. Say &ldquo;Taylor&rdquo; to start one.</p>}
      {groups.map(({ g, list }) => (
        <div key={g} className="h-group">
          <h3>{g}</h3>
          <ul>
            {list.map((c) => (
              <li key={c.id} className={c.id === currentId ? "current" : ""}>
                <button type="button" className="h-open" onClick={() => onOpen(c.id)}>
                  <span>{c.title}</span>
                  <time dateTime={c.updated_at}>
                    {new Date(c.updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </button>
                <button type="button" className="icon-btn ghost sm" onClick={() => onDelete(c.id)} aria-label={`Delete “${c.title}”`}>
                  <I.trash />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Drawer>
  );
}

/* ---------------- Settings ---------------- */
export function SettingsPanel({
  name,
  email,
  accounts,
  voiceOn,
  wakeOn,
  wakeSupported,
  onName,
  onVoice,
  onWake,
  onSignOut,
  onClose,
}: {
  name: string;
  email: string | null;
  accounts: boolean;
  voiceOn: boolean;
  wakeOn: boolean;
  wakeSupported: boolean;
  onName: (n: string) => void;
  onVoice: (on: boolean) => void;
  onWake: (on: boolean) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <Drawer title="Settings" onClose={onClose}>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          onName(draft.trim());
        }}
      >
        <label htmlFor="set-name">What should Taylor call you?</label>
        <div className="row">
          <input id="set-name" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your first name" autoComplete="given-name" />
          <button type="submit" className="btn-secondary">
            Save
          </button>
        </div>
      </form>

      <div className="toggle-row">
        <div>
          <strong>Spoken replies</strong>
          <p>Taylor reads her answers aloud.</p>
        </div>
        <button type="button" role="switch" aria-checked={voiceOn} className="switch" onClick={() => onVoice(!voiceOn)} aria-label="Spoken replies" />
      </div>
      <div className="toggle-row">
        <div>
          <strong>&ldquo;Taylor&rdquo; wake word</strong>
          <p>
            {wakeSupported
              ? "Start a sentence with “Taylor…” and she'll answer. Works while Taylor is open on screen; phones pause this when the screen locks."
              : "This browser doesn't support voice activation. Try Chrome, Edge or Safari."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={wakeOn}
          className="switch"
          disabled={!wakeSupported}
          onClick={() => onWake(!wakeOn)}
          aria-label="Wake word"
        />
      </div>

      {accounts && <AutopilotSection />}
      {accounts && <ConnectionsSection />}
      {accounts && <DevicesSection />}

      {accounts && (
        <div className="account">
          <p>
            Signed in as <strong>{email}</strong>
          </p>
          <button type="button" className="btn-secondary" onClick={onSignOut}>
            <I.out /> Sign out
          </button>
        </div>
      )}
      <p className="drawer-note">Taylor is an AI by Capvtal Innovations and can make mistakes.</p>
    </Drawer>
  );
}

/* ---------------- Connections ---------------- */
type ConnInfo = {
  ready: boolean;
  providers: { id: string; label: string; covers: string; available: boolean; account: string | null }[];
  whatsapp: { available: boolean; owner: boolean };
};
const BADGE: Record<string, string> = { google: "G", microsoft: "M", meta: "f", linkedin: "in", tiktok: "TT", whatsapp: "WA" };

function ConnectionsSection() {
  const [info, setInfo] = useState<ConnInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const authed = async (init: RequestInit = {}) => {
    const t = await accessToken();
    return { ...init, headers: { ...(init.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) } };
  };
  const load = async () => {
    try {
      const r = await fetch("/api/connections", await authed());
      if (r.ok) setInfo(await r.json());
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);

  const connect = async (id: string) => {
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`/api/connect/${id}/start`, await authed({ method: "POST" }));
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "Couldn't start the connection.");
      window.location.href = j.url;
    } catch (e: any) {
      setErr(e.message);
      setBusy(null);
    }
  };
  const disconnect = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/connections?provider=${id}`, await authed({ method: "DELETE" }));
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="conns">
      <h3>Connections</h3>
      <p className="drawer-note">Let Taylor read and act on your accounts. She always asks before sending or posting anything.</p>
      {!info && <div className="w-skeleton" style={{ height: 160 }} />}
      {info && !info.ready && <p className="drawer-note">Connections aren&rsquo;t switched on for this server yet.</p>}
      {info && (
        <ul>
          {info.providers.map((p) => (
            <li key={p.id}>
              <span className={`badge b-${p.id}`} aria-hidden="true">
                {BADGE[p.id]}
              </span>
              <span className="conn-text">
                <strong>{p.label}</strong>
                <span>{p.account ? `Connected · ${p.account}` : p.available ? p.covers : "Not set up on the server yet"}</span>
              </span>
              {p.account ? (
                <button type="button" className="btn-secondary sm" disabled={busy === p.id} onClick={() => disconnect(p.id)} aria-label={`Disconnect ${p.label}`}>
                  Disconnect
                </button>
              ) : (
                <button type="button" className="btn-primary sm" disabled={!p.available || busy === p.id} onClick={() => connect(p.id)} aria-label={`Connect ${p.label}`}>
                  {busy === p.id ? "Opening…" : "Connect"}
                </button>
              )}
            </li>
          ))}
          <li>
            <span className="badge b-whatsapp" aria-hidden="true">
              {BADGE.whatsapp}
            </span>
            <span className="conn-text">
              <strong>WhatsApp Business</strong>
              <span>
                {!info.whatsapp.available
                  ? "Not set up on the server yet"
                  : info.whatsapp.owner
                    ? "Business number linked · send messages and read customer chats"
                    : "Linked, but only the business owner can use it"}
              </span>
            </span>
            <span className={`dot ${info.whatsapp.available && info.whatsapp.owner ? "ok" : "warn"}`} aria-hidden="true" />
          </li>
        </ul>
      )}
      {err && (
        <p className="auth-msg err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/* ---------------- Shared fetch with sign-in ---------------- */
async function authed(init: RequestInit = {}) {
  const t = await accessToken();
  return { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) } };
}

/* ---------------- Autopilot (owner) ---------------- */
type Auto = {
  owner: boolean;
  social?: { autopilot: boolean; platforms: string[]; recent: { id: string; day: string; headline: string; status: string; link: string }[] };
  channels?: { email: boolean; whatsapp: boolean };
  leads?: boolean;
  crons?: boolean;
};

function AutopilotSection() {
  const [a, setA] = useState<Auto | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    authed()
      .then((i) => fetch("/api/autopilot", i))
      .then((r) => r.json())
      .then(setA)
      .catch(() => {});
  }, []);
  if (!a?.owner) return null;

  const run = async (action: "briefing" | "post") => {
    setBusy(action);
    setMsg("");
    try {
      const r = await fetch("/api/autopilot", await authed({ method: "POST", body: JSON.stringify({ action }) }));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      if (action === "post" && j.link) window.open(j.link, "_blank", "noopener");
      else setMsg(`Briefing sent: ${(j.sent || []).join(", ") || "saved"}.`);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const rows = [
    { label: "Morning briefing", value: "Daily ~05:30 · WhatsApp + email", ok: !!a.crons && (!!a.channels?.email || !!a.channels?.whatsapp) },
    { label: "Social posts", value: `Daily ~09:00 · ${a.social?.autopilot ? "auto-publish" : "you approve"}`, ok: !!a.crons },
    { label: "Lead finder", value: "Weekdays · no-website businesses", ok: !!a.crons && !!a.leads },
  ];
  return (
    <div className="conns">
      <h3>Autopilot</h3>
      <p className="drawer-note">What Taylor runs for Capvtal on her own.</p>
      <ul className="sys">
        {rows.map((r) => (
          <li key={r.label}>
            <span className={`dot ${r.ok ? "ok" : "warn"}`} aria-hidden="true" />
            <span className="sys-l">{r.label}</span>
            <span className="sys-v">{r.ok ? r.value : "Not set up yet"}</span>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary sm" disabled={!!busy} onClick={() => run("briefing")}>
          {busy === "briefing" ? "Building…" : "Send my briefing now"}
        </button>
        <button type="button" className="btn-secondary sm" disabled={!!busy} onClick={() => run("post")}>
          {busy === "post" ? "Drafting…" : "Today's post"}
        </button>
      </div>
      {msg && (
        <p className="drawer-note" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/* ---------------- Devices (hands-free phone + laptop) ---------------- */
type Device = { id: string; name: string; kind: string; created_at: string; last_used_at: string | null };

function DevicesSection() {
  const [list, setList] = useState<Device[] | null>(null);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/api/devices", await authed());
      if (r.ok) setList((await r.json()).devices);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  const add = async (kind: "phone" | "laptop") => {
    setBusy(true);
    try {
      const r = await fetch("/api/devices", await authed({ method: "POST", body: JSON.stringify({ kind, name: kind === "phone" ? "My phone" : "My laptop" }) }));
      const j = await r.json();
      if (j.token) setFresh({ name: j.name, token: j.token });
      await load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await fetch(`/api/devices?id=${id}`, await authed({ method: "DELETE" }));
    await load();
  };
  return (
    <div className="conns">
      <h3>Devices</h3>
      <p className="drawer-note">Talk to Taylor hands-free on your phone (“Hey Siri, Taylor”) and laptop (“Taylor, …”). Setup steps are in the README.</p>
      {fresh && (
        <div className="key-box" role="status">
          <strong>{fresh.name} key: copy it now, it won&rsquo;t be shown again</strong>
          <code>{fresh.token}</code>
          <button type="button" className="btn-secondary sm" onClick={() => navigator.clipboard?.writeText(fresh.token)}>
            Copy key
          </button>
        </div>
      )}
      {list && list.length > 0 && (
        <ul>
          {list.map((d) => (
            <li key={d.id}>
              <span className="badge" aria-hidden="true">
                {d.kind === "laptop" ? "PC" : "PH"}
              </span>
              <span className="conn-text">
                <strong>{d.name}</strong>
                <span>{d.last_used_at ? `Last used ${new Date(d.last_used_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "Not used yet"}</span>
              </span>
              <button type="button" className="btn-secondary sm" onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn-secondary sm" disabled={busy} onClick={() => add("phone")}>
          Add phone
        </button>
        <button type="button" className="btn-secondary sm" disabled={busy} onClick={() => add("laptop")}>
          Add laptop
        </button>
      </div>
    </div>
  );
}

/* ---------------- Sign in ---------------- */
const GOOGLE_SIGNIN = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";
export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = sb();
    if (!c) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await c.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setMsg({ kind: "ok", text: "Check your email to confirm your account, then sign in." });
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message || "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <Reactor variant="big" mode="idle" />
        <h1>TAYLOR</h1>
        <p className="auth-sub">Identity verification required</p>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "in"} onClick={() => setMode("in")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "up"} onClick={() => setMode("up")}>
            Create account
          </button>
        </div>
        {GOOGLE_SIGNIN && (
          <>
            <button
              type="button"
              className="btn-google wide"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                const { error } = (await sb()?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })) || {};
                if (error) {
                  setMsg({ kind: "err", text: error.message });
                  setBusy(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z" />
                <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1A11 11 0 0 0 1 12c0 1.8.4 3.4 1.1 4.9L5.8 14Z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6Z" />
              </svg>
              Continue with Google
            </button>
            <p className="or" aria-hidden="true">
              <span>or use email</span>
            </p>
          </>
        )}
        <form onSubmit={submit} className="auth-form">
          {mode === "up" && (
            <div className="field">
              <label htmlFor="a-name">First name</label>
              <input id="a-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="a-email">Email</label>
            <input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="a-pass">Password</label>
            <input
              id="a-pass"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
            />
          </div>
          {msg && (
            <p className={`auth-msg ${msg.kind}`} role="status">
              {msg.text}
            </p>
          )}
          <button type="submit" className="btn-primary wide" disabled={busy}>
            {busy ? "Verifying…" : mode === "in" ? "Authorise" : "Create account"}
          </button>
        </form>
        <p className="auth-foot">Capvtal Innovations · Next Generation Innovation</p>
      </div>
    </main>
  );
}

/* ---------------- Boot sequence ---------------- */
const BOOT = ["TAYLOR OS v2.0", "Initialising core…", "Neural voice: online", "Memory banks: synced", "Uplink established", "All systems nominal"];

export function BootSequence() {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("taylor.booted") === "1";
      sessionStorage.setItem("taylor.booted", "1");
    } catch {}
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const a = setTimeout(() => setFade(true), 2100);
    const b = setTimeout(() => setShow(false), 2600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  if (!show) return null;
  return (
    <div className={`boot ${fade ? "out" : ""}`} onClick={() => setShow(false)} aria-hidden="true">
      <Reactor variant="big" mode="thinking" />
      <ol>
        {BOOT.map((l, i) => (
          <li key={l} style={{ animationDelay: `${0.15 + i * 0.28}s` }}>
            <span>[{String(i).padStart(2, "0")}]</span> {l}
          </li>
        ))}
      </ol>
    </div>
  );
}
