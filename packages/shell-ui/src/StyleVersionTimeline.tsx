/**
 * @file StyleVersionTimeline.tsx
 * AKARI-HUB-073 Phase 2 (T-11): Style version timeline + rollback ワンクリック.
 *
 * 役割:
 *   - {@link StyleAsset.changelog}（spec §6 — 各 version up entry の append-only ログ）を
 *     **新→旧 (descending) で縦タイムライン**として可視化する pure component
 *   - 各 version の表示: version badge / 承認日 / summary / approved_by / rule 件数 /
 *     reference 件数 / rollback ボタン
 *   - rollback クリックで `onRollback(target_version)` を発火。**モーダル / ダイアログ禁止**
 *     (RULES.md §11)、確認は inline 2-step（1 押し目 = highlight、2 押し目 = 確定）
 *   - 「現在の version」（`StyleAsset.version`）は changelog の同 version entry に
 *     "current" badge を出し、rollback ボタンを非表示
 *
 * 設計指針:
 *   - presentational only — 永続化 / pool-impl 呼び出しは外側責任
 *     (akari-agents `style/version-up.ts` の `StyleVersionUp.rollback` を呼ぶ想定)
 *   - 削除 / rollback は 2 回押し inline confirm（モーダル不使用、StyleEditor の
 *     `OverrideRow` と同じ pattern）
 *   - changelog が 0 件 = 初期 Style の場合は「履歴なし」プレースホルダ
 *   - signal_diff の表示は v0.2.0 後半 (T-14〜T-18) で追加 — 本 round では
 *     reference_diff / rules_diff の件数のみ
 *
 * 関連 spec / ADR:
 *   - spec-style-management-ui-learning-loop (AKARI-HUB-073) §3 AC-6 / AC-7 / AC-15
 *   - ADR-095 (Style as Asset Subtype)
 *   - HUB-073 Phase 1 で確立した shell-ui component pattern (StyleEditor / StylePanel)
 *
 * 注意:
 *   - rollback 後に Style 本体 state (reference / rules / overrides) は外側で再取得して
 *     props に流し込む流儀（WorkflowEditor 同流儀の immutable / props down）。
 *   - 「rollback で Style 本体が即座に target_version に戻るか」は Phase 2 後半で
 *     snapshot 戦略を詰めるまでは「changelog のみ append、本体は別途編集が必要」と
 *     UI 上で hint を出す（akari-agents `version-up.ts` `StyleVersionUp.rollback`
 *     のコメントと同期）。
 */

import * as React from "react"
import { useCallback, useMemo, useState } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"
import type { StyleAsset, StyleChangelog } from "./types/style"

// ─── Props ─────────────────────────────────────────────────────────────────

/** {@link StyleVersionTimeline} の Props */
export interface StyleVersionTimelineProps {
  /** 表示対象の Style（`changelog` と `version` を読む） */
  style: StyleAsset
  /**
   * rollback クリック時の callback。引数は changelog 上の `version` semver。
   * 省略すると rollback ボタン自体が非表示になる（read-only mode 兼用）。
   */
  onRollback?: (target_version: string) => void
  /** read-only モード（trace 表示等で rollback 不要なケース） */
  readOnly?: boolean
  /**
   * 表示順。既定は `desc`（新→旧）。`asc` を指定すると古い順。
   * spec §6 / AC-6 のサンプル UI は新→旧。
   */
  order?: "asc" | "desc"
  className?: string
}

// ─── 内部小物 ──────────────────────────────────────────────────────────────

/** "v1.2.3" 表示の version pill（StyleEditor.VersionBadge と同流儀） */
function VersionPill({
  version,
  isCurrent,
}: {
  version: string
  isCurrent: boolean
}) {
  return (
    <code
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-mono leading-none",
        isCurrent
          ? "bg-primary/15 text-primary border border-primary/30"
          : "bg-muted/50 text-foreground/70",
      )}
      title={
        isCurrent
          ? `現在の version (${version})`
          : `過去の version (${version})`
      }
    >
      v{version}
    </code>
  )
}

/** "current" badge — 現在 version 行にだけ出す */
function CurrentBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/15 px-1.5 py-px text-[9px] font-medium leading-none text-primary">
      current
    </span>
  )
}

