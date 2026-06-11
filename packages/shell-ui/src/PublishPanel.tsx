/**
 * @file PublishPanel.tsx
 * ADR-114 D1/D2/D3: Publishing Capability — shell-ui 共通投稿パネル。
 *
 * 役割:
 *   - 各スタジオ（video / design / writer 等）から呼ばれる「投稿へ送る」UI
 *   - 右からスライドインする <aside>（fixed right、オーバーレイ / 背景暗転なし）
 *   - 一画面化原則（ルール 9 / 11）準拠 — モーダル禁止・背景暗転なし
 *   - ScheduleEntry（kind: "post"）を生成して onScheduleEntryCreated へ返す
 *   - API 実装は親が inject する（DI）— このコンポーネントは pool を直接呼ばない
 *
 * 設計指針:
 *   - PublishPanelApi を親が inject → このコンポーネントは API 実装を知らない
 *   - プラットフォーム選択（x / threads / youtube）→ listConnectedPlatforms の状態を反映
 *   - 「今すぐ」/「予約」切り替え（datetime-local）
 *   - 「下書き保存」「予約する」2 アクション
 *   - 接続状態に応じてチェックボックスを活性 / バッジ表示（未接続は dim）
 *
 * 関連 ADR:
 *   - ADR-114（Publishing は Capability。印刷モデル）
 *   - ADR-054（PublishingPayload スキーマ）
 *   - AKARI-HUB-095（ScheduleEntry データモデル）
 *   - docs/RULES.md ルール 9 / 11（一画面化原則）
 *   - docs/RULES.md ルール 14（Shell Externals Contract）
 */

import * as React from "react"
import { useState, useCallback, useId } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"

// ──────────────────────────────────────────────────────────────────
// 公開型
// ──────────────────────────────────────────────────────────────────

/** 接続済みプラットフォームの情報 */
export interface PlatformInfo {
  /** プラットフォーム ID（例: "x" / "threads" / "youtube"）*/
  id: string
  /** 表示名（例: "X（旧 Twitter）"）*/
  label: string
  /** 接続済みか */
  connected: boolean
}

/**
 * 親から inject される API。
 * このコンポーネントは pool-mcp を直接呼ばず、このインタフェース越しにのみ通信する。
 */
export interface PublishPanelApi {
  /** ScheduleEntry を作成する（pool-mcp: schedule_entry_create 相当） */
  createScheduleEntry(input: CreateScheduleEntryInput): Promise<{ id: string }>
  /** 接続済みプラットフォーム一覧を取得する */
  listConnectedPlatforms(): Promise<PlatformInfo[]>
  /**
   * プラットフォームの OAuth 接続を開始する。
   * 返却された auth_url を呼び元がシステムブラウザで開く。
   * 未実装プラットフォームの場合は undefined を返す。
   */
  connectPlatform?(platform: string): Promise<{ auth_url: string } | undefined>
  /**
   * ローカルファイルを cloud staging へアップロードする。
   * 進捗を 0.0〜1.0 の数値で onProgress コールバックへ通知する。
   * 戻り値は staging_key（cloud に渡す識別子）。
   */
  uploadMedia?(
    filePath: string,
    opts?: { onProgress?: (progress: number) => void },
  ): Promise<{ staging_key: string; content_type: string; size_bytes: number }>
  /**
   * cloud /api/schedule/entries へエントリを push する。
   * dry_run: true で送信し、返却 cloud_entry_id をローカル ScheduleEntry に書き戻す。
   */
  pushToCloud?(
    localEntryId: string,
    input: CreateScheduleEntryInput & {
      media?: Array<{ staging_key: string; content_type: string; size_bytes: number }>
      platform_config?: Record<string, unknown>
    },
  ): Promise<{ cloud_entry_id: string }>
  /**
   * プラットフォーム固有のメディア検証を行う。
   * - x: 動画 140 秒以下 / 512MB 以下 / 動画 1 本以下
   * - youtube: 検証なし（YouTube は長尺対応）
   * ok=false のとき reason に表示用メッセージを返す。
   */
  validateMediaForPlatform?(
    platform: string,
    filePaths: string[],
  ): Promise<{ ok: boolean; reason?: string }>
  /**
   * YouTube Resumable Upload でローカル動画を直接アップロードする。
   * access_token は cloud GET /api/oauth/youtube/access-token から取得する。
   * 進捗は onProgress コールバック（0.0〜1.0）で通知する。
   * 戻り値は YouTube video ID。
   */
  youtubeUpload?(
    filePath: string,
    opts: {
      accessToken: string
      title: string
      caption?: string
      scheduledAt?: string
      timing: "now" | "schedule"
      onProgress?: (progress: number) => void
    },
  ): Promise<{ videoId: string }>
}

