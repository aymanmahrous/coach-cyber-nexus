import { useState, useEffect } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  Bot,
} from "lucide-react";
import type { OfficialStaffSession } from "@/lib/official-auth";
import {
  getStaffInbox,
  getStaffConversationMessages,
  takeOverStaffConversation,
  returnStaffConversationToAi,
  type StaffInboxMessage,
  type StaffConversationMessage,
} from "@/lib/staff-whatsapp";

type Lang = "ar" | "en";

interface WhatsAppHubProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
  session: OfficialStaffSession;
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

export function WhatsAppHub({ lang, log, session }: WhatsAppHubProps) {
  const isAr = lang === "ar";
  const [inbox, setInbox] = useState<StaffInboxMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<StaffConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [mutatingMode, setMutatingMode] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]!.id);
  const [customText, setCustomText] = useState(isAr ? TEMPLATES[0]!.textAr : TEMPLATES[0]!.textEn);
  const [clientQuery, setClientQuery] = useState("");
  const [aiSuggestedReply, setAiSuggestedReply] = useState("");
  const [replyChannel, setReplyChannel] = useState<"whatsapp" | "messenger" | "instagram">("whatsapp");
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

  async function loadInboxData() {
    setLoadingInbox(true);
    setInboxError(false);
    try {
      const items = await getStaffInbox(session);
      setInbox(items);
      if (items.length > 0 && !selectedConvId) {
        setSelectedConvId(items[0]!.conversationId);
      }
    } catch {
      setInboxError(true);
    } finally {
      setLoadingInbox(false);
    }
  }

  useEffect(() => {
    void loadInboxData();
  }, [session.accessToken]);

  useEffect(() => {
    if (!selectedConvId) return;
    setLoadingMessages(true);
    setMessagesError(false);
    setConvMessages([]);
    getStaffConversationMessages(session, selectedConvId)
      .then(setConvMessages)
      .catch(() => setMessagesError(true))
      .finally(() => setLoadingMessages(false));
  }, [selectedConvId, session.accessToken]);

  async function handleTakeover(convId: string) {
    if (mutatingMode) return;
    setMutatingMode(true);
    try {
      await takeOverStaffConversation(session, convId);
      setInbox((prev) =>
        prev.map((c) => (c.conversationId === convId ? { ...c, mode: "human_takeover" } : c)),
      );
      log(isAr ? "تم الاستحواذ البشري على المحادثة" : "Staff took over conversation", "ok");
    } catch (e) {
      log(`${isAr ? "تعذر الاستحواذ" : "Takeover failed"}: ${(e as Error).message}`, "err");
    } finally {
      setMutatingMode(false);
    }
  }

  async function handleReturnToAi(convId: string) {
    if (mutatingMode) return;
    setMutatingMode(true);
    try {
      await returnStaffConversationToAi(session, convId);
      setInbox((prev) =>
        prev.map((c) => (c.conversationId === convId ? { ...c, mode: "ai_active" } : c)),
      );
      log(isAr ? "تم تغيير وضع المحادثة إلى الذكاء الاصطناعي" : "Conversation set to AI mode", "ok");
    } catch (e) {
      log(`${isAr ? "تعذر الإرجاع" : "Return failed"}: ${(e as Error).message}`, "err");
    } finally {
      setMutatingMode(false);
    }
  }

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

  const generateReplyWithBrain = async () => {
    if (!clientQuery.trim() || generatingReply) return;
    setGeneratingReply(true);
    setAiSuggestedReply("");

    const channelContext =
      replyChannel === "messenger"
        ? "المنصة المستهدفة: فيسبوك مسنجر (Facebook Messenger)."
        : replyChannel === "instagram"
          ? "المنصة المستهدفة: إنستغرام دايركت (Instagram Direct)."
          : "المنصة المستهدفة: واتساب (WhatsApp).";

    const prompt = `أنت المساعد الذكي لمبيعات وتأهيل السباحة لكابتن أيمن في أبوظبي.
${channelContext}
استفسار العميل الوارد:
"${clientQuery}"

قواعد الرد المعتمدة:
1. التعاطف والتطمين أولاً بشأن الخوف من الماء.
2. توضيح أن التقييم الأولي مجاني تماماً بإشراف كابتن أيمن شخصياً لتحديد المستوى.
3. باقات التدريب: مجموعات أطفال (450 درهم / خصم إخوة 400 درهم)، حصص خاصة (150 / 250 درهم).
4. الفروع: المشرف، الفلاح، مدينة خليفة، الدانة.
5. دعوة لاختيار الفرع لحجز جلسة التقييم المجاني.`;

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) throw new Error(await res.text());
      const reply = await res.text();
      setAiSuggestedReply(reply.trim());
      log(
        isAr
          ? `تمت صياغة الرد لمنصة ${channelNames[replyChannel]} بواسطة كوتش براين`
          : "AI reply generated",
        "ok",
      );
    } catch (e) {
      log(`${isAr ? "تعذر توليد الرد" : "Failed to generate reply"}: ${(e as Error).message}`, "err");
    } finally {
      setGeneratingReply(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Integration Header Banner */}
      <section className="glass space-y-4 border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <MessageCircle className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm tracking-wider text-primary">
                  {isAr
                    ? "صندوق محادثات الموظفين وأدوات التحكم"
                    : "Staff Inbox & Conversation Controls"}
                </h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground font-bold">
                  {isAr ? "الاستقبال غير مفحوص" : "Ingress Unverified"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تعرض الشاشة نتائج استدعاءات قاعدة البيانات؛ لا تتحقق من استقبال n8n. الإرسال الخارجي معطل، وتغيير وضع المحادثة لا يُعتمد إلا بعد نجاح قاعدة البيانات."
                  : "This screen displays database RPC results; it does not verify n8n ingress. External sending is disabled, and conversation-mode changes are accepted only after database success."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadInboxData()}
              disabled={loadingInbox}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loadingInbox ? "animate-spin" : ""}`} />
              {isAr ? "تحديث المحادثات" : "Refresh"}
            </button>
            <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground font-mono">
              058 821 9130
            </span>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid gap-3 sm:grid-cols-4 pt-1">
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "حالة الاستقبال:" : "Ingress status:"}
            </span>
            <div className="text-sm font-bold text-muted-foreground mt-0.5">
              {isAr ? "غير مفحوص" : "Not checked"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "المحادثات المفتوحة:" : "Active Conversations:"}
            </span>
            <div className="font-mono text-sm font-bold text-foreground mt-0.5">
              {inbox.length}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "الاستحواذ البشري النشط:" : "Human Takeover Active:"}
            </span>
            <div className="font-mono text-sm font-bold text-warning mt-0.5">
              {inbox.filter((c) => c.mode === "human_takeover").length}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">
              {isAr ? "حالة الإرسال الخارجي:" : "Outbound Sending:"}
            </span>
            <div className="font-mono text-sm font-bold text-accent mt-0.5">
              {isAr ? "محمي (Dry-run)" : "Protected (Dry-run)"}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Inbox and Conversation View */}
      <section className="glass grid gap-4 p-4 lg:grid-cols-12">
        {/* Conversations list */}
        <div className="space-y-3 lg:col-span-5 border-e border-border/40 pe-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "المحادثات الواردة" : "Incoming Conversations"}
            </h3>
            <span className="text-xs text-muted-foreground font-mono">{inbox.length}</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingInbox && (
              <p className="rounded-lg border border-border p-4 text-center text-xs text-muted-foreground">
                {isAr ? "جارٍ تحميل المحادثات…" : "Loading conversations…"}
              </p>
            )}
            {inboxError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-xs text-destructive"
              >
                {isAr
                  ? "تعذر قراءة المحادثات من قاعدة البيانات."
                  : "Could not read conversations from the database."}
              </p>
            )}
            {inbox.map((conv) => {
              const selected = conv.conversationId === selectedConvId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.conversationId)}
                  className={`cursor-pointer rounded-lg border p-3 transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/40 hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{conv.senderName}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                        conv.mode === "human_takeover"
                          ? "bg-warning/20 text-warning"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {conv.mode === "human_takeover"
                        ? isAr
                          ? "استحواذ بشري"
                          : "Staff Takeover"
                        : isAr
                          ? "وضع الذكاء الاصطناعي"
                          : "AI Mode"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">{conv.text}</p>
                </div>
              );
            })}

            {inbox.length === 0 && !loadingInbox && !inboxError && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                {isAr
                  ? "لم تُرجع قاعدة البيانات أي محادثات لموظفك."
                  : "The database returned no conversations for this staff session."}
              </p>
            )}
          </div>
        </div>

        {/* Selected conversation view */}
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "تفاصيل المحادثة وسجل الرسائل" : "Conversation History"}
            </h3>
            {selectedConvId && (
              <div className="flex items-center gap-2">
                {inbox.find((c) => c.conversationId === selectedConvId)?.mode === "human_takeover" ? (
                  <button
                    onClick={() => void handleReturnToAi(selectedConvId)}
                    disabled={mutatingMode}
                    className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <Bot className="size-3.5" />
                    {isAr ? "تغيير الوضع إلى الذكاء الاصطناعي" : "Set AI mode"}
                  </button>
                ) : (
                  <button
                    onClick={() => void handleTakeover(selectedConvId)}
                    disabled={mutatingMode}
                    className="flex items-center gap-1 rounded bg-warning px-2.5 py-1 text-xs font-semibold text-warning-foreground hover:bg-warning/90"
                  >
                    <UserCheck className="size-3.5" />
                    {isAr ? "الاستحواذ البشري" : "Take Over"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="min-h-64 max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/30 p-3">
            {loadingMessages && (
              <p className="text-center text-xs text-muted-foreground py-8">
                {isAr ? "جارٍ تحميل الرسائل…" : "Loading messages…"}
              </p>
            )}
            {messagesError && (
              <p role="alert" className="text-center text-xs text-destructive py-8">
                {isAr
                  ? "تعذر تحميل سجل الرسائل من قاعدة البيانات."
                  : "Could not load message history from the database."}
              </p>
            )}
            {!loadingMessages &&
              convMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[85%] rounded-lg p-2.5 text-xs ${
                    msg.direction === "outbound"
                      ? "ms-auto bg-primary text-primary-foreground"
                      : "me-auto bg-secondary text-foreground"
                  }`}
                >
                  <div className="text-[10px] opacity-75 mb-0.5">{msg.senderName}</div>
                  <div>{msg.text}</div>
                </div>
              ))}
            {!loadingMessages && !messagesError && convMessages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                {selectedConvId
                  ? isAr
                    ? "لا توجد رسائل في المحادثة المحددة."
                    : "No messages were returned for this conversation."
                  : isAr
                    ? "حدد محادثة من القائمة لعرض سجل الرسائل."
                    : "Select a conversation to view message history."}
              </p>
            )}
          </div>
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

      {/* 4. Manual On-Demand AI Composer */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صياغة رد يدوي عند الطلب (Manual AI Draft)" : "Manual On-Demand AI Responder"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "صياغة رد مخصص لمراجعته واعتماده قبل الإرسال:"
                : "Draft a tailored reply for manual review before sending:"}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setReplyChannel("whatsapp")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "whatsapp" ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground"
              }`}
            >
              واتساب
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("messenger")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "messenger" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground"
              }`}
            >
              مسنجر
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("instagram")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "instagram" ? "bg-pink-600 text-white shadow-sm" : "text-muted-foreground"
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
                ? `مثال استفسار عبر ${channelNames[replyChannel]}: "كم سعر حصص الأطفال في فرع مدينة خليفة؟"`
                : "e.g. What is the pricing for kids group lessons in Khalifa City?"
            }
            rows={2}
            className="w-full rounded-lg border border-input bg-background/50 p-2.5 text-sm outline-none focus:border-primary"
          />

          <button
            onClick={generateReplyWithBrain}
            disabled={!clientQuery.trim() || generatingReply}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
                {isAr ? "الرد المقترح:" : "Suggested Reply:"}
              </span>
              <button
                onClick={copyReply}
                className="flex items-center gap-1 rounded border border-primary/40 px-2 py-1 text-xs hover:bg-primary/10"
              >
                {copiedReply ? <Check className="size-3 text-accent" /> : <Copy className="size-3" />}
                {copiedReply ? (isAr ? "تم النسخ!" : "Copied!") : isAr ? "نسخ الرد" : "Copy Reply"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {aiSuggestedReply}
            </p>
          </div>
        )}
      </section>

      {/* 5. Campaign Link Generator */}
      <section className="glass space-y-4 p-4">
        <div>
          <h3 className="font-display text-sm tracking-wider text-primary">
            {isAr ? "روابط الحملات الإعلانية الذكية (Lead Generation Links)" : "Smart Lead Generation Links"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "روابط سريعة لوضعها في إعلانات فيسبوك وإنستغرام لتوجيه العميل إلى واتساب مباشرة:"
              : "Quick links for ads to direct clients to WhatsApp with pre-filled message:"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
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
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm hover:bg-secondary"
          >
            {copiedLink ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            {copiedLink ? (isAr ? "تم النسخ!" : "Copied!") : isAr ? "نسخ رابط الحملة" : "Copy Link"}
          </button>
        </div>
      </section>
    </div>
  );
}
