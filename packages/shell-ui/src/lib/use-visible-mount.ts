/**
 * useVisibleMount — IntersectionObserver で「viewport に近づいたとき 1 回だけ」
 * onMount を発火させる lazy-mount フック。
 *
 * 素材グリッド（MaterialPanel / ContextSlotPanel）が画面外のカードまで全件即時に
 * backend ロード（getItem / getItemFilePath / getItemThumbnail = ffmpeg）を走らせて
 * いた問題を解消する。rootMargin=320px で「もうすぐ見える」段階で先読みする。
 *
 * 単一の共有 IntersectionObserver + WeakMap でコールバックを引く。shell-ui は app から
 * external 参照され shell に単一 bundle されるため、observer も 1 インスタンス共有になる。
 */
import { useCallback, useEffect, useRef } from "react";

type VisibleCallback = () => void;
const visibleCallbacks = new WeakMap<Element, VisibleCallback>();
let visibleObserver: IntersectionObserver | null = null;

function getVisibleObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!visibleObserver) {
    visibleObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = visibleCallbacks.get(entry.target);
          if (!cb) continue;
          visibleObserver?.unobserve(entry.target);
          visibleCallbacks.delete(entry.target);
          cb();
        }
      },
      { root: null, rootMargin: "320px", threshold: 0.01 },
    );
  }
  return visibleObserver;
}

/**
 * 返り値は callback ref。対象要素に `ref={mountRef}` で渡す。
 * onMount は要素が viewport（+320px マージン）に入った最初の 1 回だけ呼ばれる。
 * IntersectionObserver が無い環境（test / SSR）では即時 1 回発火する。
 */
export function useVisibleMount(onMount?: () => void) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const ranRef = useRef(false);
  const run = useCallback(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    onMount?.();
  }, [onMount]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      const prev = nodeRef.current;
      if (prev && prev !== node) {
        visibleObserver?.unobserve(prev);
        visibleCallbacks.delete(prev);
      }
      nodeRef.current = node;
      if (!node || !onMount || ranRef.current) return;
      const observer = getVisibleObserver();
      if (!observer) {
        run();
        return;
      }
      visibleCallbacks.set(node, run);
      observer.observe(node);
    },
    [onMount, run],
  );

  useEffect(
    () => () => {
      const node = nodeRef.current;
      if (!node) return;
      visibleObserver?.unobserve(node);
      visibleCallbacks.delete(node);
    },
    [],
  );

  return ref;
}
