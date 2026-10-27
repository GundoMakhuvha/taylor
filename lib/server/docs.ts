// Document creation: Taylor writes Markdown, this turns it into a branded Word document
// and returns a private download link (Supabase Storage, 7 days). Server-only.
import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { admin, adminConfigured } from "./admin";

function runs(text: string): TextRun[] {
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if ((m.index ?? 0) > last) out.push(new TextRun(text.slice(last, m.index)));
    const s = m[0];
    out.push(s.startsWith("**") ? new TextRun({ text: s.slice(2, -2), bold: true }) : new TextRun({ text: s.slice(1, -1), italics: true }));
    last = (m.index ?? 0) + s.length;
  }
  if (last < text.length) out.push(new TextRun(text.slice(last)));
  return out;
}

export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][m[1].length - 1];
      children.push(new Paragraph({ children: runs(m[2]), heading: level, spacing: { before: 240, after: 120 } }));
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      children.push(new Paragraph({ children: runs(m[1]), bullet: { level: 0 } }));
    } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      children.push(new Paragraph({ children: [new TextRun(`${m[1]}. `), ...runs(m[2])], indent: { left: 360 } }));
    } else {
      children.push(new Paragraph({ children: runs(line), spacing: { after: 140 } }));
    }
  }
  const doc = new Document({
    creator: "Taylor · Capvtal Innovations",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "CAPVTAL INNOVATIONS", bold: true, color: "0A6F91", size: 18 })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "capvtal.com · Next Generation Innovation", color: "7D9BAD", size: 16 })] })] }) },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function createDocument(uid: string, title: string, markdown: string) {
  if (!adminConfigured()) throw new Error("Document storage isn't set up (SUPABASE_SERVICE_ROLE_KEY)");
  const buf = await markdownToDocx(title, markdown);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";
  const path = `${uid}/${new Date().toISOString().slice(0, 10)}-${slug}-${Math.random().toString(36).slice(2, 7)}.docx`;
  const store = admin().storage.from("documents");
  const { error } = await store.upload(path, buf, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (error) throw error;
  const { data, error: e2 } = await store.createSignedUrl(path, 7 * 86400, { download: `${slug}.docx` });
  if (e2) throw e2;
  return { url: data.signedUrl, file: `${slug}.docx` };
}
