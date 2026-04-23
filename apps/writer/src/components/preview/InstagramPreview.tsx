/**
 * InstagramPreview — Instagram の3形式プレビュー。
 * IGFeedPreview はダーク/ライトモード対応。
 * IGStoryPreview / IGReelPreview は全画面系のためダーク固定。
 *
 * DeviceFrame の中に入れて使う。
 */

import { useState } from "react";
import { Home, Search, PlusSquare, Film, User, Heart, MessageCircle, Send, Bookmark, Camera, Music, X as XIcon } from "lucide-react";
import type { PreviewTheme } from "./XPreview";

const IG_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif';

const THEMES = {
  dark: {
    bg: "#000",
    text: "#f5f5f5",
    border: "#262626",
    muted: "#a8a8a8",
    avatarBg: "#333",
    placeholderBg: "#1a1a1a",
    blue: "#0095f6",
  },
  light: {
    bg: "#ffffff",
    text: "#262626",
    border: "#dbdbdb",
    muted: "#8e8e8e",
    avatarBg: "#efefef",
    placeholderBg: "#fafafa",
    blue: "#0095f6",
  },
} as const;

// ダーク固定の定数（Story / Reel 用）
const IG_TEXT = "#f5f5f5";
const IG_BORDER = "#262626";
const IG_BLUE = "#0095f6";
const IG_MUTED = "#a8a8a8";

// ── 共有 Avatar ──────────────────────────────────────────

