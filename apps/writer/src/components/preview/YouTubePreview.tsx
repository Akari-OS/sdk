/**
 * YouTubePreview / YouTubeShortsPreview — YouTube の動画・Shorts 風プレビュー。
 * YouTubePreview はダーク/ライトモード対応。
 * YouTubeShortsPreview は全画面系のためダーク固定。
 *
 * DeviceFrame の中に入れて使う。
 */

import { useState } from "react";
import { Home, Search, Plus, ListVideo, Library, Play, ThumbsUp, ThumbsDown, MessageCircle, Share2, Tv, Film } from "lucide-react";
import type { PreviewTheme } from "./XPreview";

const THEMES = {
  dark: {
    bg: "#0f0f0f",
    text: "#f1f1f1",
    secondary: "#aaa",
    border: "#272727",
    cardBg: "#272727",
    subscribeBg: "#f1f1f1",
    subscribeText: "#0f0f0f",
    avatarBg: "#333",
  },
  light: {
    bg: "#ffffff",
    text: "#0f0f0f",
    secondary: "#606060",
    border: "#e5e5e5",
    cardBg: "#f2f2f2",
    subscribeBg: "#0f0f0f",
    subscribeText: "#ffffff",
    avatarBg: "#e5e5e5",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  共通ヘルパー                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  YouTubePreview（通常動画 — ダーク/ライト対応）                       */
/* ------------------------------------------------------------------ */

interface YouTubePreviewProps {
  content: string;
  title?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrl?: string;
  theme?: PreviewTheme;
}

export function YouTubePreview({
  content,
  title,
  displayName,
  username,
  avatarUrl,
  mediaUrl,
  theme = "dark",
}: YouTubePreviewProps) {
  const t = THEMES[theme];
  const [descExpanded, setDescExpanded] = useState(false);

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
          padding: "8px 12px",
        }}
      >
        {/* YouTube ロゴ */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 24,
              height: 17,
              backgroundColor: "#ff0000",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "7px solid #fff",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
              }}
            />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5 }}>YouTube</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Search size={20} color={t.text} />
          <Tv size={18} color={t.secondary} />
          <Avatar size={24} src={avatarUrl} name={displayName} theme={theme} />
        </div>
      </div>

      {/* フィード */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* サムネイル */}
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            backgroundColor: t.cardBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Play size={28} color="#fff" fill="#fff" />
            </div>
          )}
          {/* 再生バー */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              backgroundColor: "rgba(255,255,255,0.2)",
            }}
          >
            <div
              style={{
                width: "35%",
                height: "100%",
                backgroundColor: "#ff0000",
              }}
            />
          </div>
        </div>

        {/* 動画情報 */}
        <div style={{ padding: "12px 12px 8px" }}>
          {/* タイトル */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.3,
              color: t.text,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {title || "動画タイトル"}
          </div>

          {/* チャンネル情報 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
            }}
          >
            <Avatar size={36} src={avatarUrl} name={displayName} theme={theme} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: t.text,
                }}
              >
                {displayName || "AKARI User"}
              </div>
              <div style={{ fontSize: 11, color: t.secondary }}>
                {username ? `@${username}` : "チャンネル登録者数 1.2万人"}
              </div>
            </div>
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                backgroundColor: t.subscribeBg,
                color: t.subscribeText,
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              チャンネル登録
            </div>
          </div>

          {/* 説明文 */}
          <div
            onClick={() => !descExpanded && setDescExpanded(true)}
            style={{
              marginTop: 12,
              padding: "8px 12px",
              backgroundColor: t.cardBg,
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.4,
              color: t.text,
              cursor: descExpanded ? "default" : "pointer",
            }}
          >
            <div style={{ fontSize: 12, color: t.secondary, marginBottom: 4 }}>
              1.2万 回視聴 · 3時間前
            </div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(descExpanded ? {} : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }),
              }}
            >
              {content || (
                <span style={{ color: t.secondary }}>説明文を入力...</span>
              )}
            </div>
            {!descExpanded && content && content.length > 40 && (
              <div style={{ fontSize: 12, fontWeight: 500, color: t.text, marginTop: 4 }}>
                ...もっと見る
              </div>
            )}
            {descExpanded && (
              <div
                onClick={(e) => { e.stopPropagation(); setDescExpanded(false); }}
                style={{ fontSize: 12, fontWeight: 500, color: t.text, marginTop: 4, cursor: "pointer" }}
              >
                一部を表示
              </div>
            )}
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
          padding: "8px 0 10px",
          borderTop: `0.5px solid ${t.border}`,
          fontSize: 10,
          color: t.secondary,
          backgroundColor: t.bg,
        }}
      >
        <BottomTab icon={<Home size={20} />} label="ホーム" active theme={theme} />
        <BottomTab icon={<Film size={20} />} label="Shorts" theme={theme} />
        <BottomTab icon={<Plus size={24} />} label="" isPlus theme={theme} />
        <BottomTab icon={<ListVideo size={20} />} label="サブスク" theme={theme} />
        <BottomTab icon={<Library size={20} />} label="ライブラリ" theme={theme} />
      </div>
    </div>
  );
}