/** createScheduleEntry に渡す最小入力型 */
export interface CreateScheduleEntryInput {
  /** Work ID（任意 — 素材先行フローでは undefined 可） */
  work_id?: string
  /** Variant ID（任意） */
  variant_ids?: string[]
  /** 投稿タイトル（任意） */
  title?: string
  /** kind は "post" 固定（ADR-114 D3） */
  kind: "post"
  /** "draft" または "scheduled" */
  status: "draft" | "scheduled"
  /** 予約日時（ISO8601 UTC、status="scheduled" のとき設定） */
  scheduled_at?: string
  /**
   * ADR-054 PublishingPayload 最小形。
   * platforms キーはプラットフォーム ID → caption / enabled のマップ。
   */
  payload?: {
    platforms: Record<
      string,
      {
        enabled: boolean
        caption?: string
      }
    >
  }
  /** キャンペーン ID（任意） */
  campaign_id?: string
}

/**
 * PublishPanel に渡す既存の下書き情報（フロー 2 / 3 で使用）。
 * 各スタジオが「投稿へ送る」ボタンを押したときに引き継ぐコンテキスト。
 */
export interface DraftEntry {
  /** 関連 Work ID */
  workId?: string
  /** Work タイトル（表示用） */
  workTitle?: string
  /** Variant ID（書き出し済みファイルに対応） */
  variantId?: string
  /** 書き出し済みファイルパス（メディア添付候補）。アップロード前の絶対パス。 */
  outputPaths?: string[]
}

/** PublishPanel の Props */
export interface PublishPanelProps {
  /** パネルを表示するか */
  open: boolean
  /** 閉じるコールバック */
  onClose: () => void
  /**
   * 既存の下書き情報。
   * undefined の場合は空のフォームから始まる（フロー 1: Writer 先行）。
   */
  draftEntry?: DraftEntry
  /** ScheduleEntry 作成後に呼ばれるコールバック */
  onScheduleEntryCreated?: (entry: { id: string }) => void
  /** 親から inject される API 実装 */
  api: PublishPanelApi
  /** 追加 className */
  className?: string
}

// ──────────────────────────────────────────────────────────────────
// 内部定数
// ──────────────────────────────────────────────────────────────────

/** 表示するプラットフォームの定義（接続状態は API から取得）*/
const PLATFORM_DEFS: { id: string; label: string; icon: React.ReactNode }[] = [
  {
    id: "x",
    label: "X（旧 Twitter）",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.737l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "threads",
    label: "Threads",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-.987-3.588-3.38-5.454-7.295-5.478-2.958.024-5.195.895-6.65 2.587-1.458 1.698-2.188 4.139-2.211 7.255.024 3.11.753 5.55 2.21 7.248 1.455 1.692 3.692 2.564 6.65 2.587 1.96-.012 3.375-.486 4.38-1.448 1.148-1.1 1.461-2.694 1.465-3.766a9.053 9.053 0 0 0-.143-1.571c-.38.157-.793.275-1.24.338-.52.074-1.07.097-1.639.059-2.258-.16-4.022-1.163-4.838-2.742-.543-1.033-.628-2.243-.232-3.42.439-1.311 1.41-2.225 2.75-2.576 1.19-.314 2.445-.177 3.536.382.573.293 1.076.704 1.483 1.2.04-.267.052-.517.052-.717V8.3h2.04v.002c0 .285-.014.57-.043.85a12.5 12.5 0 0 1-.196 1.407 7.3 7.3 0 0 1-.504 1.549c.42 1.16.497 2.457.198 3.788-.41 1.828-1.473 3.27-2.981 4.071-1.38.738-3.01 1.046-4.725 1.033zm-.358-9.988c.28.018.555.005.818-.038a3.68 3.68 0 0 0 .895-.27 2.96 2.96 0 0 0-.572-1.098 2.557 2.557 0 0 0-.86-.666c-.576-.294-1.22-.384-1.81-.228-.672.178-1.173.636-1.413 1.295-.231.692-.168 1.434.17 2.075.497.945 1.587 1.573 3.046 1.674a7.19 7.19 0 0 0 .452.017c.19 0 .375-.01.554-.03a4.49 4.49 0 0 0-.28-.731z" />
      </svg>
    ),
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
]

