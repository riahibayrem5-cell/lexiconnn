// Language + RTL provider for LEXICON.
// Toggle persists in localStorage. Arabic flips <html dir="rtl"> and swaps
// brand wordmark + chrome strings. AI calls receive `language` so dossiers,
// Oracle answers, and AI covers come back in Arabic too.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type Lang = "en" | "ar";

const KEY = "lexicon-lang";

interface Ctx {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const LangCtx = createContext<Ctx | null>(null);

// Pragmatic dictionary — keys mirror the English string so unknown keys
// gracefully fall back to English. Add freely as more pages get translated.
const AR: Record<string, string> = {
  // Brand
  "LEXICON": "ليكسيكون",
  "EST.": "تأسس",

  // Nav
  "Shelf": "الرف",
  "Recommendations": "التوصيات",
  "Concierge": "العرّاف",
  "Oracle": "العرّاف",
  "Reading Ritual": "طقس القراءة",
  "Quotes Vault": "خزانة الاقتباسات",
  "Book History": "سجل الكتب",
  "Archive": "الأرشيف",
  "Review Desk": "طاولة المراجعة",
  "Settings": "الإعدادات",
  "Admin Panel": "لوحة الإدارة",

  // Common buttons / chrome
  "Generate": "أنشِئ",
  "Generate dossier": "أنشئ الملف",
  "Open dossier": "افتح الملف",
  "Regenerate": "أعد الإنشاء",
  "Extend": "وسّع",
  "Improve details": "حسّن التفاصيل",
  "Delete": "احذف",
  "Save": "احفظ",
  "Cancel": "ألغِ",
  "Search": "ابحث",
  "Loading…": "جارٍ التحميل…",
  "LOADING…": "جارٍ التحميل…",
  "Sign in": "سجّل الدخول",
  "Sign out": "سجّل الخروج",
  "Sign in to sync": "سجّل الدخول للمزامنة",
  "Guest shelf": "رف الضيف",
  "Toggle sidebar": "بدّل الشريط الجانبي",

  // Sidebar/footer copy
  "Edit": "حرّر",

  // Settings page
  "Language": "اللغة",
  "Choose your preferred language. The interface, brand, and AI responses will all switch.": "اختر لغتك المفضلة. ستتغير الواجهة والاسم وردود الذكاء الاصطناعي معًا.",
  "English": "الإنجليزية",
  "Arabic": "العربية",
  "The Workshop": "الورشة",

  // Page headers
  "The Shelf": "الرف",
  "The Oracle": "العرّاف",

  // PDF / dossier UI bits
  "Export PDF": "تصدير PDF",
  "Summary": "ملخّص",
  "Themes": "موضوعات",
  "Main Ideas": "أفكار رئيسية",
  "Characters": "شخصيات",
  "Timeline": "خط زمني",
  "Key Quotes": "اقتباسات مفتاحية",
  "Symbols": "رموز",
  "Lessons": "دروس",
  "Discussion": "نقاش",
  "Criticisms": "انتقادات",
  "If You Liked": "إن أعجبك",
  "Ending": "النهاية",
  "Twists": "منعطفات",
  "Spoilers ahead": "تحذير: حرق أحداث",
  "Reveal": "اكشف",
  "Hide": "أخفِ",

  // Page headers — Shelf
  "The library,": "المكتبة،",
  "in spines": "بالأسلاك",
  "Your collection. Hover a spine for the marrow. Click to enter the dossier.": "مجموعتك. مرّر فوق الكتاب لترى لبّه. انقر لتدخل الملف.",

  // Quotes
  "The Vault": "الخزانة",
  "What you": "ما",
  "refused to forget": "رفضتَ نسيانه",
  "Every line you saved, in one room. Search. Export. Re-read.": "كل سطر حفظته، في غرفة واحدة. ابحث. صدّر. أعد القراءة.",

  // Recommendations
  "Smart Recommendations": "توصيات ذكية",
  "Editions across the": "طبعات عبر",
  "tongues of the world": "ألسنة العالم",
  "Type a book, however roughly. We identify it, then surface the best editions in English, Arabic, French, and German — with ISBN and publisher — plus AI-powered companion tools.": "اكتب اسم كتاب، ولو بتقريب. نتعرّف عليه ثم نُبرز أفضل طبعاته بالإنجليزية والعربية والفرنسية والألمانية — مع الرقم الدولي والناشر — إضافة إلى أدوات مرافقة بالذكاء الاصطناعي.",

  // Review
  "Turn the shelf into": "حوّل الرف إلى",
  "action": "فعل",
  "A productive queue for neglected books, missing notes, and next reading decisions.": "قائمة منتِجة للكتب المهملة والملاحظات الناقصة وقرارات القراءة التالية.",

  // History
  "The Memory Vault": "خزانة الذاكرة",
  "Every dossier you've composed, kept forever. Open a book on your shelf and tap Generate to add it here.": "كل ملف ركّبته، محفوظ إلى الأبد. افتح كتابًا في رفك واضغط «أنشِئ» لإضافته هنا.",

  // Archive
  "The Archive": "الأرشيف",
  "Year of": "سنة",
  "A retrospective. Your reading life with a body.": "استرجاع. حياتك القرائية في جسد واحد.",

  // Ritual
  "The Ritual": "الطقس",
  "An hour,": "ساعة،",
  "at the desk": "على المكتب",
  "Sit. Begin the timer. The page is enough.": "اجلس. ابدأ المؤقت. الصفحة تكفي.",

  // Oracle
  "The Concierge": "العرّاف",
  "Ask,": "اسأل،",
  "earnestly": "بصدق",
  "An AI fluent in your library. Tune voice, lens, model and depth — then converse.": "ذكاء اصطناعي يُجيد مكتبتك. اضبط الصوت والعدسة والنموذج والعمق، ثم حاوِر.",

  // Settings
  "House": "تدبير",
  "keeping": "المنزل",
  "Backup, import, choose a binding for your library.": "نسخ احتياطي، استيراد، واختيار تجليد لمكتبتك.",

  // Admin
  "Edit the": "حرّر",
  "whole website": "الموقع كله",
  "Customize identity, navigation, copy, behavior, recommendations, and visual depth.": "خصّص الهوية والتنقّل والنصوص والسلوك والتوصيات والعمق البصري.",

  // Auth
  "Welcome back": "أهلاً بعودتك",
  "Create your library": "أنشئ مكتبتك",
  "Sign in to your library.": "ادخل إلى مكتبتك.",
  "A reading life, kept with care.": "حياة قرائية، مصانة بعناية.",
  "Email": "البريد الإلكتروني",
  "Password": "كلمة المرور",
  "Display name": "الاسم الظاهر",
  "Sign up": "أنشئ حسابًا",
  "Continue with Google": "تابع مع جوجل",
  "Already have an account?": "هل لديك حساب؟",
  "New here?": "جديد هنا؟",
  "Account created. Welcome to your library.": "تم إنشاء الحساب. أهلاً بك في مكتبتك.",
  "Authentication failed": "فشل التحقق",

  // 404
  "Page not found": "الصفحة غير موجودة",
  "Return to library": "عُد إلى المكتبة",

  // Generic actions / status
  "Saved live": "محفوظ مباشرة",
  "Everything is saved automatically": "كل شيء يُحفظ تلقائيًا",
  "Add book": "أضف كتابًا",
  "Edit book": "حرّر الكتاب",
  "Title": "العنوان",
  "Author": "المؤلف",
  "Year": "السنة",
  "Status": "الحالة",
  "Tags": "الوسوم",
  "Notes": "ملاحظات",
  "Rating": "تقييم",
  "Close": "أغلق",
  "Open": "افتح",
  "Want to read": "أريد قراءته",
  "Reading": "أقرأ",
  "Finished": "أنهيت",
  "Abandoned": "هجرته",
  "Rereading": "أعيد قراءته",
  "Export": "صدّر",
  "Import": "استورد",
};

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) as Lang | null;
    return stored === "ar" || stored === "en" ? stored : "en";
  });

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    html.dataset.lang = lang;
  }, [lang]);

  const value = useMemo<Ctx>(() => ({
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    setLang: (l) => {
      localStorage.setItem(KEY, l);
      setLangState(l);
    },
    t: (key, fallback) => {
      if (lang === "ar") return AR[key] ?? fallback ?? key;
      return fallback ?? key;
    },
  }), [lang]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}

// For non-component code (edge function payloads, lib utils).
export function getCurrentLang(): Lang {
  if (typeof localStorage === "undefined") return "en";
  const stored = localStorage.getItem(KEY);
  return stored === "ar" ? "ar" : "en";
}
