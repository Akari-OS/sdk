/**
 * ActionDispatcher
 *
 * Panel Schema v0 §6.5 の Action 規約に従い、Action ごとの handler を実装する。
 *
 * 対応 Action type:
 *   mcp.invoke  — HITL preview を挟むか判定 → 承認後 MCP ツール呼び出し
 *   handoff     — App 間遷移（AKARI App SDK Inter-App API）
 *   navigate    — Panel 内の別タブへ遷移
 *   submit      — Form 送信ロジック（mcp.invoke の簡略形）
 *
 * HITL フロー（mcp.invoke + hitl.require = true）:
 *   1. PreviewDialog を表示
 *   2. ユーザーが承認 → MCP ツール呼び出し
 *   3. ユーザーが却下 → キャンセル
 *
 * TODO: AMP 監査ログへの自動書き込み（AKARI App SDK §6.6 Permission API 参照）
 */

import type { Action, McpCall, HandoffCall, OnSuccess, OnError } from "../types/schema";
import type { McpClient, AppClient, NavigationClient, ToastClient } from "../types/context";
import { resolveActionArgs } from "./BindingResolver";
import { I18nResolver } from "./I18nResolver";

// ---------------------------------------------------------------------------
// HITL callback types
// ---------------------------------------------------------------------------

/**
 * HITL preview を表示するためのコールバック。
 * SchemaPanel が PreviewDialog に渡すために使う。
 */
export type ShowHitlPreview = (
  action: Action,
  resolvedArgs: Record<string, unknown>,
  onApprove: () => Promise<void>,
  onReject: () => void
) => void;

// ---------------------------------------------------------------------------
// ActionDispatcher
// ---------------------------------------------------------------------------

export interface ActionDispatcherOptions {
  mcpClient: McpClient;
  appClient: AppClient;
  navigationClient: NavigationClient;
  toastClient: ToastClient;
  i18nResolver: I18nResolver;
  /** HITL preview UI を表示するコールバック */
  showHitlPreview: ShowHitlPreview;
}

/**
 * Action を実行するディスパッチャー。
 *
 * 使い方:
 * ```ts
 * const dispatcher = new ActionDispatcher({...});
 * await dispatcher.dispatch(action, fieldValues);
 * ```
 */
export class ActionDispatcher {
  private mcp: McpClient;
  private app: AppClient;
  private navigation: NavigationClient;
  private toast: ToastClient;
  private i18n: I18nResolver;
  private showHitlPreview: ShowHitlPreview;

  constructor(options: ActionDispatcherOptions) {
    this.mcp = options.mcpClient;
    this.app = options.appClient;
    this.navigation = options.navigationClient;
    this.toast = options.toastClient;
    this.i18n = options.i18nResolver;
    this.showHitlPreview = options.showHitlPreview;
  }