// ──────────────────────────────────────────────────────────────────
// サブコンポーネント
// ──────────────────────────────────────────────────────────────────

/** 接続状態バッジ */
function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium",
        connected
          ? "bg-emerald-500/20 text-emerald-400"
          : "bg-muted/50 text-muted-foreground",
      )}
    >
      {connected ? "接続中" : "未接続"}
    </span>
  )
}

/** プラットフォーム選択チェック行 */
function PlatformRow({
  platform,
  checked,
  disabled,
  onChange,
  labelId,
  onConnect,
  connecting,
}: {
  platform: typeof PLATFORM_DEFS[number]
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  labelId: string
  onConnect?: () => void
  connecting?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 transition",
        disabled
          ? "border-border/40 opacity-60"
          : checked
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card/30",
      )}
    >
      <label
        htmlFor={`publish-platform-${platform.id}`}
        className={cn(
          "flex flex-1 cursor-pointer items-center gap-2",
          disabled && "cursor-not-allowed",
        )}
        id={labelId}
      >
        <input
          type="checkbox"
          id={`publish-platform-${platform.id}`}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-labelledby={labelId}
          className="h-3.5 w-3.5 accent-primary"
        />
        <span className="text-muted-foreground">{platform.icon}</span>
        <span className="flex-1 text-[13px] text-foreground">{platform.label}</span>
        <ConnectionBadge connected={!disabled} />
      </label>
      {/* 未接続のとき「接続」ボタンを表示（connectPlatform が利用可能な場合のみ） */}
      {disabled && onConnect && (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          aria-label={`${platform.label} を接続する`}
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-medium transition",
            "bg-primary/10 text-primary hover:bg-primary/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            connecting && "cursor-not-allowed opacity-50",
          )}
        >
          {connecting ? "接続中…" : "接続"}
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────────────────────────

/**
 * ADR-114 D1-1 共通 PublishModal（印刷ダイアログ相当）の実装。
 *
 * 右からスライドインする <aside>（fixed right、オーバーレイなし）として実装。
 * モーダル / Portal / 背景暗転を使わない（ルール 9 / 11 — 一画面化原則）。
 *
 * **API 実装は親が inject**（DI）— このコンポーネントは pool を直接呼ばない。
 *
 * @example
 * ```tsx
 * <PublishPanel
 *   open={isOpen}
 *   onClose={() => setOpen(false)}
 *   draftEntry={{ workId: "w-123", workTitle: "週次まとめ" }}
 *   onScheduleEntryCreated={(e) => console.log("created:", e.id)}
 *   api={myPublishApi}
 * />
 * ```
 */