/** diff 件数 chip（reference / rule の追加 / 削除 / 修正 を 1 行で） */
function DiffChip({
  label,
  count,
  tone,
  title,
}: {
  label: string
  count: number
  tone: "added" | "removed" | "modified"
  title: string
}) {
  if (count === 0) return null
  const cls =
    tone === "added"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : tone === "removed"
        ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
        : "bg-amber-500/10 text-amber-300 border-amber-500/30"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap",
        cls,
      )}
      title={title}
    >
      <span aria-hidden="true">{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

// ─── 1 行 entry ────────────────────────────────────────────────────────────

interface VersionEntryProps {
  entry: StyleChangelog
  isCurrent: boolean
  onRollback?: (target_version: string) => void
  readOnly: boolean
}

/**
 * changelog の 1 entry を縦タイムラインの 1 行として描画する。
 * 左端に circle + 縦線（pseudo-timeline）、右に内容。
 */
function VersionEntry({
  entry,
  isCurrent,
  onRollback,
  readOnly,
}: VersionEntryProps) {
  const [confirmRollback, setConfirmRollback] = useState(false)
  // version 切替で confirm state リセット
  React.useEffect(() => {
    setConfirmRollback(false)
  }, [entry.version])

  const refDiff = entry.reference_diff
  const rulesDiff = entry.rules_diff

  const dateLabel = useMemo(() => {
    try {
      return new Date(entry.date).toLocaleString()
    } catch {
      return entry.date
    }
  }, [entry.date])

  const handleRollback = useCallback(() => {
    if (!onRollback) return
    if (confirmRollback) {
      onRollback(entry.version)
      setConfirmRollback(false)
    } else {
      setConfirmRollback(true)
    }
  }, [confirmRollback, onRollback, entry.version])

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* 左: timeline rail */}
      <div className="relative flex w-3 shrink-0 flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full border",
            isCurrent
              ? "bg-primary border-primary"
              : "bg-muted border-border",
          )}
        />
        <span
          aria-hidden="true"
          className="mt-0.5 flex-1 w-px bg-border"
        />
      </div>

      {/* 右: 本文 */}
      <div
        className={cn(
          "min-w-0 flex-1 rounded-md border px-2.5 py-2 transition",
          isCurrent
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-card/30",
        )}
      >
        {/* ヘッダ */}
        <div className="flex flex-wrap items-center gap-1.5">
          <VersionPill version={entry.version} isCurrent={isCurrent} />
          {isCurrent && <CurrentBadge />}
          <DiffChip
            label="+ref"
            count={refDiff.added.length}
            tone="added"
            title={`reference 追加 ${refDiff.added.length} 件`}
          />
          <DiffChip
            label="−ref"
            count={refDiff.removed.length}
            tone="removed"
            title={`reference 削除 ${refDiff.removed.length} 件`}
          />
          <DiffChip
            label="+rule"
            count={rulesDiff.added.length}
            tone="added"
            title={`rule 追加 ${rulesDiff.added.length} 件`}
          />
          <DiffChip
            label="−rule"
            count={rulesDiff.removed.length}
            tone="removed"
            title={`rule 削除 ${rulesDiff.removed.length} 件`}
          />
          <DiffChip
            label="~rule"
            count={rulesDiff.modified.length}
            tone="modified"
            title={`rule 修正 ${rulesDiff.modified.length} 件`}
          />
          <span
            className="ml-auto text-[9px] text-muted-foreground"
            title={entry.date}
          >
            {dateLabel}
          </span>
        </div>

        {/* summary */}
        {entry.summary && (
          <p className="mt-1 text-[11px] text-foreground/80">
            {entry.summary}
          </p>
        )}

        {/* meta + rollback */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[9px] text-muted-foreground">
            by{" "}
            <code className="font-mono">{entry.approved_by || "—"}</code>
          </span>
          {!readOnly && !isCurrent && onRollback && (
            <Button
              variant={confirmRollback ? "destructive" : "outline"}
              size="xs"
              onClick={handleRollback}
              onBlur={() => setConfirmRollback(false)}
              className="ml-auto"
              title={
                confirmRollback
                  ? `もう一度押すと v${entry.version} に rollback します`
                  : `v${entry.version} に rollback`
              }
            >
              {confirmRollback ? "もう一度押すと rollback" : "↶ rollback"}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * Style version timeline + rollback ワンクリック（spec §3 AC-6 / AC-7）。
 *
 * 縦タイムラインで `StyleAsset.changelog` を新→旧（既定）に並べ、
 * 各 version で rule 件数 + reference 件数 を inline で可視化する。rollback は
 * **モーダル / ダイアログ禁止** で 2-step inline confirm（1 click = highlight、
 * 2 click = 確定）として実装する（RULES.md §11）。
 *
 * Variant Signal 関連 (`signal_diff` の可視化、cross-Variant 比較) は v0.2.0 後半
 * = T-14〜T-18 担当。本 round では reference_diff / rules_diff の件数のみ表示する。
 */
export function StyleVersionTimeline({
  style,
  onRollback,
  readOnly = false,
  order = "desc",
  className,
}: StyleVersionTimelineProps): React.ReactElement {
  const sorted = useMemo(() => {
    const entries = [...style.changelog]
    if (order === "desc") {
      // append-only ログのため index 反転で「新→旧」を作る。日付パースは避ける
      // (clock skew / 同秒重複に強くするため、入力順を信頼する)
      entries.reverse()
    }
    return entries
  }, [style.changelog, order])

  if (sorted.length === 0) {
    return (
      <div
        className={cn("flex flex-col gap-1", className)}
        data-component="StyleVersionTimeline"
      >
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          version 履歴がまだありません。reference / rule を編集して「version up」
          すると、ここに変更履歴が積み上がっていきます。
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-component="StyleVersionTimeline"
    >
      <ol className="flex flex-col gap-1">
        {sorted.map((entry) => (
          <VersionEntry
            key={`${entry.version}-${entry.date}`}
            entry={entry}
            isCurrent={entry.version === style.version}
            onRollback={onRollback}
            readOnly={readOnly}
          />
        ))}
      </ol>
    </div>
  )
}
