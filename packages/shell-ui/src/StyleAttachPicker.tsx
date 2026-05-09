/**
 * @file StyleAttachPicker.tsx
 * AKARI-HUB-073 Phase 1 (T-6): Workflow Step に Style を attach する picker。
 *
 * 役割:
 *   - WorkflowEditor の Step inspector 内（tool Step）から呼び出し、`style_ref`
 *     フィールドを「ドロップダウン + version pin」UI で編集する component
 *   - StylePanel と類似だが「Step 単位で Style を 1 つ選ぶ」一覧縮約版
 *   - ドメインフィルタ + 検索 + version pin の指定 / 解除（spec AC-8 / AC-9）
 *
 * 設計指針:
 *   - 一画面化原則（ルール 9 / 11）— モーダル / popover を使わず、inline の
 *     `<select>` + 補助 textbox で完結
 *   - props.availableStyles は呼び出し側（Shell 等）が pool-impl `list_styles`
 *     を叩いて取得する想定。本 component は Pool API を直接知らない（疎結合）
 *   - style_ref の wire format: `<style_id>` （version pin なし）または
 *     `<style_id>@<version>` （pin あり）。spec AC-9 / Workflow Step.style_ref
 *
 * Props:
 *   - availableStyles    : 候補 StyleAsset 配列（呼び出し側で fetch / cache）
 *   - selectedStyleRef   : 現在の style_ref 文字列（"id" or "id@version"）。
 *                          undefined なら未選択
 *   - onSelect           : 選択変更時 callback。null（解除）または string を受ける
 *   - domain             : 表示候補を絞る domain filter（任意）
 *   - disabled           : readOnly 時の無効化（任意）
 *   - className          : 外側 wrapper への merge class（任意）
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-style-management-ui-learning-loop.md
 *           §3 AC-8 / AC-9 / §6 Components / §7 T-6
 *   - ADR-095 (Style as Asset Subtype)
 *   - HUB-072 WorkflowEditor (5e5a427) — Step inspector への integration 元
 */

import * as React from "react"
import { useId, useMemo } from "react"
import { cn } from "./lib/cn"
import type { StyleAsset, StyleDomain } from "./types/style"

// ─── style_ref パース / 整形 ────────────────────────────────────────────────

/**
 * Workflow Step.style_ref の wire format（spec AC-9）:
 *   - "style-uuid"            : version pin なし（最新を解決）
 *   - "style-uuid@1.0.0"      : 特定 version に pin
 *
 * 本 helper は wire format を `{ id, version }` に分解する。
 * 不正な空文字 / `@` 単独は `id: ""` を返し、上位で「未選択」扱いする。
 */
export function parseStyleRef(ref: string | undefined): {
  id: string
  version: string | undefined
} {
  if (ref == null || ref === "") return { id: "", version: undefined }
  const at = ref.indexOf("@")
  if (at < 0) return { id: ref, version: undefined }
  return {
    id: ref.slice(0, at),
    version: ref.slice(at + 1) || undefined,
  }
}

/**
 * `{ id, version }` を Workflow Step.style_ref の wire format に整形。
 * id が空なら undefined を返す（= 未選択）。
 */
export function formatStyleRef(
  id: string,
  version: string | undefined,
): string | undefined {
  if (!id) return undefined
  if (!version) return id
  return `${id}@${version}`
}

// ─── domain badge ──────────────────────────────────────────────────────────

const DOMAIN_BADGE_CLS: Record<StyleDomain, string> = {
  video: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  writing: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  design: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  voice: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  mixed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

const DOMAIN_LABEL: Record<StyleDomain, string> = {
  video: "video",
  writing: "writing",
  design: "design",
  voice: "voice",
  mixed: "mixed",
}

/** Style domain の小型バッジ（StylePanel と同流儀） */
function DomainBadge({ domain }: { domain: StyleDomain }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none",
        DOMAIN_BADGE_CLS[domain],
      )}
    >
      {DOMAIN_LABEL[domain]}
    </span>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface StyleAttachPickerProps {
  /**
   * 選択候補。呼び出し側が pool-impl `list_styles(filter)` 等で fetch して渡す。
   * 空配列なら "候補なし" plate を表示。
   */
  availableStyles: StyleAsset[]
  /**
   * 現在の Workflow Step.style_ref（"id" or "id@version"）。
   * 未選択なら undefined。
   */
  selectedStyleRef?: string
  /**
   * 選択変更時 callback。`undefined` で解除（detach）。
   */
  onSelect: (styleRef: string | undefined) => void
  /**
   * domain で候補を絞る optional filter。
   * 例: tool が video editor 用なら `domain="video"` を渡して候補を限定。
   * undefined なら全 domain 表示。
   */
  domain?: StyleDomain
  /** readOnly モード（WorkflowEditor.readOnly と連動） */
  disabled?: boolean
  /** 外側 wrapper への merge class */
  className?: string
}

