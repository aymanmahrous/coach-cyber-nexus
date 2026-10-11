import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ContentFactory } from "@/components/ContentFactory";
import { WhatsAppHub } from "@/components/WhatsAppHub";
import { MediaVault } from "@/components/MediaVault";
import { usePosts } from "@/lib/posts";
import {
  Activity, Bell, Brain, Factory, FolderOpen, Gauge, Languages, MessageCircle, Send, Square, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coach Ayman Cockpit — Swimming & Relax Fix Hub Abu Dhabi" },
      { name: "description", content: "Smart command cockpit for Coach Ayman: Coach Brain AI advisor, live notifications and content status for Abu Dhabi swimming." },
      { property: "og:title", content: "Coach Ayman Cockpit — Abu Dhabi" },
      { property: "og:description", content: "Smart command cockpit with Coach Brain AI for swimming technique, pricing and ad campaigns." },
    ],
  }),
  component: Cockpit,
});

type Lang = "ar" | "en";
type Tab = "cockpit" | "brain" | "factory" | "whatsapp" | "vault";
type Msg = { role: "user" | "assistant"; content: string };
type Note = { id: number; time: string; text: string; tone: "info" | "ok" | "err" };

const T = {
  ar: {
    brand: "مقصورة كابتن أيمن", sub: "Swimming & Relax Fix Hub · أبوظبي",
    tabs: { cockpit: "المقصورة", brain: "كوتش براين", factory: "مصنع المحتوى", whatsapp: "واتساب", vault: "الوسائط" },
    online: "متصل", offline: "غير مربوط", ready: "جاهز",
    notif: "مركز الإشعارات", noNotif: "لا توجد أحداث بعد. كل حركة في النظام ستظهر هنا.", clear: "مسح",
    posts: "لوحة المنشورات", noPosts: "لا منشورات", postsNote: "تظهر هنا المنشورات الحقيقية فقط بعد ربط الحسابات (المرحلة الثانية).",
    status: { Scheduled: "مجدول", Claimed: "قيد التنفيذ", Published: "منشور", "Needs Review": "يحتاج مراجعة" },
    guard: "حماية: لا نشر تلقائي ولا سحب رصيد دون موافقتك اليدوية. لا أزرار وهمية.",
    biz: "المعلومات التجارية", branches: "الفروع", prices: "الأسعار",
    branchList: ["المشرف", "الفلاح", "مدينة خليفة", "الدانة / النجدة"],
    priceList: ["حصة خاصة: 150 / 250 درهم", "مجموعات الأطفال: 450 درهم", "خصم الإخوة: 400 درهم"],
    booking: "رقم الحجز الرسمي", mgmt: "الإدارة (مكالمات فقط)",
    askPh: "اسأل كوتش براين… تكنيك، رهبة الماء، أسعار، حملات",
    quick: ["حلل أخطاء شائعة في سباحة الصدر مع تمارين تصحيح", "خطة علاج رهبة الماء لطفل 7 سنوات على 4 حصص", "اقترح حملة ممولة على إنستغرام لأبوظبي بميزانية 1500 درهم", "اكتب رد واتساب لعميل يسأل عن أسعار مجموعات الأطفال"],
    send: "إرسال", stop: "إيقاف", thinking: "كوتش براين يفكر…",
    phase2: "المرحلة الثانية", soon: "هذا القسم قيد البناء. لن تجد هنا أزراراً وهمية — سيعمل فعلياً عند ربط الحساب المطلوب.",
    factoryDesc: "خطط نشر مرنة (فوري، يومي، 3 أيام، أسبوع) لفيسبوك وإنستغرام وتيك توك 9:16 مع بطاقات مراجعة وموافقة يدوية.",
    waDesc: "صندوق رسائل العملاء وردود مقترحة من كوتش براين. يتطلب ربط WhatsApp Business API على الرقم 058 821 9130.",
    vaultDesc: "رفع من الهاتف والكمبيوتر وربط Google Drive وPhotos وDropbox وCanva، واختيار محرك الذكاء (OpenAI / Gemini / Runway).",
    tryBrain: "جرّب كوتش براين الآن لصياغة المحتوى والردود",
    kpiTitle: "المؤشرات", demo: "بيانات تجريبية", real: "بيانات فعلية", showDemo: "عرض بيانات تجريبية", hideDemo: "إخفاء التجريبي",
    kContent: "المحتوى", kPosts: "المنشورات", kMsgs: "الرسائل", kContentSub: "مسودات بانتظار المراجعة", kPostsSub: "مجدولة / منشورة", kMsgsSub: "استفسارات غير مقروءة", empty: "لا بيانات بعد",
    shortcuts: "اختصارات سريعة", scPost: "إنشاء منشور", scMsgs: "مراجعة الرسائل", scBrain: "فتح كوتش براين",
    evBrainOk: "كوتش براين أجاب على استفسار", evBrainErr: "خطأ من كوتش براين", evAsk: "سؤال جديد لكوتش براين", evLang: "تم تغيير اللغة",
  },
  en: {
    brand: "Coach Ayman Cockpit", sub: "Swimming & Relax Fix Hub · Abu Dhabi",
    tabs: { cockpit: "Cockpit", brain: "Coach Brain", factory: "Content Factory", whatsapp: "WhatsApp", vault: "Media Vault" },
    online: "Online", offline: "Not linked", ready: "Ready",
    notif: "Notification Center", noNotif: "No events yet. Every system action appears here.", clear: "Clear",
    posts: "Posts Board", noPosts: "No posts", postsNote: "Only real posts appear here once accounts are linked (Phase 2).",
    status: { Scheduled: "Scheduled", Claimed: "Claimed", Published: "Published", "Needs Review": "Needs Review" },
    guard: "Protection: no auto-publishing and no credit spend without your manual approval. Zero fake buttons.",
    biz: "Business Info", branches: "Branches", prices: "Pricing",
    branchList: ["Al Mushrif", "Al Falah", "Khalifa City", "Al Danah / Al Najda"],
    priceList: ["Private session: 150 / 250 AED", "Kids groups: 450 AED", "Sibling discount: 400 AED"],
    booking: "Official booking", mgmt: "Management (calls only)",
    askPh: "Ask Coach Brain… technique, water fear, pricing, campaigns",
    quick: ["Analyse common breaststroke errors with correction drills", "4-session aquaphobia plan for a 7-year-old", "Suggest an Instagram paid campaign in Abu Dhabi with 1500 AED", "Draft a WhatsApp reply to a parent asking about kids group prices"],
    send: "Send", stop: "Stop", thinking: "Coach Brain is thinking…",
    phase2: "Phase 2", soon: "This section is under construction. No fake buttons here — it goes live once the required account is linked.",
    factoryDesc: "Flexible plans (instant, daily, 3 days, weekly) for Facebook, Instagram and TikTok 9:16 with review cards and manual approval.",
    waDesc: "Customer inbox with Coach Brain suggested replies. Requires WhatsApp Business API on 058 821 9130.",
    vaultDesc: "Upload from phone/computer, link Google Drive, Photos, Dropbox, Canva, and pick the AI engine (OpenAI / Gemini / Runway).",
    tryBrain: "Use Coach Brain now to draft content and replies",
    kpiTitle: "Indicators", demo: "Demo data", real: "Live data", showDemo: "Show demo data", hideDemo: "Hide demo",
    kContent: "Content", kPosts: "Posts", kMsgs: "Messages", kContentSub: "Drafts awaiting review", kPostsSub: "Scheduled / published", kMsgsSub: "Unread inquiries", empty: "No data yet",
    shortcuts: "Quick actions", scPost: "Create post", scMsgs: "Review messages", scBrain: "Open Coach Brain",
    evBrainOk: "Coach Brain answered a query", evBrainErr: "Coach Brain error", evAsk: "New question to Coach Brain", evLang: "Language changed",
  },
} as const;

