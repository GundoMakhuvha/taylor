// Voice input: "Taylor" wake word + push-to-talk, on the browser's speech recognition.

export type VoiceState = "off" | "wake" | "active";

type Handlers = {
  onState: (s: VoiceState) => void;
  onInterim: (text: string) => void;
  onWake: () => void;
  onCommand: (text: string) => void;
  onError: (message: string) => void;
};

// "Taylor, …" at the start of what you say (small fillers like "hey"/"okay"/"um" are fine).
// Anchored to the start so mentioning Taylor mid-sentence doesn't wake her.
const WAKE = /^\s*(?:(?:hey|hi|hello|okay|ok|yo|right|so|um|uh|and)[\s,]+)*(?:taylor|tailor|taylah|tayla|taila|tela|taylors)\b[\s,.!?]*/i;
const STRIP = /^\s*(?:(?:hey|hi|okay|ok)[\s,]+)?(?:taylor|tailor|taylah|tayla)\b[\s,.!?]*/i;
const ACTIVE_MS = 8000; // how long Taylor waits for a command after the wake word
const FOLLOW_UP_MS = 7000; // after she answers, you can reply without the wake word

export const speechInputSupported = () =>
  typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export class VoiceEngine {
  private rec: any = null;
  private wakeEnabled = false;
  private paused = false;
  private state: VoiceState = "off";
  private activeUntil = 0;
  private woke = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private h: Handlers) {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.kill();
        else if (this.wakeEnabled && !this.paused) this.start();
      });
    }
  }

  get supported() {
    return speechInputSupported();
  }

  /** Turn the always-listening "Hey Taylor" mode on or off. */
  setWake(on: boolean) {
    this.wakeEnabled = on;
    if (on) {
      if (!this.paused) {
        if (this.state === "off") this.setState("wake");
        this.start();
      }
    } else if (this.state !== "active") {
      this.kill();
      this.setState("off");
    }
  }

  /** Push-to-talk: capture one command now. */
  listenOnce() {
    this.paused = false;
    this.enterActive(ACTIVE_MS);
    this.start();
  }

  /** Stop listening while Taylor thinks/speaks (so she doesn't hear herself). */
  pause() {
    this.paused = true;
    this.kill();
  }

  /** Resume after Taylor finishes. followUp = allow a reply without the wake word. */
  resume(followUp: boolean) {
    this.paused = false;
    if (followUp && this.wakeEnabled) {
      this.enterActive(FOLLOW_UP_MS);
      this.start();
    } else if (this.wakeEnabled) {
      this.setState("wake");
      this.start();
    } else {
      this.setState("off");
    }
  }

  cancelActive() {
    this.activeUntil = 0;
    this.woke = false;
    if (this.wakeEnabled) this.setState("wake");
    else {
      this.kill();
      this.setState("off");
    }
  }

  private setState(s: VoiceState) {
    if (this.state !== s) {
      this.state = s;
      this.h.onState(s);
    }
  }

  private enterActive(ms: number) {
    this.activeUntil = Date.now() + ms;
    this.setState("active");
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.state === "active" && Date.now() > this.activeUntil) {
          this.h.onInterim("");
          this.cancelActive();
        }
        if (this.state !== "active" && this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }, 400);
    }
  }

  private kill() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const r = this.rec;
    this.rec = null;
    if (r) {
      r.onend = r.onresult = r.onerror = null;
      try {
        r.abort();
      } catch {}
    }
  }

  private start() {
    if (this.rec || !this.supported || this.paused) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-GB";
    rec.interimResults = true;
    rec.continuous = this.wakeEnabled;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text: string = e.results[i][0].transcript || "";
        const final: boolean = e.results[i].isFinal;
        this.handle(text, final);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wakeEnabled = false;
        this.kill();
        this.setState("off");
        this.h.onError("Microphone access is blocked. Allow the mic for this site in your browser settings.");
      }
      // "no-speech", "aborted", "network": the onend handler restarts if needed.
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (this.paused) return;
      if (this.wakeEnabled || (this.state === "active" && Date.now() < this.activeUntil)) {
        this.restartTimer = setTimeout(() => this.start(), 300);
      } else {
        this.h.onInterim("");
        this.setState("off");
      }
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
    }
  }

  private handle(text: string, final: boolean) {
    if (this.state === "active") {
      const cmd = text.replace(STRIP, " ").trim();
      this.activeUntil = Math.max(this.activeUntil, Date.now() + 2500); // still talking: keep the window open
      this.h.onInterim(cmd);
      if (final && cmd.length > 1) this.fire(cmd);
      return;
    }
    if (this.state !== "wake") return;

    const m = WAKE.exec(text);
    if (!m) return;
    const after = text.slice(m.index + m[0].length).trim();
    if (!this.woke) {
      this.woke = true;
      this.h.onWake();
    }
    if (!final) {
      this.h.onInterim(after);
      return;
    }
    this.woke = false;
    if (after.length > 1) this.fire(after);
    else this.enterActive(ACTIVE_MS); // "Hey Taylor" … (pause) … command
  }

  private fire(cmd: string) {
    this.woke = false;
    this.activeUntil = 0;
    this.h.onInterim("");
    this.pause();
    this.h.onCommand(cmd);
  }
}
