/**
 * XPreview — X (Twitter) のフィード風プレビュー。
 * ダーク/ライトモード対応。
 */

import { Home, Search, Users, Bell, Mail, MessageCircle, Repeat2, Heart, BarChart3 } from "lucide-react";

export type PreviewTheme = "dark" | "light";

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

interface XPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  theme?: PreviewTheme;
  /** スレッド表示用の分割テキスト */
  threadParts?: string[];
}

export function XPreview({ content, displayName, username, avatarUrl, mediaUrls, theme = "dark", threadParts }: XPreviewProps) {
  const t = THEMES[theme];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
        color: t.text,
      }}
    >
      {/* ナビバー */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `0.5px solid ${t.border}`, maxWidth: 600, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <Avatar size={28} src={avatarUrl} name={displayName} theme={theme} />
        <span style={{ fontSize: 18, fontWeight: 700 }}>𝕏</span>
        <div style={{ width: 28 }} />
      </div>

      {/* タブ */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, maxWidth: 600, width: "100%", margin: "0 auto" }}>
        <Tab label="おすすめ" active theme={theme} />
        <Tab label="フォロー中" theme={theme} />
      </div>

      {/* フィード — flex:1 + 背景色で下まで埋める */}
      <div style={{ flex: 1, overflowY: "auto", backgroundColor: t.bg }}>
        <div style={{ maxWidth: 600, margin: "0 auto", borderLeft: `0.5px solid ${t.border}`, borderRight: `0.5px solid ${t.border}`, minHeight: "100%" }}>
          {threadParts && threadParts.length > 1 ? (
            /* スレッド表示: 複数ツイートをスレッドラインで繋ぐ */
            threadParts.map((text, i) => (
              <XPost
                key={i}
                content={text}
                displayName={displayName}
                username={username}
                avatarUrl={avatarUrl}
                mediaUrls={i === 0 ? mediaUrls : undefined}
                isMain={i === threadParts.length - 1}
                theme={theme}
                showThreadLine={i < threadParts.length - 1}
                threadIndex={i + 1}
                threadTotal={threadParts.length}
              />
            ))
          ) : (
            /* 通常の単一投稿 */
            <>
              <XPost content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} isMain theme={theme} />
              {/* ぼかしダミー投稿 */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ filter: "blur(3px)", opacity: 0.35, pointerEvents: "none" }}>
                  <XPost content="AKARI で作った投稿がここに並びます..." displayName="Another User" theme={theme} />
                </div>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", background: `linear-gradient(transparent, ${t.bg})` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ボトムタブ */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 0", borderTop: `0.5px solid ${t.border}`, backgroundColor: t.bg, maxWidth: 600, width: "100%", margin: "0 auto" }}>
        <Home size={22} color={t.text} strokeWidth={2.5} />
        <Search size={22} color={t.secondary} />
        <Users size={22} color={t.secondary} />
        <Bell size={22} color={t.secondary} />
        <Mail size={22} color={t.secondary} />
      </div>
    </div>
  );
}

function XPost({ content, displayName, username, avatarUrl, mediaUrls, isMain, theme = "dark", showThreadLine, threadIndex, threadTotal }: {
  content: string; displayName?: string; username?: string; avatarUrl?: string; mediaUrls?: string[]; isMain?: boolean; theme?: PreviewTheme;
  showThreadLine?: boolean; threadIndex?: number; threadTotal?: number;
}) {
  const t = THEMES[theme];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: showThreadLine ? "none" : `0.5px solid ${t.border}` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Avatar size={40} src={avatarUrl} name={displayName} theme={theme} />
        {/* スレッドライン */}
        {showThreadLine && (
          <div style={{ width: 2, flex: 1, backgroundColor: t.border, marginTop: 4, borderRadius: 1 }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 15, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>{displayName || "AKARI User"}</span>
          <span style={{ fontSize: 13, color: t.secondary, whiteSpace: "nowrap", flexShrink: 0 }}>
            @{username || "akari"} · 1分
            {threadIndex !== undefined && threadTotal !== undefined && (
              <span style={{ marginLeft: 4 }}>{threadIndex}/{threadTotal}</span>
            )}
          </span>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.45, color: t.text, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 4 }}>
          {content || <span style={{ color: t.secondary }}>テキストを入力...</span>}
        </div>
        {mediaUrls && mediaUrls.length > 0 && (
          <div style={{ marginTop: 8, borderRadius: 16, overflow: "hidden", border: `0.5px solid ${t.border}`, display: "grid", gridTemplateColumns: mediaUrls.length === 1 ? "1fr" : "1fr 1fr", gap: 2 }}>
            {mediaUrls.slice(0, 4).map((url, i) => (
              <img key={i} src={url} alt="" style={{ width: "100%", height: mediaUrls.length === 1 ? 200 : 100, objectFit: "cover", display: "block" }} />
            ))}
          </div>
        )}
        {isMain && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingRight: 48, fontSize: 13, color: t.secondary }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle size={15} /> 12</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Repeat2 size={15} /> 3</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart size={15} /> 48</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><BarChart3 size={15} /> 1.2万</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ size = 40, src, name, theme = "dark" }: { size?: number; src?: string; name?: string; theme?: PreviewTheme }) {
  const t = THEMES[theme];
  const initial = name ? name[0] : "A";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: t.avatarBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, color: t.secondary, overflow: "hidden" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
    </div>
  );
}

function Tab({ label, active, theme = "dark" }: { label: string; active?: boolean; theme?: PreviewTheme }) {
  const t = THEMES[theme];
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 15, fontWeight: active ? 700 : 400, color: active ? t.text : t.secondary, position: "relative" }}>
      {label}
      {active && (
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 56, height: 4, borderRadius: 2, backgroundColor: t.accent }} />
      )}
    </div>
  );
}