const TABS: { id: Tab; icon: typeof Gauge }[] = [
  { id: "cockpit", icon: Gauge }, { id: "brain", icon: Brain }, { id: "factory", icon: Factory },
  { id: "whatsapp", icon: MessageCircle }, { id: "vault", icon: FolderOpen },
];

function Cockpit() {
  const [lang, setLang] = useState<Lang>("ar");
  const [tab, setTab] = useState<Tab>("cockpit");
  const [notes, setNotes] = useState<Note[]>([]);
  const [brainState, setBrainState] = useState<"ready" | "online" | "err">("ready");
  const t = T[lang];
  const isAr = lang === "ar";

  useEffect(() => {
    const saved = localStorage.getItem("cockpit-lang");
    if (saved === "en" || saved === "ar") setLang(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("cockpit-lang", lang);
  }, [lang]);

  const log = (text: string, tone: Note["tone"] = "info") =>
    setNotes((n) => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), text, tone }, ...n].slice(0, 50));

  const channels = [
    { name: isAr ? "واتساب (058 821 9130)" : "WhatsApp", on: true },
    { name: isAr ? "فيسبوك وماسنجر" : "Facebook & Messenger", on: true },
    { name: isAr ? "إنستغرام (@RelaxFixUAE)" : "Instagram", on: true },
    { name: isAr ? "Canva & Gemini AI" : "Canva & Gemini", on: true },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 md:p-6">
      <header className="glass flex flex-wrap items-center gap-3 p-3 md:p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg border border-primary/40 text-primary"><Activity className="size-5" /></div>
          <div>
            <h1 className="font-display text-sm font-extrabold tracking-wider text-primary glow-text md:text-lg">{t.brand}</h1>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 font-mono text-[11px]">
          {channels.map((c) => (
            <span key={c.name} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              <span className={`size-2 rounded-full ${c.on ? "bg-accent" : "bg-muted-foreground/50"}`} />
              {c.name} · {c.on ? t.online : t.offline}
            </span>
          ))}
          <span className="flex items-center gap-1.5 rounded-full border border-primary/40 px-2.5 py-1 text-primary">
            <span className={`size-2 rounded-full ${brainState === "err" ? "bg-destructive" : "animate-pulse bg-accent"}`} />
            Coach Brain · {brainState === "online" ? t.online : brainState === "err" ? "ERR" : t.ready}
          </span>
          <button
            onClick={() => { setLang(lang === "ar" ? "en" : "ar"); log(T[lang === "ar" ? "en" : "ar"].evLang); }}
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
          >
            <Languages className="size-3.5" /> {lang === "ar" ? "EN" : "عربي"}
          </button>
        </div>
      </header>

      <nav className="glass sticky top-2 z-10 flex gap-1 overflow-x-auto p-1.5">
        {TABS.map(({ id, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Icon className="size-4" /> {t.tabs[id]}
          </button>
        ))}
      </nav>

      <main className="flex-1">
        {tab === "cockpit" && <CockpitView t={t} notes={notes} clear={() => setNotes([])} go={setTab} />}
        <div className={tab === "brain" ? "" : "hidden"}>
          <BrainView t={t} log={log} setBrainState={setBrainState} />
        </div>
        {tab === "factory" && <ContentFactory lang={lang} log={log} />}
        {tab === "whatsapp" && <WhatsAppHub lang={lang} log={log} />}
        {tab === "vault" && <MediaVault lang={lang} log={log} />}
      </main>
    </div>
  );
}

