/**
 * PreviewRouter — platformId に応じて適切なプレビューコンポーネントを返す。
 * Feed 系にはテーマを配線し、全画面系（Story/Reel/TikTok/Shorts）はダーク固定。
 */

import { XPreview, type PreviewTheme } from "./XPreview";
import { XLongPreview } from "./XLongPreview";
import { ThreadsPreview } from "./ThreadsPreview";
import { IGFeedPreview, IGStoryPreview, IGReelPreview } from "./InstagramPreview";
import { TikTokPreview } from "./TikTokPreview";
import { YouTubePreview, YouTubeShortsPreview } from "./YouTubePreview";
import { NotePreview } from "./NotePreview";
import { BlogPreview } from "./BlogPreview";
import { FacebookPreview } from "./FacebookPreview";

export type { PreviewTheme };

export interface PreviewProps {
  platformId: string;
  content: string;
  title?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  theme?: PreviewTheme;
  /** スレッド表示用の分割テキスト */
  threadParts?: string[];
}

export function PreviewRouter({ platformId, content, title, displayName, username, avatarUrl, mediaUrls, theme = "dark", threadParts }: PreviewProps) {
  const firstMedia = mediaUrls?.[0];

  switch (platformId) {
    case "x":
      return <XPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} threadParts={threadParts} />;
    case "x_long":
      return <XLongPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} theme={theme} />;
    case "threads":
      return <ThreadsPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} />;
    case "facebook":
      return <FacebookPreview content={content} displayName={displayName} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} />;
    case "ig_feed":
      return <IGFeedPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} />;
    case "ig_story":
      return <IGStoryPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrl={firstMedia} />;
    case "ig_reel":
      return <IGReelPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrl={firstMedia} />;
    case "tiktok":
      return <TikTokPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrl={firstMedia} />;
    case "youtube":
      return <YouTubePreview content={content} title={title} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrl={firstMedia} theme={theme} />;
    case "youtube_short":
      return <YouTubeShortsPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrl={firstMedia} />;
    case "note":
      return <NotePreview content={content} title={title} displayName={displayName} avatarUrl={avatarUrl} mediaUrl={firstMedia} theme={theme} />;
    case "blog":
      return <BlogPreview content={content} title={title} displayName={displayName} avatarUrl={avatarUrl} mediaUrl={firstMedia} theme={theme} />;
    default:
      // 未対応プラットフォームは X 風フォールバック
      return <XPreview content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} />;
  }
}
