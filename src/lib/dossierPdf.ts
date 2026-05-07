// Beautifully-designed PDF export of a book dossier.
// Uses jsPDF directly (no html2canvas) so output is crisp vector text,
// editorial in feel — Penguin/NYRB inspired typography rhythm.
// Supports Arabic via Noto Naskh font + glyph shaping + bidi reordering.
import jsPDF from "jspdf";
import type { BookDossier } from "./dossier";
import { hasArabic, registerArabicFont, shapeLine } from "./arabicPdf";
import { getCurrentLang, type Lang } from "./i18n";

interface ExportArgs {
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  dossier: BookDossier;
  generatedAt: string;
  extendedAt?: string;
  lang?: Lang;
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

// Localised PDF chrome strings
const STRINGS = {
  en: {
    eyebrow: "THE MEMORY VAULT · BOOK DOSSIER",
    summary: "Summary",
    themes: "Themes",
    ideas: "Ideas to Remember",
    whyItMatters: "Why it matters",
    characters: "Characters",
    quotes: "Key Quotes",
    symbols: "Symbols & Motifs",
    lessons: "Lessons to Carry",
    questions: "Questions to Sit With",
    critique: "Honest Critique",
    timeline: "Plot Timeline",
    twists: "Major Twists",
    ending: "The Ending",
    ifYouLiked: "If You Liked This",
    genre: "Genre",
    setting: "Setting",
    composed: "Composed",
    extended: "Extended",
    arc: "Arc",
    colophon: "LEXICON · Memory Vault · AI-composed dossier · Verify before quoting",
  },
  ar: {
    eyebrow: "خزانة الذاكرة · ملف كتاب",
    summary: "ملخّص",
    themes: "موضوعات",
    ideas: "أفكار للتذكّر",
    whyItMatters: "لماذا يهم",
    characters: "شخصيات",
    quotes: "اقتباسات مفتاحية",
    symbols: "رموز ودلالات",
    lessons: "دروس نحملها",
    questions: "أسئلة للتأمّل",
    critique: "نقد صادق",
    timeline: "خط الأحداث",
    twists: "منعطفات كبرى",
    ending: "النهاية",
    ifYouLiked: "إن أعجبك هذا",
    genre: "النوع",
    setting: "المكان",
    composed: "أُنشئ",
    extended: "مُوسَّع",
    arc: "المسار",
    colophon: "ليكسيكون · خزانة الذاكرة · ملف من إعداد الذكاء الاصطناعي · تحقّق قبل الاقتباس",
  },
} as const;

export async function exportDossierPdf(args: ExportArgs) {
  const lang: Lang = args.lang ?? getCurrentLang();
  const isAr = lang === "ar";
  const S = STRINGS[isAr ? "ar" : "en"];

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Try to register Arabic font; if it fails we'll fall back to times for Arabic
  // (which won't render glyphs correctly — but at least won't crash).
  let arabicReady = false;
  if (isAr || hasArabic(`${args.title} ${args.author} ${args.dossier.summary ?? ""}`)) {
    arabicReady = await registerArabicFont(doc);
  }

  let y = M;

  const setColor = (rgb: readonly [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: readonly [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  // Pick font + render-ready text + alignment depending on whether the
  // string contains Arabic.
  type Style = "serif" | "serif-italic" | "serif-bold" | "sans" | "sans-bold";
  const applyFont = (style: Style, text: string): { renderText: string; align: "left" | "right" | "center" | undefined } => {
    const ar = arabicReady && hasArabic(text);
    if (ar) {
      const weight = style === "serif-bold" || style === "sans-bold" ? "bold" : "normal";
      doc.setFont("NotoNaskh", weight);
      return { renderText: shapeLine(text), align: "right" };
    }
    switch (style) {
      case "serif": doc.setFont("times", "normal"); break;
      case "serif-italic": doc.setFont("times", "italic"); break;
      case "serif-bold": doc.setFont("times", "bold"); break;
      case "sans": doc.setFont("helvetica", "normal"); break;
      case "sans-bold": doc.setFont("helvetica", "bold"); break;
    }
    return { renderText: text, align: undefined };
  };

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - M) {
      doc.addPage();
      y = M;
      drawFooter();
    }
  };

  const drawFooter = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    const left = `${args.title} — ${args.author}`;
    const { renderText: lt, align: la } = applyFont("serif-italic", left);
    doc.setFontSize(8);
    setColor(MUTED);
    if (la === "right") doc.text(lt, PAGE_W - M, PAGE_H - 28, { align: "right" });
    else doc.text(lt, M, PAGE_H - 28);
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    doc.text(`${page}`, la === "right" ? M : PAGE_W - M, PAGE_H - 28, { align: la === "right" ? "left" : "right" });
    setDraw(RULE);
    doc.setLineWidth(0.4);
    doc.line(M, PAGE_H - 38, PAGE_W - M, PAGE_H - 38);
  };

  const eyebrow = (text: string) => {
    ensureSpace(22);
    doc.setFontSize(7.5);
    setColor(ACCENT);
    const useAr = arabicReady && hasArabic(text);
    if (useAr) {
      const { renderText } = applyFont("sans-bold", text);
      doc.text(renderText, PAGE_W - M, y, { align: "right" });
    } else {
      doc.setFont("helvetica", "bold");
      doc.text(text.toUpperCase(), M, y, { charSpace: 1.6 });
    }
    y += 14;
  };

  const heading = (text: string, size = 16) => {
    ensureSpace(size + 14);
    doc.setFontSize(size);
    setColor(INK);
    const { renderText, align } = applyFont("serif-bold", text);
    if (align === "right") doc.text(renderText, PAGE_W - M, y, { align: "right" });
    else doc.text(renderText, M, y);
    y += size + 6;
    setDraw(RULE);
    doc.setLineWidth(0.6);
    if (align === "right") doc.line(PAGE_W - M - 36, y, PAGE_W - M, y);
    else doc.line(M, y, M + 36, y);
    y += 14;
  };

  const paragraph = (text: string, opts: { italic?: boolean; size?: number; color?: readonly [number, number, number]; bold?: boolean } = {}) => {
    const size = opts.size ?? 10.5;
    doc.setFontSize(size);
    setColor(opts.color ?? INK);
    const useAr = arabicReady && hasArabic(text);
    const style: Style = opts.bold ? "serif-bold" : opts.italic ? "serif-italic" : "serif";
    if (useAr) {
      doc.setFont("NotoNaskh", opts.bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, COL_W);
      for (const line of lines) {
        ensureSpace(size + 4);
        doc.text(shapeLine(line), PAGE_W - M, y, { align: "right" });
        y += size + 4;
      }
    } else {
      applyFont(style, text);
      const lines = doc.splitTextToSize(text, COL_W);
      for (const line of lines) {
        ensureSpace(size + 4);
        doc.text(line, M, y);
        y += size + 4;
      }
    }
    y += 4;
  };

  const bullet = (text: string) => {
    const size = 10.5;
    doc.setFontSize(size);
    setColor(INK);
    const useAr = arabicReady && hasArabic(text);
    if (useAr) {
      doc.setFont("NotoNaskh", "normal");
      const lines = doc.splitTextToSize(text, COL_W - 18);
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(size + 4);
        if (i === 0) {
          setColor(ACCENT);
          doc.text("◆", PAGE_W - M, y, { align: "right" });
          setColor(INK);
        }
        doc.text(shapeLine(lines[i]), PAGE_W - M - 16, y, { align: "right" });
        y += size + 4;
      }
    } else {
      doc.setFont("times", "normal");
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
    }
    y += 2;
  };

