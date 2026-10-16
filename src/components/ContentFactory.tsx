import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Sparkles as Spark,
  Trash2,
  Wand2,
  Send,
  Calendar,
  LayoutTemplate,
  Zap,
  Image as ImageIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { z } from "zod";
import { unlockOwnerSession, usePosts, type Platform, type Post } from "@/lib/posts";
import { BrandedPosterStudio } from "./BrandedPosterStudio";

type Lang = "ar" | "en";
type Plan = "instant" | "daily" | "3days" | "week";
export type PostTemplate = "drill" | "carousel" | "transformation" | "branch_promo" | "quiz";

interface EnhancedPost extends Post {
  templateType?: PostTemplate;
  publishedExternalId?: string;
  publishedExternalUrl?: string;
}

const AiResponseSchema = z.object({
  posts: z
    .array(
      z.object({
        platform: z.enum(["facebook", "instagram", "tiktok"]),
        templateType: z
          .enum(["drill", "carousel", "transformation", "branch_promo", "quiz"])
          .optional(),
        caption: z.string().min(1),
        visual: z.string().optional(),
      }),
    )
    .min(1),
});

function parseAiResponse(text: string) {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("Invalid AI response");
  return AiResponseSchema.parse(JSON.parse(text.slice(jsonStart, jsonEnd + 1)));
}

const TEMPLATE_INFO: Record<
  PostTemplate,
  { labelAr: string; labelEn: string; ratio: string; canvaType: string }
> = {
  drill: {
    labelAr: "ريلز تكتيك وتصحيح تكنيك (9:16)",
    labelEn: "Technique Drill (9:16 Reel)",
    ratio: "9:16",
    canvaType: "Instagram Reel / TikTok Video",
  },
  carousel: {
    labelAr: "إنفوجرافيك خطوات تعليمية (4:5)",
    labelEn: "Educational Carousel (4:5)",
    ratio: "4:5",
    canvaType: "Instagram Carousel",
  },
  transformation: {
    labelAr: "قصة نجاح وعلاج رهبة الماء (4:5)",
    labelEn: "Transformation Story (4:5)",
    ratio: "4:5",
    canvaType: "Instagram Post",
  },
  branch_promo: {
    labelAr: "عرض باقات فروع أبوظبي (1:1)",
    labelEn: "Abu Dhabi Branches Promo (1:1)",
    ratio: "1:1",
    canvaType: "Square Social Post",
  },
  quiz: {
    labelAr: "سؤال وتحدي تفاعلي للجمهور (9:16)",
    labelEn: "Interactive Quiz / Poll (9:16)",
    ratio: "9:16",
    canvaType: "Story / Reel",
  },
};

