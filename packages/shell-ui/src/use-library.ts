/**
 * @file use-library.ts
 * AKARI-HUB-079 Phase 1 T2.3 — Library listing fetch / install hooks。
 *
 * useLibrary: listings + loading + error state。filter 変更で refetch。
 * useLibraryInstall: install(listing) → Promise<LibraryInstallResult> + installing + error。
 *
 * LibraryBrowser から使われる + shell side からも直接使えるよう独立 export。
 *
 * 関連:
 *   - spec: docs/sdd/specs/spec-library-in-shell-consumer.md (HUB-079 §4.4)
 *   - types: ./types/listing.ts
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  LibraryFilter,
  LibraryListing,
  LibraryBrowserBackend,
  LibraryInstallResult,
} from "./types/listing";

// ─── useLibrary ──────────────────────────────────────────────────────────────

export interface UseLibraryResult {
  listings: LibraryListing[];
  loading: boolean;
  error: string | null;
  /** 手動 refetch */
  refresh: () => void;
}

/**
 * listings を fetch する hook。
 * filter が変わると自動的に refetch する。
 */
export function useLibrary(
  backend: LibraryBrowserBackend,
  filter: LibraryFilter,
): UseLibraryResult {
  const [listings, setListings] = useState<LibraryListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // filter の deep-equal 化（参照が毎回変わっても無限 loop しないよう JSON 化）
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const page = await backend.listListings(filter);
        if (cancelled) return;
        setListings(page.listings);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "listings の取得に失敗しました";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, filterKey, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return { listings, loading, error, refresh };
}

// ─── useLibraryInstall ───────────────────────────────────────────────────────

export interface UseLibraryInstallResult {
  install: (listing: LibraryListing) => Promise<LibraryInstallResult>;
  installing: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * listing を現 Work の Pool に install する hook。
 * backend.installToCurrentWork を call し、installing / error state を管理する。
 */
export function useLibraryInstall(
  backend: LibraryBrowserBackend,
): UseLibraryInstallResult {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 最新の backend ref（hook の安定性を保つ）
  const backendRef = useRef(backend);
  backendRef.current = backend;

  const install = useCallback(
    async (listing: LibraryListing): Promise<LibraryInstallResult> => {
      setInstalling(true);
      setError(null);
      try {
        const result = await backendRef.current.installToCurrentWork(listing);
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Install に失敗しました";
        setError(msg);
        throw err;
      } finally {
        setInstalling(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { install, installing, error, clearError };
}