function Avatar({
  size = 32,
  src,
  name,
  ring,
  theme = "dark",
}: {
  size?: number;
  src?: string;
  name?: string;
  ring?: boolean;
  theme?: PreviewTheme;
}) {
  const t = THEMES[theme];
  const initial = name ? name[0] : "A";
  const outer = ring ? size + 6 : size;
  return (
    <div
      style={{
        width: outer,
        height: outer,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ring
          ? "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
          : "transparent",
        padding: ring ? 2 : 0,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: t.avatarBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          color: t.muted,
          overflow: "hidden",
          border: ring ? `2px solid ${t.bg}` : "none",
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
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. IGFeedPreview（ダーク/ライト対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface IGFeedPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  theme?: PreviewTheme;
}

export function IGFeedPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrls,
  theme = "dark",
}: IGFeedPreviewProps) {
  const t = THEMES[theme];
  const handle = username || "akari";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.bg,
        fontFamily: IG_FONT,
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
          padding: "10px 16px",
          borderBottom: `0.5px solid ${t.border}`,
        }}
      >
        <Camera size={22} color={t.text} />
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontStyle: "italic",
            letterSpacing: -0.5,
          }}
        >
          Instagram
        </span>
        <Send size={22} color={t.text} />
      </div>

      {/* フィード */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 投稿ヘッダー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 12px",
            gap: 10,
          }}
        >
          <Avatar size={32} src={avatarUrl} name={displayName} ring theme={theme} />
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            {handle}
          </span>
          <span style={{ fontSize: 16, color: t.muted, letterSpacing: 2 }}>
            ···
          </span>
        </div>

        {/* 画像エリア */}
        {mediaUrls && mediaUrls.length > 0 ? (
          <img
            src={mediaUrls[0]}
            alt=""
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              backgroundColor: t.placeholderBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.muted,
            }}
          >
            <Camera size={48} />
          </div>
        )}

        {/* アクションバー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 12px",
          }}
        >
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            <Heart size={24} color={t.text} />
            <MessageCircle size={24} color={t.text} />
            <Send size={24} color={t.text} />
          </div>
          <Bookmark size={24} color={t.text} />
        </div>

        {/* いいね */}
        <div
          style={{
            padding: "0 12px 4px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          いいね 48件
        </div>

        {/* キャプション */}
        <div
          style={{
            padding: "0 12px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, marginRight: 6 }}>{handle}</span>
          <span
            style={{
              color: t.text,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content || (
              <span style={{ color: t.muted }}>テキストを入力...</span>
            )}
          </span>
        </div>
      </div>

      {/* ボトムタブ */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-around",
          padding: "10px 0",
          borderTop: `0.5px solid ${t.border}`,
          fontSize: 20,
          backgroundColor: t.bg,
        }}
      >
        <Home size={22} color={t.text} strokeWidth={2.5} />
        <Search size={22} color={t.muted} />
        <PlusSquare size={22} color={t.muted} />
        <Film size={22} color={t.muted} />
        <User size={22} color={t.muted} />
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. IGStoryPreview（全画面系 — ダーク固定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface IGStoryPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrl?: string;
}

export function IGStoryPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrl,
}: IGStoryPreviewProps) {
  const handle = username || "akari";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: IG_FONT,
        color: IG_TEXT,
        position: "relative",
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
            background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          }}
        />
      )}

      {/* 半透明オーバーレイ（背景画像の上にかぶせる） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: mediaUrl
            ? "linear-gradient(rgba(0,0,0,0.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.4) 100%)"
            : "transparent",
        }}
      />

      {/* コンテンツ（z-index で前面に） */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* プログレスバー */}
        <div style={{ padding: "8px 8px 0" }}>
          <div
            style={{
              height: 2,
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "35%",
                height: "100%",
                backgroundColor: "#fff",
                borderRadius: 1,
              }}
            />
          </div>
        </div>

        {/* ヘッダー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 12px",
            gap: 8,
          }}
        >
          <Avatar size={32} src={avatarUrl} name={displayName} ring />
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            {handle}
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            1分前
          </span>
          <span
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.7)",
              marginLeft: 8,
              letterSpacing: 2,
            }}
          >
            ···
          </span>
          <XIcon size={18} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />
        </div>

        {/* テキストオーバーレイ（中央） */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
          }}
        >
          {content ? (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                textAlign: "center",
                lineHeight: 1.4,
                textShadow: "0 1px 8px rgba(0,0,0,0.6)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {content}
            </div>
          ) : (
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.4)",
                textAlign: "center",
              }}
            >
              テキストを入力...
            </div>
          )}
        </div>

        {/* 返信バー */}
        <div
          style={{
            padding: "12px 12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.3)",
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            メッセージを送信
          </div>
          <Send size={22} color="#fff" />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. IGReelPreview（全画面系 — ダーク固定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface IGReelPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrl?: string;
}

export function IGReelPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrl,
}: IGReelPreviewProps) {
  const handle = username || "akari";
  const [captionExpanded, setCaptionExpanded] = useState(false);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: IG_FONT,
        color: IG_TEXT,
        position: "relative",
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
            background: "linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 50%, #0d0d0d 100%)",
          }}
        />
      )}

      {/* グラデーションオーバーレイ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* コンテンツ */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700 }}>リール</span>
          <Camera size={22} color="#fff" />
        </div>

        {/* メインエリア（スペーサー） */}
        <div style={{ flex: 1 }} />

        {/* 下部コンテンツ */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            padding: "0 0 8px",
          }}
        >
          {/* 左: ユーザー情報 + キャプション */}
          <div
            style={{
              flex: 1,
              padding: "0 12px",
              minWidth: 0,
            }}
          >
            {/* ユーザー行 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Avatar size={28} src={avatarUrl} name={displayName} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{handle}</span>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  backgroundColor: IG_BLUE,
                  borderRadius: 6,
                }}
              >
                フォロー
              </div>
            </div>

            {/* キャプション */}
            <div
              onClick={() => !captionExpanded && setCaptionExpanded(true)}
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                marginBottom: 8,
                cursor: captionExpanded ? "default" : "pointer",
                ...(captionExpanded ? {} : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }),
              }}
            >
              {content || (
                <span style={{ color: "rgba(255,255,255,0.5)" }}>
                  テキストを入力...
                </span>
              )}
            </div>
            {!captionExpanded && content && content.length > 40 && (
              <div
                onClick={() => setCaptionExpanded(true)}
                style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer", marginTop: -4, marginBottom: 8 }}
              >
                ...もっと見る
              </div>
            )}

            {/* 音楽情報 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <Music size={12} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName || "AKARI User"} · オリジナル音源
              </span>
            </div>
          </div>

          {/* 右: アクションバー（縦） */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              padding: "0 12px 4px",
            }}
          >
            {[
              { icon: <Heart size={26} />, label: "1.2万" },
              { icon: <MessageCircle size={26} />, label: "348" },
              { icon: <Send size={26} />, label: "" },
              { icon: <Bookmark size={26} />, label: "" },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {item.icon}
                {item.label && (
                  <span style={{ fontSize: 11, color: IG_TEXT }}>
                    {item.label}
                  </span>
                )}
              </div>
            ))}
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1 }}>···</span>
            {/* ミニアルバムアート */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: `2px solid ${IG_BORDER}`,
                backgroundColor: "#333",
                overflow: "hidden",
              }}
            >
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
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
            padding: "10px 0",
            borderTop: `0.5px solid ${IG_BORDER}`,
            fontSize: 12,
          }}
        >
          {[
            { icon: <Home size={22} />, label: "ホーム", active: false },
            { icon: <Search size={22} />, label: "発見", active: false },
            { icon: <PlusSquare size={22} />, label: "", active: false },
            { icon: <Film size={22} />, label: "リール", active: true },
            { icon: <User size={22} />, label: "プロフィール", active: false },
          ].map((tab, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                opacity: tab.active ? 1 : 0.5,
              }}
            >
              {tab.icon}
              {tab.label && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: tab.active ? 600 : 400,
                    color: tab.active ? IG_TEXT : IG_MUTED,
                  }}
                >
                  {tab.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