type TT = (typeof T)[Lang];

function Numbers({ t }: { t: TT }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <a href="https://wa.me/971588219130" target="_blank" rel="noreferrer" className="rounded-lg border border-accent/40 p-3 hover:bg-accent/10">
        <div className="text-xs text-muted-foreground">{t.booking}</div>
        <div dir="ltr" className="font-mono text-lg text-accent">058 821 9130</div>
      </a>
      <a href="tel:+971551378660" className="rounded-lg border border-border p-3 hover:bg-secondary">
        <div className="text-xs text-muted-foreground">{t.mgmt}</div>
        <div dir="ltr" className="font-mono text-lg">055 137 8660</div>
      </a>
    </div>
  );
}

function CockpitView({ t, notes, clear, go }: { t: TT; notes: Note[]; clear: () => void; go: (t: Tab) => void }) {
  const goBrain = () => go("brain");
  const cols = ["Scheduled", "Claimed", "Published", "Needs Review"] as const;
  const [demo, setDemo] = useState(false);
  const { posts } = usePosts();
  const cnt = (st: string) => posts.filter((p) => p.status === st).length;
  const kpis = [
    { label: t.kContent, sub: t.kContentSub, v: demo ? 6 : cnt("Needs Review"), icon: Factory, to: "factory" as Tab },
    { label: t.kPosts, sub: t.kPostsSub, v: demo ? "4 / 12" : cnt("Scheduled") + cnt("Published") ? `${cnt("Scheduled")} / ${cnt("Published")}` : 0, icon: Gauge, to: "factory" as Tab },
    { label: t.kMsgs, sub: t.kMsgsSub, v: demo ? 9 : 0, icon: MessageCircle, to: "whatsapp" as Tab },
  ];
  const shortcuts = [
    { label: t.scPost, icon: Factory, to: "factory" as Tab },
    { label: t.scMsgs, icon: MessageCircle, to: "whatsapp" as Tab },
    { label: t.scBrain, icon: Brain, to: "brain" as Tab },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="glass p-4 lg:col-span-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm tracking-wider text-primary">{t.kpiTitle}</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded-full border px-2 py-0.5 font-mono ${demo ? "border-warning/50 text-warning" : "border-accent/50 text-accent"}`}>{demo ? t.demo : t.real}</span>
            <button onClick={() => setDemo(!demo)} className="rounded-full border border-border px-3 py-0.5 text-muted-foreground hover:text-foreground">{demo ? t.hideDemo : t.showDemo}</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <button key={k.label} onClick={() => go(k.to)} className="rounded-lg border border-border bg-background/40 p-4 text-start transition hover:border-primary">
              <div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{k.label}</span><k.icon className="size-4 text-primary" /></div>
              <div dir="ltr" className="mt-2 font-mono text-3xl text-foreground glow-text">{k.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{!demo && k.v === 0 ? t.empty : k.sub}</div>
            </button>
          ))}
        </div>
        <h3 className="mb-2 mt-4 text-xs text-muted-foreground">{t.shortcuts}</h3>
        <div className="grid grid-cols-3 gap-2">
          {shortcuts.map((s) => (
            <button key={s.label} onClick={() => go(s.to)} className="flex flex-col items-center gap-1 rounded-lg bg-primary/10 p-3 text-xs text-primary transition hover:bg-primary hover:text-primary-foreground sm:flex-row sm:justify-center sm:text-sm">
              <s.icon className="size-4" />{s.label}
            </button>
          ))}
        </div>
      </section>
      <section className="glass p-4 lg:col-span-2">
        <h2 className="mb-3 font-display text-sm tracking-wider text-primary">{t.posts}</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {cols.map((c) => (
            <div key={c} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{t.status[c]}</span><span className="font-mono text-2xl text-foreground">{cnt(c)}</span></div>
              {cnt(c) === 0 && <p className="mt-6 text-center text-[11px] text-muted-foreground">{t.noPosts}</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t.postsNote}</p>
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">{t.guard}</div>
      </section>

      <section className="glass flex max-h-[28rem] flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm tracking-wider text-primary"><Bell className="size-4" />{t.notif}</h2>
          {notes.length > 0 && <button onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Trash2 className="size-3" />{t.clear}</button>}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {notes.length === 0 && <p className="text-xs text-muted-foreground">{t.noNotif}</p>}
          {notes.map((n) => (
            <div key={n.id} className="flex gap-2 rounded-md border border-border bg-background/40 p-2 text-xs">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${n.tone === "ok" ? "bg-accent" : n.tone === "err" ? "bg-destructive" : "bg-primary"}`} />
              <div className="flex-1">{n.text}</div>
              <span dir="ltr" className="font-mono text-muted-foreground">{n.time}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="glass p-4 lg:col-span-2">
        <h2 className="mb-3 font-display text-sm tracking-wider text-primary">{t.biz}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div><div className="mb-2 text-xs text-muted-foreground">{t.branches}</div>
            <ul className="grid grid-cols-2 gap-2 text-sm">{t.branchList.map((b) => <li key={b} className="rounded-md border border-border px-3 py-2">{b}</li>)}</ul></div>
          <div><div className="mb-2 text-xs text-muted-foreground">{t.prices}</div>
            <ul className="space-y-2 text-sm">{t.priceList.map((p) => <li key={p} className="rounded-md border border-border px-3 py-2">{p}</li>)}</ul></div>
        </div>
        <div className="mt-4"><Numbers t={t} /></div>
      </section>

      <button onClick={goBrain} className="glass flex flex-col items-center justify-center gap-3 p-6 text-center transition hover:border-primary">
        <Brain className="size-10 text-primary" />
        <span className="font-display text-sm text-primary">{t.tabs.brain}</span>
        <span className="text-xs text-muted-foreground">{t.tryBrain}</span>
      </button>
    </div>
  );
}

