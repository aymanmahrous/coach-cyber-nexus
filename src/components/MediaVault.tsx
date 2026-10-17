import { useState, useEffect, useRef } from "react";
import {
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Video,
  Check,
  Copy,
  ShieldCheck,
  RefreshCw,
  Link2,
} from "lucide-react";
import type { OfficialStaffSession } from "@/lib/official-auth";
import {
  getStaffMediaAssets,
  uploadStaffMediaAsset,
  linkStaffMediaToContent,
  type StaffMediaAsset,
} from "@/lib/media-rpc";

type Lang = "ar" | "en";

interface MediaVaultProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
  session: OfficialStaffSession;
}

export function MediaVault({ lang, log, session }: MediaVaultProps) {
  const isAr = lang === "ar";
  const [assets, setAssets] = useState<StaffMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadMedia() {
    setLoading(true);
    setLoadError(false);
    try {
      const items = await getStaffMediaAssets(session);
      setAssets(items);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMedia();
  }, [session.accessToken]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let uploadedCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;

        const asset = await uploadStaffMediaAsset(
          session,
          file,
          "pool",
          isVideo ? "9:16" : "4:5",
        );
        setAssets((prev) => [asset, ...prev]);
        uploadedCount++;
      }
      if (uploadedCount > 0) {
        log(
          isAr
            ? `تم رفع وتخزين ${uploadedCount} ملف في وسائط التخزين وقاعدة البيانات بنجاح.`
            : `Uploaded and stored ${uploadedCount} asset(s) in media vault.`,
          "ok",
        );
      }
    } catch (err) {
      log(`${isAr ? "فشل الرفع" : "Upload failed"}: ${(err as Error).message}`, "err");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Integration Banner */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm tracking-wider text-primary">
                {isAr ? "مكتبة الوسائط الفعلية والتخزين السحابي" : "Official Media Vault & Storage"}
              </h2>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] text-emerald-400 font-bold">
                media_assets
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تخزين دائم في Supabase Storage وجدول media_assets مع إمكانية ربط الوسائط بالمنشورات."
                : "Durable Supabase storage & media_assets table with content linkage."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadMedia()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              {isAr ? "تحديث" : "Refresh"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Upload className={`size-4 ${uploading ? "animate-bounce" : ""}`} />
              {uploading
                ? isAr
                  ? "جارٍ الرفع…"
                  : "Uploading…"
                : isAr
                  ? "رفع وسائط جديدة"
                  : "Upload Media"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => void handleFileUpload(e)}
              className="hidden"
            />
          </div>
        </div>

        {/* Studio Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* 1. Canva Developer Integration - Honest status */}
          <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {isAr ? "Canva (غير مربوط حالياً)" : "Canva (Not Connected)"}
              </span>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {isAr ? "غير مهيأ" : "Not configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "أُحيل المسار القديم غير الدائم للتقاعد؛ يتطلب ربطاً رسمياً دائماً عبر مزود موثق."
                : "Legacy in-memory route retired; requires verified durable integration."}
            </p>
            <div className="pt-1">
              <a
                href="https://www.canva.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "فتح Canva الخارجي" : "Open Canva"}
              </a>
            </div>
          </div>

          {/* 2. Google Gemini AI Studio */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">
                {isAr ? "محرك Google Gemini AI للتصاميم" : "Google Gemini AI Studio"}
              </span>
              <Sparkles className="size-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "بديل فوري وقوي لتوليد برومبتات التصاميم والبوسترات الإعلانية بنقرة واحدة."
                : "Instant alternative to generate visual concepts and marketing design prompts."}
            </p>
            <div className="pt-1">
              <a
                href="https://gemini.google.com/app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Sparkles className="size-3.5" />
                {isAr ? "فتح Gemini Studio" : "Launch Gemini"}
              </a>
            </div>
          </div>

          {/* 3. Google Drive Archive */}
          <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {isAr ? "أرشيف Google Drive السحابي" : "Google Drive Media Archive"}
              </span>
              <FolderOpen className="size-4 text-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الوصول المباشر لمجلدات Drive التي تحتوي على صور وفيديوهات التدريب الأصلية."
                : "Direct access to Drive storage with high-resolution original training videos."}
            </p>
            <div className="pt-1">
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "فتح مجلد Google Drive" : "Open Google Drive"}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Asset Grid */}
      <section className="glass space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm tracking-wider text-primary">
            {isAr ? "الوسائط المخزنة في قاعدة البيانات" : "Stored Media Assets"}
          </h3>
          <span className="text-xs font-mono text-muted-foreground">{assets.length}</span>
        </div>

        {loading && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {isAr ? "جارٍ تحميل الوسائط…" : "Loading media assets…"}
          </p>
        )}

        {loadError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-xs text-destructive"
          >
            {isAr
              ? "تعذر تحميل الوسائط من خدمة Supabase؛ لم يتم اعتبارها قائمة فارغة."
              : "Media could not be loaded from Supabase; this is not an empty-library result."}
          </p>
        )}

        {!loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-background/40 p-3 space-y-3 hover:border-primary/50 transition"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {asset.type === "video" ? (
                      <Video className="size-3.5 text-accent" />
                    ) : (
                      <ImageIcon className="size-3.5 text-primary" />
                    )}
                    {asset.type.toUpperCase()}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {asset.ratio}
                  </span>
                </div>

                {asset.url ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded bg-black/40">
                    {asset.type === "video" ? (
                      <video src={asset.url} controls className="h-full w-full object-cover" />
                    ) : (
                      <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
                    )}
                  </div>
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground">
                    {asset.name}
                  </div>
                )}

                <div>
                  <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {asset.category} · {asset.id.slice(0, 16)}
                  </p>
                </div>
              </div>
            ))}

            {assets.length === 0 && !loadError && (
              <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                {isAr
                  ? "لا توجد وسائط مخزنة بعد. اضغط على 'رفع وسائط جديدة' لرفع صور أو فيديوهات للسباحة."
                  : "No media assets stored yet. Click 'Upload Media' to add swimming photos or videos."}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
