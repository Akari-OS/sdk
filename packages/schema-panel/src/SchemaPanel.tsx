/**
 * SchemaPanel — メインコンポーネント
 *
 * Panel Schema v0 を受け取り、Widget を再帰的に render する。
 *
 * 設計:
 * - schema を受け取り、Panel の layout / fields / actions を描画する
 * - 各 Widget は WidgetRegistry 経由で dispatch（Phase 3b が実装を埋める）
 * - Binding 解決・Expression 評価・HITL preview・i18n をまとめて管理する
 *
 * props:
 *   schema   : PanelSchema   — panel.schema.json の内容
 *   context  : RenderContext — 実行時クライアント群（Shell 側から注入）
 *
 * 使い方:
 * ```tsx
 * import { SchemaPanel } from "@akari-os/schema-panel";
 *
 * function App() {
 *   const context = createStubRenderContext("ja");
 *   return <SchemaPanel schema={notionSchema} context={context} />;
 * }
 * ```
 *
 * Widget 拡張（Phase 3b）:
 * ```tsx
 * import { SchemaPanel, defaultWidgetRegistry } from "@akari-os/schema-panel";
 * const registry = { ...defaultWidgetRegistry, "pool-picker": MyPoolPicker };
 * <SchemaPanel schema={schema} context={context} widgetRegistry={registry} />
 * ```
 */

import React, { useRef, useEffect, useState, useCallback } from "react";

import type { PanelSchema, Field, Action, LayoutType } from "./types/schema";
import type { RenderContext } from "./types/context";
import { I18nResolver } from "./engine/I18nResolver";
import { ExpressionEvaluator } from "./engine/ExpressionEvaluator";
import { BindingResolver } from "./engine/BindingResolver";
import { ActionDispatcher } from "./engine/ActionDispatcher";
import type { ShowHitlPreview } from "./engine/ActionDispatcher";
import {
  createPanelStore,
  createStateAccessor,
  usePanelFieldValues,
  extractStateBindings,
} from "./state/usePanelState";
import { PreviewDialog } from "./hitl/PreviewDialog";
import type { WidgetRegistry, WidgetProps } from "./WidgetRegistry";
import { defaultWidgetRegistry } from "./WidgetRegistry";

// ---------------------------------------------------------------------------
// HITL state
// ---------------------------------------------------------------------------

interface HitlState {
  action: Action;
  resolvedArgs: Record<string, unknown>;
  onApprove: () => Promise<void>;
  onReject: () => void;
}

// ---------------------------------------------------------------------------
// SchemaPanelProps
// ---------------------------------------------------------------------------

export interface SchemaPanelProps {
  /** Panel Schema v0（panel.schema.json の内容） */
  schema: PanelSchema;
  /** 実行時コンテキスト（Shell 側から注入） */
  context: RenderContext;
  /**
   * Widget レジストリ。省略時は defaultWidgetRegistry を使う。
   * Phase 3b でカスタム Widget を登録するためにここを差し替える。
   */
  widgetRegistry?: WidgetRegistry;
  /** 外部から追加の CSS クラスを付与する */
  className?: string;
}

// ---------------------------------------------------------------------------
// SchemaPanel
// ---------------------------------------------------------------------------

