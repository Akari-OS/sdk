// useSourceIngest — 「外部ソースを Pool に取り込む」統一フック（統一ソース取込・フェーズB）。
//
// Video（akari-video）の「+」メニューと Pool Browser（akari-shell）の「+追加」は
// 見た目（chrome）は文脈ごとに異なるが、**取込ロジックは同一であるべき**。本フックが
// その唯一の実装（SSOT）で、両 host が呼ぶ。Rust 側の統一取込コマンド
// （pool_add_url / pool_add_item / pool_add_item_from_signed_url / pool_add_text）に委譲する。
//
// target.workId / variantId が揃うときは、取込後に slot_add_entry を併走させて WorkPool
// パネルにも出す（揃わない＝ライブラリ取込のみ。Pool Browser はこちら）。
import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PoolItemSummary } from "@akari-os/sdk/pool";

export interface SourceIngestTarget {
  /** 取込先 Pool ライブラリ名（Work Pool id でも可）。 */
  library: string;
  /** WorkPool スロット登録用。workId + variantId が揃うときのみ slot_add_entry を併走。 */
  workId?: string;
  variantId?: string;
  /** スロット role（既定 "main-track"）。 */
  role?: string;
}

export interface IngestOptions {
  /** 表示名（未指定なら backend がファイル名 / タイトルから推定）。 */
  name?: string;
  /** context_json（来歴 / credit / source_app 等）。 */
  contextJson?: Record<string, unknown>;
  /** ファイル取込時の保存モード（"copy" / "reference" / "auto"）。 */
  storageMode?: string;
  /** この取込だけ slot role を上書き（既定は target.role ?? "main-track"）。 */
  role?: string;
}

export interface SourceIngest {
  /** URL を取込（統一 Rust 取込: yt-dlp 動画サイト / 直リンクメディア / Web ページ を自動分類）。 */
  ingestUrl: (url: string, opts?: IngestOptions) => Promise<PoolItemSummary>;
  /** ローカル絶対パス群を取込（OS ピッカー / D&D / 撮影成果物など）。 */
  ingestFilePaths: (paths: string[], opts?: IngestOptions) => Promise<PoolItemSummary[]>;
  /** リモートメディア URL（画像検索の fullUrl / cloud 署名 URL 等）を DL して取込。 */
  ingestRemoteMedia: (signedUrl: string, opts?: IngestOptions) => Promise<PoolItemSummary>;
  /** テキスト / メモを取込。 */
  ingestText: (text: string, opts?: IngestOptions) => Promise<PoolItemSummary>;
}

/**
 * 統一ソース取込フック。target（取込先）を固定し、ソース種別ごとの取込メソッドを返す。
 *
 * ```ts
 * const ingest = useSourceIngest({ library: workPoolLib, workId, variantId, role: "main-track" });
 * await ingest.ingestUrl("https://youtu.be/...");
 * ```
 */
export function useSourceIngest(target: SourceIngestTarget): SourceIngest {
  const { library, workId, variantId, role } = target;
  return useMemo<SourceIngest>(() => {
    // 取込後の WorkPool スロット登録（表示用）。揃わなければ no-op。失敗しても取込自体は成功扱い。
    const linkToWorkPool = async (
      item: PoolItemSummary | { id?: string } | null | undefined,
      roleOverride?: string,
    ) => {
      const assetId = item?.id;
      if (!assetId || !workId || !variantId) return;
      try {
        await invoke("slot_add_entry", {
          library,
          workId,
          variantId,
          role: roleOverride ?? role ?? "main-track",
          assetId,
        });
      } catch (err) {
        console.warn("[useSourceIngest] slot_add_entry failed:", err);
      }
    };

    const ingestUrl: SourceIngest["ingestUrl"] = async (url, opts) => {
      const item = (await invoke("pool_add_url", {
        library,
        url,
        name: opts?.name ?? null,
        contextJson: opts?.contextJson ?? null,
      })) as PoolItemSummary;
      await linkToWorkPool(item, opts?.role);
      return item;
    };

    const ingestRemoteMedia: SourceIngest["ingestRemoteMedia"] = async (signedUrl, opts) => {
      const item = (await invoke("pool_add_item_from_signed_url", {
        library,
        signedUrl,
        name: opts?.name ?? null,
        contextJson: opts?.contextJson ?? null,
      })) as PoolItemSummary;
      await linkToWorkPool(item, opts?.role);
      return item;
    };

    const ingestText: SourceIngest["ingestText"] = async (text, opts) => {
      const item = (await invoke("pool_add_text", {
        library,
        text,
        name: opts?.name ?? null,
        contextJson: opts?.contextJson ?? null,
      })) as PoolItemSummary;
      await linkToWorkPool(item, opts?.role);
      return item;
    };

    const ingestFilePaths: SourceIngest["ingestFilePaths"] = async (paths, opts) => {
      const out: PoolItemSummary[] = [];
      for (const filePath of paths) {
        const item = (await invoke("pool_add_item", {
          library,
          filePath,
          name: opts?.name ?? null,
          contextJson: opts?.contextJson ?? null,
          storageMode: opts?.storageMode ?? null,
        })) as PoolItemSummary;
        await linkToWorkPool(item, opts?.role);
        out.push(item);
      }
      return out;
    };

    return { ingestUrl, ingestFilePaths, ingestRemoteMedia, ingestText };
  }, [library, workId, variantId, role]);
}
