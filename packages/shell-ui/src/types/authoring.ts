/**
 * @file types/authoring.ts
 * AKARI-HUB-088 §2-5: 素材オーサリングアプリ（diagram / motion / mockup / 3d / synth）の
 * embedded kit が実装する統一契約型。
 *
 * standalone / embedded で中身（engine / store / パネル）は共通、外枠だけ
 * AppLayout かホスト側ダイアログかが変わる（Video の SfxSourcePanel → SynthEditorDialog と同流儀）。
 *
 * 各アプリは `kit/<App>Editor.tsx` で `AuthoringEditorProps<その App の Doc 型>` を実装する。
 * 例: diagram は `AuthoringEditorProps<DiagramDoc>`。
 *
 * 設計 SSOT: docs/design/creator-app-shell-standard-2026-06-03.md §7-5
 */

/** ホスト比率（Video のステージ等）に合わせるためのプリセット。 */
export type AuthoringStagePreset = {
  width: number
  height: number
  fps?: number
}

/** `onApply` でホストに返す確定結果。 */
export type AuthoringApplyResult<Doc> = {
  /** 各アプリ SSOT の本体（Diagram Doc / AMF / Mockup Scene 等）。 */
  doc: Doc
  /** doc の種別（"diagram" / "amf" / "mockup-scene" / ...）。MaterialAsset.docFormat と対応。 */
  docFormat: string
  /** Pool に登録された素材 item の id。 */
  itemId: string
  /** 代表 PNG サムネの Pool item id。 */
  thumbnailItemId: string
}

/**
 * 素材オーサリング editor kit の統一 props。
 * @typeParam Doc - そのアプリの SSOT ドキュメント型（例: DiagramDoc）。
 */
export type AuthoringEditorProps<Doc> = {
  /** standalone = Shell 単独起動 / embedded = ホストアプリ内ダイアログ。 */
  mode: "standalone" | "embedded"
  /** 新規作成 or 復元時の初期ドキュメント。 */
  initialDoc?: Doc
  /** Library から「編集」で渡る既存素材（その itemId を読み込んで編集開始）。 */
  sourceItem?: { itemId: string }
  /** ホスト比率に合わせるステージ寸法（embedded で Video 等から渡る）。 */
  stagePreset?: AuthoringStagePreset
  /** 確定時にホストへ結果を返す（embedded ではホストが canvas/timeline に差す）。 */
  onApply?: (result: AuthoringApplyResult<Doc>) => void
  /** 閉じる（embedded ダイアログのクローズ等）。 */
  onClose?: () => void
}
