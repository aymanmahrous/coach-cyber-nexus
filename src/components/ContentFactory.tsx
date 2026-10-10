import { useState } from "react";
import { Check, Copy, ExternalLink, Pencil, Sparkles as Spark, Trash2, Wand2 } from "lucide-react";
import { usePosts, type Platform, type Post } from "@/lib/posts";

type Lang = "ar" | "en";
type Plan = "instant" | "daily" | "3days" | "week";

const L = {
  ar: {
    title: "مصنع المحتوى", plan: "مدة الخطة", plans: { instant: "فوري (منشور واحد)", daily: "يومي (اليوم)", "3days": "3 أيام", week: "أسبوع" },
    platforms: "المنصات", topic: "فكرة أو موضوع (اختياري)", topicPh: "مثال: عروض مجموعات الأطفال في مدينة خليفة",
    generate: "توليد المسودات بكوتش براين", generating: "جارٍ التوليد…", manual: "إضافة منشور يدوي",
    review: "بانتظار مراجعتك", scheduled: "مجدولة", published: "منشورة", empty: "لا منشورات هنا بعد.",
    approve: "موافقة وجدولة", edit: "تعديل", save: "حفظ", cancel: "إلغاء", del: "حذف", when: "موعد النشر",
    markPub: "تم النشر يدوياً", backReview: "إرجاع للمراجعة", copy: "نسخ النص", copied: "تم النسخ",
    canva: "صمّم في كانفا", gemini: "صمّم في جيمني", caption: "النص", visual: "وصف التصميم / الفيديو",
    guard: "لا يتم أي نشر تلقائي. بعد الموافقة تنسخ النص وتصمم في كانفا أو جيمني ثم تنشر بنفسك، وتضغط \"تم النشر\". الربط المباشر مع فيسبوك وإنستغرام وتيك توك يأتي في المرحلة التالية.",
    err: "تعذر التوليد", needWhen: "حدد موعد النشر أولاً",
  },
  en: {
    title: "Content Factory", plan: "Plan length", plans: { instant: "Instant (1 post)", daily: "Daily (today)", "3days": "3 days", week: "Week" },
    platforms: "Platforms", topic: "Idea or topic (optional)", topicPh: "e.g. Kids group offers in Khalifa City",
    generate: "Generate drafts with Coach Brain", generating: "Generating…", manual: "Add manual post",
    review: "Awaiting your review", scheduled: "Scheduled", published: "Published", empty: "No posts here yet.",
    approve: "Approve & schedule", edit: "Edit", save: "Save", cancel: "Cancel", del: "Delete", when: "Publish time",
    markPub: "Mark as published", backReview: "Back to review", copy: "Copy text", copied: "Copied",
    canva: "Design in Canva", gemini: "Design in Gemini", caption: "Caption", visual: "Design / video brief",
    guard: "Nothing is ever auto-published. After approval, copy the text, design in Canva or Gemini, post it yourself, then tap \"Mark as published\". Direct Facebook/Instagram/TikTok linking comes next phase.",
    err: "Generation failed", needWhen: "Pick a publish time first",
  },
};

const PLAT: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok 9:16" };
const COUNT: Record<Plan, number> = { instant: 1, daily: 1, "3days": 3, week: 7 };
const uid = () => Math.random().toString(36).slice(2, 10);

