/**
 * @file WorkflowVersionTimeline.tsx
 * AKARI-HUB-072 Phase 2 (T-11): Workflow version chain の timeline + ワンクリック rollback。
 *
 * 役割:
 *   - Workflow.changelog を時系列 timeline で表示（Learning Loop で進化した履歴）
 *   - 各 entry に rollback button（current 以外）— **ワンクリック + inline 2 段確定**
 *     （モーダル禁止、ルール 9 / 11 一画面化原則）
 *   - 旧 version への参照リンク（trace_refs / parent_version）を small label で示す
 *
 * 実装指針（CheckpointInline / WorkflowEditor の inline confirm pattern を踏襲）:
 *   - rollback は `useState<string | null>` で「確定待ち version」を保持
 *   - 1 押し: button label が「もう一度押すと rollback」に変わる
 *   - 2 押し: `onRollback(version)` callback を発火
 *   - blur で confirm state リセット（誤爆防止）
 *   - 別 entry を選ぶと前の confirm はクリア（同時に 1 つだけ pending）
 *
 * 関連 spec / ADR:
 *   - spec-workflow-checkpoint-context-budget-learning-loop (AKARI-HUB-072) §3 AC-18 / AC-19 / §6 / §7 T-11
 *   - ADR-094 (Workflow Learning Loop の version chain semantics)
 *   - docs/RULES.md ルール 9 / 11 (一画面化原則)
 *   - 兄弟: AKARI-HUB-073 Phase 2 StyleVersionTimeline（同 pattern）
 */

import * as React from "react"
import { useState, useCallback, useEffect } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"
import type { Workflow, ChangelogEntry } from "./types/workflow"

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

/**
 * WorkflowVersionTimeline props。
 *
 * 描画は workflow.changelog をそのまま新しい順に並べる。changelog 内の
 * `parent_version` で chain を可視化（断絶があれば warning chip を出す）。
 */
export interface WorkflowVersionTimelineProps {
  /** 表示対象の Workflow（changelog + version 必須） */
  workflow: Workflow
  /**
   * rollback 確定時の callback。実 rollback 処理（buildRollbackVersion +
   * pool-mcp `workflow_asset_update` 等）は呼び出し側で行う。
   *
   * @param toVersion rollback 先 semver（過去の version。current は対象外）
   */
  onRollback: (toVersion: string) => void
  /**
   * 並びは "newest-first"（既定）/ "oldest-first" を選べる。
   */
  order?: "newest-first" | "oldest-first"
  /**
   * read-only mode（rollback button を出さない、履歴閲覧のみ）。
   */
  readOnly?: boolean
  /** 任意の追加 className（host UI で margin / scroll を制御するため） */
  className?: string
  /**
   * 各 entry の右側に追加で描画する slot（trace_refs link 等）。
   * render-prop で疎結合（呼び出し側が pool-mcp link / Trace inspector 等を差し込める）。
   */
  renderEntryExtra?: (entry: ChangelogEntry) => React.ReactNode
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD HH:mm 表記（ISO 8601 を縮める。failsafe で原文返す） */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const pad = (n: number) => n.toString().padStart(2, "0")
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    )
  } catch {
    return iso
  }
}

/**
 * changelog の表示順を整える。
 * - entry の `approved_at` で sort（同時刻は配列順を保つ stable sort）
 * - newest-first / oldest-first を切替
 */
function sortEntries(
  entries: ChangelogEntry[],
  order: "newest-first" | "oldest-first",
): ChangelogEntry[] {
  const cmp = (a: ChangelogEntry, b: ChangelogEntry) =>
    a.approved_at.localeCompare(b.approved_at)
  const sorted = [...entries].sort(cmp)
  return order === "newest-first" ? sorted.reverse() : sorted
}

// ──────────────────────────────────────────────────────────────────
// Sub component: TimelineEntry
// ──────────────────────────────────────────────────────────────────

interface TimelineEntryProps {
  entry: ChangelogEntry
  isCurrent: boolean
  /** rollback の confirm 状態（このエントリが pending かどうか） */
  pendingConfirm: boolean
  readOnly: boolean
  onRollbackClick: () => void
  onBlur: () => void
  renderExtra?: (entry: ChangelogEntry) => React.ReactNode
}

