/**
 * TikTokPreview — TikTok のフルスクリーン風プレビュー。
 *
 * DeviceFrame の中に入れて使う。
 */

import { useState } from "react";
import { Heart, MessageCircle, Bookmark, Share2, Music, Home, Plus, User, Mail } from "lucide-react";

interface TikTokPreviewProps {
  content: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  /** 背景に表示するメディア URL（画像 or 動画サムネ） */
  mediaUrl?: string;
}

export function TikTokPreview({
  content,
  displayName,
  username,
  avatarUrl,
  mediaUrl,
}: TikTokPreviewProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const truncatedContent = captionExpanded
    ? content
    : content && content.length > 80 ? content.slice(0, 80) + "..." : content;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#000",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 背景画像 */}
      {mediaUrl && (
        <img
          src={mediaUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.6,
          }}
        />
      )}

      {/* 暗くするオーバーレイ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(transparent 40%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* トップナビ */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "12px 16px",
        }}
      >
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          フォロー中
        </span>
        <span style={{ fontSize: 14, color: "#fff", position: "relative" }}>
          おすすめ
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 24,
              height: 2,
              borderRadius: 1,
              backgroundColor: "#fff",
            }}
          />
        </span>
      </div>

      {/* メインコンテンツ領域 */}
      <div style={{ flex: 1, position: "relative", zIndex: 1 }} />

      {/* 右サイドバー */}
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: 100,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* アバター + フォローボタン */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            marginBottom: 4,
          }}
        >
          <Avatar size={40} src={avatarUrl} name={displayName} />
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: "#fe2c55",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              position: "absolute",
              bottom: -6,
            }}
          >
            +
          </div>
        </div>

        <SidebarAction icon={<Heart size={26} color="#fff" />} label="4.8万" />
        <SidebarAction icon={<MessageCircle size={26} color="#fff" />} label="326" />
        <SidebarAction icon={<Bookmark size={26} color="#fff" />} label="1.2万" />
        <SidebarAction icon={<Share2 size={26} color="#fff" />} label="892" />

        {/* 回転レコード */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "#333",
            border: "2px solid #555",
            marginTop: 4,
          }}
        />
      </div>

      {/* 左下の情報 */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0 56px 8px 12px",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          @{username || "akari"}
        </div>
        <div
          onClick={() => !captionExpanded && setCaptionExpanded(true)}
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            color: "rgba(255,255,255,0.9)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: captionExpanded ? "default" : "pointer",
            ...(captionExpanded ? {} : {
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }),
          }}
        >
          {truncatedContent || (
            <span style={{ opacity: 0.5 }}>テキストを入力...</span>
          )}
        </div>
        {!captionExpanded && content && content.length > 40 && (
          <div
            onClick={() => setCaptionExpanded(true)}
            style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer", marginTop: 2 }}
          >
            ...もっと見る
          </div>
        )}
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "rgba(255,255,255,0.6)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Music size={12} color="rgba(255,255,255,0.6)" />
          <span
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxWidth: 180,
            }}
          >
            {displayName || "AKARI User"} · オリジナル楽曲
          </span>
        </div>
      </div>

      {/* ボトムタブ */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          padding: "8px 0",
          borderTop: "0.5px solid rgba(255,255,255,0.1)",
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      >
        <TabItem icon={<Home size={20} />} label="ホーム" active />
        <TabItem icon={<User size={20} />} label="友達" />
        {/* 中央の + ボタン */}
        <div
          style={{
            width: 38,
            height: 26,
            borderRadius: 6,
            background: "linear-gradient(90deg, #25f4ee, #fe2c55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 34,
              height: 22,
              borderRadius: 4,
              backgroundColor: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            <Plus size={16} color="#000" strokeWidth={3} />
          </div>
        </div>
        <TabItem icon={<Mail size={20} />} label="受信箱" />
        <TabItem icon={<User size={20} />} label="プロフ" />
      </div>
    </div>
  );
}

function SidebarAction({ icon, label }: { icon: React.ReactNode; label: string }) {
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
      <span style={{ fontSize: 10, color: "#fff" }}>{label}</span>
    </div>
  );
}

function Avatar({
  size = 40,
  src,
  name,
}: {
  size?: number;
  src?: string;
  name?: string;
}) {
  const initial = name ? name[0] : "A";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#333",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        color: "#888",
        overflow: "hidden",
        border: "2px solid #fff",
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

function TabItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        color: active ? "#fff" : "rgba(255,255,255,0.5)",
      }}
    >
      {icon}
      <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
    </div>
  );
}
