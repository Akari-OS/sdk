import { useState } from "react";
import { X, Download } from "lucide-react";
import { getXPlan, setXPlan, type XPlan } from "../lib/platforms";
import { loadSnsAccounts, setSnsAccount, type SnsAccount } from "../lib/account-store";
import { PlatformIcon } from "../components/icons/SnsIcons";

interface WriterSettingsProps {
  onClose: () => void;
  /** プラン変更時に親を再レンダリングさせるコールバック */
  onSettingsChanged?: () => void;
}

const X_PLANS: { id: XPlan; label: string; description: string }[] = [
  { id: "free", label: "Free", description: "280字制限" },
  { id: "premium", label: "Premium", description: "25,000字・スケジュール投稿" },
  { id: "premium_plus", label: "Premium+", description: "25,000字・動画4時間・16GB" },
];

export function WriterSettings({ onClose, onSettingsChanged }: WriterSettingsProps) {
  const [xPlan, setXPlanState] = useState<XPlan>(getXPlan);

  // SNS アカウント設定
  const [accounts, setAccounts] = useState<Record<string, SnsAccount>>(loadSnsAccounts);
  const xAccount = accounts["x"] ?? { displayName: "", username: "", avatarUrl: "" };
  const [fetchingAccount, setFetchingAccount] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "success" | "error">("idle");

  function updateXAccount(patch: Partial<SnsAccount>) {
    const updated = { ...xAccount, ...patch };
    setSnsAccount("x", updated);
    setAccounts((prev) => ({ ...prev, x: updated }));
    onSettingsChanged?.();
  }

  async function fetchXAccount() {
    setFetchingAccount(true);
    setFetchStatus("idle");
    try {
      const { callToolJson } = await import("@akari-os/sdk/mcp");
      const res = await callToolJson<{ id: string; name: string; username: string; profile_image_url?: string }>("operator_get_me", { target: "x" });
      updateXAccount({
        displayName: res.name,
        username: res.username,
        avatarUrl: res.profile_image_url ?? "",
      });
      setFetchStatus("success");
    } catch {
      setFetchStatus("error");
    } finally {
      setFetchingAccount(false);
      setTimeout(() => setFetchStatus("idle"), 3000);
    }
  }

  function handleXPlanChange(plan: XPlan) {
    setXPlanState(plan);
    setXPlan(plan);
    onSettingsChanged?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Writer 設定</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-5 overflow-y-auto flex-1">
          {/* X プラン */}
          <div>
            <div className="text-xs font-medium mb-2">𝕏 プラン</div>
            <p className="text-[10px] text-muted-foreground mb-2">
              お使いの X アカウントのプランを選択してください。文字数制限や利用可能な機能が変わります。
            </p>
            <div className="space-y-1.5">
              {X_PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => handleXPlanChange(plan.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition ${
                    xPlan === plan.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    xPlan === plan.id ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {xPlan === plan.id && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{plan.label}</div>
                    <div className="text-[10px] text-muted-foreground">{plan.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SNS アカウント */}
          <div>
            <div className="text-xs font-medium mb-2">SNS アカウント</div>
            <p className="text-[10px] text-muted-foreground mb-2">
              プレビューに表示するアカウント情報を設定します。API から自動取得もできます。
            </p>

            {/* X アカウント */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PlatformIcon platformId="x" size={16} />
                  <span className="text-[11px] font-medium">X アカウント</span>
                </div>
                <button
                  onClick={() => void fetchXAccount()}
                  disabled={fetchingAccount}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 disabled:text-muted-foreground/40 transition"
                  title="X API からアカウント情報を取得"
                >
                  <Download className={`w-3 h-3 ${fetchingAccount ? "animate-pulse" : ""}`} />
                  {fetchingAccount ? "取得中..." : "API から取得"}
                </button>
              </div>

              {/* 取得ステータス */}
              {fetchStatus === "success" && (
                <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
                  アカウント情報を取得しました
                </div>
              )}
              {fetchStatus === "error" && (
                <div className="text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1">
                  取得に失敗しました。daemon が起動しているか、X API の認証情報が設定されているか確認してください。
                </div>
              )}

              {/* プロフィール画像プレビュー + 入力 */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                  {xAccount.avatarUrl ? (
                    <img src={xAccount.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">?</span>
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <input
                    value={xAccount.displayName}
                    onChange={(e) => updateXAccount({ displayName: e.target.value })}
                    placeholder="表示名（例: 中島竜馬）"
                    className="w-full text-xs px-2 py-1.5 bg-background border border-border rounded focus:border-primary/50 focus:outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">@</span>
                    <input
                      value={xAccount.username}
                      onChange={(e) => updateXAccount({ username: e.target.value.replace(/^@/, "") })}
                      placeholder="ユーザーID"
                      className="flex-1 text-xs px-2 py-1.5 bg-background border border-border rounded focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                  <input
                    value={xAccount.avatarUrl}
                    onChange={(e) => updateXAccount({ avatarUrl: e.target.value })}
                    placeholder="プロフィール画像 URL（任意）"
                    className="w-full text-[10px] px-2 py-1 bg-background border border-border rounded focus:border-primary/50 focus:outline-none text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
