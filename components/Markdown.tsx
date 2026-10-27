import { Fragment, type ReactNode } from "react";

// Small, safe markdown renderer (no HTML injection): paragraphs, lists, headings, code, bold, italics, links.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const s = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (s.startsWith("**")) out.push(<strong key={k}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith("`")) out.push(<code key={k}>{s.slice(1, -1)}</code>);
    else if (s.startsWith("[")) {
      const label = s.slice(1, s.indexOf("]("));
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    } else if (s.startsWith("http")) {
      let host = s;
      try {
        host = new URL(s).hostname.replace(/^www\./, "");
      } catch {}
      out.push(
        <a key={k} href={s} target="_blank" rel="noopener noreferrer">
          {host}
        </a>,
      );
    } else out.push(<em key={k}>{s.slice(1, -1)}</em>);
    last = at + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={b++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      const k = b++;
      blocks.push(
        <ul key={k}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${k}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      const k = b++;
      blocks.push(
        <ol key={k}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${k}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const k = b++;
      blocks.push(
        <p key={k} className="md-h">
          {inline(line.replace(/^#{1,6}\s+/, ""), String(k))}
        </p>,
      );
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("```")
    )
      para.push(lines[i++]);
    const k = b++;
    blocks.push(
      <p key={k}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `${k}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}
