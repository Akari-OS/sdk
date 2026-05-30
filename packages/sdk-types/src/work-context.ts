/**
 * @file work-context.ts
 * Work レベルコンテキストの型（AKARI-HUB-086 — Context-First Panel の基盤）。
 *
 * 「全 app instance（Video / Design / Writer）が購読する Work 単位の文脈」を
 * App SDK の公式 surface として定義する。purpose / strategy / tone / references /
 * slot_definitions / slot_entries を Work が一級概念として保持する。
 *
 * 関連: spec `docs/sdd/specs/spec-slot-and-work-context-schema.md` §3 / §4-2
 */

import type { SlotDefinition, SlotEntry } from "./slot.js";

/** 方針の構造化フィールド（テンプレ注入。追加 / 削除自由・必須にしない） */
export interface StrategyField {
  key: string;
  value: string;
  required?: boolean;
}

/**
 * 方針（strategy）— 「構造化 default + 自由記述拡張」（HUB-086 §3-2）。
 */
export interface StrategyContext {
  /** 構造化フィールド群（テンプレ注入。空でも進める） */
  fields: StrategyField[];
  /** 「その他メモ」— 常時開いた自由記述 textarea */
  memo: string;
}

/**
 * Work レベルの参考素材（AKARI-HUB-083 Reference と整合）。
 */
export interface WorkReference {
  id: string;
  /** Pool item ID（Pool 素材の場合） */
  asset_id?: string | null;
  /** 外部 URL（YouTube 等） */
  external_url?: string | null;
  /** AI カテゴリ分類 */
  purpose: "style" | "pacing" | "tone" | "general";
}

/**
 * Work レベルコンテキスト — App SDK の公式 surface。
 *
 * 永続化（HUB-086 §5、Phase 1 案 A）:
 *   - Work レベルのデフォルト（purpose / strategy / tone / slot_definitions /
 *     references）は `works.context_json` に保存。
 *   - `slot_entries` は別テーブルに正規化（per-Variant、OQ-1）。
 *   - 既存 `intent_json`（purpose / tone / tags）とは merge して生成（§6-2）。
 */
export interface WorkContextPayload {
  work_id: string;
  /** 目的（自由記述） */
  purpose: string;
  /** 方針（構造化 default + 自由記述拡張） */
  strategy: StrategyContext;
  /** トーン指針（自由記述。role='tone' スロットと連動） */
  tone: string | null;
  /** スロット定義（テンプレ注入済み） */
  slot_definitions: SlotDefinition[];
  /** スロット実エントリ（ユーザー投入済み素材） */
  slot_entries: SlotEntry[];
  /** 参考素材（AKARI-HUB-083 Reference 型と整合） */
  references: WorkReference[];
}
