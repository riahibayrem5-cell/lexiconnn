/**
 * Deterministic, beautiful client-side quote-card renderer.
 * No AI, no edge function — instant and free.
 * Returns a 1080x1080 PNG blob suitable for share/download.
 */

interface QuoteCardInput {
  text: string;
  title: string;
  author: string;
  brand?: string;
}

const PALETTE = {
  bg: "#0E0B07",
  ink: "#E8DFCD",
  gold: "#C9A24A",
  rule: "#3a2f1c",
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderQuoteCard(input: QuoteCardInput): Promise<Blob> {
  const SIZE = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle vignette
  const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.15, SIZE / 2, SIZE / 2, SIZE * 0.7);
  grad.addColorStop(0, "rgba(255,220,160,0.05)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Gold border frame
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, SIZE - 120, SIZE - 120);
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(76, 76, SIZE - 152, SIZE - 152);

  // Quote glyph
  ctx.fillStyle = PALETTE.gold;
  ctx.font = "italic 220px Georgia, serif";
  ctx.globalAlpha = 0.18;
  ctx.fillText("\u201C", 110, 280);
  ctx.globalAlpha = 1;

  // Quote body
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "italic 52px Georgia, serif";
  const maxW = SIZE - 200;
  const text = `\u201C${input.text}\u201D`;
  const lines = wrap(ctx, text, maxW);
  const lineHeight = 70;
  const blockHeight = lines.length * lineHeight;
  const startY = (SIZE - blockHeight) / 2 - 40;

  ctx.textAlign = "left";
  lines.forEach((l, i) => ctx.fillText(l, 100, startY + i * lineHeight));

  // Divider
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 60, SIZE - 240);
  ctx.lineTo(SIZE / 2 + 60, SIZE - 240);
  ctx.stroke();

  // Author + title
  ctx.fillStyle = PALETTE.gold;
  ctx.font = "bold 22px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(input.author.toUpperCase(), SIZE / 2, SIZE - 200);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "26px Georgia, serif";
  ctx.fillText(input.title, SIZE / 2, SIZE - 162);

  // Brand
  ctx.fillStyle = "#8a7a52";
  ctx.font = "16px 'Courier New', monospace";
  ctx.fillText((input.brand || "LEXICON").split("").join(" "), SIZE / 2, SIZE - 100);

  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function quoteToMarkdown(text: string, title: string, author: string, page?: string): string {
  const ref = page ? `${author}, *${title}*, p. ${page}` : `${author}, *${title}*`;
  return `> ${text}\n>\n> — ${ref}\n`;
}
