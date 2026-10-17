import { useState, useEffect } from "react";
import { Settings, ShieldCheck, X, RefreshCw } from "lucide-react";
import type { OfficialStaffSession } from "@/lib/official-auth";
import type { IntegrationSummary, IntegrationStatusType } from "@/routes/api/integrations";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "ar" | "en";
  session: OfficialStaffSession;
}

const STATUS_BADGES: Record<
  IntegrationStatusType,
  { labelAr: string; labelEn: string; colorClass: string }
> = {
  not_configured: {
    labelAr: "غير مهيأ (Not Configured)",
    labelEn: "Not Configured",
    colorClass: "bg-muted text-muted-foreground border-border",
  },
  setup_saved: {
    labelAr: "الإعدادات محفوظة (Setup Saved)",
    labelEn: "Setup Saved",
    colorClass: "bg-secondary text-foreground border-border",
  },
  configured_unverified: {
    labelAr: "مُهيأ / لم يُتحقق (Configured — Not Verified)",
    labelEn: "Configured — Not Verified",
    colorClass: "bg-warning/15 text-warning border-warning/40",
  },
  verified: {
    labelAr: "متحقق فعلياً (Verified)",
    labelEn: "Verified",
    colorClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  },
  blocked: {
    labelAr: "محظور حالياً (Blocked)",
    labelEn: "Blocked",
    colorClass: "bg-destructive/15 text-destructive border-destructive/40",
  },
};

export function SettingsModal({ isOpen, onClose, lang, session }: SettingsModalProps) {
  const isAr = lang === "ar";
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { integrations: IntegrationSummary[] };
        setIntegrations(data.integrations || []);
      }
    } catch {
      // Keep existing list
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      void fetchStatus();
    }
  }, [isOpen, session.accessToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass w-full max-w-2xl p-5 space-y-4 rounded-xl border border-border shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            <h2 className="font-display text-base text-primary">
              {isAr ? "إعدادات وتشخيص التكاملات الرسمية" : "Integration Status & Diagnostics"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchStatus()}
              disabled={loading}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title={isAr ? "تحديث" : "Refresh"}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          {isAr
            ? "تشخيص شفاف ومباشر: لا تُعرض المفاتيح أو الأسرار الحساسة، ولا يتم إجراء فحص نشر حي في المعاينة لمنع أي ظهور غير مقصود."
            : "Honest diagnostics: secrets are never leaked, and live publishing checks are omitted in preview."}
        </div>

        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pe-1">
          {integrations.map((item) => {
            const badge = STATUS_BADGES[item.status] || STATUS_BADGES.not_configured;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-background/50 p-3 flex flex-col gap-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-xs text-foreground">
                    {isAr ? item.labelAr : item.labelEn}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold ${badge.colorClass}`}
                  >
                    {isAr ? badge.labelAr : badge.labelEn}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? item.notesAr : item.notesEn}
                </p>
              </div>
            );
          })}

          {integrations.length === 0 && !loading && (
            <p className="text-center text-xs text-muted-foreground py-6">
              {isAr ? "جارٍ استرداد حالة التكاملات…" : "Retrieving integration status…"}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-border/40">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {isAr ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