export function PublishPanel({
  open,
  onClose,
  draftEntry,
  onScheduleEntryCreated,
  api,
  className,
}: PublishPanelProps): React.ReactElement | null {
  const uid = useId()

  // ── 状態 ─────────────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [platformsLoaded, setPlatformsLoaded] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({})
  const [caption, setCaption] = useState<string>("")
  /** "now" | "schedule" */
  const [timing, setTiming] = useState<"now" | "schedule">("now")
  const [scheduledAt, setScheduledAt] = useState<string>("")
  const [submitting, setSubmitting] = useState<false | "draft" | "schedule">(false)
  /** メディアアップロード進捗（0〜1。null は未開始 / 完了） */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  /** アップロード中のファイル名（表示用） */
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [cloudEntryId, setCloudEntryId] = useState<string | null>(null)
  /** YouTube 予約完了時の video ID（youtu.be リンク表示用） */
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null)
  /** YouTube dry-run フラグ（接続前のフォールバック） */
  const [youtubeDryRun, setYoutubeDryRun] = useState<boolean>(false)
  /** プラットフォーム接続中フラグ（platform id → true） */
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
  /**
   * outputPaths → staging_key のキャッシュ。
   * 同一パネルセッション内で再度「予約する」を押しても同じ staging_key を再利用し
   * 二重アップロードを防ぐ。open=false → true でリセットされる。
   */
  const [cachedStagingKeys, setCachedStagingKeys] = useState<
    Map<string, { staging_key: string; content_type: string; size_bytes: number }>
  >(new Map())

  // ── プラットフォーム読み込み ─────────────────────────────────
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setPlatformsLoaded(false)
    api.listConnectedPlatforms().then((list) => {
      if (cancelled) return
      setPlatforms(list)
      // 接続済みのものだけデフォルト選択
      const initSel: Record<string, boolean> = {}
      for (const p of list) {
        initSel[p.id] = p.connected
      }
      setSelectedPlatforms(initSel)
      setPlatformsLoaded(true)
    }).catch(() => {
      if (cancelled) return
      // エラー時は PLATFORM_DEFS から未接続として表示
      const fallback = PLATFORM_DEFS.map((d) => ({ id: d.id, label: d.label, connected: false }))
      setPlatforms(fallback)
      const initSel: Record<string, boolean> = {}
      for (const p of fallback) { initSel[p.id] = false }
      setSelectedPlatforms(initSel)
      setPlatformsLoaded(true)
    })
    return () => { cancelled = true }
  }, [open, api])

  // ── パネルを開くたびにフォームをリセット ────────────────────
  React.useEffect(() => {
    if (open) {
      setCaption("")
      setTiming("now")
      setScheduledAt("")
      setError(null)
      setSuccessId(null)
      setCloudEntryId(null)
      setYoutubeVideoId(null)
      setYoutubeDryRun(false)
      setSubmitting(false)
      setUploadProgress(null)
      setUploadingFile(null)
      setConnectingPlatform(null)
      setCachedStagingKeys(new Map())
    }
  }, [open])

  // ── ヘルパー ─────────────────────────────────────────────────

  /** 選択プラットフォームを platforms フィールドに変換 */
  const buildPlatformsPayload = useCallback(() => {
    const result: Record<string, { enabled: boolean; caption?: string }> = {}
    for (const [id, enabled] of Object.entries(selectedPlatforms)) {
      if (enabled) {
        result[id] = { enabled: true, caption: caption || undefined }
      }
    }
    return result
  }, [selectedPlatforms, caption])

  /** scheduled_at を ISO8601 UTC に変換（datetime-local は ローカル時刻） */
  const toUtcIso = useCallback((localDatetime: string): string | undefined => {
    if (!localDatetime) return undefined
    return new Date(localDatetime).toISOString()
  }, [])

  // ── アクション ────────────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    setError(null)
    setSubmitting("draft")
    try {
      const entry = await api.createScheduleEntry({
        kind: "post",
        status: "draft",
        work_id: draftEntry?.workId,
        variant_ids: draftEntry?.variantId ? [draftEntry.variantId] : undefined,
        title: draftEntry?.workTitle,
        payload: { platforms: buildPlatformsPayload() },
      })
      setSuccessId(entry.id)
      onScheduleEntryCreated?.(entry)
    } catch (e) {
      setError(e instanceof Error ? e.message : "下書き保存に失敗しました")
    } finally {
      setSubmitting(false)
    }
  }, [api, draftEntry, buildPlatformsPayload, onScheduleEntryCreated])

  /**
   * 「接続」ボタン押下ハンドラ。
   * connectPlatform → auth_url をシステムブラウザで開く。
   * connectPlatform が未実装なら no-op。
   */
  const handleConnect = useCallback(async (platformId: string) => {
    if (!api.connectPlatform) return
    setConnectingPlatform(platformId)
    setError(null)
    try {
      const result = await api.connectPlatform(platformId)
      if (result?.auth_url) {
        // 呼び元（VideoStudio）が openExternal を使ってブラウザで開く想定
        // API が auth_url を返した場合はリロードを促すだけ
        setError(`ブラウザで認証を完了してください。完了後にパネルを開き直してください。`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続に失敗しました")
    } finally {
      setConnectingPlatform(null)
    }
  }, [api])

  const handleSchedule = useCallback(async () => {
    const enabledCount = Object.values(selectedPlatforms).filter(Boolean).length
    if (enabledCount === 0) {
      setError("投稿先プラットフォームを 1 つ以上選択してください")
      return
    }
    if (timing === "schedule" && !scheduledAt) {
      setError("予約日時を指定してください")
      return
    }

    // X 向けメディア事前検証（X が選択 & 添付ファイルあり & validateMediaForPlatform 実装済み）
    const xEnabled = selectedPlatforms["x"] === true
    if (
      xEnabled &&
      api.validateMediaForPlatform &&
      draftEntry?.outputPaths &&
      draftEntry.outputPaths.length > 0
    ) {
      const validation = await api.validateMediaForPlatform("x", draftEntry.outputPaths)
      if (!validation.ok) {
        setError(validation.reason ?? "X へのアップロード検証に失敗しました")
        return
      }
    }

    setError(null)
    setSubmitting("schedule")
    setUploadProgress(null)
    setUploadingFile(null)

    /**
     * Draft-first パターン（A 案）:
     *   ① draft で ScheduleEntry 作成（まだ scheduled にしない）
     *   ② メディアアップロード（X: cloud staging / YouTube: Rust 直アップロード）
     *   ③ cloud push
     *   ④ ローカル entry を scheduled に更新
     *
     * こうすることで、② 失敗時にローカル entry が status=scheduled のまま
     * 残って二重実行対象になる問題を防ぐ。
     *
     * 二重アップロード防止:
     *   cachedStagingKeys に filePath → staging 結果をキャッシュし、
     *   同一パネルセッション内で再押下しても同じ staging_key を再利用する。
     */

    const baseScheduledAt =
      timing === "now"
        ? new Date().toISOString()
        : toUtcIso(scheduledAt)

    const draftInput: CreateScheduleEntryInput = {
      kind: "post",
      // まず draft として作成。③ 完了後に scheduled へ更新する
      status: "draft",
      work_id: draftEntry?.workId,
      variant_ids: draftEntry?.variantId ? [draftEntry.variantId] : undefined,
      title: draftEntry?.workTitle ?? "(タイトルなし)",
      scheduled_at: baseScheduledAt,
      payload: { platforms: buildPlatformsPayload() },
    }

    let entry: { id: string } | null = null
    try {
      // --- ① ローカル ScheduleEntry を draft で作成 ---
      entry = await api.createScheduleEntry(draftInput)

      // YouTube が選択されているか判定
      const youtubeEnabled = selectedPlatforms["youtube"] === true

      // --- ② YouTube 直アップロードパス ---
      // YouTube は cloud staging を経由せず Rust コマンドで直接アップロードする
      let youtubeVideoId: string | null = null
      let youtubeDryRun = false
      if (
        youtubeEnabled &&
        api.youtubeUpload &&
        draftEntry?.outputPaths &&
        draftEntry.outputPaths.length > 0
      ) {
        // 動画ファイルを 1 本だけ対象にする（YouTube は 1 投稿 1 本）
        const videoPath = draftEntry.outputPaths.find(
          (p) => /\.(mp4|mov|webm|mkv|avi)$/i.test(p),
        ) ?? draftEntry.outputPaths[0]
        const filename = videoPath.split("/").pop() ?? videoPath
        setUploadingFile(filename)
        setUploadProgress(0)
        try {
          const result = await api.youtubeUpload(videoPath, {
            accessToken: "", // VideoStudio.tsx 側で access-token API を呼んで渡す
            title: draftEntry?.workTitle ?? "(タイトルなし)",
            caption,
            scheduledAt: timing === "schedule" ? baseScheduledAt : undefined,
            timing,
            onProgress: (p) => setUploadProgress(p),
          })
          youtubeVideoId = result.videoId
        } catch (e) {
          // YouTube アップロード失敗時は dry-run として続行
          // （youtubeUpload 実装が dry-run モードを返した場合も同様）
          if (e instanceof Error && e.message.includes("dry-run")) {
            youtubeDryRun = true
          } else {
            throw e
          }
        }
        setUploadProgress(null)
        setUploadingFile(null)
      }

      // --- ③ X パス: メディアアップロード（uploadMedia が実装されている場合のみ） ---
      // YouTube 専用投稿（X 非選択）の場合は staging upload をスキップ
      const uploadedMedia: Array<{ staging_key: string; content_type: string; size_bytes: number }> = []
      const xOnlyOrMixed = !youtubeEnabled || xEnabled
      if (
        xOnlyOrMixed &&
        api.uploadMedia &&
        draftEntry?.outputPaths &&
        draftEntry.outputPaths.length > 0
      ) {
        const nextCache = new Map(cachedStagingKeys)
        for (let i = 0; i < draftEntry.outputPaths.length; i++) {
          const filePath = draftEntry.outputPaths[i]
          const cached = nextCache.get(filePath)
          if (cached) {
            // 同一セッション内で既にアップロード済み — キャッシュを再利用
            uploadedMedia.push(cached)
          } else {
            const filename = filePath.split("/").pop() ?? filePath
            setUploadingFile(filename)
            setUploadProgress(0)
            const result = await api.uploadMedia(filePath, {
              onProgress: (p) => setUploadProgress(p),
            })
            uploadedMedia.push(result)
            nextCache.set(filePath, result)
            setUploadProgress(1)
          }
        }
        setCachedStagingKeys(nextCache)
        setUploadProgress(null)
        setUploadingFile(null)
      }

      // --- ④ cloud push（pushToCloud が実装されている場合のみ） ---
      // cloud へ push する際は status="scheduled" を渡す（ADR-114 D3 フロー2 準拠）
      // YouTube の video_id は platform_config.youtube.video_id に格納
      const scheduledInput: CreateScheduleEntryInput = {
        ...draftInput,
        status: "scheduled",
      }
      if (api.pushToCloud) {
        const platformConfig: Record<string, unknown> = {}
        if (youtubeEnabled) {
          if (youtubeVideoId) {
            platformConfig["youtube"] = { video_id: youtubeVideoId }
          } else if (youtubeDryRun) {
            platformConfig["youtube"] = { dry_run: true }
          }
        }
        const cloudInput = {
          ...scheduledInput,
          media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
          platform_config: Object.keys(platformConfig).length > 0 ? platformConfig : undefined,
        }
        const { cloud_entry_id } = await api.pushToCloud(entry.id, cloudInput)
        setCloudEntryId(cloud_entry_id)
        // YouTube 予約済みの場合は video_id を state に保持してリンク表示
        if (youtubeVideoId) {
          setYoutubeVideoId(youtubeVideoId)
        }
        if (youtubeDryRun) {
          setYoutubeDryRun(true)
        }
      }

      // --- ⑤ ローカル entry を scheduled に昇格して通知 ---
      // createScheduleEntry は status 更新 API を兼ねていないため、
      // 親への通知は id のみ渡す（親が pool 側で status 更新する設計）
      setSuccessId(entry.id)
      onScheduleEntryCreated?.(entry)
    } catch (e) {
      setError(e instanceof Error ? e.message : "予約に失敗しました")
      // entry が作成済みなら draft のまま残す（ロールバック不要 — draft は二重実行対象外）
    } finally {
      setSubmitting(false)
      setUploadProgress(null)
      setUploadingFile(null)
    }
  }, [api, draftEntry, selectedPlatforms, caption, timing, scheduledAt, buildPlatformsPayload, toUtcIso, onScheduleEntryCreated, cachedStagingKeys])

  // ── 接続済みプラットフォーム一覧（PLATFORM_DEFS との merge） ──
  const platformRows = PLATFORM_DEFS.map((def) => {
    const info = platforms.find((p) => p.id === def.id)
    return {
      ...def,
      label: info?.label ?? def.label,
      connected: info?.connected ?? false,
    }
  })

  // ── render ────────────────────────────────────────────────────

  return (
    <>
      {/*
       * スライドイン <aside>（fixed right）。
       * オーバーレイ / 背景暗転なし — 一画面化原則（ルール 9 / 11）。
       * open=false でも DOM から消えず transform で右外に退避する（スムーズ遷移）。
       */}
      <aside
        aria-label="投稿パネル"
        aria-hidden={!open}
        data-open={open}
        className={cn(
          // レイアウト
          "fixed right-0 top-0 z-40 flex h-full w-80 flex-col",
          // ビジュアル
          "border-l border-border bg-background shadow-xl",
          // トランジション
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
          className,
        )}
        // ホストアプリ側に Tailwind ユーティリティが無い環境でも開閉が成立するよう、
        // transform はインラインで強制する（shadow の滲み対策で 110% 退避）
        style={{
          transform: open ? "translateX(0%)" : "translateX(110%)",
          // 閉じるときは退避アニメーション完了後に visibility を落とす
          transition: `transform 300ms ease-in-out, visibility 0s linear ${open ? "0s" : "300ms"}`,
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
        }}
      >
        {/* ── ヘッダー ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[13px] font-semibold text-foreground">投稿へ送る</h2>
            {draftEntry?.workTitle && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                {draftEntry.workTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="投稿パネルを閉じる"
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              "text-muted-foreground transition hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            {/* × アイコン（lucide 非依存） */}
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── スクロール可能な本体 ──────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">

          {/* 書き出し済みファイル（表示のみ） */}
          {draftEntry?.outputPaths && draftEntry.outputPaths.length > 0 && (
            <section aria-label="添付ファイル">
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">添付ファイル</p>
              <ul className="flex flex-col gap-1">
                {draftEntry.outputPaths.map((p) => (
                  <li
                    key={p}
                    className="truncate rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] text-foreground"
                    title={p}
                  >
                    {p.split("/").pop() ?? p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* プラットフォーム選択 */}
          <section aria-label="投稿先プラットフォーム">
            <p
              id={`${uid}-platform-label`}
              className="mb-2 text-[11px] font-medium text-muted-foreground"
            >
              投稿先
            </p>
            {!platformsLoaded ? (
              <p className="text-[12px] text-muted-foreground">読み込み中…</p>
            ) : (
              <div
                role="group"
                aria-labelledby={`${uid}-platform-label`}
                className="flex flex-col gap-1.5"
              >
                {platformRows.map((pf) => (
                  <PlatformRow
                    key={pf.id}
                    platform={pf}
                    checked={selectedPlatforms[pf.id] ?? false}
                    disabled={!pf.connected}
                    labelId={`${uid}-platform-row-${pf.id}`}
                    onChange={(checked) => {
                      setSelectedPlatforms((prev) => ({ ...prev, [pf.id]: checked }))
                    }}
                    onConnect={api.connectPlatform ? () => handleConnect(pf.id) : undefined}
                    connecting={connectingPlatform === pf.id}
                  />
                ))}
              </div>
            )}
            {/* YouTube 選択中の注意書き */}
            {selectedPlatforms["youtube"] === true && (
              <p className="mt-1.5 text-[10px] text-muted-foreground/70 leading-relaxed">
                ※ YouTube は長尺対応ですが、15 分超の動画はチャンネルの確認（電話番号登録）が必要です。
              </p>
            )}
          </section>

          {/* キャプション */}
          <section aria-label="キャプション">
            <label
              htmlFor={`${uid}-caption`}
              className="mb-1.5 block text-[11px] font-medium text-muted-foreground"
            >
              キャプション
            </label>
            <textarea
              id={`${uid}-caption`}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="投稿のキャプションを入力"
              rows={4}
              className={cn(
                "w-full resize-y rounded-md border border-border bg-background px-3 py-2",
                "text-[13px] text-foreground placeholder:text-muted-foreground/60",
                "outline-none transition",
                "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
              )}
            />
          </section>

          {/* 投稿タイミング（今すぐ / 予約） */}
          <section aria-label="投稿タイミング">
            <p
              id={`${uid}-timing-label`}
              className="mb-2 text-[11px] font-medium text-muted-foreground"
            >
              投稿タイミング
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-timing-label`}
              className="flex flex-col gap-1.5"
            >
              {/* 今すぐ */}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition",
                  timing === "now"
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card/30 hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-timing`}
                  value="now"
                  checked={timing === "now"}
                  onChange={() => setTiming("now")}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-[13px] text-foreground">今すぐ投稿</span>
              </label>

              {/* 予約 */}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition",
                  timing === "schedule"
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card/30 hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-timing`}
                  value="schedule"
                  checked={timing === "schedule"}
                  onChange={() => setTiming("schedule")}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-[13px] text-foreground">予約投稿</span>
              </label>
            </div>

            {/* 予約日時入力（timing=schedule のときのみ表示） */}
            {timing === "schedule" && (
              <div className="mt-2">
                <label
                  htmlFor={`${uid}-scheduled-at`}
                  className="mb-1 block text-[11px] text-muted-foreground"
                >
                  予約日時
                </label>
                <input
                  id={`${uid}-scheduled-at`}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  aria-required="true"
                  className={cn(
                    "w-full rounded-md border border-border bg-background px-3 py-2",
                    "text-[13px] text-foreground",
                    "outline-none transition",
                    "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                  )}
                />
              </div>
            )}
          </section>

          {/* アップロード進捗 */}
          {uploadProgress !== null && uploadingFile && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col gap-1"
            >
              <p className="text-[11px] text-muted-foreground truncate">
                アップロード中: {uploadingFile}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                />
              </div>
              <p className="text-right text-[10px] text-muted-foreground">
                {Math.round(uploadProgress * 100)}%
              </p>
            </div>
          )}

          {/* エラー */}
          {error && (
            <p
              role="alert"
              className={cn(
                "rounded-md border border-destructive/40 bg-destructive/10",
                "px-3 py-2 text-[12px] text-destructive",
              )}
            >
              {error}
            </p>
          )}

          {/* 成功 */}
          {successId && (
            <div
              role="status"
              className={cn(
                "rounded-md border border-emerald-500/40 bg-emerald-500/10",
                "px-3 py-2 text-[12px] text-emerald-400 flex flex-col gap-0.5",
              )}
            >
              <p>保存しました（ID: {successId}）</p>
              {cloudEntryId && (
                <p className="text-[10px] text-emerald-400/70">
                  cloud 登録: {cloudEntryId}
                </p>
              )}
              {youtubeVideoId && (
                <p className="text-[11px] text-emerald-300">
                  YouTube 側で予約済み — youtu.be/{youtubeVideoId}
                </p>
              )}
              {youtubeDryRun && !youtubeVideoId && (
                <p className="text-[11px] text-amber-400/80">
                  YouTube: dry-run（接続後に実アップロード）
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── フッター アクション ──────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSaveDraft}
            disabled={submitting !== false}
            aria-label="下書きとして保存する"
            className="flex-1"
          >
            {submitting === "draft" ? "保存中…" : "下書き保存"}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleSchedule}
            disabled={submitting !== false}
            aria-label={timing === "now" ? "今すぐ投稿する" : "予約投稿を設定する"}
            className="flex-1"
          >
            {submitting === "schedule"
              ? uploadProgress !== null
                ? `アップロード中 ${Math.round(uploadProgress * 100)}%`
                : "処理中…"
              : timing === "now"
              ? "今すぐ投稿"
              : "予約する"}
          </Button>
        </div>
      </aside>
    </>
  )
}