export const SchemaPanel: React.FC<SchemaPanelProps> = ({
  schema,
  context,
  widgetRegistry,
  className,
}) => {
  // --- Engines ---
  const i18nResolver = new I18nResolver({
    locales: schema.locales,
    locale: context.locale,
    fallbackLocale: context.fallbackLocale,
  });
  const expressionEvaluator = new ExpressionEvaluator();

  // --- Zustand store （Panel ごとに独立） ---
  const storeRef = useRef(createPanelStore());
  const store = storeRef.current;
  const fieldValues = usePanelFieldValues(store);

  // schema の default 値で初期化
  useEffect(() => {
    store.getState().initFromSchema(schema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Binding resolver ---
  const stateAccessor = createStateAccessor(store);
  const bindingResolver = new BindingResolver({
    mcpClient: context.mcpClient,
    poolClient: context.poolClient,
    ampClient: context.ampClient,
    stateAccessor,
  });

  // --- HITL state ---
  const [hitlState, setHitlState] = useState<HitlState | null>(null);

  const showHitlPreview: ShowHitlPreview = useCallback(
    (action, resolvedArgs, onApprove, onReject) => {
      setHitlState({ action, resolvedArgs, onApprove, onReject });
    },
    []
  );

  // --- Action dispatcher ---
  const actionDispatcher = new ActionDispatcher({
    mcpClient: context.mcpClient,
    moduleClient: context.moduleClient,
    navigationClient: context.navigationClient,
    toastClient: context.toastClient,
    i18nResolver,
    showHitlPreview,
  });

  // --- Widget registry ---
  const registry = widgetRegistry ?? defaultWidgetRegistry;

  // --- Active tab state ---
  const [activeTab, setActiveTab] = useState<string>(
    schema.tabs?.[0]?.id ?? ""
  );

  // --- Render helpers ---

  /**
   * フィールドを render する（Phase 3b の Widget が実装を提供する）。
   */
  const renderField = (field: Field): React.ReactNode => {
    // visible_when 評価
    if (!expressionEvaluator.isVisible(field.visible_when, fieldValues)) {
      return null;
    }

    // tabs レイアウトの場合、アクティブタブのフィールドのみ表示
    if (schema.layout === "tabs" && field.tab && field.tab !== activeTab) {
      return null;
    }

    // enabled_when 評価
    const isEnabled = expressionEvaluator.isEnabled(
      field.enabled_when,
      fieldValues
    );

    const widgetProps: WidgetProps = {
      field,
      value: fieldValues[field.id] ?? undefined,
      onChange: (value) => {
        store.getState().setFieldValue(field.id, value);
        // state.* バインディングは Zustand に書く（他の bind は別途処理）
      },
      isEnabled,
      i18nResolver,
      bindingResolver,
      context,
    };

    const WidgetComponent = registry[field.type];
    if (!WidgetComponent) {
      return (
        <UnknownWidgetFallback
          key={field.id}
          fieldId={field.id}
          widgetType={field.type}
        />
      );
    }

    return (
      <div key={field.id} className="mb-4">
        <WidgetComponent {...widgetProps} />
      </div>
    );
  };

  /**
   * Action ボタンを render する。
   */
  const renderAction = (action: Action): React.ReactNode => {
    // visible_when 評価
    if (!expressionEvaluator.isVisible(action.visible_when, fieldValues)) {
      return null;
    }

    // tabs レイアウトの場合、アクティブタブのアクションのみ表示
    if (schema.layout === "tabs" && action.tab && action.tab !== activeTab) {
      return null;
    }

    const isEnabled = expressionEvaluator.isEnabled(
      action.enabled_when,
      fieldValues
    );

    const handleClick = async () => {
      await actionDispatcher.dispatch(action, fieldValues);
    };

    return (
      <ActionButton
        key={action.id}
        action={action}
        isEnabled={isEnabled}
        i18nResolver={i18nResolver}
        onClick={handleClick}
      />
    );
  };

  // --- Layout renderers ---

  const renderTabsLayout = (): React.ReactNode => (
    <div>
      {/* Tab bar */}
      {schema.tabs && schema.tabs.length > 0 && (
        <div
          role="tablist"
          className="flex border-b border-border"
        >
          {schema.tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i18nResolver.resolve(tab.label)}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div
        role="tabpanel"
        className="mt-4 space-y-2"
      >
        {schema.fields.map(renderField)}
        <div className="mt-4 flex gap-2">
          {schema.actions.map(renderAction)}
        </div>
      </div>
    </div>
  );

  const renderFormLayout = (): React.ReactNode => (
    <div className="space-y-2">
      {schema.fields.map(renderField)}
      <div className="mt-4 flex gap-2">
        {schema.actions.map(renderAction)}
      </div>
    </div>
  );

  const renderLayout = (layout: LayoutType): React.ReactNode => {
    switch (layout) {
      case "tabs":
        return renderTabsLayout();
      case "form":
        return renderFormLayout();
      case "split":
        // TODO: Phase 3b で split レイアウト実装
        return renderFormLayout();
      case "dashboard":
        // TODO: Phase 3b で dashboard レイアウト実装
        return renderFormLayout();
      case "list":
        // TODO: Phase 3b で list レイアウト実装
        return renderFormLayout();
      default: {
        const _never: never = layout;
        console.warn(`[SchemaPanel] Unknown layout: ${_never}`);
        return renderFormLayout();
      }
    }
  };

  return (
    <div className={`schema-panel ${className ?? ""}`.trim()}>
      {/* Panel title */}
      {schema.title && (
        <h1 className="mb-4 text-xl font-bold">
          {i18nResolver.resolve(schema.title)}
        </h1>
      )}

      {/* Layout */}
      {renderLayout(schema.layout)}

      {/* HITL preview dialog */}
      {hitlState && (
        <PreviewDialog
          action={hitlState.action}
          resolvedArgs={hitlState.resolvedArgs}
          fieldValues={fieldValues}
          i18nResolver={i18nResolver}
          onApprove={hitlState.onApprove}
          onReject={hitlState.onReject}
          onClose={() => setHitlState(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ActionButton
// ---------------------------------------------------------------------------

const BUTTON_KIND_CLASSES: Record<string, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  ghost:
    "hover:bg-accent hover:text-accent-foreground",
};

interface ActionButtonProps {
  action: Action;
  isEnabled: boolean;
  i18nResolver: I18nResolver;
  onClick: () => Promise<void>;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  action,
  isEnabled,
  i18nResolver,
  onClick,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (!isEnabled || isLoading) return;
    setIsLoading(true);
    try {
      await onClick();
    } finally {
      setIsLoading(false);
    }
  };

  const kindClass =
    BUTTON_KIND_CLASSES[action.kind] ?? BUTTON_KIND_CLASSES.secondary;

  return (
    <button
      type="button"
      disabled={!isEnabled || isLoading}
      onClick={handleClick}
      className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${kindClass}`}
    >
      {isLoading ? "..." : i18nResolver.resolve(action.label)}
    </button>
  );
};

// ---------------------------------------------------------------------------
// UnknownWidgetFallback
// ---------------------------------------------------------------------------

const UnknownWidgetFallback: React.FC<{
  fieldId: string;
  widgetType: string;
}> = ({ fieldId, widgetType }) => (
  <div className="rounded border border-dashed border-yellow-400 p-2 text-xs text-yellow-600 dark:text-yellow-400">
    Widget not implemented: type="{widgetType}" id="{fieldId}" (Phase 3b)
  </div>
);

export default SchemaPanel;
