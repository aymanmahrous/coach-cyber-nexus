import { useState, useEffect } from "react";
import {
  canSendStaffWhatsApp,
  getStaffConversationMessages,
  getStaffInbox,
  returnStaffConversationToAi,
  sendStaffWhatsAppMessage,
  signInStaff,
  takeOverStaffConversation,
  type StaffInboxMessage,
  type StaffSession,
} from "@/lib/staff-whatsapp";
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
  ShieldCheck,
  Radio,
} from "lucide-react";

type Lang = "ar" | "en";

interface WhatsAppHubProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}

type InboundMessage = StaffInboxMessage;

interface ChannelStatusMap {
  whatsapp?: { status: string; configured: boolean; verifiedLive: boolean; missingConfig: string[] };
  messenger?: { status: string; configured: boolean; verifiedLive: boolean; missingConfig: string[] };
  instagram?: { status: string; configured: boolean; verifiedLive: boolean; missingConfig: string[] };
  facebook_page?: { status: string; configured: boolean; verifiedLive: boolean; missingConfig: string[] };
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
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffAuthError, setStaffAuthError] = useState("");
  const [staffAuthBusy, setStaffAuthBusy] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<unknown[]>([]);
  const [channelDiagnostics, setChannelDiagnostics] = useState<ChannelStatusMap>({});

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

  const fetchChannelStatus = async () => {
    try {
      const res = await fetch("/api/meta-webhook?action=status");
      if (res.ok) {
        const data = await res.json();
        if (data.channels) {
          setChannelDiagnostics(data.channels);
        }
      }
    } catch {
      // Quiet failover
    }
  };

  const fetchInbox = async (session = staffSession) => {
    if (!session) return;
    setLoadingInbox(true);
    try {
      setInboxMessages(await getStaffInbox(session));
      setStaffAuthError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "INBOX_FAILED";
      if (message === "SESSION_EXPIRED" || message === "STAFF_ACCESS_DENIED") {
        setStaffSession(null);
        setInboxMessages([]);
      } else {
        setStaffAuthError(message);
      }
    } finally {
      setLoadingInbox(false);
    }
  };

  const handleStaffSignIn = async () => {
    if (!staffEmail.trim() || !staffPassword) return;
    setStaffAuthBusy(true);
    setStaffAuthError("");
    try {
      const session = await signInStaff(staffEmail, staffPassword);
      setStaffSession(session);
      setStaffPassword("");
      await fetchInbox(session);
      log(isAr ? `تم تسجيل دخول الموظف: ${session.displayName}` : `Staff session opened for ${session.displayName}`, "ok");
    } catch (error) {
      setStaffAuthError(error instanceof Error ? error.message : "LOGIN_FAILED");
    } finally {
      setStaffAuthBusy(false);
    }
  };

  const handleStaffSignOut = () => {
    setStaffSession(null);
    setInboxMessages([]);
    setSelectedConversationId(null);
    setConversationMessages([]);
  };

  useEffect(() => {
    fetchChannelStatus();
  }, []);

  useEffect(() => {
    if (staffSession) fetchInbox(staffSession);
  }, [staffSession]);

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

  const getStatusBadge = (status?: string) => {
    if (status === "verified") {
      return (
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400 font-bold">
          {isAr ? "متصل ومتحقق" : "Verified"}
        </span>
      );
    }
    if (status === "configured_unverified") {
      return (
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 font-mono text-[10px] text-blue-400 font-bold">
          {isAr ? "اعتماد متاح (غير مجرب)" : "Configured (Unverified)"}
        </span>
      );
    }
    if (status === "blocked") {
      return (
        <span className="rounded-full bg-destructive/20 px-2 py-0.5 font-mono text-[10px] text-destructive font-bold">
          {isAr ? "مرفوض / صلاحية ناقصة" : "Blocked / Revoked"}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-warning/20 px-2 py-0.5 font-mono text-[10px] text-warning font-bold">
        {isAr ? "بحاجة لإعداد" : "Needs Setup"}
      </span>
    );
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
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
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
    setSelectedConversationId(msg.conversationId);
    setClientQuery(msg.text);
    const mappedChannel =
      msg.platform === "whatsapp" || msg.platform === "messenger" || msg.platform === "instagram"
        ? msg.platform
        : "whatsapp";
    setReplyChannel(mappedChannel);
    generateReplyWithBrain(msg.text, mappedChannel);
  };

  const handleLoadMessages = async (conversationId: string) => {
    if (!staffSession) return;
    try {
      setSelectedConversationId(conversationId);
      setConversationMessages(await getStaffConversationMessages(staffSession, conversationId));
    } catch (error) {
      log(`${isAr ? "فشل تحميل الرسائل" : "Message history failed"}: ${error instanceof Error ? error.message : "ERROR"}`, "err");
    }
  };

  const handleTakeover = async (conversationId: string) => {
    if (!staffSession) return;
    try {
      await takeOverStaffConversation(staffSession, conversationId);
      await fetchInbox(staffSession);
      log(isAr ? "تم تحويل المحادثة إلى الموظف" : "Conversation taken over by staff", "ok");
    } catch (error) {
      log(`${isAr ? "فشل التحويل" : "Takeover failed"}: ${error instanceof Error ? error.message : "ERROR"}`, "err");
    }
  };

  const handleReturnToAi = async (conversationId: string) => {
    if (!staffSession) return;
    try {
      await returnStaffConversationToAi(staffSession, conversationId);
      await fetchInbox(staffSession);
      log(isAr ? "عادت المحادثة إلى Coach Brain" : "Conversation returned to Coach Brain", "ok");
    } catch (error) {
      log(`${isAr ? "فشل الإرجاع" : "Return failed"}: ${error instanceof Error ? error.message : "ERROR"}`, "err");
    }
  };

  const handleSendStaffReply = async () => {
    if (!staffSession || !selectedConversationId || !aiSuggestedReply.trim()) return;
    if (replyChannel !== "whatsapp") {
      log(isAr ? "الإرسال الدائم متاح حالياً عبر وظيفة WhatsApp الحالية فقط" : "Durable send is currently wired to the existing WhatsApp function only", "err");
      return;
    }
    try {
      const result = await sendStaffWhatsAppMessage(staffSession, selectedConversationId, aiSuggestedReply);
      log(result.dryRun ? (isAr ? "تم تسجيل إرسال تجريبي دون رسالة حقيقية" : "Dry-run reply recorded; no real message sent") : (isAr ? "تم إرسال الرد وتسجيله" : "Reply sent and recorded"), "ok");
      await fetchInbox(staffSession);
    } catch (error) {
      log(`${isAr ? "فشل إرسال الرد" : "Reply failed"}: ${error instanceof Error ? error.message : "ERROR"}`, "err");
    }
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
      {/* 1. Transparent Omnichannel Status Header */}
      <section className="glass space-y-4 border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Radio className="size-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm tracking-wider text-primary">
                  {isAr
                    ? "مركز تكاملات Meta الموحد (Coach Brain Ingress)"
                    : "Unified Meta Omnichannel Hub"}
                </h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  Webhook v21.0
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "فحص آمن يميز بين الإعداد الناقص، والاعتماد المتاح، والاتصال الذي اجتاز اختباراً فعلياً دون كشف أي أسرار."
                  : "Safe diagnostics distinguishing missing setup, configured credentials, and verified live connection."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchChannelStatus();
              fetchInbox();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition"
          >
            <RefreshCw className="size-3.5" />
            {isAr ? "تحديث الحالة" : "Refresh Status"}
          </button>
        </div>

        {/* Channel Diagnostic Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          {/* WhatsApp */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400">WhatsApp Cloud</span>
              {getStatusBadge(channelDiagnostics.whatsapp?.status)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "رقم الهاتف / الحساب:" : "Phone ID:"}{" "}
              <span className="font-mono text-foreground font-semibold">058 821 9130</span>
            </div>
          </div>

          {/* Messenger */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400">FB Messenger</span>
              {getStatusBadge(channelDiagnostics.messenger?.status)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "الصفحة:" : "Page:"}{" "}
              <span className="font-mono text-foreground font-semibold">m.me/{fbPageId}</span>
            </div>
          </div>

          {/* Instagram */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-400">Instagram DM</span>
              {getStatusBadge(channelDiagnostics.instagram?.status)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "الحساب:" : "Account:"}{" "}
              <span className="font-mono text-foreground font-semibold">@RelaxFixUAE</span>
            </div>
          </div>

          {/* Facebook Publishing */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-400">FB Page Posts</span>
              {getStatusBadge(channelDiagnostics.facebook_page?.status)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "النشر المعتمد:" : "Publishing:"}{" "}
              <span className="text-foreground font-semibold">{isAr ? "محمي برمز PIN" : "PIN Guarded"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Durable Supabase Staff Inbox */}
      <section className="glass space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-primary" />
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صندوق الموظفين الدائم (Supabase)" : "Durable Staff Inbox (Supabase)"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {staffSession && (
              <>
                <span className="text-xs text-muted-foreground">{staffSession.displayName}</span>
                <button type="button" onClick={() => fetchInbox()} disabled={loadingInbox} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary cursor-pointer">
                  <RefreshCw className={`size-3 ${loadingInbox ? "animate-spin" : ""}`} />
                  {isAr ? "تحديث" : "Refresh"}
                </button>
                <button type="button" onClick={handleStaffSignOut} className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary cursor-pointer">
                  {isAr ? "خروج" : "Sign out"}
                </button>
              </>
            )}
          </div>
        </div>

        {!staffSession ? (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-warning"><Lock className="size-4" /><strong className="text-sm">{isAr ? "دخول موظف مطلوب" : "Staff sign-in required"}</strong></div>
            <p className="text-xs text-muted-foreground">{isAr ? "يستخدم هذا الدخول جلسة Supabase وصلاحيات Staff. لا يتم إرسال Owner PIN إلى المتصفح ولا تخزينه." : "This uses a Supabase Staff session. The Owner PIN is not sent to or stored in the browser."}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} type="email" autoComplete="username" placeholder={isAr ? "البريد الإلكتروني" : "Staff email"} className="rounded border border-input bg-background/60 px-3 py-2 text-xs outline-none focus:border-primary" />
              <input value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} type="password" autoComplete="current-password" placeholder={isAr ? "كلمة المرور" : "Password"} onKeyDown={(e) => { if (e.key === "Enter") handleStaffSignIn(); }} className="rounded border border-input bg-background/60 px-3 py-2 text-xs outline-none focus:border-primary" />
            </div>
            <button type="button" onClick={handleStaffSignIn} disabled={staffAuthBusy || !staffEmail.trim() || !staffPassword} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer">
              {staffAuthBusy ? (isAr ? "جارٍ التحقق…" : "Signing in…") : (isAr ? "دخول آمن" : "Secure sign in")}
            </button>
            {staffAuthError && <p className="text-xs text-destructive">{staffAuthError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {inboxMessages.map((msg) => (
              <div key={msg.id} className="rounded-lg border border-border bg-background/40 p-3.5 space-y-2.5 hover:border-primary/50 transition">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${msg.platform === "whatsapp" ? "bg-emerald-500/20 text-emerald-400" : msg.platform === "messenger" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>{msg.platform}</span>
                    <span className="font-bold text-foreground">{msg.senderName || msg.senderId}</span>
                    <span className="text-muted-foreground">{msg.unread} unread</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="rounded bg-secondary/50 p-2.5 text-xs text-foreground/90 leading-relaxed">{msg.text || (isAr ? "لا توجد رسالة أخيرة" : "No last message")}</div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs pt-1">
                  <button type="button" onClick={() => { setSelectedConversationId(msg.conversationId); handleDraftFromInbox(msg); }} disabled={generatingReply} className="flex items-center gap-1.5 rounded bg-primary/20 border border-primary/30 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 transition cursor-pointer"><Sparkles className="size-3" />{isAr ? "صياغة رد" : "Draft reply"}</button>
                  <button type="button" onClick={() => handleLoadMessages(msg.conversationId)} className="rounded border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary cursor-pointer">{isAr ? "عرض الرسائل" : "View messages"}</button>
                  {msg.mode === "human_takeover" || msg.mode === "human_required" ? (
                    <button type="button" onClick={() => handleReturnToAi(msg.conversationId)} className="rounded border border-primary/30 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/10 cursor-pointer">{isAr ? "إرجاع إلى Coach Brain" : "Return to AI"}</button>
                  ) : (
                    <button type="button" onClick={() => handleTakeover(msg.conversationId)} className="rounded border border-warning/40 px-2.5 py-1 text-[11px] text-warning hover:bg-warning/10 cursor-pointer">{isAr ? "تحويل لموظف" : "Take over"}</button>
                  )}
                </div>
              </div>
            ))}
            {inboxMessages.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2"><AlertCircle className="size-5 mx-auto text-muted-foreground" /><p className="text-xs text-muted-foreground">{isAr ? "لا توجد محادثات واردة في Supabase أو لا تملك الجلسة صلاحية القراءة." : "No persisted conversations, or this Staff session has no access."}</p></div>}
            {selectedConversationId && conversationMessages.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-primary">{isAr ? "سجل الرسائل" : "Message history"}</div>
                {conversationMessages.map((item, index) => {
                  const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
                  const body = String(row["body"] || row["content"] || row["text"] || "");
                  const direction = String(row["direction"] || row["sender_type"] || row["role"] || "");
                  return <div key={`${selectedConversationId}-${index}`} className="rounded bg-background/50 p-2 text-xs"><span className="mr-2 text-muted-foreground">{direction}</span>{body}</div>;
                })}
              </div>
            )}
            {staffAuthError && <p className="text-xs text-destructive">{staffAuthError}</p>}
          </div>
        )}
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

      {/* 4. Interactive AI Composer */}
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
              {replyChannel === "whatsapp" && staffSession && selectedConversationId && canSendStaffWhatsApp(staffSession) && (
                <button type="button" onClick={handleSendStaffReply} className="flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-3.5 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20 cursor-pointer">
                  <ShieldCheck className="size-3.5" />
                  {isAr ? "إرسال عبر الوظيفة الحالية (Dry-run)" : "Send via existing function (dry-run)"}
                </button>
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
