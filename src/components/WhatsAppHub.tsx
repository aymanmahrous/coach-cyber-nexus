import { useState, useEffect } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  RefreshCw,
  Inbox,
  AlertCircle,
  Lock,
  KeyRound,
} from "lucide-react";

type Lang = "ar" | "en";

interface WhatsAppHubProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}

interface InboundMessage {
  id: string;
  platform: "messenger" | "instagram" | "whatsapp" | "unknown";
  senderId: string;
  senderName?: string | undefined;
  text: string;
  timestamp: number;
}

const TEMPLATES = [
  {
    id: "assessment",
    titleAr: "تقييم مجاني أولي",
    titleEn: "Free Assessment",
    textAr: "مرحباً كابتن أيمن، أرغب في حجز تقييم أولي مجاني لمستوى السباحة في أبوظبي.",
    textEn: "Hi Coach Ayman, I would like to book a free initial swimming assessment in Abu Dhabi.",
  },
  {
    id: "kids_group",
    titleAr: "مجموعات الأطفال (450 درهم)",
    titleEn: "Kids Groups (450 AED)",
    textAr:
      "السلام عليكم كابتن أيمن، استفسار عن مواعيد وأماكن مجموعات الأطفال (باقة 450 درهم / خصم الإخوة 400 درهم).",
    textEn:
      "Hello Coach Ayman, inquiring about kids group schedules (450 AED package / 400 AED sibling discount).",
  },
  {
    id: "aquaphobia",
    titleAr: "علاج رهبة الماء (حصص خاصة)",
    titleEn: "Aquaphobia Treatment",
    textAr:
      "مرحباً كابتن، أرغب في الاستفسار عن الحصص الخاصة لعلاج الخوف من الماء وبناء الثقة للكبار أو الصغار (150/250 درهم).",
    textEn:
      "Hi Coach, inquiring about private sessions for aquaphobia treatment and confidence building (150/250 AED).",
  },
  {
    id: "branches",
    titleAr: "فروع مسابح أبوظبي",
    titleEn: "Abu Dhabi Branches",
    textAr: "مرحباً، ما هي أقرب مواعيد للحصص في فروعكم: المشرف، الفلاح، مدينة خليفة، أو الدانة؟",
    textEn:
      "Hi, what are the upcoming session times at your branches: Al Mushrif, Al Falah, Khalifa City, or Al Danah?",
  },
];