const L = {
  ar: {
    title: "مصنع المحتوى الذكي",
    plan: "مدة الخطة",
    plans: {
      instant: "فوري (منشور واحد)",
      daily: "خطة اليوم",
      "3days": "3 أيام متنوعة",
      week: "أسبوع كامل (7 قوالب)",
    },
    platforms: "المنصات المستهدفة",
    topic: "فكرة أو موضوع مخصص (اختياري)",
    topicPh: "مثال: تصحيح النفس في السباحة الحرة، أو عروض فرع مدينة خليفة والمشرف",
    generate: "توليد محتوى متنوع بكوتش براين",
    generating: "كوتش براين يصيغ المحتوى…",
    manual: "إضافة منشور يدوي",
    review: "بانتظار المراجعة والاعتماد",
    scheduled: "خطة محلية بموعد مقترح",
    published: "منشورة ومؤكدة",
    empty: "لا منشورات في هذه القائمة بعد.",
    approve: "اعتماد الخطة محلياً",
    publishNow: "نشر فوري معتمد",
    publishing: "جارٍ النشر…",
    edit: "تعديل",
    save: "حفظ",
    cancel: "إلغاء",
    del: "حذف",
    when: "الموعد المقترح",
    markPub: "تأكيد النشر",
    backReview: "إرجاع للمراجعة",
    copy: "نسخ النص",
    copied: "تم النسخ",
    canva: "فتح قالب Canva",
    copyBrief: "نسخ موجز التصميم",
    briefCopied: "تم نسخ الموجز!",
    gemini: "صمّم في Google Gemini",
    caption: "نص المنشور والخطاف",
    visual: "موجز التصميم وهوية القالب",
    templateLabel: "نوع القالب والتصميم:",
    guard:
      "حماية الأكاديمية: لا يتم النشر أو سحب رصيد تلقائياً. الخطط والمنشورات تُحفظ في التخزين السحابي عند فتح جلسة المالك (وإلا على هذا الجهاز)؛ لا تُجدول أو تُنشر على المنصات إلا بعد ربط الحسابات وموافقتك اليدوية.",
    err: "تعذر التوليد",
    needWhen: "حدد موعد وتاريخ النشر أولاً",
    fbPage: "صفحة فيسبوك: 1164107840123575",
    igAccount: "إنستغرام: 17841439747493221",
  },
  en: {
    title: "Smart Content Factory",
    plan: "Plan Duration",
    plans: {
      instant: "Instant (1 post)",
      daily: "Today's Plan",
      "3days": "3 Varied Days",
      week: "Full Week (7 distinct styles)",
    },
    platforms: "Platforms",
    topic: "Custom Topic / Focus (optional)",
    topicPh: "e.g. Freestyle breathing drill or Khalifa City branch special",
    generate: "Generate Varied Content with AI",
    generating: "Coach Brain is crafting content…",
    manual: "Add Manual Post",
    review: "Awaiting Review",
    scheduled: "Local plan (suggested time)",
    published: "Published & Verified",
    empty: "No posts in this stage yet.",
    approve: "Approve local plan",
    publishNow: "Publish Now",
    publishing: "Publishing…",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    del: "Delete",
    when: "Suggested publish time",
    markPub: "Mark Published",
    backReview: "Back to Review",
    copy: "Copy Text",
    copied: "Copied",
    canva: "Open Canva Template",
    copyBrief: "Copy Design Brief",
    briefCopied: "Brief Copied!",
    gemini: "Design in Gemini",
    caption: "Caption & Hook",
    visual: "Visual Style & Brief",
    templateLabel: "Template Style:",
    guard:
      "Academy Protection: No automatic publishing or ad spend. Plans and posts sync to cloud storage once the owner session is unlocked (otherwise this device only); they are not scheduled on social platforms unless accounts are connected and you manually approve.",
    err: "Generation failed",
    needWhen: "Select publish time first",
    fbPage: "Facebook Page: 1164107840123575",
    igAccount: "Instagram: 17841439747493221",
  },
};

const PLAT: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok 9:16",
};
const COUNT: Record<Plan, number> = { instant: 1, daily: 1, "3days": 3, week: 7 };
const uid = () => Math.random().toString(36).slice(2, 10);