function TimelineEntry({
  entry,
  isCurrent,
  pendingConfirm,
  readOnly,
  onRollbackClick,
  onBlur,
  renderExtra,
}: TimelineEntryProps) {
  return (
    <li
      className={cn(
        "relative flex gap-3 rounded-md border border-border bg-card/30 px-3 py-2.5",
        isCurrent && "border-emerald-500/40 bg-emerald-500/5",
      )}
      aria-current={isCurrent ? "true" : undefined}
    >
      {/* 左 marker (timeline dot) */}
      <div className="flex flex-col items-center pt-1">
        <div
          className={cn(
            "size-2 rounded-full",
            isCurrent
              ? "bg-emerald-400 ring-2 ring-emerald-400/30"
              : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
      </div>

      {/* 主要情報 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <code className="font-mono text-[12px] font-semibold text-foreground">
            v{entry.version}
          </code>
          {isCurrent && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
              current
            </span>
          )}
          {entry.parent_version && (
            <span className="text-[10px] text-muted-foreground">
              ← v{entry.parent_version}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatTimestamp(entry.approved_at)}
          </span>
        </div>

        <p className="text-[12px] leading-snug text-foreground">
          {entry.summary || "(no summary)"}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            by <code className="rounded bg-muted/40 px-1 py-0.5">{entry.approved_by}</code>
          </span>
          {entry.trace_refs.length > 0 && (
            <span aria-label="learning に使われた trace 数">
              📚 {entry.trace_refs.length} trace{entry.trace_refs.length === 1 ? "" : "s"}
            </span>
          )}
          {renderExtra && (
            <span className="ml-auto inline-flex items-center gap-1">
              {renderExtra(entry)}
            </span>
          )}
        </div>

        {/* rollback button (current 以外、read-only でない場合のみ) */}
        {!isCurrent && !readOnly && (
          <div className="flex">
            <Button
              variant={pendingConfirm ? "destructive" : "outline"}
              size="sm"
              onClick={onRollbackClick}
              onBlur={onBlur}
              aria-label={
                pendingConfirm
                  ? `v${entry.version} に rollback を確定`
                  : `v${entry.version} に rollback`
              }
            >
              {pendingConfirm
                ? "もう一度押すと rollback"
                : `↩︎ v${entry.version} に rollback`}
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

/**
 * Workflow.changelog を timeline で表示し、各 entry に rollback button を出す。
 *
 * - **モーダル禁止 / 画面遷移禁止**（ルール 9 / 11 一画面化原則）
 * - rollback は inline 2 段確定（誤爆防止 + Undo 一級市民）
 * - changelog が空のとき: 「履歴なし」placeholder
 *
 * spec AC-18 / AC-19 を充足:
 *   - AC-18: changelog の表示 + version chain 可視化
 *   - AC-19: ワンクリック rollback button
 */
export function WorkflowVersionTimeline({
  workflow,
  onRollback,
  order = "newest-first",
  readOnly = false,
  className,
  renderEntryExtra,
}: WorkflowVersionTimelineProps) {
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)

  // workflow が変わったら confirm state リセット
  useEffect(() => {
    setPendingVersion(null)
  }, [workflow.id, workflow.version])

  const handleClick = useCallback(
    (version: string) => {
      if (pendingVersion === version) {
        onRollback(version)
        setPendingVersion(null)
      } else {
        setPendingVersion(version)
      }
    },
    [pendingVersion, onRollback],
  )

  const handleBlur = useCallback(() => {
    // 短い遅延で blur 後に他の entry click を許す。
    // setTimeout を使うと race するので、blur で即リセットする
    // （onBlur → 他 button onClick の順は React event loop で onClick が後勝ち）
    setPendingVersion(null)
  }, [])

  const entries = sortEntries(workflow.changelog, order)

  return (
    <section
      className={cn("flex flex-col gap-2", className)}
      aria-label="Workflow version timeline"
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Version timeline
        </h3>
        <span className="text-[10px] text-muted-foreground">
          current: <code className="font-mono">v{workflow.version}</code>
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
          まだ version 履歴がありません。Workflow Learning Loop で改善が承認されると、
          ここに timeline が積まれていきます。
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <TimelineEntry
              key={`${entry.version}-${entry.approved_at}`}
              entry={entry}
              isCurrent={entry.version === workflow.version}
              pendingConfirm={pendingVersion === entry.version}
              readOnly={readOnly}
              onRollbackClick={() => handleClick(entry.version)}
              onBlur={handleBlur}
              renderExtra={renderEntryExtra}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
