/**
 * NotePreview — note.com の記事風プレビュー。
 * ダーク/ライトモード対応。
 *
 * DeviceFrame の中に入れて使う。
 */

import { Search, Bell } from "lucide-react";
import type { PreviewTheme } from "./XPreview";
import { markdownToHtml } from "@akari-os/markdown-core";

const THEMES = {
  dark: {
    bg: "#1a1a1a",
    text: "#e0e0e0",
    secondary: "#888",
    border: "#2a2a2a",
    bodyText: "#d0d0d0",
    avatarBg: "#333",
    accent: "#41c9b4",
    buttonBg: "#2a2a2a",
    placeholder: "#666",
  },
  light: {
    bg: "#ffffff",
    text: "#191919",
    secondary: "#999",
    border: "#e8e8e8",
    bodyText: "#333",
    avatarBg: "#e5e5e5",
    accent: "#2eb8a6",
    buttonBg: "#f5f5f5",
    placeholder: "#aaa",
  },
} as const;

interface NotePreviewProps {
  content: string;
  title?: string;
  displayName?: string;
  avatarUrl?: string;
  mediaUrl?: string;
  theme?: PreviewTheme;
}

export function NotePreview({
  content,
  title,
  displayName,
  avatarUrl,
  mediaUrl,
  theme = "dark",
}: NotePreviewProps) {
  const t = THEMES[theme];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.bg,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
        color: t.text,
      }}
    >
      {/* トップバー */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        {/* note ロゴ */}
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: t.accent,
            letterSpacing: -0.5,
          }}
        >
          note
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Search size={18} color={t.secondary} />
          <Bell size={18} color={t.secondary} />
          <Avatar size={24} src={avatarUrl} name={displayName} theme={theme} />
        </div>
      </div>

      {/* 記事コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* サムネイル */}
        {mediaUrl && (
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              overflow: "hidden",
            }}
          >
            <img
              src={mediaUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        <div style={{ padding: "20px 16px" }}>
          {/* 記事タイトル */}
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1.4,
              color: t.text,
              margin: 0,
              wordBreak: "break-word",
            }}
          >
            {title || "タイトルを入力..."}
          </h1>

          {/* 著者情報 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 16,
              marginBottom: 20,
            }}
          >
            <Avatar size={36} src={avatarUrl} name={displayName} theme={theme} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
                {displayName || "AKARI User"}
              </div>
              <div style={{ fontSize: 12, color: t.secondary }}>
                3時間前
              </div>
            </div>
          </div>

          {/* 記事本文 */}
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.8,
              color: t.bodyText,
              wordBreak: "break-word",
            }}
          >
            {content ? (
              <div className="markdown-rendered" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
            ) : (
              <span style={{ color: t.placeholder }}>本文を入力...</span>
            )}
          </div>
        </div>
      </div>

      {/* スキ！ボタン */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 16px",
          borderTop: `1px solid ${t.border}`,
          backgroundColor: t.bg,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 24px",
            borderRadius: 24,
            backgroundColor: t.buttonBg,
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 18 }}>♡</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: t.text,
            }}
          >
            スキ!
          </span>
          <span style={{ fontSize: 13, color: t.secondary }}>48</span>
        </div>
      </div>
    </div>
  );
}

function Avatar({ size = 36, src, name, theme = "dark" }: { size?: number; src?: string; name?: string; theme?: PreviewTheme }) {
  const t = THEMES[theme];
  const initial = name ? name[0] : "A";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: t.avatarBg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        color: t.secondary,
        overflow: "hidden",
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initial
      )}
    </div>
  );
}
