/**
 * ThreadsPreview — Threads のフィード風プレビュー。
 * ダーク/ライトモード対応。
 *
 * DeviceFrame の中に入れて使う。
 */

import { Home, Search, PlusSquare, Heart, User, MessageCircle, Repeat2, Send, Bell } from "lucide-react";
import type { PreviewTheme } from "./XPreview";

const THEMES = {
  dark: {
    bg: "#101010",
    text: "#f5f5f5",
    secondary: "#777",
    border: "#2a2a2a",
    avatarBg: "#333",
    threadLine: "#333",
  },
  light: {
    bg: "#ffffff",
    text: "#000000",
    secondary: "#999",
    border: "#e0e0e0",
    avatarBg: "#ccc",
    threadLine: "#ccc",
  },
} as const;

interface ThreadsPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  theme?: PreviewTheme;
}

export function ThreadsPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrls,
  theme = "dark",
}: ThreadsPreviewProps) {
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
      {/* トップナビ */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `0.5px solid ${t.border}`,
        }}
      >
        <span style={{ fontSize: 18, color: t.secondary }}>←</span>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>
          Threads
        </span>
        <Bell size={18} color={t.secondary} />
      </div>

      {/* フィード */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* メイン投稿 */}
        <ThreadsPost
          content={content}
          displayName={displayName}
          username={username}
          avatarUrl={avatarUrl}
          mediaUrls={mediaUrls}
          isMain
          theme={theme}
        />

        {/* 他の投稿 (ぼかし) */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div
            style={{
              filter: "blur(3px)",
              opacity: 0.35,
              pointerEvents: "none",
            }}
          >
            <ThreadsPost
              content="AKARI で作った投稿がここに並びます。Threads のスレッド表示にも対応予定..."
              displayName="Another User"
              theme={theme}
            />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "60%",
              background: `linear-gradient(transparent, ${t.bg})`,
            }}
          />
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
          fontSize: 20,
          backgroundColor: t.bg,
        }}
      >
        <Home size={22} color={t.text} strokeWidth={2.5} />
        <Search size={22} color={t.secondary} />
        <PlusSquare size={22} color={t.secondary} />
        <Heart size={22} color={t.secondary} />
        <User size={22} color={t.secondary} />
      </div>
    </div>
  );
}

function ThreadsPost({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrls,
  isMain,
  theme = "dark",
}: {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  isMain?: boolean;
  theme?: PreviewTheme;
}) {
  const t = THEMES[theme];
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderBottom: `0.5px solid ${t.border}`,
      }}
    >
      {/* アバター + スレッドライン */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Avatar size={36} src={avatarUrl} name={displayName} theme={theme} />
        {isMain && (
          <div
            style={{
              width: 2,
              flex: 1,
              backgroundColor: t.threadLine,
              marginTop: 4,
              borderRadius: 1,
              minHeight: 20,
            }}
          />
        )}
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ユーザー情報 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: t.text }}>
              {username || "akari"}
            </span>
            <span style={{ fontSize: 13, color: t.secondary }}>1分</span>
          </div>
          <span style={{ fontSize: 14, color: t.secondary, letterSpacing: 2 }}>
            ···
          </span>
        </div>

        {/* テキスト */}
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.45,
            color: t.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginTop: 4,
          }}
        >
          {content || (
            <span style={{ color: t.secondary }}>テキストを入力...</span>
          )}
        </div>

        {/* 添付画像 */}
        {mediaUrls && mediaUrls.length > 0 && (
          <div
            style={{
              marginTop: 8,
              borderRadius: 12,
              overflow: "hidden",
              border: `0.5px solid ${t.border}`,
              display: "grid",
              gridTemplateColumns:
                mediaUrls.length === 1 ? "1fr" : "1fr 1fr",
              gap: 2,
            }}
          >
            {mediaUrls.slice(0, 4).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                style={{
                  width: "100%",
                  height: mediaUrls.length === 1 ? 200 : 100,
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ))}
          </div>
        )}

        {/* アクション行 */}
        {isMain && (
          <>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 12,
                fontSize: 18,
                color: t.secondary,
              }}
            >
              <Heart size={18} />
              <MessageCircle size={18} />
              <Repeat2 size={18} />
              <Send size={18} />
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: t.secondary,
              }}
            >
              3件の返信
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Avatar({
  size = 36,
  src,
  name,
  theme = "dark",
}: {
  size?: number;
  src?: string;
  name?: string;
  theme?: PreviewTheme;
}) {
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
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