function BottomTab({
  icon,
  label,
  active,
  isPlus: _isPlus,
  theme = "dark",
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  isPlus?: boolean;
  theme?: PreviewTheme;
}) {
  const t = THEMES[theme];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        color: active ? t.text : t.secondary,
      }}
    >
      {icon}
      {label && <span style={{ fontSize: 10 }}>{label}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  YouTubeShortsPreview（9:16 フルスクリーン — ダーク固定）              */
/* ------------------------------------------------------------------ */

interface YouTubeShortsPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrl?: string;
}

export function YouTubeShortsPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrl,
}: YouTubeShortsPreviewProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* 背景 */}
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #1a1a2e 0%, #0f0f0f 50%, #16213e 100%)",
          }}
        />
      )}

      {/* オーバーレイ（下部グラデーション） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* トップバー */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: "12px 16px",
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700 }}>Shorts</span>
      </div>

      {/* 右サイドバー */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          zIndex: 2,
        }}
      >
        <SideAction icon={<ThumbsUp size={24} color="#fff" />} label="1.2万" />
        <SideAction icon={<ThumbsDown size={24} color="#fff" />} label="低評価" />
        <SideAction icon={<MessageCircle size={24} color="#fff" />} label="234" />
        <SideAction icon={<Share2 size={24} color="#fff" />} label="共有" />
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1 }}>···</span>
      </div>

      {/* 下部情報 */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 12,
          right: 60,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Avatar size={32} src={avatarUrl} name={displayName} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            @{username || "akari"}
          </span>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              border: "1px solid #fff",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            チャンネル登録
          </div>
        </div>
        <div
          onClick={() => !descExpanded && setDescExpanded(true)}
          style={{
            fontSize: 13,
            lineHeight: 1.3,
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            cursor: descExpanded ? "default" : "pointer",
            ...(descExpanded ? {
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            } : {
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }),
          }}
        >
          {content || "ショート動画の説明文..."}
        </div>
        {!descExpanded && content && content.length > 30 && (
          <div
            onClick={() => setDescExpanded(true)}
            style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer", marginTop: 2 }}
          >
            ...もっと見る
          </div>
        )}
      </div>

      {/* ボトムタブ */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          padding: "8px 0 10px",
          backgroundColor: "#0f0f0f",
          fontSize: 10,
          color: "#aaa",
          zIndex: 2,
        }}
      >
        <BottomTab icon={<Home size={20} />} label="ホーム" />
        <BottomTab icon={<Film size={20} />} label="Shorts" active />
        <BottomTab icon={<Plus size={24} />} label="" isPlus />
        <BottomTab icon={<ListVideo size={20} />} label="サブスク" />
        <BottomTab icon={<Library size={20} />} label="ライブラリ" />
      </div>
    </div>
  );
}

function SideAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      {icon}
      <span style={{ fontSize: 10 }}>{label}</span>
    </div>
  );
}
