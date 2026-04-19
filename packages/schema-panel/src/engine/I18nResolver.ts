/**
 * I18nResolver
 *
 * Panel Schema v0 §6.7 の i18n 規約に従い、{{t:key}} 記法を解決する。
 *
 * 解決優先順位:
 *   1. 指定ロケールのキー
 *   2. フォールバックロケール（通常 "en"）のキー
 *   3. キー文字列そのまま（開発時に気づけるよう）
 *
 * 使い方:
 * ```ts
 * const resolver = new I18nResolver({
 *   locales: schema.locales,
 *   locale: "ja",
 *   fallbackLocale: "en",
 * });
 * const label = resolver.resolve("{{t:post.body}}"); // "本文"
 * ```
 */

import type { LocalesMap, LocaleCode } from "../types/schema";

export interface I18nResolverOptions {
  /** PanelSchema.locales マップ */
  locales?: LocalesMap;
  /** 現在のロケール（Shell から渡される） */
  locale: LocaleCode;
  /** フォールバックロケール。デフォルト: "en" */
  fallbackLocale?: LocaleCode;
}

// {{t:key}} パターン
const T_PATTERN = /\{\{t:([^}]+)\}\}/g;

export class I18nResolver {
  private locales: LocalesMap;
  private locale: LocaleCode;
  private fallbackLocale: LocaleCode;

  constructor(options: I18nResolverOptions) {
    this.locales = options.locales ?? {};
    this.locale = options.locale;
    this.fallbackLocale = options.fallbackLocale ?? "en";
  }

  /**
   * 文字列内の {{t:key}} をすべて解決して返す。
   * 複数の {{t:...}} が含まれる場合は全て置換する。
   *
   * @param text  解決する文字列
   * @returns     解決後の文字列
   */
  resolve(text: string): string {
    return text.replace(T_PATTERN, (_match, key) => this.lookupKey(key.trim()));
  }

  /**
   * 単一のキーを解決する。
   * {{t:...}} ラッパーなしのキー文字列を直接渡す。
   */
  lookupKey(key: string): string {
    // 1. 現在ロケール
    const inLocale = this.locales[this.locale]?.[key];
    if (inLocale !== undefined) return inLocale;

    // 2. フォールバックロケール
    const inFallback = this.locales[this.fallbackLocale]?.[key];
    if (inFallback !== undefined) return inFallback;

    // 3. キー文字列そのまま（開発時に気づけるよう）
    console.warn(
      `[I18nResolver] Missing key "${key}" for locale "${this.locale}" (fallback: "${this.fallbackLocale}")`
    );
    return key;
  }

  /**
   * 文字列が {{t:key}} 形式かどうかを判定する。
   */
  static isI18nString(text: string): boolean {
    return T_PATTERN.test(text);
  }

  /**
   * ロケールを変更した新しい I18nResolver を返す。
   */
  withLocale(locale: LocaleCode): I18nResolver {
    return new I18nResolver({
      locales: this.locales,
      locale,
      fallbackLocale: this.fallbackLocale,
    });
  }

  /**
   * 利用可能なロケール一覧を返す。
   */
  availableLocales(): LocaleCode[] {
    return Object.keys(this.locales);
  }
}
