// Arabic shaping + bidi reordering helpers for jsPDF rendering.
// jsPDF can render TTF fonts but does not shape Arabic glyphs nor reorder
// for visual display. We:
//   1) reshape characters into their positional presentation forms
//   2) run the Unicode Bidi Algorithm and reorder each line into visual order
// so jsPDF can place the resulting visually-ordered string left-to-right
// and end up with a correct RTL rendering.
import bidiFactory from "bidi-js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { ArabicShaper } = require("arabic-persian-reshaper") as { ArabicShaper: { convertArabic: (s: string) => string } };

const bidi = bidiFactory();

export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

/** Reshape + bidi-reorder a single line for visual rendering in jsPDF. */
export function shapeLine(line: string): string {
  if (!line) return line;
  const shaped: string = ArabicShaper.convertArabic(line);
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  const segments = bidi.getReorderSegments(shaped, levels);
  let out = shaped;
  for (const [start, end] of segments) {
    const slice = out.slice(start, end + 1);
    const reversed = Array.from(slice).reverse().join("");
    out = out.slice(0, start) + reversed + out.slice(end + 1);
  }
  return out;
}

let fontPromise: Promise<{ regular: string; bold: string } | null> | null = null;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font ${url}`);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

export async function loadArabicFont(): Promise<{ regular: string; bold: string } | null> {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        const [regular, bold] = await Promise.all([
          fetchFontBase64("/fonts/NotoNaskhArabic-Regular.ttf"),
          fetchFontBase64("/fonts/NotoNaskhArabic-Bold.ttf"),
        ]);
        return { regular, bold };
      } catch (e) {
        console.warn("[arabicPdf] font load failed", e);
        return null;
      }
    })();
  }
  return fontPromise;
}

// Register Arabic font on a jsPDF instance. Returns true if registered.
export async function registerArabicFont(doc: any): Promise<boolean> {
  const data = await loadArabicFont();
  if (!data) return false;
  doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", data.regular);
  doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoNaskh", "normal");
  doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", data.bold);
  doc.addFont("NotoNaskhArabic-Bold.ttf", "NotoNaskh", "bold");
  return true;
}
