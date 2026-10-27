// House style: Taylor never uses hyphens or dashes in what she writes or says.
// Code blocks, inline code, links, emails, numbers and dates are left untouched.

const PROTECTED = /^(?:https?:\/\/|www\.)|@|[\d]-[\d]|\.[a-z]{2,}\//i;

function cleanWord(w: string) {
  if (!w.includes("-") || PROTECTED.test(w) || /^-?\d/.test(w)) return w;
  // well-known → well known ; co-founder → co founder ; trailing/leading hyphen → removed
  return w.replace(/([A-Za-zÀ-ɏ'’)])-+(?=[A-Za-zÀ-ɏ(])/g, "$1 ").replace(/^-+(?=[A-Za-z])/, "").replace(/(?<=[A-Za-z])-+$/, "");
}

function cleanProse(s: string, atLineStart = true) {
  const bullets = atLineStart ? /^(\s*)[-–—]\s+/gm : /(\n\s*)[-–—]\s+/g;
  return s
    .replace(bullets, "$1• ") // list bullets
    .replace(/\s*[—–]\s*/g, ",") // em/en dashes
    .replace(/\s+-{1,2}(?=\s|$)\s*/g, ",") // spaced hyphen used as a dash
    .replace(/,(?=[^\s\d])/g, ", ")
    .replace(/\S+/g, cleanWord)
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1");
}

/** Clean a complete text (keeps ``` code blocks and `inline code` intact). */
export function noDashes(text: string, atLineStart = true): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : cleanProse(part, i === 0 ? atLineStart : false)))
    .join("");
}

/** Streaming version: feed chunks, get cleaned text back (holds back an unfinished word). */
export class DashFilter {
  private buf = "";
  private inFence = false;
  private lineStart = true;
  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    // Process up to the last whitespace so words aren't split.
    const cut = Math.max(this.buf.lastIndexOf(" "), this.buf.lastIndexOf("\n"));
    if (cut <= 0) return "";
    // Keep the whitespace itself buffered so a dash spanning chunks still sees its spaces.
    const ready = this.buf.slice(0, cut);
    this.buf = this.buf.slice(cut);
    for (const part of ready.split(/(```)/)) {
      if (part === "```") {
        this.inFence = !this.inFence;
        out += part;
      } else out += this.inFence ? part : noDashes(part, this.lineStart);
    }
    if (ready) this.lineStart = false;
    return out;
  }
  flush(): string {
    const rest = this.buf;
    this.buf = "";
    return this.inFence ? rest : noDashes(rest, this.lineStart);
  }
}
