/**
 * PolicyPanel — 投稿の目的パネル（旧 SourceDraftPanel の後継）
 *
 * テンプレート選択 + 動的フィールド + 自由メモ + アクションボタン
 * spec: AKARI-HUB-014 §5
 */

import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, MessageSquare, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/icons/SnsIcons";
import { TemplateSelector } from "./TemplateSelector";
import { TemplateFields } from "./TemplateFields";
import { getPlatform } from "@/lib/platforms";
import { getTemplate, type PolicyData, createDefaultPolicy } from "@akari-os/templates-core";

export interface PolicyPanelProps {
  policy: PolicyData | undefined;
  onPolicyChange: (policy: PolicyData) => void;
  selectedPlatforms: string[];
  onEnhance: (targetPlatforms?: string[]) => void;
  enhancing: boolean;
  enhancingPlatform?: string | null;
  /** Chat に方針を送って AI と詰める */
  onDiscussWithAI?: () => void;
}

export function PolicyPanel({
  policy,
  onPolicyChange,
  selectedPlatforms,
  onEnhance,
  enhancing,
  enhancingPlatform,
  onDiscussWithAI,
}: PolicyPanelProps) {
  const p = policy ?? createDefaultPolicy();
  const template = getTemplate(p.templateId);

  // AI 反映時のハイライト演出（3秒間光る）
  const [highlight, setHighlight] = useState(false);
  const prevPolicyRef = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify(policy);
    if (prevPolicyRef.current && prevPolicyRef.current !== key) {
      setHighlight(true);
      const timer = setTimeout(() => setHighlight(false), 3000);
      return () => clearTimeout(timer);
    }
    prevPolicyRef.current = key;
  }, [policy]);

  // エンハンス対象PFの個別選択（デフォルト: 全選択）
  const [enhanceTargets, setEnhanceTargets] = useState<Set<string>>(
    new Set(selectedPlatforms),
  );
  // selectedPlatforms が変わったら enhanceTargets をリセット
  const targetsKey = selectedPlatforms.join(",");
  const [lastTargetsKey, setLastTargetsKey] = useState(targetsKey);
  if (targetsKey !== lastTargetsKey) {
    setEnhanceTargets(new Set(selectedPlatforms));
    setLastTargetsKey(targetsKey);
  }

  function toggleTarget(pid: string) {
    setEnhanceTargets((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        // 最低1つは選択されている必要がある
        if (next.size > 1) next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  }

  function selectAllTargets() {
    setEnhanceTargets(new Set(selectedPlatforms));
  }

  const activeTargets = selectedPlatforms.filter((pid) => enhanceTargets.has(pid));
  const isAllSelected = activeTargets.length === selectedPlatforms.length;

  // テンプレート変更: 既存フィールドのうち新テンプレートにも存在するものは値を維持
  function handleTemplateChange(templateId: string) {
    const newTemplate = getTemplate(templateId);
    const newFieldIds = new Set(newTemplate.fields.map((f) => f.id));
    const preserved: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.fields)) {
      if (newFieldIds.has(k)) preserved[k] = v;
    }
    onPolicyChange({ ...p, templateId, fields: preserved });
  }

  // フィールド値変更
  function handleFieldChange(fieldId: string, value: string) {
    onPolicyChange({ ...p, fields: { ...p.fields, [fieldId]: value } });
  }

  // メモ変更
  function handleMemoChange(memo: string) {
    onPolicyChange({ ...p, memo });
  }

  // エンハンス可能条件: 方針に何か入力があり、PF が選択されている
  const hasContent =
    p.memo.trim().length > 0 ||
    Object.values(p.fields).some((v) => v.trim().length > 0);
  const canEnhance = !enhancing && hasContent && activeTargets.length > 0;

  const currentName = enhancingPlatform
    ? getPlatform(enhancingPlatform).name
    : null;

  return (
    <div className={`p-3 flex flex-col gap-3 transition-all duration-500 ${
      highlight ? "ring-2 ring-primary/50 bg-primary/5 rounded-lg" : ""
    }`}>
      {/* 見出し */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-semibold">投稿方針</h3>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          テンプレートと追加メモで方向性を決めます。SNS ごとのスタイルは別パネルで調整。
        </p>
      </div>

      {/* テンプレート選択 */}
      <TemplateSelector
        selectedId={p.templateId}
        onChange={handleTemplateChange}
      />

      {/* 動的入力フィールド */}
      <TemplateFields
        fields={template.fields}
        values={p.fields}
        onChange={handleFieldChange}
      />

      {/* 自由記述メモ */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-muted-foreground">
          追加メモ
        </label>
        <textarea
          value={p.memo}
          onChange={(e) => handleMemoChange(e.target.value)}
          rows={5}
          placeholder="補足情報・キーワード・トーンの希望など自由に..."
          className="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* アクションボタン */}
      <div className="flex flex-col gap-2">
        {/* AI と方針を詰める */}
        {onDiscussWithAI && (
          <Button
            type="button"
            variant="outline"
            onClick={onDiscussWithAI}
            disabled={!hasContent || enhancing}
            className="w-full gap-1.5 min-w-0"
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs truncate">AI と方針を詰める</span>
          </Button>
        )}

        {/* エンハンスボタン */}
        <Button
          type="button"
          onClick={() => onEnhance(activeTargets)}
          disabled={!canEnhance}
          className="w-full gap-1.5 min-w-0"
        >
          {enhancing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              <span className="text-xs truncate">
                {currentName ? `${currentName} を生成中...` : "生成中..."}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs truncate">
                {isAllSelected
                  ? `全 ${selectedPlatforms.length} SNS にエンハンス`
                  : `${activeTargets.length} SNS にエンハンス`}
              </span>
            </>
          )}
        </Button>
      </div>

      {/* エンハンス対象プラットフォーム chips（クリックで個別 ON/OFF） */}
      {selectedPlatforms.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">エンハンス対象</div>
            {!isAllSelected && (
              <button
                type="button"
                onClick={selectAllTargets}
                className="text-[10px] text-primary hover:text-primary/80 transition"
              >
                全選択
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedPlatforms.map((pid) => {
              const pf = getPlatform(pid);
              const isCurrent = enhancingPlatform === pid;
              const isTarget = enhanceTargets.has(pid);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => !enhancing && toggleTarget(pid)}
                  disabled={enhancing}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] transition cursor-pointer ${
                    isCurrent
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : isTarget
                        ? "border-border bg-muted/30 text-foreground"
                        : "border-border/50 bg-transparent text-muted-foreground/40"
                  }`}
                >
                  <PlatformIcon platformId={pid} size={12} />
                  <span>{pf.name}</span>
                  {isCurrent && (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedPlatforms.length === 0 && (
        <div className="text-[10px] text-muted-foreground/70 italic">
          SNS タブから投稿先を追加してください
        </div>
      )}
    </div>
  );
}