  /**
   * Action を実行する。
   *
   * @param action       実行する Action
   * @param fieldValues  フィールド ID → 現在値のマップ
   */
  async dispatch(
    action: Action,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    switch (action.type) {
      case "mcp.invoke":
        await this.handleMcpInvoke(action, fieldValues);
        break;

      case "handoff":
        await this.handleHandoff(action, fieldValues);
        break;

      case "navigate":
        this.handleNavigate(action, fieldValues);
        break;

      case "submit":
        // submit は mcp.invoke の簡略形として同じロジックで処理
        await this.handleMcpInvoke(action, fieldValues);
        break;

      default: {
        // TypeScript の exhaustive check のために string にキャスト
        const unknownType = (action as Action).type as string;
        console.warn(`[ActionDispatcher] Unknown action type: "${unknownType}"`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // mcp.invoke handler
  // ---------------------------------------------------------------------------

  private async handleMcpInvoke(
    action: Action,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    if (!action.mcp) {
      console.error(
        `[ActionDispatcher] Action "${action.id}" has type mcp.invoke but no mcp field`
      );
      return;
    }

    const resolvedArgs = resolveActionArgs(action.mcp.args, fieldValues);

    if (action.hitl?.require) {
      // HITL ゲートが必要 → PreviewDialog を表示
      await this.showHitlAndInvoke(action, action.mcp, resolvedArgs, fieldValues);
    } else {
      // 直接実行
      await this.invokeMcp(action, action.mcp.tool, resolvedArgs, fieldValues);
    }
  }

  private async showHitlAndInvoke(
    action: Action,
    mcpCall: McpCall,
    resolvedArgs: Record<string, unknown>,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    return new Promise((resolve) => {
      this.showHitlPreview(
        action,
        resolvedArgs,
        async () => {
          // 承認
          await this.invokeMcp(action, mcpCall.tool, resolvedArgs, fieldValues);
          resolve();
        },
        () => {
          // 却下
          console.log(`[ActionDispatcher] HITL rejected: "${action.id}"`);
          resolve();
        }
      );
    });
  }

  private async invokeMcp(
    action: Action,
    tool: string,
    resolvedArgs: Record<string, unknown>,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    try {
      const result = await this.mcp.call(tool, resolvedArgs);
      await this.handleSuccess(action, result, fieldValues);
    } catch (err) {
      this.handleError(action, err, fieldValues);
    }
  }

  // ---------------------------------------------------------------------------
  // handoff handler
  // ---------------------------------------------------------------------------

  private async handleHandoff(
    action: Action,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    if (!action.handoff) {
      console.error(
        `[ActionDispatcher] Action "${action.id}" has type handoff but no handoff field`
      );
      return;
    }

    const handoff: HandoffCall = action.handoff;
    const resolvedPayload = resolveActionArgs(
      handoff.payload as Record<string, unknown>,
      fieldValues
    );

    try {
      await this.app.handoff({
        to: handoff.to,
        intent: handoff.intent,
        payload: resolvedPayload,
      });
    } catch (err) {
      console.error(`[ActionDispatcher] Handoff failed for "${action.id}":`, err);
      this.handleError(action, err, fieldValues);
    }
  }

  // ---------------------------------------------------------------------------
  // navigate handler
  // ---------------------------------------------------------------------------

  private handleNavigate(
    action: Action,
    _fieldValues: Record<string, unknown>
  ): void {
    // navigate action は on_success.navigate や action 自体に navigate 先を持つ
    // 現状の spec では navigate は on_success の side effect で表現されることが多い
    // action.type = "navigate" の場合は別途 navigate 先を spec が定義する必要がある
    // TODO: spec で navigate action のフォーマットを確定する
    console.warn(
      `[ActionDispatcher] Navigate action "${action.id}" - destination not yet specified in spec`
    );
  }

  // ---------------------------------------------------------------------------
  // on_success / on_error handlers
  // ---------------------------------------------------------------------------

  private async handleSuccess(
    action: Action,
    result: unknown,
    fieldValues: Record<string, unknown>
  ): Promise<void> {
    const onSuccess: OnSuccess | undefined = action.on_success;
    if (!onSuccess) return;

    // toast 表示
    if (onSuccess.toast) {
      const message = this.resolveTemplate(onSuccess.toast, fieldValues, result);
      this.toast.success(message);
    }

    // 結果を state に書き込む
    // TODO: bind_result への書き込みは BindingResolver.write() を使う
    // ここでは SchemaPanel 側から stateAccessor を渡す必要があるため、
    // bind_result の処理は SchemaPanel コンポーネントで行う
    if (onSuccess.bind_result) {
      console.log(
        `[ActionDispatcher] bind_result: "${onSuccess.bind_result}" =`,
        result
      );
      // SchemaPanel が on_success コールバックを受け取り、Zustand に書き込む
    }

    // タブ遷移
    if (onSuccess.navigate) {
      this.navigation.navigate(onSuccess.navigate);
    }
  }

  private handleError(
    action: Action,
    err: unknown,
    fieldValues: Record<string, unknown>
  ): void {
    const onError: OnError | undefined = action.on_error;
    if (!onError) {
      console.error(`[ActionDispatcher] Action "${action.id}" failed:`, err);
      return;
    }

    if (onError.toast) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const message = this.resolveTemplate(
        onError.toast,
        { ...fieldValues, error: errorMessage },
        null
      );
      this.toast.error(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Template resolver for on_success / on_error messages
  // ---------------------------------------------------------------------------

  /**
   * "{{t:key}}" の i18n 解決と "{{error}}" / "{{fieldId}}" の動的置換を行う。
   */
  private resolveTemplate(
    template: string,
    fieldValues: Record<string, unknown>,
    _result: unknown
  ): string {
    // i18n キー解決
    let resolved = this.i18n.resolve(template);

    // {{fieldId}} / {{error}} の動的変数を置換
    resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
      const value = fieldValues[key.trim()];
      return value !== undefined ? String(value) : `{{${key}}}`;
    });

    return resolved;
  }
}
