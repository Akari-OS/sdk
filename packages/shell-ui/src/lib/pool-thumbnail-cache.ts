/**
 * Pool サムネイルのフロントエンド共有キャッシュ（shell-ui 版）。
 *
 * akari-shell の `src/lib/pool-thumbnail-cache.ts` を shell-ui に移植したもの。
 * ContextSlotPanel（= 各 app の「ワークプール」タブ）が entry ごとに無制限並列で
 * getItemThumbnail（ffmpeg）を叩き、かつ完了ごとに Map 全コピー + パネル全体再描画を
 * していた O(N^2) 問題を解消するために導入。
 *
 * 設計（akari-shell 版と同一思想）:
 * - `cache: Map<key, url>` — `${library}::${id}` → convertFileSrc 済 URL or null（生成失敗含む）
 * - `inflight: Map<key, Promise>` — 同 key の並行リクエストを 1 本に集約
 * - `queue` + `MAX_CONCURRENT=1` — backend で ffmpeg が起動するため並列数を絞り動画 preview と競合させない
 * - video preview 再生中は新規 thumbnail job を開始しない（既に走った 1 本だけ完走）
 * - `subscribers` + rAF コアレス notify — 複数サムネ完了を 1 フレーム 1 回の再描画に束ねる
 *
 * 注: shell-ui は app から external として参照されるため、本モジュールも shell に
 * bundle される単一インスタンスとして共有される（video / design 双方が同じ cache を使う）。
 */
import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getItemThumbnail } from "@akari-os/sdk/pool";

type Key = string;
const key = (library: string, id: string): Key => `${library}::${id}`;

const cache = new Map<Key, string | null>();
const inflight = new Map<Key, Promise<string | null>>();
const generating = new Set<Key>();
const subscribers = new Set<() => void>();
const generatingSubscribers = new Set<() => void>();
const playbackSubscribers = new Set<() => void>();

/**
 * 並列実行数の上限。cache miss 時に backend で ffmpeg が起動するため、
 * 動画 preview / Google Drive File Provider とCPU・I/Oを奪い合わないよう 1 本に絞る。
 */
const MAX_CONCURRENT = 1;
let active = 0;
type QueueTask = {
  key: Key;
  run: () => void;
  resolve: (value: string | null) => void;
};
const queue: QueueTask[] = [];
let previewPlaybackActive = false;

if (typeof window !== "undefined") {
  window.addEventListener("akari:video-preview-playback", (event) => {
    const next = Boolean(
      (event as CustomEvent<{ isPlaying?: boolean }>).detail?.isPlaying,
    );
    if (next === previewPlaybackActive) return;
    previewPlaybackActive = next;
    for (const fn of playbackSubscribers) fn();
    if (!previewPlaybackActive) pumpQueue();
  });
}

function pumpQueue() {
  if (previewPlaybackActive) return;
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    if (next) {
      active++;
      next.run();
    }
  }
}

// notify() の rAF コアレス用。1 フレーム 1 回の再描画に束ねる。
const scheduleFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16) as unknown as number;
let notifyScheduled = false;
let notifyGeneratingScheduled = false;

function notify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  scheduleFrame(() => {
    notifyScheduled = false;
    for (const fn of subscribers) fn();
  });
}

function notifyGenerating() {
  if (notifyGeneratingScheduled) return;
  notifyGeneratingScheduled = true;
  scheduleFrame(() => {
    notifyGeneratingScheduled = false;
    for (const fn of generatingSubscribers) fn();
  });
}

export function getCachedThumb(library: string, id: string): string | null | undefined {
  return cache.get(key(library, id));
}

export function isThumbGenerating(library: string, id: string): boolean {
  return generating.has(key(library, id));
}

export function ensureThumb(library: string, id: string): Promise<string | null> {
  const k = key(library, id);
  const cached = cache.get(k);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inflight.get(k);
  if (existing) return existing;

  const p = new Promise<string | null>((resolve) => {
    const run = async () => {
      try {
        const path = await getItemThumbnail(library, id);
        const url = path ? convertFileSrc(path) : null;
        cache.set(k, url);
        notify();
        resolve(url);
      } catch {
        cache.set(k, null);
        notify();
        resolve(null);
      } finally {
        inflight.delete(k);
        active--;
        if (generating.delete(k)) notifyGenerating();
        pumpQueue();
      }
    };
    generating.add(k);
    notifyGenerating();
    queue.push({ key: k, run, resolve });
    pumpQueue();
  });
  inflight.set(k, p);
  return p;
}

/**
 * まだ開始していない（queue 待ち）サムネ生成ジョブを破棄する。解決済みキャッシュと
 * in-flight（既に走っている ≤MAX_CONCURRENT 本）は保持する。
 * ContextSlotPanel の unmount 時に呼ぶ。
 */
export function cancelPendingThumbs() {
  const pending = queue.splice(0);
  for (const task of pending) {
    inflight.delete(task.key);
    if (generating.delete(task.key)) notifyGenerating();
    task.resolve(null);
  }
}

/** workspace 切替時に呼び出す（古いキャッシュを破棄） */
export function clearThumbCache() {
  cache.clear();
  inflight.clear();
  queue.length = 0;
  active = 0;
  if (generating.size > 0) {
    generating.clear();
    notifyGenerating();
  }
  notify();
}

/**
 * React hook: cache が更新されたら親コンポーネントを再 render する subscription。
 * 親で 1 つだけ subscribe して全 card を一気に更新する（card ごとの購読より安い）。
 */
export function useThumbCacheSubscription(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return tick;
}

export function useThumbGeneratingSubscription(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    generatingSubscribers.add(fn);
    return () => {
      generatingSubscribers.delete(fn);
    };
  }, []);
  return tick;
}

export function usePreviewPlaybackActive(): boolean {
  const [active, setActive] = useState(previewPlaybackActive);
  useEffect(() => {
    const fn = () => setActive(previewPlaybackActive);
    playbackSubscribers.add(fn);
    return () => {
      playbackSubscribers.delete(fn);
    };
  }, []);
  return active;
}
