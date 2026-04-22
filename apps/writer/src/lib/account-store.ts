/**
 * SNS アカウント設定の永続化。
 * 各プラットフォームごとにユーザーが自分のアカウント情報を登録できる。
 * プレビュー表示に使用。
 */

export interface SnsAccount {
  /** 表示名（例: 中島竜馬） */
  displayName: string;
  /** ユーザーID（例: @nakajima_ryoma） — @ なしで保存 */
  username: string;
  /** プロフィール画像 URL or data URL */
  avatarUrl: string;
}

const ACCOUNTS_KEY = "akari.settings.snsAccounts";

/** 全プラットフォームのアカウント設定を取得 */
export function loadSnsAccounts(): Record<string, SnsAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SnsAccount>) : {};
  } catch {
    return {};
  }
}

/** 特定プラットフォームのアカウント設定を取得 */
export function getSnsAccount(platformId: string): SnsAccount | null {
  const accounts = loadSnsAccounts();
  return accounts[platformId] ?? null;
}

/** 特定プラットフォームのアカウント設定を保存 */
export function setSnsAccount(platformId: string, account: SnsAccount): void {
  const accounts = loadSnsAccounts();
  accounts[platformId] = account;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** 特定プラットフォームのアカウント設定を削除 */
export function removeSnsAccount(platformId: string): void {
  const accounts = loadSnsAccounts();
  delete accounts[platformId];
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
