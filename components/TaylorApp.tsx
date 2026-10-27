"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { accountsOn, accessToken, sb } from "@/lib/supabase";
import { getStore, titleFrom, type ConvMeta, type Msg } from "@/lib/store";
import { SentenceChunker, Speaker } from "@/lib/speech";
import { VoiceEngine, speechInputSupported, type VoiceState } from "@/lib/voice";
import { summarise, type Weather } from "@/lib/weather";
import { Reactor, type CoreMode } from "./Reactor";
import { I } from "./Icons";
import { Markdown } from "./Markdown";
import type { Sys } from "./Widgets";
import { GlassModule, HudClock, HudLog, HudMeter, HudStatus, SystemsModule, WeatherModule, useNow, type LogLine } from "./Modules";
import { AuthScreen, BootSequence, HistoryPanel, SettingsPanel } from "./Panels";
import { ActionCard, type ActionState } from "./ActionCard";

const YES = /^(yes|yeah|yep|yup|sure|confirm(ed)?|send( it)?|post( it)?|do it|go ahead|go for it|please do|book it|ok(ay)?|that'?s (fine|good|right)|correct)\b/i;
const NO = /^(no|nope|cancel|don'?t|stop|never ?mind|hold (on|off)|wait)\b/i;
const CONNECTED_LABEL: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
  meta: "Facebook + Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const GENERIC = "Taylor is having trouble connecting right now. Please try again in a moment.";

const STATUS: Record<CoreMode, string> = {
  idle: "Online",
  wake: "Say “Taylor”",
  listening: "Listening",
  thinking: "Thinking",
  searching: "Searching",
  speaking: "Speaking",
};

const QUICK = [
  { label: "Brief me", prompt: "Give me my briefing." },
  { label: "Weather this week", prompt: "What's the weather looking like for the next few days?" },
  { label: "What does Capvtal do?", prompt: "Tell me what Capvtal Innovations does." },
  { label: "Latest tech news", prompt: "What are today's biggest tech headlines?" },
];

const pref = {
  get(k: string, d: string) {
    try {
      return localStorage.getItem(`taylor.${k}`) ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`taylor.${k}`, v);
    } catch {}
  },
};

function greeting(name: string) {
  const h = new Date().getHours();
  const g = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${g}${name ? `, ${name}` : ""}.`;
}

/* ============================== Root: auth gate ============================== */
export default function TaylorApp() {
  const [ready, setReady] = useState(!accountsOn);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const c = sb();
    if (!c) return;
    c.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready)
    return (
      <main className="auth">
        <Reactor variant="big" mode="thinking" />
      </main>
    );
  if (accountsOn && !session) return <AuthScreen />;
  return (
    <Console
      key={session?.user.id ?? "guest"}
      email={session?.user.email ?? null}
      accountName={(session?.user.user_metadata?.name as string | undefined) ?? ""}
    />
  );
}

/* ============================== Console ============================== */
function Console({ email, accountName }: { email: string | null; accountName: string }) {
  const store = useMemo(() => getStore(), []);

  const [name, setName] = useState(accountName);
  const [convs, setConvs] = useState<ConvMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setModeState] = useState<CoreMode>("idle");
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [drawer, setDrawer] = useState<null | "history" | "settings">(null);
  const [notice, setNotice] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [wxStatus, setWxStatus] = useState<"loading" | "ready" | "error">("loading");
  const [precise, setPrecise] = useState(false);
  const [sys, setSys] = useState<Sys>({ core: null, voice: null, memory: null, search: null, latency: null });
  const [latencies, setLatencies] = useState<number[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const addLog = useCallback((m: string) => {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    setLog((l) => [...l.slice(-11), { t, m }]);
  }, []);
  useEffect(() => {
    addLog("Taylor core online");
  }, [addLog]);
  const now = useNow();
  const clockChip = now
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · ${now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}`
    : "SYNCING";
  const [actions, setActions] = useState<Record<number, ActionState>>({});
  const [statusLabel, setStatusLabel] = useState("");
  const actionsRef = useRef<Record<number, ActionState>>({});
  actionsRef.current = actions;

  const modeRef = useRef<CoreMode>("idle");
  const busyRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const voiceOnRef = useRef(true);
  const wakeOnRef = useRef(false);
  const lastVoiceRef = useRef(false);
  const weatherRef = useRef<Weather | null>(null);
  const nameRef = useRef(accountName);
  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const voiceRef = useRef<VoiceEngine | null>(null);
  const sendRef = useRef<(t: string, viaVoice?: boolean) => void>(() => {});
  const confirmRef = useRef<(idx: number) => void>(() => {});
  const cancelRef = useRef<(idx: number) => void>(() => {});
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  messagesRef.current = messages;
  currentIdRef.current = currentId;
  voiceOnRef.current = voiceOn;
  wakeOnRef.current = wakeOn;
  weatherRef.current = weather;
  nameRef.current = name;

  const setMode = useCallback((m: CoreMode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? "" : n)), 5000);
  }, []);

  /** After a reply is finished (and spoken): go back to listening/idle. */
  const finishTurn = useCallback(() => {
    if (busyRef.current) return;
    setMode(wakeOnRef.current ? "wake" : "idle");
    voiceRef.current?.resume(lastVoiceRef.current && wakeOnRef.current);
  }, [setMode]);

  /* ---------- engines ---------- */
  useEffect(() => {
    const root = document.documentElement;
    const speaker = new Speaker(
      accessToken,
      (on) => {
        if (on) setMode("speaking");
        else if (modeRef.current === "speaking" || !busyRef.current) finishTurn();
      },
      (level) => root.style.setProperty("--level", level.toFixed(3)),
    );
    speakerRef.current = speaker;

    const voice = new VoiceEngine({
      onState: (s: VoiceState) => {
        if (busyRef.current || modeRef.current === "speaking") return;
        setMode(s === "active" ? "listening" : s === "wake" ? "wake" : "idle");
      },
      onWake: () => {
        addLog("Wake word detected");
        speaker.chime("wake");
        setMode("listening");
      },
      onInterim: (t) => setInterim(t),
      onCommand: (t) => sendRef.current(t, true),
      onError: (m) => {
        setWakeOn(false);
        pref.set("wake", "0");
        flash(m);
      },
    });
    voiceRef.current = voice;

    // Phones only allow audio after a tap: unlock on the first interaction.
    const unlock = () => speaker.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    // Preferences
    const supported = speechInputSupported();
    setWakeSupported(supported);
    const v = pref.get("voice", "1") === "1";
    setVoiceOn(v);
    const w = supported && pref.get("wake", "0") === "1";
    setWakeOn(w);
    if (w) voice.setWake(true);
    if (!nameRef.current) setName(pref.get("name", ""));

    return () => {
      speaker.stop();
      voice.pause();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [finishTurn, flash, setMode]);

  /* ---------- status + latency ---------- */
  useEffect(() => {
    const check = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        const j = await r.json();
        const ms = Math.round(performance.now() - t0);
        setSys({ core: !!j.core, voice: j.voice, memory: j.memory, search: !!j.search, latency: ms });
        setLatencies((l) => [...l.slice(-19), ms]);
      } catch {
        setSys((s) => ({ ...s, core: false, latency: null }));
      }
    };
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, []);

  /* ---------- weather ---------- */
  const loadWeather = useCallback(async (coords?: { lat: number; lon: number }) => {
    addLog("Acquiring weather feed");
    try {
      const q = coords ? `?lat=${coords.lat}&lon=${coords.lon}` : "";
      const r = await fetch(`/api/weather${q}`);
      if (!r.ok) throw new Error();
      const w = await r.json();
      setWeather(w);
      setWxStatus("ready");
      addLog(`Weather synced · ${w.location}`);
    } catch {
      setWxStatus("error");
    }
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPrecise(true);
        loadWeather({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      () => flash("Location access is off, so I'm using Johannesburg."),
      { maximumAge: 15 * 60000, timeout: 10000 },
    );
  }, [flash, loadWeather]);

  useEffect(() => {
    let coords: { lat: number; lon: number } | undefined;
    const boot = async () => {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm?.state === "granted") {
          const p = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { maximumAge: 15 * 60000, timeout: 8000 }),
          );
          coords = { lat: p.coords.latitude, lon: p.coords.longitude };
          setPrecise(true);
        }
      } catch {}
      loadWeather(coords);
    };
    boot();
    const t = setInterval(() => loadWeather(coords), 15 * 60000);
    return () => clearInterval(t);
  }, [loadWeather]);

  /* ---------- returning from a connect screen ---------- */
  useEffect(() => {
    const u = new URL(window.location.href);
    const ok = u.searchParams.get("connected");
    const bad = u.searchParams.get("connect_error");
    if (!ok && !bad) return;
    if (ok) flash(`${CONNECTED_LABEL[ok] || "Account"} connected. Try “Taylor, what's on my calendar today?”`);
    if (bad) flash(`Couldn't connect ${CONNECTED_LABEL[bad] || "that account"}${u.searchParams.get("reason") === "cancelled" ? " (cancelled)" : ""}. Please try again.`);
    window.history.replaceState(null, "", "/");
  }, [flash]);

  /* ---------- history ---------- */
  const refreshList = useCallback(async () => {
    try {
      setConvs(await store.list());
    } catch {
      /* offline */
    }
  }, [store]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode]);

  /* ---------- talking to Taylor ---------- */
  const buildContext = () => {
    const w = weatherRef.current;
    return {
      name: nameRef.current,
      localTime: new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: w?.location,
      weather: w ? summarise(w) : undefined,
      device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "phone" : "computer",
    };
  };

  const send = useCallback(
    async (text: string, viaVoice = false) => {
      const content = text.trim();
      if (!content || busyRef.current) return;

      // A held action is waiting: a short "yes" / "no" answers it.
      const pending = Object.entries(actionsRef.current).find(([, a]) => a.status === "pending");
      if (pending && content.split(/\s+/).length <= 6) {
        const idx = Number(pending[0]);
        if (YES.test(content)) {
          setInput("");
          setInterim("");
          lastVoiceRef.current = viaVoice;
          return confirmRef.current(idx);
        }
        if (NO.test(content)) {
          setInput("");
          setInterim("");
          lastVoiceRef.current = viaVoice;
          return cancelRef.current(idx);
        }
      }

      busyRef.current = true;
      setStatusLabel("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      lastVoiceRef.current = viaVoice;
      const speaker = speakerRef.current!;
      speaker.stop();
      voiceRef.current?.pause();
      setInterim("");
      setInput("");
      setDrawer(null);

      const user: Msg = { role: "user", content };
      const history = [...messagesRef.current, user];
      setMessages([...history, { role: "assistant", content: "" }]);
      setMode("thinking");
      addLog(viaVoice ? "Voice command received" : "Query received");

      let id = currentIdRef.current;
      if (!id) {
        try {
          id = await store.create(titleFrom(content));
          setCurrentId(id);
          currentIdRef.current = id;
        } catch {
          id = null;
        }
      }

      const speak = voiceOnRef.current;
      const chunker = new SentenceChunker();
      if (speak) speaker.begin();
      const ac = new AbortController();
      abortRef.current = ac;

      let reply = "";
      let error = "";
      try {
        const token = await accessToken();
        const res = await fetch("/api/chat", {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ messages: history, context: buildContext() }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => null);
          error = j?.error || GENERIC;
        } else {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              let ev: any;
              try {
                ev = JSON.parse(line);
              } catch {
                continue;
              }
              if (ev.type === "text") {
                reply += ev.text;
                const snap = reply;
                setMessages([...history, { role: "assistant", content: snap }]);
                if (modeRef.current === "searching") setMode("thinking");
                if (speak) chunker.push(ev.text).forEach((c) => speaker.enqueue(c));
              } else if (ev.type === "status") {
                setStatusLabel(ev.label || "");
                if (ev.label) addLog(ev.label);
                if (modeRef.current !== "speaking") setMode(ev.status === "searching" ? "searching" : "thinking");
              } else if (ev.type === "action" && ev.action?.token) {
                const idx = history.length;
                setActions((p) => ({ ...p, [idx]: { ...ev.action, status: "pending" } }));
              } else if (ev.type === "error") {
                error = ev.message || GENERIC;
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") error = GENERIC;
      }

      addLog(error ? "Uplink error" : "Response delivered");
      if (error) {
        reply = reply ? `${reply}\n\n${error}` : error;
        setMessages([...history, { role: "assistant", content: reply }]);
      }
      if (speak && !ac.signal.aborted) chunker.flush().forEach((c) => speaker.enqueue(c));
      abortRef.current = null;
      busyRef.current = false;

      if (id && reply.trim() && !error) {
        store
          .append(id, [user, { role: "assistant", content: reply }])
          .then(refreshList)
          .catch(() => flash("Couldn't save this conversation. Check your connection."));
      }

      if (speak && !ac.signal.aborted) speaker.end();
      else finishTurn();
    },
    [store, setMode, refreshList, flash, finishTurn],
  );
  sendRef.current = send;

  /* ---------- confirm / cancel held actions ---------- */
  const say = useCallback((text: string) => {
    const speaker = speakerRef.current;
    if (voiceOnRef.current && speaker) {
      speaker.begin();
      speaker.enqueue(text);
      speaker.end();
    } else finishTurn();
  }, [finishTurn]);

  const note = useCallback(
    (text: string) => {
      const msg: Msg = { role: "assistant", content: text };
      setMessages((m) => [...m, msg]);
      const id = currentIdRef.current;
      if (id) store.append(id, [msg]).catch(() => {});
    },
    [store],
  );

  const confirmAction = useCallback(
    async (idx: number) => {
      const a = actionsRef.current[idx];
      if (!a || a.status !== "pending") return;
      speakerRef.current?.unlock();
      voiceRef.current?.pause();
      setActions((p) => ({ ...p, [idx]: { ...a, status: "running" } }));
      setMode("thinking");
      setStatusLabel("Working on it");
      try {
        const token = await accessToken();
        const r = await fetch("/api/actions/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ token: a.token }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "That didn't go through.");
        setActions((p) => ({ ...p, [idx]: { ...a, status: "done" } }));
        note(`✓ ${j.message}`);
        say(`Done. ${j.message}`);
      } catch (e: any) {
        setActions((p) => ({ ...p, [idx]: { ...a, status: "error", result: e.message } }));
        note(`⚠ ${e.message}`);
        say(e.message);
      }
    },
    [note, say, setMode],
  );

  const cancelAction = useCallback(
    (idx: number) => {
      const a = actionsRef.current[idx];
      if (!a || a.status !== "pending") return;
      setActions((p) => ({ ...p, [idx]: { ...a, status: "cancelled" } }));
      note("✕ Cancelled. Nothing was sent.");
      say("No problem, I've cancelled that.");
    },
    [note, say],
  );
  confirmRef.current = confirmAction;
  cancelRef.current = cancelAction;

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    speakerRef.current?.stop();
    voiceRef.current?.cancelActive();
    setInterim("");
    if (!busyRef.current) finishTurn();
  }, [finishTurn]);

  const talk = useCallback(() => {
    speakerRef.current?.unlock();
    const m = modeRef.current;
    if (m === "speaking" || m === "thinking" || m === "searching") return stopAll();
    if (m === "listening") {
      voiceRef.current?.cancelActive();
      setInterim("");
      return;
    }
    if (!speechInputSupported()) {
      inputRef.current?.focus();
      return flash("Voice input isn't supported in this browser. Try Chrome, Edge or Safari.");
    }
    speakerRef.current?.chime("wake");
    voiceRef.current?.listenOnce();
    setMode("listening");
  }, [flash, setMode, stopAll]);

  /* ---------- toggles ---------- */
  const toggleVoice = (on = !voiceOn) => {
    speakerRef.current?.unlock();
    setVoiceOn(on);
    pref.set("voice", on ? "1" : "0");
    if (!on) speakerRef.current?.stop();
  };
  const toggleWake = (on = !wakeOn) => {
    speakerRef.current?.unlock();
    setWakeOn(on);
    pref.set("wake", on ? "1" : "0");
    voiceRef.current?.setWake(on);
    if (on) flash("Wake word armed. Say “Taylor”.");
    if (!busyRef.current && modeRef.current !== "speaking") setMode(on ? "wake" : "idle");
  };
  const saveName = (n: string) => {
    setName(n);
    pref.set("name", n);
    sb()?.auth.updateUser({ data: { name: n } }).catch(() => {});
    flash(n ? `Lovely. I'll call you ${n}.` : "Name cleared.");
  };

  /* ---------- conversations ---------- */
  const newChat = () => {
    stopAll();
    setMessages([]);
    setActions({});
    setCurrentId(null);
    setDrawer(null);
  };
  const openChat = async (id: string) => {
    stopAll();
    setDrawer(null);
    try {
      const msgs = await store.load(id);
      setActions({});
      setMessages(msgs);
      setCurrentId(id);
    } catch {
      flash("Couldn't open that conversation.");
    }
  };
  const deleteChat = async (id: string) => {
    try {
      await store.remove(id);
      if (id === currentIdRef.current) {
        setMessages([]);
        setCurrentId(null);
      }
      refreshList();
    } catch {
      flash("Couldn't delete that conversation.");
    }
  };

  const signOut = async () => {
    stopAll();
    await sb()?.auth.signOut();
  };

  /* ---------- render ---------- */
  const home = messages.length === 0;
  const busy = mode === "thinking" || mode === "searching";
  const lastIdx = messages.length - 1;

  return (
    <div className={`app m-${mode}`}>
      <BootSequence />
      <div className="hud-bg" aria-hidden="true">
        <span className="beam b1" />
        <span className="beam b2" />
        <span className="beam b3" />
        <span className="floor" />
        <span className="arc a1" />
        <span className="arc a2" />
      </div>
      {home && (
        <>
          <HudStatus
            rows={[
              ["TRACKING", weather?.location?.toUpperCase() || "LOCATING"],
              ["VOICE", voiceOn ? "ON" : "MUTED", !voiceOn],
              ["WAKE", wakeOn ? "ARMED" : "STANDBY", !wakeOn],
              ["MEMORY", sys.memory === "cloud" ? "SYNCED" : "LOCAL"],
              ["UPLINK", sys.latency != null ? `${sys.latency} MS` : "…"],
            ]}
          />
          <HudClock />
          <HudLog lines={log} />
          <HudMeter />
        </>
      )}

      <nav className="pill" aria-label="Taylor">
        <button type="button" className="pill-brand" onClick={newChat} aria-label="Taylor home">
          <Reactor variant="mini" mode={mode} />
          <span className="pill-name">TAYLOR</span>
          <span className="pill-state" aria-hidden="true">
            {STATUS[mode]}
          </span>
        </button>
        <div className="pill-actions">
          <button type="button" className="pill-btn" onClick={newChat} aria-label="New conversation">
            <I.plus />
            <span className="pill-label">New</span>
          </button>
          <button type="button" className="pill-btn" onClick={() => setDrawer("history")} aria-label="History">
            <I.history />
            <span className="pill-label">History</span>
          </button>
          <span className="pill-sep" aria-hidden="true" />
          <button
            type="button"
            className={`pill-btn ${wakeOn ? "on" : ""}`}
            aria-pressed={wakeOn}
            disabled={!wakeSupported}
            onClick={() => toggleWake()}
            aria-label="“Taylor” wake word"
            title="“Taylor” wake word"
          >
            {wakeOn ? <I.ear /> : <I.earOff />}
          </button>
          <button
            type="button"
            className={`pill-btn ${voiceOn ? "on" : ""}`}
            aria-pressed={voiceOn}
            onClick={() => toggleVoice()}
            aria-label="Spoken replies"
            title="Spoken replies"
          >
            {voiceOn ? <I.speaker /> : <I.mute />}
          </button>
          <button type="button" className="pill-btn" onClick={() => setDrawer("settings")} aria-label="Settings">
            <I.user />
          </button>
        </div>
      </nav>

      <main className="main">
        {home ? (
          <div className="home">
            <div className="modules">
              <WeatherModule weather={weather} status={wxStatus} precise={precise} onLocate={locate} />

              <GlassModule code="M-02" side="center" label="Taylor core" status={STATUS[mode].toUpperCase()} chip={clockChip}>
                <button
                  type="button"
                  className="core-btn"
                  onClick={talk}
                  aria-label={mode === "listening" ? "Stop listening" : mode === "speaking" ? "Stop Taylor" : "Talk to Taylor"}
                >
                  <Reactor variant="big" mode={mode} />
                </button>
                <h1 className="gm-title center">TAYLOR</h1>
                <p className="greet">{greeting(name)}</p>
                <p className="hint" role="status" aria-live="polite">
                  {interim
                    ? `“${interim}”`
                    : wakeOn
                      ? "Say “Taylor”, tap the core, or type below."
                      : wakeSupported
                        ? "Tap the core to talk, or type below."
                        : "Type below to get started."}
                </p>
              </GlassModule>

              <SystemsModule sys={sys} latencies={latencies} wake={wakeOn} wakeSupported={wakeSupported} />
            </div>

            <div className="chips" role="group" aria-label="Quick commands">
              {QUICK.map((q) => (
                <button key={q.label} type="button" className="chip" onClick={() => send(q.prompt)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="log" ref={logRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === "assistant" ? (
                  <>
                    <span className="who">TAYLOR</span>
                    {m.content ? (
                      <div className="md">
                        <Markdown text={m.content} />
                      </div>
                    ) : i === lastIdx && busy ? (
                      <p className="working">
                        {statusLabel || (mode === "searching" ? "Searching the web" : "Thinking")}
                        <span className="dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      </p>
                    ) : null}
                    {i === lastIdx && m.content && busy && statusLabel && <p className="working">{statusLabel}…</p>}
                    {actions[i] && (
                      <ActionCard a={actions[i]} onConfirm={() => confirmAction(i)} onCancel={() => cancelAction(i)} />
                    )}
                  </>
                ) : (
                  m.content
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="dock">
        {!home && (interim || mode === "listening" || mode === "wake") && (
          <div className="transcript" aria-live="polite">
            <span className="tx-label">{mode === "wake" ? "STANDBY" : "LISTENING"}</span>
            <span>{interim || (mode === "wake" ? "Say “Taylor”…" : "Go ahead…")}</span>
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            speakerRef.current?.unlock();
            send(input);
          }}
        >
          <label htmlFor="ask" className="sr-only">
            Message Taylor
          </label>
          <textarea
            id="ask"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Ask Taylor anything…"
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                speakerRef.current?.unlock();
                send(input);
              }
            }}
          />
          {busy || mode === "speaking" ? (
            <button type="button" className="icon-btn stop" onClick={stopAll} aria-label="Stop">
              <I.stop />
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`icon-btn mic ${mode === "listening" ? "on" : ""}`}
                onClick={talk}
                aria-label={mode === "listening" ? "Stop listening" : "Speak to Taylor"}
              >
                <I.mic />
              </button>
              <button type="submit" className="icon-btn send" disabled={!input.trim()} aria-label="Send">
                <I.send />
              </button>
            </>
          )}
        </form>
        <p className="foot">Taylor by Capvtal Innovations · AI can make mistakes</p>
      </div>

      {drawer === "history" && (
        <HistoryPanel
          items={convs}
          currentId={currentId}
          kind={store.kind}
          onOpen={openChat}
          onDelete={deleteChat}
          onNew={newChat}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === "settings" && (
        <SettingsPanel
          name={name}
          email={email}
          accounts={accountsOn}
          voiceOn={voiceOn}
          wakeOn={wakeOn}
          wakeSupported={wakeSupported}
          onName={saveName}
          onVoice={toggleVoice}
          onWake={toggleWake}
          onSignOut={signOut}
          onClose={() => setDrawer(null)}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