function BrainView({ t, log, setBrainState }: { t: TT; log: (s: string, tone?: Note["tone"]) => void; setBrainState: (s: "ready" | "online" | "err") => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput(""); setBusy(true); log(t.evAsk);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }), signal: ac.signal });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
      setBrainState("online"); log(t.evBrainOk, "ok");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const m = (e as Error).message || "Error";
      setMsgs([...next, { role: "assistant", content: `⚠️ ${m}` }]);
      setBrainState("err"); log(`${t.evBrainErr}: ${m}`, "err");
    } finally { setBusy(false); abortRef.current = null; }
  }

  return (
    <section className="glass flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col p-3 md:p-4">
      <div className="flex-1 space-y-4 overflow-y-auto p-1">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-2xl py-6 text-center">
            <Brain className="mx-auto mb-3 size-12 text-primary" />
            <h2 className="mb-4 font-display text-primary glow-text">{t.tabs.brain}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {t.quick.map((q) => <button key={q} onClick={() => ask(q)} className="rounded-lg border border-border bg-background/40 p-3 text-start text-sm hover:border-primary">{q}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="ms-auto max-w-[85%] rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">{m.content}</div>
        ) : (
          <div key={i} className="prose-hud max-w-[95%] text-sm leading-relaxed">
            {m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : <span className="animate-pulse text-muted-foreground">{t.thinking}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-3 flex items-end gap-2 rounded-xl border border-input bg-background/50 p-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder={t.askPh}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          className="flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground" />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="flex size-10 items-center justify-center rounded-lg bg-destructive text-destructive-foreground" aria-label={t.stop}><Square className="size-4" /></button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" aria-label={t.send}><Send className="size-4 rtl:-scale-x-100" /></button>
        )}
      </form>
    </section>
  );
}