  const blockquote = (text: string, attribution?: string) => {
    const size = 11;
    const useAr = arabicReady && hasArabic(text);
    const wrapped = useAr ? `«${text}»` : `"${text}"`;
    if (useAr) doc.setFont("NotoNaskh", "normal");
    else doc.setFont("times", "italic");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(wrapped, COL_W - 22);
    ensureSpace(lines.length * (size + 4) + 14);
    setDraw(ACCENT);
    doc.setLineWidth(1.2);
    const startY = y - 2;
    for (const line of lines) {
      ensureSpace(size + 4);
      setColor(INK);
      if (useAr) doc.text(shapeLine(line), PAGE_W - M - 14, y, { align: "right" });
      else doc.text(line, M + 14, y);
      y += size + 4;
    }
    if (useAr) doc.line(PAGE_W - M, startY, PAGE_W - M, y - (size - 2));
    else doc.line(M, startY, M, y - (size - 2));
    if (attribution) {
      const arAttr = arabicReady && hasArabic(attribution);
      if (arAttr) doc.setFont("NotoNaskh", "normal"); else doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      setColor(MUTED);
      const attrText = `— ${attribution}`;
      if (arAttr) doc.text(shapeLine(attrText), PAGE_W - M - 14, y, { align: "right" });
      else doc.text(attrText, M + 14, y);
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

  doc.setFontSize(7.5);
  setColor(ACCENT);
  if (isAr && arabicReady) {
    doc.setFont("NotoNaskh", "bold");
    doc.text(shapeLine(S.eyebrow), PAGE_W - M, M - 8, { align: "right" });
  } else {
    doc.setFont("helvetica", "bold");
    doc.text(S.eyebrow, M, M - 8, { charSpace: 1.8 });
  }

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
      setDraw([0, 0, 0]);
      doc.setLineWidth(0.3);
      doc.rect(cx, y, cw, ch);
      y += ch + 32;
    }
  }

