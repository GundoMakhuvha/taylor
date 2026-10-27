// Taylor's voice output: speaks replies sentence-by-sentence while they stream in,
// with a premium server voice and the browser's British voice as fallback.

const UK_FEMALE = ["Libby", "Sonia", "Maisie", "Hollie", "Serena", "Kate", "Martha", "Stephanie", "Google UK English Female", "Female"];

export function forSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_#>~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits streaming text into speakable chunks: the first sentence ASAP, then ~2-sentence chunks. */
export class SentenceChunker {
  private buf = "";
  private emitted = 0;
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    // Never split inside a code block.
    if ((this.buf.match(/```/g) || []).length % 2 === 1) return out;
    const re = /[.!?…](?=["')\]]?\s)|\n{1,}/g;
    let cut = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) {
      const end = m.index + m[0].length;
      const piece = this.buf.slice(0, end);
      const min = this.emitted === 0 ? 18 : 140;
      if (piece.trim().length >= min) cut = end;
      if (cut > -1 && this.emitted === 0) break;
    }
    if (cut > -1) {
      out.push(this.buf.slice(0, cut));
      this.buf = this.buf.slice(cut);
      this.emitted++;
    }
    return out;
  }
  flush(): string[] {
    const rest = this.buf;
    this.buf = "";
    return rest.trim() ? [rest] : [];
  }
}

type Item = { text: string; audio: Promise<string | null> }; // audio URL, or null = use browser voice

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export class Speaker {
  private queue: Item[] = [];
  private playing = false;
  private ended = true;
  private gen = 0;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private premium: boolean | null = null; // null = unknown until first try
  private unlocked = false;

  constructor(
    private getToken: () => Promise<string | null>,
    private onSpeaking: (on: boolean) => void,
    private onLevel: (level: number) => void,
  ) {}

  /** Call from a user gesture (tap/click) so phones allow audio later. */
  unlock() {
    if (this.unlocked || typeof window === "undefined") return;
    this.unlocked = true;
    this.audio = new Audio();
    this.audio.setAttribute("playsinline", "true");
    this.audio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    this.audio.play().catch(() => {});
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.ctx.resume().catch(() => {});
        // Route voice through an analyser so the core can pulse with her voice (skipped on iOS for reliability).
        if (!isIOS()) {
          const src = this.ctx.createMediaElementSource(this.audio);
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 512;
          src.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
        }
      }
    } catch {
      this.analyser = null;
    }
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis?.speak(u);
      window.speechSynthesis?.getVoices();
    } catch {}
  }

  /** Short "I'm listening" chime. */
  chime(kind: "wake" | "done" = "wake") {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const notes = kind === "wake" ? [880, 1320] : [1320, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.18);
    });
  }

  begin() {
    this.stop();
    this.ended = false;
  }

  enqueue(raw: string) {
    const text = forSpeech(raw);
    if (!text) return;
    this.queue.push({ text, audio: this.fetchAudio(text) });
    if (!this.playing) this.pump();
  }

  /** No more text is coming for this reply. */
  end() {
    this.ended = true;
    if (!this.playing && !this.queue.length) this.onSpeaking(false);
  }

  stop() {
    this.gen++;
    this.queue = [];
    this.playing = false;
    this.ended = true;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    this.stopMeter();
    this.onSpeaking(false);
  }

  private async fetchAudio(text: string): Promise<string | null> {
    if (this.premium === false) return null;
    try {
      const token = await this.getToken();
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (res.status !== 200) {
        if (res.status === 204) this.premium = false;
        return null;
      }
      this.premium = true;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  private async pump() {
    const gen = this.gen;
    this.playing = true;
    this.onSpeaking(true);
    while (this.queue.length && gen === this.gen) {
      const item = this.queue.shift()!;
      const url = await item.audio;
      if (gen !== this.gen) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url && this.audio) await this.playUrl(url, gen);
      else await this.speakBrowser(item.text, gen);
    }
    if (gen !== this.gen) return;
    this.playing = false;
    this.stopMeter();
    if (this.ended) this.onSpeaking(false);
  }

  private playUrl(url: string, gen: number) {
    return new Promise<void>((resolve) => {
      const a = this.audio!;
      const done = () => {
        URL.revokeObjectURL(url);
        a.onended = a.onerror = null;
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.src = url;
      if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      a.play()
        .then(() => {
          if (gen === this.gen) this.startMeter();
        })
        .catch(done);
    });
  }

  private speakBrowser(text: string, gen: number) {
    return new Promise<void>((resolve) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth || gen !== this.gen) return resolve();
      const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("en-gb"));
      const voice = UK_FEMALE.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) || voices[0];
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = "en-GB";
      u.rate = 1.03;
      u.pitch = 1.05;
      u.onend = u.onerror = () => resolve();
      synth.speak(u);
      this.fakeMeter(gen);
    });
  }

  private startMeter() {
    if (!this.analyser) return this.onLevel(0.6);
    cancelAnimationFrame(this.raf);
    const data = new Uint8Array(this.analyser.fftSize);
    let smooth = 0;
    const tick = () => {
      this.analyser!.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      smooth = smooth * 0.7 + rms * 0.3;
      this.onLevel(smooth);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private fakeMeter(gen: number) {
    cancelAnimationFrame(this.raf);
    const tick = (t: number) => {
      if (gen !== this.gen) return;
      this.onLevel(0.35 + 0.3 * Math.abs(Math.sin(t / 140)) * Math.abs(Math.sin(t / 370)));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopMeter() {
    cancelAnimationFrame(this.raf);
    this.onLevel(0);
  }
}
