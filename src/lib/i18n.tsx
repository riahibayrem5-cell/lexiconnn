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
  "Drop a book here, or change a book's status to": "أفلت كتابًا هنا، أو غيّر حالة كتاب إلى",
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
  "Currently Reading": "أقرأ حاليًا",
  "Import": "استورد",

  // History page
  "Recently composed": "أُنشئت حديثًا",
  "Recently extended": "وُسِّعت حديثًا",
  "By author": "حسب المؤلف",
  "Search your vault…": "ابحث في خزانتك…",
  "Loading your vault…": "جارٍ تحميل خزانتك…",
  "No dossiers match that search.": "لا توجد ملفات تطابق هذا البحث.",
  "No dossiers yet.": "لا توجد ملفات بعد.",
  "Memory Vault": "خزانة الذاكرة",
  "Spoilers on": "كشف الأحداث مفعَّل",
  "Spoilers off": "كشف الأحداث معطَّل",
  "Composing PDF…": "جارٍ تركيب PDF…",
  "PDF exported": "تم تصدير PDF",
  "PDF export failed": "فشل تصدير PDF",
  "Dossier regenerated": "تم إعادة إنشاء الملف",
  "Could not regenerate": "تعذّر إعادة الإنشاء",
  "Dossier extended": "تم توسيع الملف",
  "Dossier missing": "الملف مفقود",
  "It may have been removed. Regenerate to bring it back.": "قد يكون قد حُذف. أعد الإنشاء لاستعادته.",
  "Loading dossier…": "جارٍ تحميل الملف…",
  "Contents": "المحتويات",
  "Essence": "الجوهر",
  "Ideas": "الأفكار",
  "People": "الأشخاص",
  "Quotes": "الاقتباسات",
  // (Lessons key already defined above)
  "Plot": "الحبكة",
  "Ideas to Remember": "أفكار للتذكّر",
  "Why it matters": "لماذا يهم",
  "Lessons to Carry": "دروس نحملها",
  "Questions to sit with": "أسئلة للتأمّل",
  "Honest critique": "نقد صادق",
  "If you liked this": "إن أعجبك هذا",
  "Symbols & motifs": "رموز ودلالات",
  "Major twists": "منعطفات كبرى",
  "The ending": "النهاية",
  "Spoilers hidden — toggle to reveal": "الأحداث مخفيّة — بدّل للكشف",
  "AI-generated, verify before quoting": "محتوى من الذكاء الاصطناعي، تحقّق قبل الاقتباس",
  "extended": "مُوسَّع",
  "One deeper pass": "تمريرة أعمق",
  "Two passes — much richer": "تمريرتان — أغنى بكثير",
  "Three passes — deepest dive": "ثلاث تمريرات — الأعمق",
  "Download a beautifully designed PDF of this dossier": "نزّل ملف PDF أنيقًا لهذا الدوسيه",

  // Shelf
  "Surprise me": "فاجئني",
  "Add Book": "أضف كتابًا",
  "Search title, author, tag…": "ابحث بالعنوان أو المؤلف أو الوسم…",
  "Recently Added": "أُضيفت حديثًا",
  "Time since I thought about this": "منذ آخر مرة فكّرت فيه",
  "All": "الكل",
  "FLAT COVERS": "أغلفة مسطّحة",
  "COMPACT 3D": "ثلاثي الأبعاد مدمج",
  "TRUE-TO-PAGES 3D": "ثلاثي الأبعاد بعدد الصفحات",
  "VOLUMES": "مجلّدات",
  "Library weight": "ثقل المكتبة",
  "volumes catalogued": "مجلّد مفهرس",
  "Lines kept": "سطور محفوظة",
  "saved fragments": "شذرات مخزّنة",
  "Reading time": "وقت القراءة",
  "minutes logged": "دقيقة مسجَّلة",
  "An empty shelf is a kind of patience.": "الرف الفارغ نوع من الصبر.",
  "Add your first volume": "أضف أول مجلّد",
  "No volumes match this arrangement.": "لا توجد مجلّدات تطابق هذا الترتيب.",
  "Clear filters": "امسح المرشّحات",
  "Guest shelf · local": "رف الضيف · محلي",
  "Synced shelf · private": "رف مُزامَن · خاص",

  // Today bar
  "At the desk": "على المكتب",
  "No active read. Set a book to \"Reading\" to begin a session.": "لا قراءة نشطة. اضبط كتابًا على «أقرأ» لبدء جلسة.",
  "today": "اليوم",
  "this week": "هذا الأسبوع",
  "streak": "تتابع",
  "min": "د",
  "Weekly goal": "الهدف الأسبوعي",
  "% read": "% مقروء",
  "Begin a ritual": "ابدأ طقسًا",

  // Quotes
  "Beautiful language": "لغة جميلة",
  "Philosophical bomb": "قنبلة فلسفية",
  "Character truth": "صدق شخصية",
  "Funny": "طريف",
  "Painful": "موجع",
  "I needed this": "احتجت هذا",
  "Search keywords, books, authors…": "ابحث بكلمات أو كتب أو مؤلفين…",
  "QUOTES": "اقتباسات",
  "Card downloaded": "تم تنزيل البطاقة",
  "Could not render card": "تعذّر إنشاء البطاقة",
  "Copied as Markdown": "تم النسخ بصيغة Markdown",
  "Clipboard blocked": "الحافظة محجوبة",
  "No quotes match.": "لا توجد اقتباسات مطابقة.",
  "Copy as Markdown": "نسخ كـ Markdown",
  "Download share card": "تنزيل بطاقة مشاركة",

  // Review
  "Priority queue": "قائمة الأولوية",
  "Add books to build a review queue.": "أضف كتبًا لبناء قائمة المراجعة.",
  "Active reads": "قراءات نشطة",
  "Captured thoughts": "أفكار مُلتقطة",
  "Back to shelf": "عُد إلى الرف",

  // Command palette
  "Search books, quotes, jump anywhere…  (⌘K)": "ابحث في الكتب والاقتباسات، تنقّل أينما شئت… (⌘K)",
  "Nothing found.": "لا شيء.",
  "Pages": "الصفحات",
  "Quick actions": "إجراءات سريعة",
  "Add a book": "أضف كتابًا",
  "Start a reading ritual": "ابدأ طقس قراءة",
  "Books": "الكتب",

  // Recommendations
  "Find editions": "اعثر على الطبعات",
  "Saved recommendations": "توصيات محفوظة",
  "Remove saved search": "احذف البحث المحفوظ",
  "Identifying the book and gathering its editions…": "نتعرّف على الكتاب ونجمع طبعاته…",
  "Identified": "تم التعرّف",
  "confidence": "ثقة",
  "Saved": "محفوظ",
  "Save search": "احفظ البحث",
  "Best edition per language": "أفضل طبعة لكل لغة",
  "No editions surfaced. Try a more specific title.": "لم تظهر طبعات. جرّب عنوانًا أدقّ.",
  "Publisher:": "الناشر:",
  "Pages:": "الصفحات:",
  "Preview": "معاينة",
  "Buy": "اشترِ",
  "Apply to a book": "طبّق على كتاب",
  "AI-powered companion tools": "أدوات مرافقة بالذكاء الاصطناعي",
  "Visit": "زيارة",
  "Saved to your recommendations": "تم الحفظ في توصياتك",
  "Search saved so we can re-apply it later": "تم حفظ البحث لإعادة تطبيقه لاحقًا",
  "Apply edition": "طبّق الطبعة",
  "Choose which Book Brain entry should receive this edition's language, ISBN, cover, and a first-underlined prompt.": "اختر مدخل «دماغ الكتاب» الذي سيستقبل لغة هذه الطبعة ورقمها الدولي وغلافها.",
  "Your shelf is empty. Add a book first, then return here to apply the edition.": "رفّك فارغ. أضف كتابًا أولًا، ثم عُد لتطبيق الطبعة.",

  // AddBookDrawer
  "Acquisition": "اقتناء",
  "Check in a new volume": "سجِّل دخول مجلّد جديد",
  "Search Open Library, then complete the personal record.": "ابحث في Open Library، ثم أكمل السجل الشخصي.",
  "Title, author, or ISBN…": "عنوان أو مؤلف أو ISBN…",
  "No results — try different spelling.": "لا نتائج — جرّب تهجئة أخرى.",
  "Want to Read": "أريد قراءته",
  "Re-reading": "أعيد قراءته",
  "Physical": "ورقي",
  "Ebook": "إلكتروني",
  "Audiobook": "مسموع",
  "Dual": "مزدوج",
  "Format": "الصيغة",
  "Copies to add": "النسخ المراد إضافتها",
  "Page count · spine thickness": "عدد الصفحات · سماكة الكعب",
  "Drag the slider to feel the weight of this volume on your shelf.": "اسحب الشريط لتحسّ بثقل المجلّد على رفّك.",
  "Generate a custom 2D spine artwork that matches this cover": "أنشئ كعبًا فنيًا ثنائي الأبعاد يطابق هذا الغلاف",
  "How I found this book": "كيف عثرت على هذا الكتاب",
  "A friend, a footnote, a 3am rabbit hole…": "صديق، حاشية، شغف منتصف الليل…",
  "(comma-separated)": "(مفصولة بفواصل)",
  "Spine binding": "تجليد الكعب",
  "Color": "اللون",
  "Texture": "الخامة",
  "Foil": "نقش",
  "Leather": "جلد",
  "Cloth": "قماش",
  "Paper": "ورق",
  "Gold": "ذهبي",
  "Silver": "فضي",
  "None": "بلا",
  "Check In": "سجّل الدخول",
  "Upload": "ارفع",
  "Retry search": "أعد البحث",
  "AI cover": "غلاف بالذكاء",
  "Search again": "ابحث مجددًا",
  "AI checking metadata…": "الذكاء يتحقق من البيانات…",
  "Page count unknown": "عدد الصفحات مجهول",
  "No verified cover · shelf spine fallback": "لا غلاف موثّق · سيُستخدم كعب الرف",
  "Custom cover uploaded": "تم رفع الغلاف المخصص",
  "Upload failed": "فشل الرفع",
  "Cover found": "تم العثور على الغلاف",
  "Still no real cover — try uploading one": "لا يوجد غلاف فعلي بعد — جرّب رفع غلاف",
  "Pick a book from the search first": "اختر كتابًا من البحث أولًا",

  // Oracle
  "Conversation": "محادثة",
  "Reset": "إعادة",
  "Begin where you like — a book, a mood, an argument.": "ابدأ كما تشاء — بكتاب أو مزاج أو حُجّة.",
  "What pattern do you see across my favorites?": "أيّ نمط ترى عبر مفضّلاتي؟",
  "Why did I abandon what I abandoned?": "لمَ هجرتُ ما هجرته؟",
  "Give me one book to break a slump.": "أعطني كتابًا واحدًا يكسر الركود.",
  "Argue with my taste.": "جادل ذائقتي.",
  "Ask the Oracle…": "اسأل العرّاف…",
  "Voice · Lens · Model · Depth": "صوت · عدسة · نموذج · عمق",
  "Voice": "الصوت",
  "Lens": "العدسة",
  "Model": "النموذج",
  "Reasoning depth": "عمق الاستدلال",
  "Mood": "المزاج",
  "Time": "الوقت",
  "Kind": "النوع",
  "Theme": "موضوع",
  "Book A": "الكتاب أ",
  "Book B": "الكتاب ب",
  "Pick two books": "اختر كتابين",
  "Consult the Oracle": "استشر العرّاف",
  "Response": "الرد",
  "Chat": "محادثة",
  "What Next": "ماذا بعد",
  "Thematic Threads": "خيوط موضوعية",
  "Author Universe": "كون المؤلف",
  "Book vs Book": "كتاب مقابل كتاب",
  "Fiction": "خيال",
  "Non-fiction": "غير خيالي",
  "Either": "أيّهما",
  "Free conversation with full library context.": "محادثة حرة بسياق المكتبة كاملةً.",
  "A recommendation rooted in your history.": "توصية متجذّرة في تاريخك.",
  "Patterns across your reading.": "أنماط عبر قراءتك.",
  "Influences, lineages, reading paths.": "التأثيرات والأنساب ومسارات القراءة.",
  "Two volumes in parallel dossier.": "مجلّدان في ملف متوازٍ.",
  "Librarian agent": "وكيل المكتبة",
  "Search or add a book…": "ابحث أو أضف كتابًا…",
  "Confirm add": "أكّد الإضافة",
  "Agent failed": "فشل الوكيل",
  "Oracle silent": "العرّاف صامت",
  "The Oracle is silent.": "العرّاف صامت.",
  "Rate limit reached. Try again in a moment.": "تم بلوغ الحد. حاول بعد لحظات.",
  "AI credits exhausted. Add credits in Settings → Workspace → Usage.": "نفدت رصيد الذكاء. أضف رصيدًا من الإعدادات.",
  "Dry editor": "محرّر صارم",
  "Warm mentor": "مرشد دافئ",
  "Brutalist critic": "ناقد قاسٍ",
  "Polymath scholar": "عالم موسوعي",
  "Poet": "شاعر",
  "Literary craft": "حرفة أدبية",
  "Philosophical": "فلسفي",
  "Emotional truth": "صدق عاطفي",
  "Historical & cultural": "تاريخي وثقافي",
  "Immersive": "غامر",
  "Flash": "خاطف",
  "Pro": "محترف",
  "GPT-5": "GPT-5",
  "GPT-5 mini": "GPT-5 صغير",
  "Quick": "سريع",
  "Light": "خفيف",
  "Balanced": "متوازن",
  "Deep": "عميق",
  "Sprint (a weekend)": "اندفاعة (عطلة)",
  "Season (a month or more)": "موسم (شهر أو أكثر)",

  // Edition picker
  "Choose an edition": "اختر طبعة",
  "Best match is pre-selected using ISBN, title and author scoring. Press Apply best, or pick another.": "أفضل تطابق محدَّد مسبقًا اعتمادًا على ISBN والعنوان والمؤلف. اضغط «طبّق الأفضل» أو اختر غيرها.",
  "Apply best": "طبّق الأفضل",
  "Apply": "طبّق",
  "Best": "الأفضل",
  "match": "تطابق",
  "Choose edition": "اختر طبعة",
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