  // Title
  const titleHasAr = arabicReady && hasArabic(args.title);
  if (titleHasAr) doc.setFont("NotoNaskh", "bold");
  else doc.setFont("times", "bold");
  doc.setFontSize(28);
  setColor(INK);
  const titleLines = doc.splitTextToSize(args.title, COL_W);
  for (const t of titleLines) {
    doc.text(titleHasAr ? shapeLine(t) : t, PAGE_W / 2, y, { align: "center" });
    y += 32;
  }

  const authorLine = `${args.author}${args.year ? ` · ${args.year}` : ""}`;
  const authorAr = arabicReady && hasArabic(authorLine);
  if (authorAr) doc.setFont("NotoNaskh", "normal");
  else doc.setFont("times", "italic");
  doc.setFontSize(13);
  setColor(MUTED);
  doc.text(authorAr ? shapeLine(authorLine) : authorLine, PAGE_W / 2, y, { align: "center" });
  y += 28;

  if (args.dossier.oneLiner) {
    const olAr = arabicReady && hasArabic(args.dossier.oneLiner);
    const wrapped = olAr ? `«${args.dossier.oneLiner}»` : `"${args.dossier.oneLiner}"`;
    if (olAr) doc.setFont("NotoNaskh", "normal");
    else doc.setFont("times", "italic");
    doc.setFontSize(12);
    setColor(INK);
    const oneLiner = doc.splitTextToSize(wrapped, COL_W - 60);
    for (const line of oneLiner) {
      doc.text(olAr ? shapeLine(line) : line, PAGE_W / 2, y, { align: "center" });
      y += 16;
    }
  }

  // Meta strip at bottom of cover
  const metaY = PAGE_H - M - 48;
  setDraw(RULE);
  doc.setLineWidth(0.4);
  doc.line(M, metaY, PAGE_W - M, metaY);
  doc.setFontSize(7.5);
  setColor(MUTED);
  const meta = [
    args.dossier.genre ? `${S.genre} · ${args.dossier.genre}` : null,
    args.dossier.setting ? `${S.setting} · ${args.dossier.setting}` : null,
    `${S.composed} · ${new Date(args.generatedAt).toLocaleDateString(isAr ? "ar" : undefined)}`,
    args.extendedAt ? `${S.extended} · ${new Date(args.extendedAt).toLocaleDateString(isAr ? "ar" : undefined)}` : null,
  ].filter(Boolean) as string[];
  const metaJoined = meta.join("    ·    ");
  const metaAr = arabicReady && hasArabic(metaJoined);
  if (metaAr) doc.setFont("NotoNaskh", "normal");
  else doc.setFont("helvetica", "normal");
  doc.text(metaAr ? shapeLine(metaJoined) : metaJoined, PAGE_W / 2, metaY + 16, { align: "center", charSpace: metaAr ? 0 : 0.6 });

