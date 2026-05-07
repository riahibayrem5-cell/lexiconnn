/// <reference types="vite/client" />

declare module "arabic-persian-reshaper" {
  export const ArabicShaper: { convertArabic: (s: string) => string };
  export const PersianShaper: { convertArabic: (s: string) => string };
  const _default: { ArabicShaper: typeof ArabicShaper; PersianShaper: typeof PersianShaper };
  export default _default;
}

declare module "bidi-js" {
  interface BidiAPI {
    getEmbeddingLevels: (text: string, explicitDirection?: "ltr" | "rtl") => unknown;
    getReorderSegments: (text: string, embeddingLevels: unknown) => Array<[number, number]>;
  }
  const factory: () => BidiAPI;
  export default factory;
}
