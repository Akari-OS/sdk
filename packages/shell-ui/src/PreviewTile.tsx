/**
 * PreviewTile — Akari OS 共通の「プレビュータイル + ホバーで全体ポップアップ」標準部品。
 *
 * 正典標準: `akari-os/docs/design/ui-preview-and-hover-standard-2026-06-04.md`。
 * もとは akari-diagram の参照実装（Tile + .diag-hover-pop）。全 GUI アプリ（素材一覧 /
 * テンプレ一覧 / 形状パレット等）で**同じ挙動**にするため shell-ui に共通化（session134）。
 *
 * 自己完結方針:
 * - スタイルは inline + 自前注入 CSS（`akari-pt-*` クラス）で完結し、ホスト app の Tailwind 有無に
 *   依存しない（diagram は自前 Tailwind を持たないため）。色は shell semantic token（CSS 変数）を直参照。
 * - ホバーポップアップは `document.body` への portal + `position:fixed`（祖先の overflow/transform に
 *   潰されない）。一定時間ホバーで「ふわっと」表示し、カーソルに追従。
 *
 * 使い方（ホスト側はグリッド枠だけ用意）:
 *   <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))", gap:6}}>
 *     {items.map(it => <PreviewTile key={it.id} svg={it.svg} label={it.name} desc={it.desc}
 *        fit="cover" onClick={() => pick(it)} />)}
 *   </div>
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";

export interface PreviewTileProps {
  /** プレビュー SVG 文字列（renderSvg 等の出力）。 */
  svg: string;
  label: string;
  /** ホバーポップアップに出す極小説明（任意）。 */
  desc?: string;
  /** 複合物=cover（代表をズーム）/ 単一要素=contain（全体を letterbox）。既定 cover。 */
  fit?: "cover" | "contain";
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  /** ポップアップ表示までの待ち時間（ms）。既定 1500（即時表示は鬱陶しい）。 */
  hoverDelayMs?: number;
  /** タイル内サムネ高さ(px)。既定 44。 */
  thumbHeight?: number;
}

const POPUP_W = 180;
const POPUP_THUMB_H = 110;
const POPUP_H = 150; // svg + label + desc + padding の概算
const STYLE_ID = "akari-preview-tile-styles";

/** svg に preserveAspectRatio を注入（タイルの fit 制御）。 */
function withPAR(svg: string, par: string): string {
  return svg.replace(/^<svg /, `<svg preserveAspectRatio="${par}" `);
}

/** 自前 CSS（サムネ内 svg サイズ・hover 枠・ふわっと animation）を 1 度だけ注入。 */
function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes akari-pt-in { from { opacity:0; transform: translateY(4px) scale(.98);} to { opacity:1; transform:none;} }
.akari-pt-tile { display:flex; flex-direction:column; align-items:center; gap:4px; padding:5px; width:100%; min-width:0;
  border:1px solid var(--border-default,#3a3a3a); border-radius:6px; background:transparent; cursor:pointer; transition:border-color 120ms ease; }
.akari-pt-tile:hover { border-color: var(--accent,#7c9cff); }
.akari-pt-thumb { width:100%; border-radius:4px; background:var(--background,#0b0b0c); overflow:hidden; display:flex; align-items:center; justify-content:center; }
.akari-pt-thumb svg { width:100%; height:100%; display:block; }
.akari-pt-label { width:100%; font-size:11px; line-height:1.2; text-align:center; color:var(--text-primary,#eee);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.akari-pt-pop { position:fixed; z-index:9999; pointer-events:none; border-radius:8px; padding:6px;
  background:var(--surface-elevated, var(--surface-2,#1a1a1c)); border:1px solid var(--border-default,#3a3a3a);
  box-shadow:0 8px 24px rgba(0,0,0,.4); animation: akari-pt-in 120ms ease-out; }
.akari-pt-pop-thumb { width:100%; border-radius:4px; background:var(--background,#0b0b0c); overflow:hidden; display:flex; align-items:center; justify-content:center; }
.akari-pt-pop-thumb svg { width:100%; height:100%; display:block; }
.akari-pt-pop-label { margin-top:4px; font-size:11px; font-weight:600; color:var(--text-primary,#eee);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.akari-pt-pop-desc { font-size:9px; color:var(--text-muted,#999); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
  document.head.appendChild(el);
}

export function PreviewTile({
  svg,
  label,
  desc,
  fit = "cover",
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  hoverDelayMs = 1500,
  thumbHeight = 44,
}: PreviewTileProps) {
  ensureStyles();

  const par = fit === "cover" ? "xMinYMin slice" : "xMidYMid meet";
  const tileSvg = withPAR(svg, par);
  const fullSvg = withPAR(svg, "xMidYMid meet");

  // 表示前は ref 更新のみ・タイマー発火で初表示。表示後だけ追従して setState（クリック取りこぼし防止）。
  const timerRef = useRef<number | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const shownRef = useRef(false);
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const show = () => {
    shownRef.current = true;
    setPop({ x: posRef.current.x, y: posRef.current.y });
  };
  const onEnter = (e: React.MouseEvent) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    shownRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(show, hoverDelayMs);
  };
  const onMove = (e: React.MouseEvent) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    if (shownRef.current) setPop({ x: e.clientX, y: e.clientY });
  };
  const leave = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    shownRef.current = false;
    setPop(null);
  };

  // カーソルの少し下に出す。画面端は反対側へクランプ。
  let left = 0;
  let top = 0;
  if (pop) {
    left = Math.min(Math.max(8, pop.x - POPUP_W / 2), window.innerWidth - POPUP_W - 8);
    top = pop.y + 16;
    if (top + POPUP_H > window.innerHeight) top = pop.y - POPUP_H - 12;
  }

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={leave}
      draggable={draggable}
      onDragStart={(e) => {
        leave();
        onDragStart?.(e);
      }}
      onDragEnd={() => onDragEnd?.()}
      className="akari-pt-tile"
    >
      <div
        className="akari-pt-thumb"
        style={{ height: thumbHeight }}
        dangerouslySetInnerHTML={{ __html: tileSvg }}
      />
      <span className="akari-pt-label">{label}</span>

      {pop &&
        createPortal(
          <div className="akari-pt-pop" style={{ left, top, width: POPUP_W }}>
            <div
              className="akari-pt-pop-thumb"
              style={{ height: POPUP_THUMB_H }}
              dangerouslySetInnerHTML={{ __html: fullSvg }}
            />
            <div className="akari-pt-pop-label">{label}</div>
            {desc && <div className="akari-pt-pop-desc">{desc}</div>}
          </div>,
          document.body,
        )}
    </button>
  );
}