export function ContentFactory({
  lang,
  log,
}: {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}) {
  const t = L[lang];
  const { posts, save, sync } = usePosts();
  const unlockSync = async () => {
    const pin =
      window.prompt(
        lang === "ar" ? "أدخل رمز المالك لتفعيل المزامنة" : "Enter owner PIN to enable sync",
      ) || "";
    if (!pin) return;
    const r = await unlockOwnerSession(pin);
    log(
      r.ok
        ? lang === "ar"
          ? "تم تفعيل المزامنة السحابية"
          : "Cloud sync unlocked"
        : lang === "ar"
          ? "تعذّر فتح جلسة المالك"
          : `Owner unlock failed (${r.error})`,
      r.ok ? "ok" : "err",
    );
  };
  const [plan, setPlan] = useState<Plan>("3days");
  const [plats, setPlats] = useState<Platform[]>(["instagram", "facebook"]);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const enhancedPosts = posts as EnhancedPost[];

  const update = (id: string, patch: Partial<EnhancedPost>) =>
    save(enhancedPosts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function generate() {
    if (!plats.length || busy) return;
    setBusy(true);
    const n = COUNT[plan];
    const prompt = `Create ${n} social media post(s) for Coach Ayman Swimming Academy in Abu Dhabi.
Requested post count: ${n}
Target Platforms: ${plats.map((p) => PLAT[p]).join(", ")}.
Topic Focus: ${topic || "Mix of technique correction, fear of water progressive therapy, and Abu Dhabi pool branches"}.
Language: ${lang === "ar" ? "Gulf-friendly professional Arabic" : "English"}.
Official Booking WhatsApp: 058 821 9130.
Pool branches: Al Mushrif, Al Falah, Khalifa City, Al Danah.
STRICT MARKETING RULE: DO NOT put numerical prices (AED) in the public social post captions or visuals! Focus on technique, overcoming water fear, and invite people to inquire via WhatsApp: 058 821 9130. Prices are reserved for qualified leads in private chat. Never invent customer testimonials, results, schedules, limited availability, or facility/safety claims. If TikTok is selected, every TikTok post must use a vertical 9:16 drill or quiz format.

CRITICAL INSTRUCTION: DO NOT use the same visual format or template for all posts! Vary the template style across:
1) "drill" (9:16 vertical video reel with 3s hook)
2) "carousel" (4:5 step-by-step technique breakdown)
3) "transformation" (story of overcoming aquaphobia)
4) "branch_promo" (pricing & branch availability)
5) "quiz" (interactive question to engage comments)

Return ONLY valid JSON, no markdown fences, matching this structure:
{"posts":[{"platform":"facebook"|"instagram"|"tiktok","templateType":"drill"|"carousel"|"transformation"|"branch_promo"|"quiz","caption":"...","visual":"detailed Canva brief with dimensions, headline, colors (Navy & Cyan)"}]}`;

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const txt = await res.text();
      const json = parseAiResponse(txt);

      const templateKeys: PostTemplate[] = [
        "drill",
        "carousel",
        "transformation",
        "branch_promo",
        "quiz",
      ];

      const items: EnhancedPost[] = json.posts
        .filter((p) => plats.includes(p.platform))
        .slice(0, n)
        .map((p, index) => ({
          id: uid(),
          platform: p.platform as Platform,
          templateType:
            p.platform === "tiktok"
              ? p.templateType === "quiz"
                ? "quiz"
                : "drill"
              : p.templateType && templateKeys.includes(p.templateType as PostTemplate)
                ? (p.templateType as PostTemplate)
                : templateKeys[index % templateKeys.length]!,
          caption: p.caption || "",
          visual: p.visual || "",
          status: "Needs Review",
          createdAt: new Date().toISOString(),
        }));

      if (!items.length) throw new Error("empty response");
      save([...items, ...enhancedPosts]);
      log(`${items.length} ${t.review}`, "ok");
    } catch (e) {
      log(`${t.err}: ${(e as Error).message}`, "err");
    } finally {
      setBusy(false);
    }
  }

  async function generateAutoPilotWeek() {
    if (!plats.length || busy) return;
    setBusy(true);
    log(
      lang === "ar"
        ? "جارٍ إعداد مسودة خطة محتوى لسبعة أيام للمراجعة اليدوية…"
        : "Preparing a seven-day content plan for manual review…",
      "info",
    );

    const prompt = `Create a full 7-day social media publishing schedule for Coach Ayman Swimming Academy in Abu Dhabi.
Requested post count: 7
Target Platforms: ${plats.map((p) => PLAT[p]).join(", ")}.
Official Booking WhatsApp: 058 821 9130.
Pool branches: Al Mushrif, Al Falah, Khalifa City, Al Danah.
STRICT MARKETING RULE: DO NOT include numerical prices (AED) in the public captions or visuals! Invite people to inquire via WhatsApp 058 821 9130. Never invent customer testimonials, results, schedules, limited availability, or facility/safety claims. If TikTok is selected, every TikTok post must use a vertical 9:16 drill or quiz format.

CRITICAL: Return exactly 7 varied posts across all 5 styles:
1) drill (9:16 vertical video reel with 3s hook)
2) carousel (4:5 step-by-step technique breakdown)
3) transformation (story of overcoming fear of water)
4) branch_promo (Abu Dhabi pool branches & package special)
5) quiz (interactive question to engage comments)
6) carousel (swimming safety & breathing drill)
7) drill (weekend assessment invitation)

Return ONLY valid JSON matching this structure:
{"posts":[{"platform":"facebook"|"instagram","templateType":"drill"|"carousel"|"transformation"|"branch_promo"|"quiz","caption":"...","visual":"Canva/Gemini design brief"}]}`;

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const txt = await res.text();
      const json = parseAiResponse(txt);

      const templateKeys: PostTemplate[] = [
        "drill",
        "carousel",
        "transformation",
        "branch_promo",
        "quiz",
        "carousel",
        "drill",
      ];
      const now = Date.now();

      const items: EnhancedPost[] = json.posts.slice(0, 7).map((p, index: number) => {
        const scheduledDate = new Date(now + (index + 1) * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16);
        const platform = plats.includes(p.platform)
          ? p.platform
          : plats[index % plats.length] || "instagram";
        return {
          id: uid(),
          platform,
          templateType:
            platform === "tiktok"
              ? p.templateType === "quiz"
                ? "quiz"
                : "drill"
              : p.templateType
                ? p.templateType
                : templateKeys[index % templateKeys.length]!,
          caption: p.caption || "",
          visual: p.visual || "",
          status: "Needs Review" as const,
          scheduledAt: scheduledDate,
          createdAt: new Date().toISOString(),
        };
      });

      if (!items.length) throw new Error("empty response");
      save([...items, ...enhancedPosts]);
      log(
        lang === "ar"
          ? `تم إعداد خطة أولية من ${items.length} منشورات؛ راجعها واعتمد كل منشور قبل النشر.`
          : `Prepared ${items.length} draft posts. Review and approve each before publishing.`,
        "ok",
      );
    } catch (e) {
      log(`${t.err}: ${(e as Error).message}`, "err");
    } finally {
      setBusy(false);
    }
  }

  const addManual = () =>
    save([
      {
        id: uid(),
        platform: plats[0] || "instagram",
        templateType: "drill",
        caption: "",
        visual: "",
        status: "Needs Review",
        createdAt: new Date().toISOString(),
      },
      ...enhancedPosts,
    ]);

  const groups: { key: string; title: string; items: EnhancedPost[] }[] = [
    { key: "r", title: t.review, items: enhancedPosts.filter((p) => p.status === "Needs Review") },
    {
      key: "s",
      title: t.scheduled,
      items: enhancedPosts
        .filter((p) => p.status === "Scheduled" || p.status === "Claimed")
        .sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || "")),
    },
    { key: "p", title: t.published, items: enhancedPosts.filter((p) => p.status === "Published") },
  ];

  return (
    <div className="space-y-4">
      {/* Factory Controls */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm tracking-wider text-primary">{t.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-secondary px-2 py-0.5 font-mono">{t.fbPage}</span>
            <span className="rounded bg-secondary px-2 py-0.5 font-mono">{t.igAccount}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.plan}</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(t.plans) as Plan[]).map((k) => (
              <button
                key={k}
                onClick={() => setPlan(k)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  plan === k
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.plans[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.platforms}</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLAT) as Platform[]).map((p) => {
              const on = plats.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => setPlats(on ? plats.filter((x) => x !== p) : [...plats, p])}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                    on
                      ? "border-accent text-accent font-medium"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {on && <Check className="size-3.5" />}
                  {PLAT[p]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.topic}</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t.topicPh}
            className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateAutoPilotWeek}
            disabled={busy || !plats.length}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
          >
            <Zap className={`size-4 ${busy ? "animate-spin" : ""}`} />
            {lang === "ar" ? "إعداد خطة محتوى لأسبوع للمراجعة" : "Prepare a 7-day content draft"}
          </button>
          <button
            onClick={generate}
            disabled={busy || !plats.length}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 shadow-sm"
          >
            <Wand2 className={`size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? t.generating : t.generate}
          </button>
          <button
            onClick={addManual}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            {t.manual}
          </button>
        </div>

        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning leading-relaxed">
          {t.guard}
        </p>
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <span>
            {sync === "cloud"
              ? lang === "ar"
                ? "المنشورات متزامنة مع التخزين السحابي"
                : "Posts synced to cloud storage"
              : sync === "memory"
                ? lang === "ar"
                  ? "الخادم بدون تخزين دائم — المنشورات محفوظة على هذا الجهاز"
                  : "Server has no durable storage — posts kept on this device"
                : sync === "locked"
                  ? lang === "ar"
                    ? "المزامنة مقفلة — المنشورات محفوظة على هذا الجهاز"
                    : "Sync locked — posts kept on this device"
                  : sync === "error"
                    ? lang === "ar"
                      ? "تعذّر الاتصال بالخادم — المنشورات محفوظة على هذا الجهاز"
                      : "Server unreachable — posts kept on this device"
                    : lang === "ar"
                      ? "جارٍ المزامنة…"
                      : "Syncing…"}
          </span>
          {sync === "locked" && (
            <button
              type="button"
              onClick={unlockSync}
              className="rounded border border-primary/40 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
            >
              {lang === "ar" ? "تفعيل المزامنة" : "Unlock sync"}
            </button>
          )}
        </div>
      </section>

      {/* Posts Groups */}
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            {g.title}
            <span className="font-mono text-foreground font-semibold">({g.items.length})</span>
          </h3>
          {g.items.length === 0 ? (
            <p className="glass p-4 text-xs text-muted-foreground">{t.empty}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((p) => (
                <EnhancedPostCard
                  key={p.id}
                  p={p}
                  t={t}
                  lang={lang}
                  update={update}
                  remove={() => save(enhancedPosts.filter((x) => x.id !== p.id))}
                  log={log}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function EnhancedPostCard({
  p,
  t,
  lang,
  update,
  remove,
  log,
}: {
  p: EnhancedPost;
  t: (typeof L)[Lang];
  lang: Lang;
  update: (id: string, patch: Partial<EnhancedPost>) => void;
  remove: () => void;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}) {
  const isAr = lang === "ar";
  const [editing, setEditing] = useState(!p.caption);
  const [caption, setCaption] = useState(p.caption);
  const [visual, setVisual] = useState(p.visual);
  const [platform, setPlatform] = useState<Platform>(p.platform);
  const [templateType, setTemplateType] = useState<PostTemplate>(p.templateType || "drill");
  const [when, setWhen] = useState(p.scheduledAt || "");
  const [copied, setCopied] = useState(false);
  const [showStudio, setShowStudio] = useState(true);
  const [verifyingPublish, setVerifyingPublish] = useState(false);
  const [customLiveUrl, setCustomLiveUrl] = useState(p.publishedExternalUrl || "");

  const templateMeta = TEMPLATE_INFO[templateType] || TEMPLATE_INFO.drill;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    log(isAr ? "تم نسخ نص المنشور والهاشتاجات!" : "Caption copied!", "ok");
  };

  const getPlatformDefaultUrl = (plat: Platform) => {
    switch (plat) {
      case "instagram":
        return "https://www.instagram.com/RelaxFixUAE";
      case "facebook":
        return "https://www.facebook.com/1164107840123575";
      case "tiktok":
        return "https://www.tiktok.com/@RelaxFixUAE";
    }
  };

  const handleLaunchPublishBridge = async () => {
    // 1. Copy caption + hashtags
    await navigator.clipboard.writeText(p.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    // 2. Open destination composer
    let composerUrl = "";
    if (p.platform === "instagram") {
      composerUrl = "https://business.facebook.com/latest/composer?context=instagram";
    } else if (p.platform === "facebook") {
      composerUrl = "https://www.facebook.com/1164107840123575";
    } else {
      composerUrl = "https://www.tiktok.com/creator-center/upload";
    }

    window.open(composerUrl, "_blank", "noopener");
    setVerifyingPublish(true);

    log(
      isAr
        ? `📋 تم نسخ النص والهاشتاجات وجارٍ فتح صفحة ${PLAT[p.platform]} للنشر المباشر!`
        : `Copied caption & opened ${PLAT[p.platform]} composer!`,
      "info",
    );
  };

  const [imageUrl, setImageUrl] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const handleMetaPublish = async () => {
    if (p.platform === "tiktok") return;
    if (p.platform === "instagram" && !imageUrl.trim())
      return log(
        isAr
          ? "إنستغرام يحتاج رابط صورة عام (من كانفا أو درايف)"
          : "Instagram needs a public image URL",
        "err",
      );
    if (
      !window.confirm(
        isAr
          ? `تأكيد النشر الفعلي الآن على ${PLAT[p.platform]}؟`
          : `Publish to ${PLAT[p.platform]} now?`,
      )
    )
      return;
    setMetaBusy(true);
    try {
      const payload = {
        platform: p.platform,
        caption: p.caption,
        imageUrl: imageUrl.trim(),
        idempotencyKey: /^[A-Za-z0-9_-]{4,64}$/.test(p.id) ? p.id : undefined,
      };
      // The owner session cookie authorizes publishing; the PIN is only asked for when locked
      // and is never stored in the browser.
      const send = (pin?: string) =>
        fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pin ? { ...payload, pin } : payload),
        });
      let res = await send();
      let data = await res.json();
      if (res.status === 401 && data.error === "owner_session_required") {
        const pin = window.prompt(isAr ? "أدخل رمز المالك للنشر" : "Enter owner publish PIN") || "";
        if (!pin) return;
        res = await send(pin);
        data = await res.json();
      }
      if (!res.ok) {
        const msgs: Record<string, string> = {
          wrong_pin: isAr ? "رمز المالك غير صحيح" : "Wrong PIN",
          owner_session_required: isAr ? "يلزم رمز المالك" : "Owner PIN required",
          publish_pin_not_configured: isAr
            ? "لم يتم ضبط رمز المالك بعد"
            : "Owner PIN not set up yet",
          facebook_not_configured: isAr ? "حساب فيسبوك غير مربوط بعد" : "Facebook not linked yet",
          instagram_not_configured: isAr
            ? "حساب إنستغرام غير مربوط بعد"
            : "Instagram not linked yet",
          instagram_needs_image: isAr ? "إنستغرام يحتاج رابط صورة" : "Instagram needs an image",
          invalid_image_url: isAr
            ? "رابط الصورة يجب أن يكون https عاماً وصالحاً"
            : "Image URL must be a valid public https link",
          publish_pin_too_weak: isAr
            ? "رمز المالك المضبوط قصير جداً (8 أحرف على الأقل)"
            : "Configured owner PIN is too short (min 8)",
          too_many_attempts: isAr
            ? "محاولات خاطئة كثيرة، حاول لاحقاً"
            : "Too many attempts, try later",
          duplicate_request: isAr
            ? "تم إرسال هذا المنشور للنشر بالفعل"
            : "This post was already sent for publishing",
          meta_auth_failed: isAr
            ? "تعذر التحقق من صلاحية حساب Meta"
            : "Meta account authorization failed",
          meta_publish_failed: isAr
            ? "تعذر النشر على Meta، لم يُنشر شيء"
            : "Meta publish failed; nothing was posted",
        };
        throw new Error(msgs[data.error] || (isAr ? "خطأ غير معروف" : "Unknown error"));
      }
      update(p.id, {
        status: "Published",
        publishedExternalId: data.id,
        publishedExternalUrl: data.url || undefined,
      } as Partial<Post>);
      log(
        isAr
          ? `✅ تم النشر فعلياً على ${PLAT[p.platform]}`
          : `Published live on ${PLAT[p.platform]}`,
        "ok",
      );
    } catch (e) {
      log(`${isAr ? "فشل النشر" : "Publish failed"}: ${(e as Error).message}`, "err");
    } finally {
      setMetaBusy(false);
    }
  };

  const handleConfirmPublished = () => {
    const finalUrl = customLiveUrl.trim() || getPlatformDefaultUrl(p.platform);
    update(p.id, {
      status: "Published",
      publishedExternalUrl: finalUrl,
    });
    setVerifyingPublish(false);
    log(
      isAr
        ? `✅ تم تأكيد اكتمال النشر على ${PLAT[p.platform]} بنجاح!`
        : `Confirmed publication on ${PLAT[p.platform]}!`,
      "ok",
    );
  };

  return (
    <article className="glass flex flex-col gap-3 p-4 border border-border/80 hover:border-primary/50 transition">
      {/* Header Info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-primary font-medium">
            {PLAT[p.platform]}
          </span>
          <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
            {templateMeta.ratio}
          </span>
        </div>
        <span className="font-mono text-muted-foreground text-[11px]">
          {p.status}
          {p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleDateString()}` : ""}
        </span>
      </div>

      {/* Template Badge */}
      <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate className="size-3.5 text-accent" />
          <span className="font-medium text-foreground">
            {isAr ? templateMeta.labelAr : templateMeta.labelEn}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowStudio(!showStudio)}
          className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
        >
          <ImageIcon className="size-3" />
          {showStudio
            ? isAr
              ? "إخفاء البوستر"
              : "Hide Poster"
            : isAr
              ? "عرض البوستر والشعار"
              : "Show Poster"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">المنصة:</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(PLAT) as Platform[]).map((k) => (
                  <option key={k} value={k}>
                    {PLAT[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">{t.templateLabel}</label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value as PostTemplate)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(TEMPLATE_INFO) as PostTemplate[]).map((k) => (
                  <option key={k} value={k}>
                    {isAr ? TEMPLATE_INFO[k].labelAr : TEMPLATE_INFO[k].labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="text-xs text-muted-foreground">{t.caption}</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-input bg-background/50 p-2 text-sm outline-none focus:border-primary"
          />

          <label className="text-xs text-muted-foreground">{t.visual}</label>
          <textarea
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background/50 p-2 text-sm outline-none focus:border-primary"
          />

          <div className="flex gap-2 pt-1">
            <button
              disabled={!caption.trim()}
              onClick={() => {
                update(p.id, { caption, visual, platform, templateType });
                setEditing(false);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {t.save}
            </button>
            {p.caption && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
              >
                {t.cancel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{p.caption}</p>

          {/* Branded Poster & Visual Card Studio */}
          {showStudio && (
            <BrandedPosterStudio
              id={p.id}
              caption={p.caption}
              visual={p.visual}
              platform={p.platform}
              templateType={templateType}
              isAr={isAr}
              log={log}
            />
          )}

          {/* Quick Caption Copy Button */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => copy(p.caption)}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary font-medium"
            >
              {copied ? <Check className="size-3 text-accent" /> : <Copy className="size-3" />}
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </>
      )}

      {/* Verification Box when publishing is initiated */}
      {verifyingPublish && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 space-y-2 text-xs">
          <div className="font-semibold text-accent flex items-center gap-1.5">
            <span>🚀</span>
            <span>
              {isAr
                ? `تم فتح ${PLAT[p.platform]} ونسخ المنشور. بعد لصق المنشور والضغط على نشر، أكد أدناه:`
                : `${PLAT[p.platform]} composer opened with caption copied. Confirm below:`}
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              {isAr ? "رابط المنشور المباشر (اختياري):" : "Direct live post URL (optional):"}
            </label>
            <input
              type="url"
              value={customLiveUrl}
              onChange={(e) => setCustomLiveUrl(e.target.value)}
              placeholder={
                p.platform === "instagram"
                  ? "https://www.instagram.com/p/..."
                  : p.platform === "facebook"
                    ? "https://www.facebook.com/..."
                    : "https://www.tiktok.com/@..."
              }
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirmPublished}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-bold text-accent-foreground shadow"
            >
              <Check className="size-3.5" />
              {isAr ? "تأكيد اكتمال النشر الفعلي" : "Confirm Published"}
            </button>
            <button
              type="button"
              onClick={() => setVerifyingPublish(false)}
              className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Scheduling & Publish Controls */}
      {!editing && (
        <div className="mt-auto space-y-2 border-t border-border pt-3">
          {p.status === "Needs Review" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3" />
                {t.when}
              </label>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
            {p.status === "Needs Review" && (
              <>
                <button
                  onClick={() => {
                    if (!when) return log(t.needWhen, "err");
                    update(p.id, { status: "Scheduled", scheduledAt: when });
                    log(`${t.approve}: ${PLAT[p.platform]} (${when})`, "ok");
                  }}
                  className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-foreground shadow-sm"
                >
                  <Check className="size-4" />
                  {t.approve}
                </button>

                <button
                  onClick={handleLaunchPublishBridge}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground shadow-sm"
                >
                  <Send className="size-3.5" />
                  {isAr
                    ? `نشر يدوي (نسخ وفتح ${PLAT[p.platform]})`
                    : `Manual post (copy & open ${PLAT[p.platform]})`}
                </button>
              </>
            )}

            {(p.status === "Scheduled" || p.status === "Claimed") && p.platform !== "tiktok" && (
              <div className="w-full space-y-2 rounded-md border border-primary/30 p-2">
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  dir="ltr"
                  placeholder={
                    isAr
                      ? "رابط الصورة العام (مطلوب لإنستغرام)"
                      : "Public image URL (required for Instagram)"
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
                <button
                  onClick={handleMetaPublish}
                  disabled={metaBusy}
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-foreground disabled:opacity-50"
                >
                  <Zap className="size-3.5" />
                  {metaBusy
                    ? isAr
                      ? "جارٍ النشر…"
                      : "Publishing…"
                    : isAr
                      ? `نشر فعلي الآن على ${PLAT[p.platform]}`
                      : `Publish live to ${PLAT[p.platform]}`}
                </button>
              </div>
            )}
            {(p.status === "Scheduled" || p.status === "Claimed") && (
              <>
                <button
                  onClick={handleLaunchPublishBridge}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
                >
                  <Send className="size-3.5" />
                  {isAr
                    ? `نشر يدوي (نسخ وفتح ${PLAT[p.platform]})`
                    : `Manual post (copy & open ${PLAT[p.platform]})`}
                </button>

                <button
                  onClick={() => setVerifyingPublish(true)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  {t.markPub}
                </button>

                <button
                  onClick={() => update(p.id, { status: "Needs Review" })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t.backReview}
                </button>
              </>
            )}

            {p.status === "Published" && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-medium">
                <Check className="size-4 text-emerald-400" />
                <span>
                  {isAr
                    ? `منشور ومؤكد على ${PLAT[p.platform]}`
                    : `Published & verified on ${PLAT[p.platform]}`}
                </span>
                {p.publishedExternalUrl && (
                  <a
                    href={p.publishedExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-cyan-300 underline hover:text-cyan-200 ms-1 font-semibold"
                  >
                    <span>
                      {p.platform === "instagram"
                        ? isAr
                          ? "مشاهدة على إنستغرام"
                          : "View on Instagram"
                        : p.platform === "facebook"
                          ? isAr
                            ? "مشاهدة على فيسبوك"
                            : "View on Facebook"
                          : isAr
                            ? "مشاهدة على تيك توك"
                            : "View on TikTok"}
                    </span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
                <button
                  onClick={() => update(p.id, { status: "Needs Review" })}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline ms-auto"
                >
                  {isAr ? "تعديل أو إعادة جدولة" : "Edit / Reschedule"}
                </button>
              </div>
            )}

            {p.status !== "Published" && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
              >
                <Pencil className="size-3.5" />
                {t.edit}
              </button>
            )}

            <button
              onClick={remove}
              className="ms-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-destructive hover:bg-destructive/10"
              aria-label={t.del}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
