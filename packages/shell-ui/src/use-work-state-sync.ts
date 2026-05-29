/**
 * useWorkStateSync — Work state JSON を debounce で Pool に upsert する hook。
 *
 * ADR-085 D-2「Work state は live sync (autosave debounce 200〜500ms)」+
 * Phase D-1 の skeleton として実装。
 *
 * 振る舞い:
 *   - `state` の JSON が変化したら debounce で `pool_upsert_item` を 1 回叩く
 *   - dedup_key = `state:{app}:{workId}` で同 Work の state は 1 行に上書き
 *   - library は `akari-work-states` 既定（無ければ初回 create）
 *   - storage_mode = "copy" 固定（state JSON は MB 級になりうるが Pool 内で
 *     完結させる方が dangling リスクが無い）
 *   - context_json に source_app / work_state: true / attached_to_work / saved_at
 *
 * 使い方:
 *   ```tsx
 *   useWorkStateSync({
 *     app: "design",
 *     workId: activeWork?.id,
 *     state: { elements, variants, templateBinding },
 *     debounceMs: 800,
 *   })
 *   ```
 *
 * 制限（skeleton 段階）:
 *   - state JSON を毎回 `save_blob_to_pool_uploads` で disk に書いてから
 *     pool_upsert_item を叩く（disk I/O 重複）。Phase D 後段で pool-core
 *     に「JSON を直接 set する API」を追加して最適化予定
 *   - live preview (writer から design Work を見る) には headless renderer
 *     が必要。本 hook は state を Pool に上げるだけ
 */
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const DEFAULT_LIBRARY = "akari-work-states";
const DEFAULT_DEBOUNCE_MS = 1000;

export type WorkStateSyncApp = "design" | "video" | "writer" | string;

export interface UseWorkStateSyncOptions<T> {
  /** app 識別子（"design" / "video" / "writer" 等）。dedup_key の prefix にもなる */
  app: WorkStateSyncApp;
  /** 対象 Work の id。null/undefined のとき sync 無効 */
  workId: string | null | undefined;
  /** Work state JSON 化対象。変化検知は JSON.stringify で行う */
  state: T;
  /** debounce ms (default 1000) */
  debounceMs?: number;
  /** library name (default "akari-work-states") */
  library?: string;
  /** false にすると sync を無効化（dev mode 等） */
  enabled?: boolean;
}

const ensuredLibraries = new Set<string>();

async function ensureLibrary(name: string): Promise<void> {
  if (ensuredLibraries.has(name)) return;
  try {
    const libs = await invoke<{ name: string }[]>("pool_list_pools", {
      includeArchived: false,
    });
    if (libs.some((l) => l.name === name)) {
      ensuredLibraries.add(name);
      return;
    }
  } catch {
    // fall through
  }
  try {
    const archived = await invoke<{ name: string }[]>(
      "pool_list_archived_pools",
    );
    if (archived.some((l) => l.name === name)) {
      await invoke("pool_restore_pool", { name });
      ensuredLibraries.add(name);
      return;
    }
  } catch {
    // fall through
  }
  try {
    await invoke("pool_create_pool", {
      name,
      description: "Work state autosave (ADR-085 Phase D)",
    });
    ensuredLibraries.add(name);
  } catch (err) {
    console.warn("[useWorkStateSync] ensureLibrary failed:", err);
  }
}

export function useWorkStateSync<T>(opts: UseWorkStateSyncOptions<T>): void {
  const {
    app,
    workId,
    state,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    library = DEFAULT_LIBRARY,
    enabled = true,
  } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJsonRef = useRef<string | null>(null);
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !workId) return;
    let json: string;
    try {
      json = JSON.stringify(state);
    } catch (err) {
      console.warn("[useWorkStateSync] JSON.stringify failed:", err);
      return;
    }
    if (json === lastJsonRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        await ensureLibrary(library);
        const filename = `${app}-${workId}.json`;
        const data = Array.from(new TextEncoder().encode(json));
        const absPath = await invoke<string>("save_blob_to_pool_uploads", {
          filename,
          data,
        });
        await invoke("pool_upsert_item", {
          library,
          filePath: absPath,
          name: `[${app} state] ${workId}`,
          dedupKey: `state:${app}:${workId}`,
          contextJson: {
            source_app: app,
            work_state: true,
            attached_to_work: workId,
            saved_at: new Date().toISOString(),
          },
          storageMode: "copy",
        });
        lastJsonRef.current = json;
      } catch (err) {
        console.warn("[useWorkStateSync] sync failed:", err);
      } finally {
        inflightRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, workId, state, app, library, debounceMs]);
}
