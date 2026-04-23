/**
 * BlogPreview — 汎用ブログ記事風プレビュー。
 * ダーク/ライトモード対応。
 */

import { Search, Menu, Heart, MessageCircle, Link2 } from "lucide-react";
import type { PreviewTheme } from "./XPreview";
import { markdownToHtml } from "@akari-os/markdown-core";

const THEMES = {
  dark: {
    bg: "#1a1a2e",
    text: "#e0e0e0",
    heading: "#f0f0f0",
    secondary: "#888",
    border: "#2a2a4a",
    accent: "#8b8bcd",
    avatarBg: "#2a2a4a",
    eyecatchBg: "#2a2a4a",
  },
  light: {
    bg: "#ffffff",
    text: "#333333",
    heading: "#111111",
    secondary: "#888",
    border: "#e0e0e0",
    accent: "#5b5bab",
    avatarBg: "#e8e8f0",
    eyecatchBg: "#f0f0f5",
  },
} as const;

interface BlogPreviewProps {
  content: string;
  title?: string;
  displayName?: string;
  avatarUrl?: string;
  mediaUrl?: string;
  theme?: PreviewTheme;
}

export function BlogPreview({ content, title, displayName, avatarUrl, mediaUrl, theme = "dark" }: BlogPreviewProps) {
  const t = THEMES[theme];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Georgia", "Hiragino Mincho ProN", serif',
        color: t.text,
      }}
    >
      {/* ナビバー */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${t.border}` }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.accent }}>Blog</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Search size={16} color={t.accent} />
          <Menu size={16} color={t.accent} />
        </div>
      </div>

      {/* 記事 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* アイキャッチ */}
        {mediaUrl ? (
          <img src={mediaUrl} alt="" style={{ width: "100%", height: 180, objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: 180, backgroundColor: t.eyecatchBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 40, opacity: 0.3 }}>✍️</span>
          </div>
        )}

        <div style={{ padding: "20px 16px" }}>
          {/* カテゴリ */}
          <div style={{ fontSize: 11, color: t.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>テクノロジー</div>

          {/* タイトル */}
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, margin: "0 0 12px", color: t.heading }}>
            {title || "無題の記事"}
          </h1>

          {/* 著者 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: t.avatarBg, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: t.accent }}>
              {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (displayName?.[0] ?? "?")}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{displayName || "Author"}</div>
              <div style={{ fontSize: 11, color: t.secondary }}>2026年4月11日 · 5分で読める</div>
            </div>
          </div>

          {/* 本文 */}
          <div style={{ fontSize: 15, lineHeight: 1.8, wordBreak: "break-word" }}>
            {content ? (
              <div className="markdown-rendered" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
            ) : (
              <span style={{ color: t.secondary }}>記事の本文を入力...</span>
            )}
          </div>
        </div>
      </div>

      {/* フッター */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-around", padding: "10px 16px", borderTop: `1px solid ${t.border}`, fontSize: 13, color: t.accent, backgroundColor: t.bg }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart size={15} /> いいね</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle size={15} /> コメント</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Link2 size={15} /> シェア</span>
      </div>
    </div>
  );
}
