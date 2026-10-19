import { useState, useEffect, useRef } from "react";
import { ExternalLink, FolderOpen, Image, Sparkles, Upload, Video } from "lucide-react";

type Lang = "ar" | "en";

interface MediaVaultProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}

interface MediaAsset {
  id: string;
  name: string;
  type: "image" | "video";
  category: "brand" | "pool" | "technique";
  ratio: "9:16" | "4:5" | "1:1";
  url?: string;
  isUploaded?: boolean;
}

const DEFAULT_ASSETS: MediaAsset[] = [
  {
    id: "asset-1",
    name: "Relax Fix Brand Badge Placeholder",
    type: "image",
    category: "brand",
    ratio: "1:1",
  },
  {
    id: "asset-2",
    name: "Abu Dhabi Pool Photo Placeholder",
    type: "image",
    category: "pool",
    ratio: "4:5",
  },
  {
    id: "asset-3",
    name: "Freestyle Breathing Drill Placeholder",
    type: "video",
    category: "technique",
    ratio: "9:16",
  },
  {
    id: "asset-4",
    name: "Water Confidence Progression Placeholder",
    type: "video",
    category: "technique",
    ratio: "9:16",
  },
];

export function MediaVault({ lang, log }: MediaVaultProps) {
  const isAr = lang === "ar";
  const [assets, setAssets] = useState<MediaAsset[]>(DEFAULT_ASSETS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAssets: MediaAsset[] = [];
    let unsupportedFiles = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) {
        unsupportedFiles += 1;
        continue;
      }
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);

      newAssets.push({
        id: `upload-${Date.now()}-${i}`,
        name: file.name,
        type: isVideo ? "video" : "image",
        category: "pool",
        ratio: isVideo ? "9:16" : "4:5",
        url,
        isUploaded: true,
      });
    }

    if (newAssets.length > 0) {
      setAssets((current) => [...newAssets, ...current]);
      log(
        isAr
          ? `تمت إضافة ${newAssets.length} معاينة محلية مؤقتة؛ لم تُرفع إلى خادم أو تخزين سحابي.`
          : `Added ${newAssets.length} temporary local previews; files were not uploaded to a server or cloud storage.`,
        "info",
      );
    }
    if (unsupportedFiles > 0) {
      log(
        isAr
          ? `تم تجاهل ${unsupportedFiles} ملفاً لأن نوعه ليس صورة أو فيديو.`
          : `Skipped ${unsupportedFiles} file(s) that were not images or videos.`,
        "err",
      );
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Header and Integration Banner */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm tracking-wider text-primary">
              {isAr
                ? "معاينة الوسائط المحلية واستوديو التصميم (Canva & Gemini)"
                : "Local Media Preview & Creative Studio"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "المعاينات تبقى مؤقتاً في هذا الجهاز. التخزين السحابي ورفع الملفات للخادم غير مربوطين."
                : "Previews are temporary on this device. Cloud storage and server uploads are not connected."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="size-4" />
              {isAr ? "معاينة ملفات من جهازك" : "Preview Local Files"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Studio Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Provider integrations are shown only when their official staff-backed contracts are connected. */}
          {/* 2. Google Gemini AI Studio */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">
                {isAr ? "محرك Google Gemini AI البديل" : "Google Gemini AI Studio"}
              </span>
              <Sparkles className="size-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "بديل فوري وقوي لـ Canva لتوليد الصور والبوسترات الإعلانية بنقرة واحدة دون انتظار تفويض."
                : "Instant alternative to generate visuals with AI prompts without waiting for Canva."}
            </p>
            <div className="pt-1">
              <a
                href="https://gemini.google.com/app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Sparkles className="size-3.5" />
                {isAr ? "فتح Google Gemini وتوليد التصاميم" : "Launch Gemini Studio"}
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
                ? "الوصول المباشر لمجلدات Drive التي تحتوي على صور وفيديوهات المتدربين الأصلية."
                : "Direct access to Drive storage with high-resolution original training videos."}
            </p>
            <div className="pt-1">
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
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
        <h3 className="font-display text-sm tracking-wider text-primary">
          {isAr ? "المعاينات المحلية والقوالب الإرشادية" : "Local previews and sample placeholders"}
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex flex-col justify-between rounded-lg border border-border bg-background/40 p-3 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  {asset.type === "video" ? (
                    <Video className="size-3.5 text-accent" />
                  ) : (
                    <Image className="size-3.5 text-primary" />
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
                  {asset.category === "brand" ? "Relax Fix Official Badge" : "Abu Dhabi Pool Asset"}
                </div>
              )}

              <div>
                <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {asset.isUploaded
                    ? isAr
                      ? "معاينة محلية مؤقتة — غير مرفوعة"
                      : "Temporary local preview — not uploaded"
                    : isAr
                      ? "عنصر إرشادي — لا يحتوي ملفاً فعلياً"
                      : "Placeholder — no actual media file"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
