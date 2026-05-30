/**
 * @file slot.ts
 * Slot 定義の型（AKARI-HUB-086 — Context-First Panel の基盤）。
 *
 * Context モード左パネルが表示する「役割を持ったスロット」のデータ構造。
 * `SlotDefinition` がスロットの宣言（role × cardinality × 許容 AssetType）、
 * `SlotEntry` がユーザーが実際に素材を入れた実エントリ。
 *
 * 注意（名前衝突回避・HUB-086 §6-3）:
 *   - `SlotEntry.role`（本 `SlotRole`）と pool-impl の `PoolItem.role`
 *     （`source | output | reference` のライフサイクル役割）は**別概念**。
 *   - `ui.ts` の `PanelSlot`（UI レイアウト配置スロット）とも別概念。
 *
 * 関連: spec `docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §4-1
 */

/** 素材スロットの役割識別子（HUB-086 §2-1 確定表） */
export type SlotRole =
  | "main-track"
  | "voice-over"
  | "subtitle"
  | "tone"
  | "bgm"
  | "sfx"
  | "inset"
  | "logo"
  | "title-card"
  | "lower-third"
  | "font-family"
  | "text-style"
  | "text-fx"
  | "color-grade"
  | "chapter"
  | "reference"
  | "misc";

/** スロットが受け入れる素材型 */
export type SlotAssetType =
  | "video"
  | "image"
  | "audio"
  | "text"
  | "auto-gen" // AI 自動生成（subtitle 等）
  | "preset"
  | "spec"
  | "3d"
  | "marker"
  | "template"
  | "font"
  | "url"
  | "any";

/** スロットの多重度 */
export type SlotCardinality =
  | "0..1" // optional-single
  | "1..1" // required-single
  | "0..n" // optional-multiple
  | "1+"; // required-multiple

/**
 * スロット定義（App テンプレから注入。Work が `slot_definitions` として保持）。
 */
export interface SlotDefinition {
  role: SlotRole;
  accepted_asset_types: SlotAssetType[];
  cardinality: SlotCardinality;
  /** UI 表示用ラベル（日本語） */
  label_ja: string;
  description?: string;
  /**
   * Phase 3 まで UI 非表示にするスロットを false にする
   * （例: sfx は HUB-086 OQ-2 で Phase 1 定義 / video default enabled=false）。
   */
  enabled: boolean;
}

/**
 * スロット実エントリ（ユーザーが実際に素材を入れたもの）。
 *
 * HUB-086 OQ-1（per-Variant + Work 既定の hybrid）:
 *   - Work レベルのデフォルトは `WorkContextPayload.slot_definitions` 側に持つ。
 *   - `variant_id` が NOT NULL のエントリを「その Variant 固有の override」として扱う。
 */
export interface SlotEntry {
  /** UUID v7（クライアント生成） */
  id: string;
  work_id: string;
  /** 出力（Variant）単位。HUB-086 OQ-1 で per-Variant に決定 */
  variant_id: string;
  role: SlotRole;
  /** Pool item への参照（ADR-085 Reference モード）。asset_id が主 */
  asset_id: string | null;
  /** 外部 URL（reference スロット専用） */
  external_url: string | null;
  /** スロット内順序（main-track 等で複数ある場合に使用） */
  position: number;
  /** misc スロットから昇格した場合の元 misc エントリ id */
  promoted_from?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * スロットエントリ + 参照 Pool item の表示メタ（pool-impl `list_slot_entries_view` の返り）。
 *
 * `asset_name` / `asset_analyzed_at` は pool_items を LEFT JOIN した freeze-safe な付加情報
 * （getItem を通さないため巨大 Reference 動画でも凍結しない）。Rust 側は `#[serde(flatten)]` で
 * SlotEntry のフィールドを top-level に展開する。
 */
export interface SlotEntryView extends SlotEntry {
  /** 参照 Pool item の表示名（external_url のみ / dangling なら null） */
  asset_name: string | null;
  /** 参照 Pool item の分析時刻（未分析 / 非 asset なら null）。RFC3339 文字列 */
  asset_analyzed_at: string | null;
}

/** SlotRole → 日本語表示ラベル（UI 共通メタ） */
export const SLOT_ROLE_LABELS: Record<SlotRole, string> = {
  "main-track": "メイントラック",
  "voice-over": "ナレーション",
  subtitle: "字幕",
  tone: "トーン",
  bgm: "BGM",
  sfx: "効果音",
  inset: "挿絵 / B-roll",
  logo: "ロゴ / 透かし",
  "title-card": "タイトルカード",
  "lower-third": "テロップ帯",
  "font-family": "フォント",
  "text-style": "文字スタイル",
  "text-fx": "文字エフェクト",
  "color-grade": "カラーグレード",
  chapter: "チャプター",
  reference: "参考素材",
  misc: "未分類",
};
