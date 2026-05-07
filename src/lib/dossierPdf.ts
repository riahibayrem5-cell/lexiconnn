// Beautifully-designed PDF export of a book dossier.
// Uses jsPDF directly (no html2canvas) so output is crisp vector text,
// editorial in feel — Penguin/NYRB inspired typography rhythm.
import jsPDF from "jspdf";
import type { BookDossier } from "./dossier";

interface ExportArgs {
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  dossier: BookDossier;
  generatedAt: string;
  extendedAt?: string;
}

const PAGE_W = 595.28; // A4 portrait in pt
const PAGE_H = 841.89;
const M = 56;          // outer margin
const COL_W = PAGE_W - M * 2;

// Editorial palette
const INK = [22, 22, 24] as const;
const MUTED = [110, 110, 118] as const;
const RULE = [180, 170, 150] as const;
const ACCENT = [140, 90, 30] as const; // burnished gold-ish

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportDossierPdf(args: ExportArgs) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = M;

  const setColor = (rgb: readonly [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: readonly [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - M) {
      doc.addPage();
      y = M;
      drawFooter();
    }
  };

  const drawFooter = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    setColor(MUTED);
    doc.text(`${args.title} — ${args.author}`, M, PAGE_H - 28);
    doc.text(`${page}`, PAGE_W - M, PAGE_H - 28, { align: "right" });
    setDraw(RULE);
    doc.setLineWidth(0.4);
    doc.line(M, PAGE_H - 38, PAGE_W - M, PAGE_H - 38);
  };

  const eyebrow = (text: string) => {
    ensureSpace(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setColor(ACCENT);
    doc.text(text.toUpperCase(), M, y, { charSpace: 1.6 });
    y += 14;
  };

  const heading = (text: string, size = 16) => {
    ensureSpace(size + 14);
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    setColor(INK);
    doc.text(text, M, y);
    y += size + 6;
    setDraw(RULE);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 36, y);
    y += 14;
  };

  const paragraph = (text: string, opts: { italic?: boolean; size?: number; color?: readonly [number, number, number] } = {}) => {
    const size = opts.size ?? 10.5;
    doc.setFont("times", opts.italic ? "italic" : "normal");
    doc.setFontSize(size);
    setColor(opts.color ?? INK);
    const lines = doc.splitTextToSize(text, COL_W);
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, M, y);
      y += size + 4;
    }
    y += 4;
  };

  const bullet = (text: string) => {
    const size = 10.5;
    doc.setFont("times", "normal");
    doc.setFontSize(size);
    setColor(INK);
    const lines = doc.splitTextToSize(text, COL_W - 18);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(size + 4);
      if (i === 0) {
        setColor(ACCENT);
        doc.text("◆", M, y);
        setColor(INK);
      }
      doc.text(lines[i], M + 16, y);
      y += size + 4;
    }
    y += 2;
  };

  const blockquote = (text: string, attribution?: string) => {
    const size = 11;
    doc.setFont("times", "italic");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(`“${text}”`, COL_W - 22);
    ensureSpace(lines.length * (size + 4) + 14);
    setDraw(ACCENT);
    doc.setLineWidth(1.2);
    const startY = y - 2;
    for (const line of lines) {
      ensureSpace(size + 4);
      setColor(INK);
      doc.text(line, M + 14, y);
      y += size + 4;
    }
    doc.line(M, startY, M, y - (size - 2));
    if (attribution) {
      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      setColor(MUTED);
      doc.text(`— ${attribution}`, M + 14, y);
      y += 12;
    }
    y += 6;
  };

  const spacer = (h = 10) => { y += h; };

  // ---------- COVER PAGE ----------
  drawFooter();

  // Top hairline
  setDraw(RULE);
  doc.setLineWidth(0.5);
  doc.line(M, M - 20, PAGE_W - M, M - 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setColor(ACCENT);
  doc.text("THE MEMORY VAULT · BOOK DOSSIER", M, M - 8, { charSpace: 1.8 });

  y = M + 60;

  // Cover image
  if (args.coverUrl) {
    const data = await loadImageDataUrl(args.coverUrl);
    if (data) {
      const cw = 160, ch = 240;
      const cx = (PAGE_W - cw) / 2;
      try {
        doc.addImage(data, "JPEG", cx, y, cw, ch, undefined, "FAST");
      } catch {
        try { doc.addImage(data, "PNG", cx, y, cw, ch, undefined, "FAST"); } catch { /* ignore */ }
      }
      // soft shadow
      setDraw([0, 0, 0]);
      doc.setLineWidth(0.3);
      doc.rect(cx, y, cw, ch);
      y += ch + 32;
    }
  }

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  setColor(INK);
  const titleLines = doc.splitTextToSize(args.title, COL_W);
  for (const t of titleLines) {
    doc.text(t, PAGE_W / 2, y, { align: "center" });
    y += 32;
  }

  doc.setFont("times", "italic");
  doc.setFontSize(13);
  setColor(MUTED);
  doc.text(`${args.author}${args.year ? ` · ${args.year}` : ""}`, PAGE_W / 2, y, { align: "center" });
  y += 28;

  if (args.dossier.oneLiner) {
    doc.setFont("times", "italic");
    doc.setFontSize(12);
    setColor(INK);
    const oneLiner = doc.splitTextToSize(`“${args.dossier.oneLiner}”`, COL_W - 60);
    for (const line of oneLiner) {
      doc.text(line, PAGE_W / 2, y, { align: "center" });
      y += 16;
    }
  }

  // Meta strip at bottom of cover
  const metaY = PAGE_H - M - 48;
  setDraw(RULE);
  doc.setLineWidth(0.4);
  doc.line(M, metaY, PAGE_W - M, metaY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(MUTED);
  const meta = [
    args.dossier.genre ? `Genre · ${args.dossier.genre}` : null,
    args.dossier.setting ? `Setting · ${args.dossier.setting}` : null,
    `Composed · ${new Date(args.generatedAt).toLocaleDateString()}`,
    args.extendedAt ? `Extended · ${new Date(args.extendedAt).toLocaleDateString()}` : null,
  ].filter(Boolean) as string[];
  doc.text(meta.join("    ·    "), PAGE_W / 2, metaY + 16, { align: "center", charSpace: 0.6 });

  // ---------- BODY PAGES ----------
  doc.addPage();
  y = M;
  drawFooter();

  const d = args.dossier;

  eyebrow("Summary");
  paragraph(d.summary);
  spacer();

  if (d.themes?.length) {
    heading("Themes");
    for (const t of d.themes) {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      setColor(ACCENT);
      ensureSpace(16);
      doc.text(t.name, M, y);
      y += 14;
      paragraph(t.description, { color: INK });
    }
    spacer();
  }

  if (d.mainIdeas?.length) {
    heading("Ideas to Remember");
    d.mainIdeas.forEach((idea, i) => {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      setColor(INK);
      ensureSpace(20);
      doc.text(`${String(i + 1).padStart(2, "0")} · ${idea.idea}`, M, y);
      y += 14;
      paragraph(idea.explanation);
      paragraph(`Why it matters: ${idea.whyItMatters}`, { italic: true, color: MUTED, size: 9.5 });
    });
    spacer();
  }

  if (d.characters?.length) {
    heading("Characters");
    for (const c of d.characters) {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      setColor(INK);
      ensureSpace(16);
      doc.text(`${c.name}  `, M, y);
      const w = doc.getTextWidth(`${c.name}  `);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setColor(ACCENT);
      doc.text(c.role.toUpperCase(), M + w, y, { charSpace: 1.2 });
      y += 14;
      paragraph(c.description);
      if (c.arc) paragraph(`Arc: ${c.arc}`, { italic: true, color: MUTED, size: 9.5 });
    }
    spacer();
  }

  if (d.keyQuotes?.length) {
    heading("Key Quotes");
    for (const q of d.keyQuotes) blockquote(q.quote, q.context);
    spacer();
  }

  if (d.symbols?.length) {
    heading("Symbols & Motifs");
    for (const s of d.symbols) {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      setColor(INK);
      ensureSpace(16);
      doc.text(s.symbol, M, y);
      y += 14;
      paragraph(s.meaning);
    }
    spacer();
  }

  if (d.lessons?.length) {
    heading("Lessons to Carry");
    for (const l of d.lessons) bullet(l);
    spacer();
  }

  if (d.discussionQuestions?.length) {
    heading("Questions to Sit With");
    for (const q of d.discussionQuestions) paragraph(`— ${q}`, { italic: true, color: MUTED });
    spacer();
  }

  if (d.criticisms?.length) {
    heading("Honest Critique");
    for (const c of d.criticisms) bullet(c);
    spacer();
  }

  if (d.timeline?.length) {
    heading("Plot Timeline");
    for (const b of d.timeline) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      setColor(ACCENT);
      ensureSpace(14);
      doc.text(b.act.toUpperCase(), M, y, { charSpace: 1.4 });
      y += 12;
      paragraph(b.event);
    }
    spacer();
  }

  if (d.twists?.length) {
    heading("Major Twists");
    for (const t of d.twists) bullet(t);
    spacer();
  }

  if (d.ending) {
    heading("The Ending");
    paragraph(d.ending);
    spacer();
  }

  if (d.ifYouLiked?.length) {
    heading("If You Liked This");
    for (const r of d.ifYouLiked) {
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      setColor(INK);
      ensureSpace(16);
      doc.text(`${r.title}`, M, y);
      y += 13;
      doc.setFont("times", "italic");
      doc.setFontSize(9.5);
      setColor(MUTED);
      doc.text(r.author, M, y);
      y += 14;
      paragraph(r.why);
    }
  }

  // Final colophon
  ensureSpace(40);
  spacer(20);
  setDraw(RULE);
  doc.line(M, y, PAGE_W - M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  setColor(MUTED);
  doc.text(
    `LEXICON · Memory Vault · AI-composed dossier · Verify before quoting`,
    PAGE_W / 2,
    y,
    { align: "center", charSpace: 1.2 },
  );

  const filename = `${args.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-dossier.pdf`;
  doc.save(filename);
}