// ─── 定数 ──────────────────────────────────────────────────────────────────

const SELECT_CLS =
  "w-full rounded-md border border-border bg-input/30 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

const VERSION_INPUT_CLS = cn(SELECT_CLS, "font-mono")

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Workflow Step に Style を attach する picker。
 *
 * UI:
 *   - 1 行目: Style 選択 `<select>`（domain badge + style id 表示）
 *   - 2 行目: version pin `<input>`（プレースホルダ "（latest）"）— 選択中のみ表示
 *   - clear ボタンで `onSelect(undefined)`
 *
 * 一画面化原則:
 *   - モーダル / popover 不使用
 *   - 確定ボタン不要（onChange で即時反映、Undo は WorkflowEditor 側が担う）
 */
export function StyleAttachPicker({
  availableStyles,
  selectedStyleRef,
  onSelect,
  domain,
  disabled = false,
  className,
}: StyleAttachPickerProps): React.ReactElement {
  const reactId = useId()
  const { id: selectedId, version: selectedVersion } = useMemo(
    () => parseStyleRef(selectedStyleRef),
    [selectedStyleRef],
  )

  // domain filter を適用した候補（無指定なら全件）
  const filtered = useMemo(() => {
    if (!domain) return availableStyles
    return availableStyles.filter((s) => s.domain === domain)
  }, [availableStyles, domain])

  // 選択中の Style 本体（badge / version 表示用）
  const selected = useMemo(
    () => filtered.find((s) => s.id === selectedId),
    [filtered, selectedId],
  )

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (!next) {
      onSelect(undefined)
      return
    }
    // domain 切替で別 Style を選ぶときは version pin を保持しない
    onSelect(formatStyleRef(next, undefined))
  }

  function handleVersionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.trim()
    onSelect(formatStyleRef(selectedId, v || undefined))
  }

  function handleClear() {
    onSelect(undefined)
  }

  // ── render: 候補ゼロの状態（"候補なし" plate） ─────────────────────────
  if (filtered.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground",
          className,
        )}
      >
        {domain
          ? `${DOMAIN_LABEL[domain]} domain の Style がまだありません`
          : "Style がまだありません"}
      </div>
    )
  }

  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      data-component="style-attach-picker"
    >
      {/* 1 行目: Style 選択 */}
      <div className="flex items-center gap-2">
        <select
          id={`${reactId}-style`}
          aria-label="Style を選択"
          disabled={disabled}
          value={selectedId}
          onChange={handleSelectChange}
          className={SELECT_CLS}
        >
          <option value="">（未選択 / detach）</option>
          {filtered.map((s) => (
            <option key={s.id} value={s.id}>
              {`[${s.domain}] ${s.id} (v${s.version})`}
            </option>
          ))}
        </select>

        {/* domain badge + clear */}
        {selected && (
          <>
            <DomainBadge domain={selected.domain} />
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Style attach を解除"
                title="Style attach を解除"
                className="rounded text-[10px] text-muted-foreground hover:text-destructive transition"
              >
                ×
              </button>
            )}
          </>
        )}
      </div>

      {/* 2 行目: version pin（選択時のみ） */}
      {selected && (
        <div className="grid grid-cols-[6rem_1fr] items-center gap-2 pl-1">
          <label
            htmlFor={`${reactId}-version`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            version pin
          </label>
          <input
            id={`${reactId}-version`}
            type="text"
            disabled={disabled}
            value={selectedVersion ?? ""}
            placeholder={`（latest = ${selected.version}）`}
            onChange={handleVersionChange}
            className={VERSION_INPUT_CLS}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}
