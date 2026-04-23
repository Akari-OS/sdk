/**
 * XLongPreview — X (Twitter) の記事 / 長文投稿風プレビュー。
 * ダーク/ライトモード対応。
 *
 * DeviceFrame の中に入れて使う。
 */

import { Home, Search, Users, Bell, Mail, MessageCircle, Repeat2, Heart, BarChart3 } from "lucide-react";
import type { PreviewTheme } from "./XPreview";
import { markdownToHtml } from "@akari-os/markdown-core";

const THEMES = {
  dark: {
    bg: "#000",
    text: "#e7e9ea",
    secondary: "#71767b",
    border: "#2f3336",
    avatarBg: "#333",
    accent: "#1d9bf0",
  },
  light: {
    bg: "#ffffff",
    text: "#0f1419",
    secondary: "#536471",
    border: "#eff3f4",
    avatarBg: "#cfd9de",
    accent: "#1d9bf0",
  },
} as const;

interface XLongPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  theme?: PreviewTheme;
}

export function XLongPreview({
  content,
  displayName,
  username,
  avatarUrl,
  theme = "dark",
}: XLongPreviewProps) {
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
      {/* ナビバー */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: `0.5px solid ${t.border}`,
        }}
      >
        <Avatar size={28} src={avatarUrl} name={displayName} theme={theme} />
        <span style={{ fontSize: 18, fontWeight: 700 }}>𝕏</span>
        <div style={{ width: 28 }} />
      </div>

      {/* タブ */}
      <div
        style={{
          display: "flex",
          borderBottom: `0.5px solid ${t.border}`,
          flexShrink: 0,
        }}
      >
        <Tab label="おすすめ" active theme={theme} />
        <Tab label="フォロー中" theme={theme} />
      </div>

      {/* 記事コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto", backgroundColor: t.bg }}>
        <div style={{ padding: "16px" }}>
          {/* 著者ヘッダー */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Avatar size={40} src={avatarUrl} name={displayName} theme={theme} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
                {displayName || "AKARI User"}
              </div>
              <div style={{ fontSize: 13, color: t.secondary }}>
                @{username || "akari"}
              </div>
            </div>
          </div>

          {/* 記事バッジ */}
          <div
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 4,
              backgroundColor: t.accent,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            記事
          </div>

          {/* 記事本文 */}
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: t.text,
              wordBreak: "break-word",
            }}
          >
            {content ? (
              <div className="markdown-rendered" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
            ) : (
              <span style={{ color: t.secondary }}>記事を入力...</span>
            )}
          </div>

          {/* 投稿日時 */}
          <div
            style={{
              fontSize: 13,
              color: t.secondary,
              marginTop: 16,
              paddingTop: 12,
              borderTop: `0.5px solid ${t.border}`,
            }}
          >
            午後3:24 · 2026年4月11日
          </div>

          {/* エンゲージメントバー */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 12,
              paddingTop: 12,
              borderTop: `0.5px solid ${t.border}`,
              paddingRight: 24,
              fontSize: 13,
              color: t.secondary,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle size={15} /> 24</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Repeat2 size={15} /> 12</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart size={15} /> 156</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><BarChart3 size={15} /> 3.4万</span>
          </div>
        </div>
      </div>

      {/* ボトムタブ */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          padding: "10px 0",
          borderTop: `0.5px solid ${t.border}`,
          backgroundColor: t.bg,
        }}
      >
        <Home size={22} color={t.text} strokeWidth={2.5} />
        <Search size={22} color={t.secondary} />
        <Users size={22} color={t.secondary} />
        <Bell size={22} color={t.secondary} />
        <Mail size={22} color={t.secondary} />
      </div>
    </div>
  );
}

function Avatar({ size = 40, src, name, theme = "dark" }: { size?: number; src?: string; name?: string; theme?: PreviewTheme }) {
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

function Tab({ label, active, theme = "dark" }: { label: string; active?: boolean; theme?: PreviewTheme }) {
  const t = THEMES[theme];
  return (
    <div
      style={{
        flex: 1,
        textAlign: "center",
        padding: "12px 0",
        fontSize: 15,
        fontWeight: active ? 700 : 400,
        color: active ? t.text : t.secondary,
        position: "relative",
      }}
    >
      {label}
      {active && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 56,
            height: 4,
            borderRadius: 2,
            backgroundColor: t.accent,
          }}
        />
      )}
    </div>
  );
}