export function WhatsAppHub({ lang, log }: WhatsAppHubProps) {
  const isAr = lang === "ar";

  const [inboxMessages, setInboxMessages] = useState<InboundMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxAuthRequired, setInboxAuthRequired] = useState(false);
  const [inboxUnconfigured, setInboxUnconfigured] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]!.id);
  const [customText, setCustomText] = useState(isAr ? TEMPLATES[0]!.textAr : TEMPLATES[0]!.textEn);
  const [clientQuery, setClientQuery] = useState("");
  const [aiSuggestedReply, setAiSuggestedReply] = useState("");
  const [replyChannel, setReplyChannel] = useState<"whatsapp" | "messenger" | "instagram">(
    "whatsapp",
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);

  const phoneE164 = "971588219130";
  const phoneDisplay = "058 821 9130";
  const mgmtPhoneDisplay = "055 137 8660";
  const fbPageId = "1164107840123575";
  const messengerUrl = `https://m.me/${fbPageId}`;
  const instagramUrl = "https://www.instagram.com/direct/inbox/";

  const waLink = `https://wa.me/${phoneE164}?text=${encodeURIComponent(customText)}`;

  const fetchInbox = async (explicitPin?: string) => {
    setLoadingInbox(true);
    try {
      const pin = explicitPin ?? (sessionStorage.getItem("owner-pin") || "");
      const headers: Record<string, string> = {};
      if (pin) headers["x-owner-pin"] = pin;

      const res = await fetch("/api/meta-webhook?action=inbox", { headers });

      if (res.status === 401 || res.status === 403) {
        setInboxAuthRequired(true);
        setInboxUnconfigured(false);
        setInboxMessages([]);
      } else if (res.status === 503) {
        setInboxUnconfigured(true);
        setInboxAuthRequired(false);
        setInboxMessages([]);
      } else if (res.ok) {
        setInboxAuthRequired(false);
        setInboxUnconfigured(false);
        const data = await res.json();
        if (Array.isArray(data?.messages)) {
          setInboxMessages(data.messages);
        }
      }
    } catch {
      // Endpoint network issue; fail-closed quietly
    } finally {
      setLoadingInbox(false);
    }
  };

  const handlePromptOwnerPin = () => {
    const pin = window.prompt(
      isAr
        ? "أدخل رمز المالك (Owner PIN) المكون من 8 خانات على الأقل لعرض رسائل العملاء:"
        : "Enter the Owner PIN (min 8 characters) to view customer messages:",
    );
    if (!pin) return;
    sessionStorage.setItem("owner-pin", pin.trim());
    fetchInbox(pin.trim());
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(waLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    log(isAr ? "تم نسخ رابط واتساب التتبعي" : "WhatsApp lead link copied", "ok");
  };

  const copyReply = async () => {
    if (!aiSuggestedReply) return;
    await navigator.clipboard.writeText(aiSuggestedReply);
    setCopiedReply(true);
    setTimeout(() => setCopiedReply(false), 2000);
    log(isAr ? "تم نسخ الرد المقترح" : "Suggested reply copied", "ok");
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl) {
      setCustomText(isAr ? tmpl.textAr : tmpl.textEn);
    }
  };

  const channelNames = {
    whatsapp: isAr ? "واتساب (058 821 9130)" : "WhatsApp (058 821 9130)",
    messenger: isAr ? "فيسبوك مسنجر (صفحة كابتن أيمن)" : "Facebook Messenger (Page)",
    instagram: isAr ? "إنستغرام دايركت (@RelaxFixUAE)" : "Instagram Direct (@RelaxFixUAE)",
  };

  const generateReplyWithBrain = async (overrideQuery?: string, overrideChannel?: "whatsapp" | "messenger" | "instagram") => {
    const targetQuery = overrideQuery ?? clientQuery;
    const targetChannel = overrideChannel ?? replyChannel;

    if (!targetQuery.trim() || generatingReply) return;
    setGeneratingReply(true);
    setAiSuggestedReply("");

    const channelContext =
      targetChannel === "messenger"
        ? "المنصة المستهدفة: فيسبوك مسنجر (Facebook Messenger). اكتب رداً ودوداً ومباشراً يناسب شات فيسبوك."
        : targetChannel === "instagram"
          ? "المنصة المستهدفة: إنستغرام دايركت (Instagram Direct). اكتب رداً جذاباً ومركزاً وسريعاً."
          : "المنصة المستهدفة: واتساب (WhatsApp). اكتب رداً مفصلاً ومرتباً مع نقاط واضحة.";

    const prompt = `أنت المساعد الذكي لمبيعات وتأهيل السباحة لكابتن أيمن (Swimming & Relax Fix Hub أبوظبي).
${channelContext}
استفسار العميل الوارد:
"${targetQuery}"

قواعد الرد النفسية والبيعية المعتمدة لكابتن أيمن (التزم بها بدقة):
1. التعاطف والتطمين أولاً:
   - إذا ذكر ولي الأمر خوفاً أو رهبة من الماء، طمئنه فوراً بأن هذا أمر طبيعي وشائع جداً، وأن كابتن أيمن متخصص في التأهيل النفسي وكسر حاجز الخوف تدريجياً بأسلوب محبب وبدون أي ضغط على الطفل.
2. توضيح خيارات التدريب:
   - تدريب خاص (VIP / فردي): تركيز كامل 1-on-1 لبناء الألفة والأمان خطوة بخطوة.
   - تدريب مجموعات صغيرة: المجموعة عبارة عن 4 أطفال فقط كحد أقصى لضمان أقصى درجات الرعاية والمتابعة الدقيقة.
3. كابتن أيمن يحدد الأنسب عبر التقييم المجاني:
   - أوضح أن الكابتن أيمن هو من يحدد البرنامج الأنسب لطفلك (خاص أم مجموعة) بعد تشريفكم في **جلسة تقييم أولي مجانية تماماً** في المسبح بدون أي التزام.
4. الشفافية في الأسعار (بعد التقييم):
   - لا تبدأ الرد بأسعار مجردة. أكد أولاً أن التقييم مجاني، ورسوم الاشتراك بعد التقييم:
     * باقة المجموعات (4 أطفال): 450 درهم شهرياً (مع خصم الأخوة 400 درهم).
     * الحصص الخاصة: 150 درهم و 250 درهم.
5. فروع أبوظبي المعتمدة: المشرف، الفلاح، مدينة خليفة، الدانة / النجدة.
6. سؤال ختامي محدد: دعوة لاختيار أقرب فرع لحجز موعد جلسة التقييم المجانية.
الرد يجب أن يكون باللغة العربية، ودوداً ومباشراً وجاهزاً للإرسال دون أي تمهيد خارجي.`;

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], channel: targetChannel }),
      });

      if (!res.ok) throw new Error(await res.text());
      const reply = await res.text();
      setAiSuggestedReply(reply.trim());
      log(
        isAr
          ? `تمت صياغة الرد لمنصة ${channelNames[targetChannel]} بواسطة كوتش براين`
          : "AI reply generated",
        "ok",
      );
    } catch (e) {
      log(
        `${isAr ? "تعذر توليد الرد" : "Failed to generate reply"}: ${(e as Error).message}`,
        "err",
      );
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleDraftFromInbox = (msg: InboundMessage) => {
    setClientQuery(msg.text);
    const mappedChannel =
      msg.platform === "whatsapp" || msg.platform === "messenger" || msg.platform === "instagram"
        ? msg.platform
        : "whatsapp";
    setReplyChannel(mappedChannel);
    generateReplyWithBrain(msg.text, mappedChannel);
  };

  const openMessengerWithCopy = async () => {
    if (aiSuggestedReply) {
      await navigator.clipboard.writeText(aiSuggestedReply);
    }
    window.open(messengerUrl, "_blank", "noopener");
    log(isAr ? "تم نسخ الرد وفتح فيسبوك مسنجر" : "Reply copied & Messenger opened", "ok");
  };

  const openInstagramWithCopy = async () => {
    if (aiSuggestedReply) {
      await navigator.clipboard.writeText(aiSuggestedReply);
    }
    window.open(instagramUrl, "_blank", "noopener");
    log(isAr ? "تم نسخ الرد وفتح إنستغرام دايركت" : "Reply copied & Instagram DM opened", "ok");
  };

  return (
    <div className="space-y-4">
      {/* 1. Honest integration status */}
      <section className="glass space-y-4 border border-warning/30 bg-warning/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
              <MessageCircle className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm tracking-wider text-warning">
                  {isAr
                    ? "مركز الرسائل — الاستقبال عبر Webhook المحمي"
                    : "Messaging Center — Protected Webhook Mode"}
                </h2>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[11px] text-warning font-bold">
                  {isAr ? "محمي برمز المالك" : "Owner Authenticated"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يستقبل مسار Webhook الرسائل الموثقة ويحتفظ بها في ذاكرة الخادم المؤقتة. القراءة مشروطة برمز المالك (PIN). لا توجد قاعدة بيانات دائمة."
                  : "The Webhook receives verified events in ephemeral memory. Reading requires Owner PIN. No persistent database."}
              </p>
            </div>
          </div>

          <span className="rounded-lg border border-warning/30 px-3 py-2 text-xs text-warning">
            {isAr
              ? "يتطلب ضبط META_APP_SECRET و OWNER_PUBLISH_PIN"
              : "Requires META_APP_SECRET & OWNER_PUBLISH_PIN"}
          </span>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid gap-3 sm:grid-cols-4 pt-1">
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "حالة الرد التلقائي:" : "Auto-Reply Status:"}
            </span>
            <div className="text-sm font-bold text-warning mt-0.5">
              {isAr ? "معطل (اعتماد يدوي)" : "Disabled (Manual)"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "الرسائل بالذاكرة المؤقتة:" : "Buffered In-Memory:"}
            </span>
            <div className="font-mono text-sm font-bold text-foreground mt-0.5">
              {inboxAuthRequired ? "🔒 محمي" : `${inboxMessages.length} ${isAr ? "رسالة" : "msgs"}`}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "قاعدة البيانات الدائمة:" : "Persistent DB:"}
            </span>
            <div className="font-mono text-sm font-bold text-warning mt-0.5">
              {isAr ? "غير مربوطة" : "None"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "نموذج الذكاء الاصطناعي:" : "AI Model:"}
            </span>
            <div className="font-mono text-sm font-bold text-emerald-400 mt-0.5">
              Gemini 2.5 / 2.0
            </div>
          </div>
        </div>
      </section>

      {/* 2. Inbound Messages Inbox (Protected by Owner PIN) */}
      <section className="glass space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-primary" />
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صندوق الاستفسارات الواردة (Webhook Buffer)" : "Inbound Inquiries Buffer"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchInbox()}
              disabled={loadingInbox}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <RefreshCw className={`size-3 ${loadingInbox ? "animate-spin" : ""}`} />
              {isAr ? "تحديث" : "Refresh"}
            </button>
            <span className="text-xs text-muted-foreground">
              {inboxAuthRequired
                ? isAr ? "يتطلب إذن المالك" : "Auth Required"
                : inboxMessages.length > 0
                  ? isAr ? `${inboxMessages.length} رسالة` : `${inboxMessages.length} msgs`
                  : isAr ? "الذاكرة فارغة" : "Empty"}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {/* Auth Required State */}
          {inboxAuthRequired && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-5 text-center space-y-3">
              <Lock className="size-6 mx-auto text-warning" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">
                  {isAr ? "صندوق الوارد محمي برمز المالك" : "Inbox Protected with Owner PIN"}
                </h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {isAr
                    ? "لحماية خصوصية العملاء، لا يمكن عرض الرسائل الواردة إلا بعد التحقق من هوية المالك باستخدام رمز PIN المعتمد."
                    : "To safeguard client privacy, viewing incoming messages requires verified Owner PIN authentication."}
                </p>
              </div>
              <button
                type="button"
                onClick={handlePromptOwnerPin}
                className="inline-flex items-center gap-2 rounded-lg bg-warning text-warning-foreground font-semibold px-4 py-2 text-xs shadow-sm hover:opacity-90 cursor-pointer"
              >
                <KeyRound className="size-3.5" />
                {isAr ? "إدخال رمز المالك لعرض الرسائل" : "Enter Owner PIN"}
              </button>
            </div>
          )}

          {/* Unconfigured State */}
          {inboxUnconfigured && (
            <div className="rounded-lg border border-border p-5 text-center space-y-2">
              <AlertCircle className="size-6 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "قراءة صندوق الوارد معطلة مؤقتاً لعدم ضبط OWNER_PUBLISH_PIN على الخادم حفاظاً على خصوصية العملاء."
                  : "Inbox access is temporarily disabled because OWNER_PUBLISH_PIN is not configured on the server."}
              </p>
            </div>
          )}

          {/* Authenticated Messages List */}
          {!inboxAuthRequired && !inboxUnconfigured && inboxMessages.map((msg) => (
            <div
              key={msg.id}
              className="rounded-lg border border-border bg-background/40 p-3.5 space-y-2.5 hover:border-primary/50 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${
                      msg.platform === "whatsapp"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : msg.platform === "messenger"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-pink-500/20 text-pink-400"
                    }`}
                  >
                    {msg.platform === "whatsapp"
                      ? "WhatsApp"
                      : msg.platform === "messenger"
                        ? "Messenger"
                        : "Instagram"}
                  </span>
                  <span className="font-bold text-foreground">
                    {msg.senderName || msg.senderId}
                  </span>
                </div>

                <span className="text-[11px] text-muted-foreground">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div className="rounded bg-secondary/50 p-2.5 text-xs text-foreground/90 leading-relaxed">
                {msg.text}
              </div>

              <div className="flex items-center justify-end gap-2 text-xs pt-1">
                <button
                  type="button"
                  onClick={() => handleDraftFromInbox(msg)}
                  disabled={generatingReply}
                  className="flex items-center gap-1.5 rounded bg-primary/20 border border-primary/30 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 transition cursor-pointer"
                >
                  <Sparkles className="size-3" />
                  {isAr ? "صياغة رد بواسطة كوتش براين" : "Draft Reply with Coach Brain"}
                </button>
              </div>
            </div>
          ))}

          {!inboxAuthRequired && !inboxUnconfigured && inboxMessages.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
              <AlertCircle className="size-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "لا توجد رسائل واردة حالياً بالذاكرة المؤقتة. فور تفعيل Webhook في Meta وإرسال استفسار، ستظهر الرسالة هنا مباشرة لتوليد الرد بضغطة زر."
                  : "No incoming messages in the buffer. Once Meta Webhook is connected and verified, received inquiries will appear here."}
              </p>
              <p className="text-[11px] text-warning/80">
                {isAr
                  ? "ملاحظة: البيانات محفوظة في ذاكرة الخادم فقط؛ يلزم ربط قاعدة بيانات دائمة للاحتفاظ بالأرشيف عند إعادة التشغيل."
                  : "Note: In-memory only; durable storage requires a persistent database."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 3. Official Omnichannel Contact Lines */}
      <section className="glass space-y-3 p-4">
        <h3 className="font-display text-sm tracking-wider text-primary">
          {isAr ? "القنوات الرسمية المعتمدة للأكاديمية" : "Official Channels"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href={`https://wa.me/${phoneE164}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 transition hover:border-emerald-500 hover:bg-emerald-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "واتساب الحجوزات" : "WhatsApp"}
              </div>
              <div dir="ltr" className="font-mono text-sm font-bold text-emerald-400">
                {phoneDisplay}
              </div>
            </div>
            <ExternalLink className="size-4 text-emerald-400" />
          </a>

          <a
            href={messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-950/20 p-3 transition hover:border-blue-500 hover:bg-blue-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "فيسبوك مسنجر" : "Messenger"}
              </div>
              <div className="text-xs font-semibold text-blue-400">m.me/{fbPageId}</div>
            </div>
            <ExternalLink className="size-4 text-blue-400" />
          </a>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-pink-500/30 bg-pink-950/20 p-3 transition hover:border-pink-500 hover:bg-pink-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "إنستغرام دايركت" : "Instagram DM"}
              </div>
              <div className="text-xs font-semibold text-pink-400">@RelaxFixUAE</div>
            </div>
            <ExternalLink className="size-4 text-pink-400" />
          </a>

          <a
            href="tel:+971551378660"
            className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3 transition hover:border-primary hover:bg-secondary"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "هاتف الإدارة (مكالمات)" : "Management Line"}
              </div>
              <div dir="ltr" className="font-mono text-sm font-bold text-foreground">
                {mgmtPhoneDisplay}
              </div>
            </div>
            <Phone className="size-4 text-primary" />
          </a>
        </div>
      </section>

      {/* 4. Manual / Interactive AI Composer */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صياغة وتعديل الرد بواسطة كوتش براين" : "Coach Brain Reply Composer"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "صياغة رد مخصص لأي استفسار مع إمكانية المراجعة والتعديل قبل النقر للإرسال:"
                : "Draft a tailored response with full human review before sending:"}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/60 p-1 text-xs">
            <span className="px-1.5 text-muted-foreground">{isAr ? "القناة:" : "Channel:"}</span>
            <button
              type="button"
              onClick={() => setReplyChannel("whatsapp")}
              className={`rounded px-2.5 py-1 font-medium transition cursor-pointer ${
                replyChannel === "whatsapp"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              واتساب
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("messenger")}
              className={`rounded px-2.5 py-1 font-medium transition cursor-pointer ${
                replyChannel === "messenger"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              مسنجر
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("instagram")}
              className={`rounded px-2.5 py-1 font-medium transition cursor-pointer ${
                replyChannel === "instagram"
                  ? "bg-pink-600 text-white shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              إنستغرام
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            placeholder={
              isAr
                ? `مثال استفسار عبر ${channelNames[replyChannel]}: "كم سعر حصص الأطفال لشهرين مع بعض في فرع مدينة خليفة؟"`
                : "e.g. What is the pricing for kids group lessons in Khalifa City?"
            }
            rows={2}
            className="w-full rounded-lg border border-input bg-background/50 p-2.5 text-sm outline-none focus:border-primary"
          />

          <button
            onClick={() => generateReplyWithBrain()}
            disabled={!clientQuery.trim() || generatingReply}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`size-4 ${generatingReply ? "animate-spin" : ""}`} />
            {generatingReply
              ? isAr
                ? "كوتش براين يصيغ الرد…"
                : "Thinking…"
              : isAr
                ? "صياغة رد بواسطة كوتش براين"
                : "Draft Reply with AI"}
          </button>
        </div>

        {aiSuggestedReply && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">
                {isAr ? "الرد المقترح (راجع وعدّل كما تشاء):" : "Suggested Reply (Review & Edit):"}
              </span>
              <button
                onClick={copyReply}
                className="flex items-center gap-1 rounded border border-primary/40 px-2 py-1 text-xs hover:bg-primary/10 cursor-pointer"
              >
                {copiedReply ? (
                  <Check className="size-3 text-accent" />
                ) : (
                  <Copy className="size-3" />
                )}
                {copiedReply ? (isAr ? "تم النسخ!" : "Copied!") : isAr ? "نسخ الرد" : "Copy Reply"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-background/40 p-3 rounded-lg border border-border">
              {aiSuggestedReply}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {replyChannel === "whatsapp" && (
                <a
                  href={`https://wa.me/${phoneE164}?text=${encodeURIComponent(aiSuggestedReply)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
                >
                  <Send className="size-3.5" />
                  {isAr ? "فتح واتساب بمسودة الرد" : "Open WhatsApp with draft"}
                </a>
              )}
              {replyChannel === "messenger" && (
                <button
                  type="button"
                  onClick={openMessengerWithCopy}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm cursor-pointer"
                >
                  <ExternalLink className="size-3.5" />
                  {isAr ? "نسخ وفتح مسنجر" : "Open Messenger"}
                </button>
              )}
              {replyChannel === "instagram" && (
                <button
                  type="button"
                  onClick={openInstagramWithCopy}
                  className="flex items-center gap-1.5 rounded-md bg-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-pink-500 shadow-sm cursor-pointer"
                >
                  <ExternalLink className="size-3.5" />
                  {isAr ? "نسخ وفتح إنستغرام" : "Open Instagram DM"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 5. Campaign Link Generator */}
      <section className="glass space-y-4 p-4">
        <div>
          <h3 className="font-display text-sm tracking-wider text-primary">
            {isAr
              ? "روابط الحملات الإعلانية الذكية (Lead Generation Links)"
              : "Smart Lead Generation Links"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "روابط سريعة لوضعها في إعلانات فيسبوك وإنستغرام لتوجيه العميل مباشرة إلى الواتساب مع رسالة افتتاحية:"
              : "Quick links for ads to direct clients to WhatsApp with pre-filled text:"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition cursor-pointer ${
                selectedTemplate === tmpl.id
                  ? "border-emerald-500 bg-emerald-500 text-white font-medium"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? tmpl.titleAr : tmpl.titleEn}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            <Send className="size-4" />
            {isAr ? "فتح واتساب مع الرسالة" : "Open WhatsApp"}
          </a>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm hover:bg-secondary cursor-pointer"
          >
            {copiedLink ? (
              <Check className="size-4 text-emerald-400" />
            ) : (
              <Copy className="size-4" />
            )}
            {copiedLink ? (isAr ? "تم النسخ!" : "Copied!") : isAr ? "نسخ رابط الحملة" : "Copy Link"}
          </button>
        </div>
      </section>
    </div>
  );
}