export function ContentFactory({ lang, log }: { lang: Lang; log: (s: string, tone?: "info" | "ok" | "err") => void }) {
  const t = L[lang];
  const { posts, save } = usePosts();
  const [plan, setPlan] = useState<Plan>("3days");
  const [plats, setPlats] = useState<Platform[]>(["instagram", "facebook"]);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<Post>) => save(posts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function generate() {
    if (!plats.length || busy) return;
    setBusy(true);
    const n = COUNT[plan];
    const prompt = `Create ${n} social media post(s) for EACH of these platforms: ${plats.map((p) => PLAT[p]).join(", ")}.
Topic: ${topic || "mix of swimming tips, kids groups, private sessions, aquaphobia treatment"}.
Language: ${lang === "ar" ? "Arabic (Gulf-friendly)" : "English"}. Include relevant hashtags and the booking number 058 821 9130 when promoting.
For TikTok write a 9:16 short video script with hook. Return ONLY JSON, no markdown fences, exactly:
{"posts":[{"platform":"facebook|instagram|tiktok","caption":"...","visual":"short design or video brief for Canva/Gemini"}]}`;
    try {
      const res = await fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }) });
      if (!res.ok) throw new Error(await res.text());
      const txt = await res.text();
      const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      const items: Post[] = (json.posts || [])
        .filter((p: Post) => plats.includes(p.platform) && p.caption)
        .map((p: Post) => ({ id: uid(), platform: p.platform, caption: p.caption, visual: p.visual || "", status: "Needs Review", createdAt: new Date().toISOString() }));
      if (!items.length) throw new Error("empty");
      save([...items, ...posts]);
      log(`${items.length} ${t.review}`, "ok");
    } catch (e) {
      log(`${t.err}: ${(e as Error).message}`, "err");
    } finally {
      setBusy(false);
    }
  }

  const addManual = () =>
    save([{ id: uid(), platform: plats[0] || "instagram", caption: "", visual: "", status: "Needs Review", createdAt: new Date().toISOString() }, ...posts]);

  const groups: { key: string; title: string; items: Post[] }[] = [
    { key: "r", title: t.review, items: posts.filter((p) => p.status === "Needs Review") },
    { key: "s", title: t.scheduled, items: posts.filter((p) => p.status === "Scheduled" || p.status === "Claimed").sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || "")) },
    { key: "p", title: t.published, items: posts.filter((p) => p.status === "Published") },
  ];

  return (
    <div className="space-y-4">
      <section className="glass space-y-4 p-4">
        <h2 className="font-display text-sm tracking-wider text-primary">{t.title}</h2>
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.plan}</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(t.plans) as Plan[]).map((k) => (
              <button key={k} onClick={() => setPlan(k)} className={`rounded-full border px-3 py-1.5 text-sm ${plan === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{t.plans[k]}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.platforms}</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLAT) as Platform[]).map((p) => {
              const on = plats.includes(p);
              return (
                <button key={p} onClick={() => setPlats(on ? plats.filter((x) => x !== p) : [...plats, p])} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent text-accent" : "border-border text-muted-foreground"}`}>
                  {on && <Check className="size-3.5" />}{PLAT[p]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t.topic}</div>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPh} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={generate} disabled={busy || !plats.length} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Wand2 className={`size-4 ${busy ? "animate-spin" : ""}`} />{busy ? t.generating : t.generate}
          </button>
          <button onClick={addManual} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">{t.manual}</button>
        </div>
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">{t.guard}</p>
      </section>

      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">{g.title}<span className="font-mono text-foreground">{g.items.length}</span></h3>
          {g.items.length === 0 ? <p className="glass p-4 text-xs text-muted-foreground">{t.empty}</p> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((p) => <PostCard key={p.id} p={p} t={t} update={update} remove={() => save(posts.filter((x) => x.id !== p.id))} log={log} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function PostCard({ p, t, update, remove, log }: { p: Post; t: (typeof L)[Lang]; update: (id: string, patch: Partial<Post>) => void; remove: () => void; log: (s: string, tone?: "info" | "ok" | "err") => void }) {
  const [editing, setEditing] = useState(!p.caption);
  const [caption, setCaption] = useState(p.caption);
  const [visual, setVisual] = useState(p.visual);
  const [platform, setPlatform] = useState<Platform>(p.platform);
  const [when, setWhen] = useState(p.scheduledAt || "");
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const openWith = async (url: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    window.open(url, "_blank", "noopener");
  };
  const ratio = p.platform === "tiktok" ? "9:16" : p.platform === "instagram" ? "4:5" : "1:1";

  return (
    <article className="glass flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-primary">{PLAT[p.platform]}</span>
        <span className="font-mono text-muted-foreground">{p.status}{p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleString()}` : ""}</span>
      </div>

      {editing ? (
        <>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            {(Object.keys(PLAT) as Platform[]).map((k) => <option key={k} value={k}>{PLAT[k]}</option>)}
          </select>
          <label className="text-xs text-muted-foreground">{t.caption}</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} className="rounded-md border border-input bg-background/50 p-2 text-sm outline-none focus:border-primary" />
          <label className="text-xs text-muted-foreground">{t.visual}</label>
          <textarea value={visual} onChange={(e) => setVisual(e.target.value)} rows={2} className="rounded-md border border-input bg-background/50 p-2 text-sm outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button disabled={!caption.trim()} onClick={() => { update(p.id, { caption, visual, platform }); setEditing(false); }} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{t.save}</button>
            {p.caption && <button onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">{t.cancel}</button>}
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.caption}</p>
          {p.visual && <p className="rounded-md bg-secondary/60 p-2 text-xs text-muted-foreground">🎨 {p.visual}</p>}
          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={() => copy(p.caption)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"><Copy className="size-3" />{copied ? t.copied : t.copy}</button>
            <button onClick={() => openWith("https://www.canva.com/create/", p.caption)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"><ExternalLink className="size-3" />{t.canva}</button>
            <button onClick={() => openWith("https://gemini.google.com/app", `Create a ${ratio} ${p.platform === "tiktok" ? "short vertical video" : "social media image"} for Coach Ayman Swimming, Abu Dhabi. ${p.visual}`)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"><Spark className="size-3" />{t.gemini}</button>
          </div>
        </>
      )}

      {!editing && (
        <div className="mt-auto space-y-2 border-t border-border pt-3">
          {p.status === "Needs Review" && (
            <>
              <label className="text-xs text-muted-foreground">{t.when}</label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            {p.status === "Needs Review" && (
              <button onClick={() => { if (!when) return log(t.needWhen, "err"); update(p.id, { status: "Scheduled", scheduledAt: when }); log(`${t.approve}: ${PLAT[p.platform]}`, "ok"); }} className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-foreground"><Check className="size-4" />{t.approve}</button>
            )}
            {(p.status === "Scheduled" || p.status === "Claimed") && (
              <>
                <button onClick={() => { update(p.id, { status: "Published" }); log(`${t.markPub}: ${PLAT[p.platform]}`, "ok"); }} className="rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-foreground">{t.markPub}</button>
                <button onClick={() => update(p.id, { status: "Needs Review" })} className="rounded-md border border-border px-3 py-1.5">{t.backReview}</button>
              </>
            )}
            {p.status !== "Published" && <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5"><Pencil className="size-3.5" />{t.edit}</button>}
            <button onClick={remove} className="ms-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-destructive" aria-label={t.del}><Trash2 className="size-4" /></button>
          </div>
        </div>
      )}
    </article>
  );
}
