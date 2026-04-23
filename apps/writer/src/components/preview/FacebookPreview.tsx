/**
 * FacebookPreview — Facebook フィード風プレビュー。
 * ダーク/ライトモード対応。
 */

import { Home, Users, Play, Store, Bell, ThumbsUp, MessageCircle, Share2, Search, Globe } from "lucide-react";
import type { PreviewTheme } from "./XPreview";

const THEMES = {
  dark: {
    bg: "#18191a",
    cardBg: "#242526",
    text: "#e4e6eb",
    secondary: "#b0b3b8",
    border: "#3e4042",
    inputBg: "#3a3b3c",
    avatarBg: "#3a3b3c",
    accent: "#0866ff",
    divider: "#242526",
  },
  light: {
    bg: "#f0f2f5",
    cardBg: "#ffffff",
    text: "#050505",
    secondary: "#65676b",
    border: "#ced0d4",
    inputBg: "#f0f2f5",
    avatarBg: "#e4e6eb",
    accent: "#0866ff",
    divider: "#f0f2f5",
  },
} as const;

interface FacebookPreviewProps {
  content: string;
  displayName?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  theme?: PreviewTheme;
}

export function FacebookPreview({ content, displayName, avatarUrl, mediaUrls, theme = "dark" }: FacebookPreviewProps) {
  const t = THEMES[theme];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", sans-serif',
        color: t.text,
      }}
    >
      {/* ナビバー */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${t.border}` }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: t.accent }}>f</span>
        <div style={{ flex: 1, margin: "0 10px" }}>
          <div style={{ backgroundColor: t.inputBg, borderRadius: 20, padding: "6px 12px", fontSize: 13, color: t.secondary, display: "flex", alignItems: "center", gap: 4 }}><Search size={13} /> 検索</div>
        </div>
        <Avatar size={28} src={avatarUrl} name={displayName} theme={theme} />
      </div>

      {/* 投稿作成エリア */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `8px solid ${t.divider}` }}>
        <Avatar size={36} src={avatarUrl} name={displayName} theme={theme} />
        <div style={{ flex: 1, backgroundColor: t.inputBg, borderRadius: 20, padding: "8px 12px", fontSize: 13, color: t.secondary }}>
          その気持ち、シェアしよう
        </div>
      </div>

      {/* フィード */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* メイン投稿 */}
        <div style={{ backgroundColor: t.cardBg, marginBottom: 8 }}>
          {/* ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 0" }}>
            <Avatar size={40} src={avatarUrl} name={displayName} theme={theme} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayName || "AKARI User"}</div>
              <div style={{ fontSize: 12, color: t.secondary, display: "flex", alignItems: "center", gap: 3 }}>1分前 · <Globe size={11} /></div>
            </div>
            <span style={{ color: t.secondary, fontSize: 16 }}>···</span>
          </div>

          {/* テキスト */}
          <div style={{ padding: "8px 12px", fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {content || <span style={{ color: t.secondary }}>テキストを入力...</span>}
          </div>

          {/* 画像 */}
          {mediaUrls && mediaUrls.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: mediaUrls.length === 1 ? "1fr" : "1fr 1fr", gap: 2 }}>
              {mediaUrls.slice(0, 4).map((url, i) => (
                <img key={i} src={url} alt="" style={{ width: "100%", height: mediaUrls.length === 1 ? 250 : 150, objectFit: "cover" }} />
              ))}
            </div>
          )}

          {/* エンゲージメント */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, color: t.secondary }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><ThumbsUp size={13} /> 48</span>
            <span>コメント 5件 · シェア 2件</span>
          </div>

          {/* アクションバー */}
          <div style={{ display: "flex", borderTop: `1px solid ${t.border}`, padding: "4px 0" }}>
            {[
              { icon: <ThumbsUp size={15} />, label: "いいね!" },
              { icon: <MessageCircle size={15} />, label: "コメント" },
              { icon: <Share2 size={15} />, label: "シェア" },
            ].map((item) => (
              <button key={item.label} style={{ flex: 1, padding: "8px 0", fontSize: 13, color: t.secondary, textAlign: "center", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ぼかしダミー */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ filter: "blur(3px)", opacity: 0.3, pointerEvents: "none", backgroundColor: t.cardBg, padding: "12px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: t.inputBg }} />
              <div>
                <div style={{ width: 100, height: 12, backgroundColor: t.inputBg, borderRadius: 4 }} />
                <div style={{ width: 60, height: 10, backgroundColor: t.inputBg, borderRadius: 4, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ width: "100%", height: 60, backgroundColor: t.inputBg, borderRadius: 4, marginTop: 8 }} />
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", background: `linear-gradient(transparent, ${t.bg})` }} />
        </div>
      </div>

      {/* ボトムタブ */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${t.border}`, backgroundColor: t.bg }}>
        <Home size={22} color={t.text} strokeWidth={2.5} />
        <Users size={22} color={t.secondary} />
        <Play size={22} color={t.secondary} />
        <Store size={22} color={t.secondary} />
        <Bell size={22} color={t.secondary} />
      </div>
    </div>
  );
}

function Avatar({ size = 40, src, name, theme = "dark" }: { size?: number; src?: string; name?: string; theme?: PreviewTheme }) {
  const t = THEMES[theme];
  const initial = name ? name[0] : "?";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: t.avatarBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, color: t.secondary, overflow: "hidden" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
    </div>
  );
}
