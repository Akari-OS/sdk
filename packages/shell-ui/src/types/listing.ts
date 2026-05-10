/**
 * AKARI-HUB-079 Phase 1 T2.1 — Library listing types
 *
 * akari-cloud の GET /api/library/listings response を表現する型 +
 * LibraryBrowser component が消費する LibraryBrowserBackend interface。
 *
 * 関連:
 *   - spec: docs/sdd/specs/spec-library-in-shell-consumer.md (HUB-079 §4.4)
 *   - cloud: src/app/api/library/listings/route.ts
 */

export type LibraryListingType =
  | "asset_content"
  | "app"
  | "poolpack"
  | "methodology_pack";

export interface LibraryListing {
  id: string;
  type: LibraryListingType;
  title: string;
  description: string;
  category: string;
  tags: string[];
  format_id: string;
  format_version: string;
  bundle_size_bytes: number;
  /** R2 keys; Phase 1a 段階では [] (HUB-066 で実装予定) */
  preview_assets: string[];
  seller_id: string;
  /** ISO 8601 (cloud 側で created_at fallback あり) */
  published_at: string;
  /** listing-level の download count */
  download_count: number;
}

export interface LibraryFilter {
  type?: LibraryListingType;
  format_id?: string;
  category?: string;
  /** default 50, max 200 */
  limit?: number;
  /** 前 page の最後の published_at */
  cursor?: string;
}

export interface LibraryListPage {
  listings: LibraryListing[];
  nextCursor: string | null;
}

/**
 * Library asset を install したときの結果。
 * shell が pool-core を呼んだ後に hook へ返す。
 */
export interface LibraryInstallResult {
  /** install された Asset の ID */
  poolAssetId: string;
  /** 取り込み先の Work */
  workId: string;
  source: {
    kind: "library";
    listingId: string;
    listingVersion: string;
  };
}

/**
 * LibraryBrowser が依存する backend abstraction。
 * shell が cloud-library-backend を inject する。
 */
export interface LibraryBrowserBackend {
  /** listings を取得 */
  listListings(filter: LibraryFilter): Promise<LibraryListPage>;

  /**
   * listing を現 Work の Pool に Install する。
   * 内部的に cloud /download endpoint を呼び、 signed URL から bundle を fetch、
   * pool-core の add_asset_from_library_bundle を呼ぶ責務を持つ。
   */
  installToCurrentWork(listing: LibraryListing): Promise<LibraryInstallResult>;
}
