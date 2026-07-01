/**
 * @file plugin.ts
 * ADR-140 P4 MVP: Layer 2 プラグイン manifest（`akari-plugin.toml`）の型定義。
 *
 * 位置づけ（ADR-140 D-1 Layer 2: 境界層）:
 * - プラグインは「操作（Operation）を宣言的に contribute する小さな Full Tier アプリ」
 *   として `~/.akari/plugins/` に配置される（Phased Rollout P4）。
 * - **本 MVP は宣言のみを扱う。プラグイン内の任意 JS を shell が実行することはない**
 *   （contribute された操作は既存 ACD MCP ツールの呼び出しに限定される。D-2 の統一
 *   Operation レジストリに `target_app` / `tool` / `args` を渡すだけで、プラグイン
 *   自身がコードを持ち込むわけではない）。
 * - D-6（権限モデルは Layer 2/3 で初日から強制）に従い、`permissions.tools` による
 *   capability 宣言を必須とする。未宣言の MCP ツールを contribute することはできない
 *   （検証は shell 側のロード時チェックが担う。本ファイルは型のみ）。
 *
 * `akari-plugin.toml` の最小サンプル:
 * ```toml
 * [plugin]
 * id = "com.example.caption-shortcuts"
 * name = "Caption Shortcuts"
 * version = "0.1.0"
 * description = "よく使う字幕位置プリセットを操作タブから呼び出す"
 *
 * [[contributes.operations]]
 * id = "caption-shortcuts.bottom-safe"
 * label = "字幕: 下部セーフエリアへ"
 * category = "字幕・テキスト"
 * target_app = "video"
 * tool = "video_set_transform"
 * description = "選択中のテキストクリップを下部セーフエリアに配置する"
 *
 * [permissions]
 * tools = ["video_set_transform"]
 * ```
 *
 * @see docs/sdd/adr/ADR-140-three-layer-extension-and-app-quartet-contract.md D-1 / D-2 / D-6, Phased Rollout P4
 */

// ---------------------------------------------------------------------------
// [plugin] section
// ---------------------------------------------------------------------------

/**
 * `[plugin]` section of `akari-plugin.toml`.
 * プラグインの識別情報。
 */
export interface PluginIdentity {
  /**
   * Reverse-domain プラグイン ID。
   * @example "com.example.caption-shortcuts"
   */
  id: string

  /** 表示名。 */
  name: string

  /**
   * プラグインの semver バージョン。
   * @example "0.1.0"
   */
  version: string

  /** 説明（任意）。 */
  description?: string
}

// ---------------------------------------------------------------------------
// [[contributes.operations]] section
// ---------------------------------------------------------------------------

/**
 * `[[contributes.operations]]` の 1 エントリ。
 * D-2 の統一 Operation レジストリに contribute される操作の宣言。
 *
 * 宣言のみで JS を持ち込まない（ADR-140 P4 MVP）ため、実行時の挙動は
 * 「`target_app` の `tool`（ACD MCP ツール名）を `args` とともに呼び出す」
 * ことに限定される。`args` は静的テンプレート（呼び出し時の実パラメータで
 * 上書きされ得る）。
 */
export interface PluginOperationContribution {
  /**
   * 操作 ID（プラグイン内で一意）。
   * @example "caption-shortcuts.bottom-safe"
   */
  id: string

  /** 操作タブ / CommandPalette に表示するラベル。 */
  label: string

  /**
   * 操作カテゴリ（既存カテゴリに合流させる場合は既存文言に合わせる）。
   * @example "字幕・テキスト"
   */
  category: string

  /**
   * 対象アプリの ID。ACD ツール名前空間（ADR-009）の接頭辞に対応する。
   * @example "video"
   */
  target_app: string

  /**
   * 呼び出す MCP ツール名。`permissions.tools` に宣言済みでなければならない
   * （D-6、shell 側ロード時に検証）。
   * @example "video_set_transform"
   */
  tool: string

  /**
   * ツール呼び出し時の静的引数テンプレート（任意）。
   * 実行時パラメータで上書きされ得る。
   */
  args?: Record<string, unknown>

  /** 操作の説明（任意）。 */
  description?: string
}

/**
 * `[contributes]` section of `akari-plugin.toml`.
 * ADR-140 P4 MVP では `operations` のみをサポートする
 * （panels / exporters 等の contribution は将来の拡張）。
 */
export interface PluginContributesSection {
  /** contribute する操作の一覧。 */
  operations: PluginOperationContribution[]
}

// ---------------------------------------------------------------------------
// [permissions] section
// ---------------------------------------------------------------------------

/**
 * `[permissions]` section of `akari-plugin.toml`.
 * D-6: Layer 2 contribution は capability 宣言を必須とする。
 */
export interface PluginPermissionsSection {
  /**
   * このプラグインが呼び出してよい MCP ツール名の一覧。
   * `contributes.operations[].tool` はすべてこの配列に含まれていなければ
   * ならない（未宣言ツールの contribute は shell 側ロード時に拒否される）。
   */
  tools: string[]
}

// ---------------------------------------------------------------------------
// Full manifest
// ---------------------------------------------------------------------------

/**
 * `akari-plugin.toml` の完全な表現（ADR-140 P4 MVP）。
 * プログラムからの読み込み・検証・スキャフォールドに用いる。
 */
export interface PluginManifest {
  /** プラグイン識別情報。 */
  plugin: PluginIdentity

  /** contribute する機能（本 MVP では operations のみ）。 */
  contributes: PluginContributesSection

  /** 宣言済み capability（D-6、必須）。 */
  permissions: PluginPermissionsSection
}

/**
 * shell がロード時に構築する、検証結果付きのプラグイン情報。
 * `~/.akari/plugins/` 走査結果の 1 エントリとして使われる。
 */
export interface PluginManifestInfo {
  /** パース済み manifest。 */
  manifest: PluginManifest

  /** manifest が検証を通過したかどうか。 */
  valid: boolean

  /** `valid: false` の場合の理由（人間可読）。 */
  invalid_reason?: string

  /**
   * manifest ファイルの絶対パス（`~/.akari/plugins/<id>/akari-plugin.toml`）。
   */
  path: string
}
