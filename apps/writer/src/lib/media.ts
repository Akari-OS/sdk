export interface MediaAttachment {
  id: string;
  name: string;
  /** data URL for thumbnail */
  dataUrl: string;
  /** 特定プラットフォーム用の画像（null なら全プラットフォーム共通） */
  platformId?: string;
}