  // ---------- BODY PAGES ----------
  doc.addPage();
  y = M;
  drawFooter();

  const d = args.dossier;

  eyebrow(S.summary);
  paragraph(d.summary);
  spacer();

  if (d.themes?.length) {
    heading(S.themes);
    for (const t of d.themes) {
      paragraph(t.name, { bold: true, color: ACCENT, size: 11 });
      paragraph(t.description, { color: INK });
    }
    spacer();
  }

  if (d.mainIdeas?.length) {
    heading(S.ideas);
    d.mainIdeas.forEach((idea, i) => {
      paragraph(`${String(i + 1).padStart(2, "0")} · ${idea.idea}`, { bold: true, size: 11 });
      paragraph(idea.explanation);
      paragraph(`${S.whyItMatters}: ${idea.whyItMatters}`, { italic: true, color: MUTED, size: 9.5 });
    });
    spacer();
  }

  if (d.characters?.length) {
    heading(S.characters);
    for (const c of d.characters) {
      paragraph(`${c.name} — ${c.role}`, { bold: true, size: 11 });
      paragraph(c.description);
      if (c.arc) paragraph(`${S.arc}: ${c.arc}`, { italic: true, color: MUTED, size: 9.5 });
    }
    spacer();
  }

  if (d.keyQuotes?.length) {
    heading(S.quotes);
    for (const q of d.keyQuotes) blockquote(q.quote, q.context);
    spacer();
  }

  if (d.symbols?.length) {
    heading(S.symbols);
    for (const s of d.symbols) {
      paragraph(s.symbol, { bold: true, size: 11 });
      paragraph(s.meaning);
    }
    spacer();
  }

  if (d.lessons?.length) {
    heading(S.lessons);
    for (const l of d.lessons) bullet(l);
    spacer();
  }

  if (d.discussionQuestions?.length) {
    heading(S.questions);
    for (const q of d.discussionQuestions) paragraph(`— ${q}`, { italic: true, color: MUTED });
    spacer();
  }

  if (d.criticisms?.length) {
    heading(S.critique);
    for (const c of d.criticisms) bullet(c);
    spacer();
  }

  if (d.timeline?.length) {
    heading(S.timeline);
    for (const b of d.timeline) {
      paragraph(b.act, { bold: true, color: ACCENT, size: 9 });
      paragraph(b.event);
    }
    spacer();
  }

  if (d.twists?.length) {
    heading(S.twists);
    for (const t of d.twists) bullet(t);
    spacer();
  }

  if (d.ending) {
    heading(S.ending);
    paragraph(d.ending);
    spacer();
  }

  if (d.ifYouLiked?.length) {
    heading(S.ifYouLiked);
    for (const r of d.ifYouLiked) {
      paragraph(r.title, { bold: true, size: 11 });
      paragraph(r.author, { italic: true, color: MUTED, size: 9.5 });
      paragraph(r.why);
    }
  }

  // Final colophon
  ensureSpace(40);
  spacer(20);
  setDraw(RULE);
  doc.line(M, y, PAGE_W - M, y);
  y += 14;
  doc.setFontSize(7);
  setColor(MUTED);
  const colAr = arabicReady && hasArabic(S.colophon);
  if (colAr) doc.setFont("NotoNaskh", "normal");
  else doc.setFont("helvetica", "normal");
  doc.text(colAr ? shapeLine(S.colophon) : S.colophon, PAGE_W / 2, y, { align: "center", charSpace: colAr ? 0 : 1.2 });

  const safe = args.title.replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-").toLowerCase();
  const filename = `${safe || "dossier"}-dossier.pdf`;
  doc.save(filename);
}
