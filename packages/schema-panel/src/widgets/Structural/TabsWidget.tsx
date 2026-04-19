/**
 * TabsWidget.tsx
 *
 * Widget type: "tabs" (structural / layout)
 *
 * Renders a tab bar that switches between groups of child widgets.
 * Tab definitions come from spec.tabs (array of { id, label }).
 * Each child widget declares `spec.tab` to indicate which tab it belongs to.
 * Engine groups children by tab and passes them as named slots.
 *
 * Shell-side import note:
 *   @/components/ui/tabs — shadcn Tabs, TabsList, TabsTrigger, TabsContent
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveLabel } from "../widget-utils";

interface TabDef {
  id: string;
  label: string;
}

/**
 * TabsWidget value: the currently active tab id.
 * onChange fires when the user switches tabs, allowing the engine to persist state.
 */
type TabsValue = string | null;

/**
 * TabsWidget
 *
 * Renders a tab strip from spec.tabs definitions.
 * Tab content (child widgets per tab) is rendered by the engine and passed
 * as `children` keyed by tab id, OR the engine renders spec.children filtered by tab.
 *
 * This implementation renders the tab bar and an active tab indicator.
 * The engine is responsible for mounting/unmounting child widget groups per tab.
 *
 * TODO: Phase 3a — confirm how engine passes per-tab content:
 *   Option A: `children` as Record<tabId, ReactNode>
 *   Option B: engine wraps children in a portal keyed by tabId
 *   Option C: engine calls TabsWidget with a `renderTab(tabId)` render prop
 */
export const TabsWidget: React.FC<
  WidgetProps<TabsValue> & {
    /** Engine passes per-tab content as a map */
    tabContent?: Record<string, React.ReactNode>;
  }
> = ({ spec, value, onChange, context, tabContent }) => {
  if (!isVisible(spec, context)) return null;

  const tabs: TabDef[] = (spec.tabs ?? []).map((t: TabDef) => ({
    id: t.id,
    label: context.i18n.resolve(t.label),
  }));

  const defaultTab = tabs[0]?.id ?? null;
  const [activeTab, setActiveTab] = useState<string>(value ?? defaultTab ?? "");

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange(tabId);
  };

  if (tabs.length === 0) {
    return (
      <div className="widget-tabs">
        <p className="text-xs text-muted-foreground">
          No tabs defined. Add tab definitions to spec.tabs.
        </p>
      </div>
    );
  }

  return (
    <div className="widget-tabs flex flex-col gap-0">
      {/* Tab strip */}
      {/* TODO: replace with shadcn <Tabs> */}
      <div
        role="tablist"
        className="flex border-b bg-muted/30 rounded-t-md overflow-x-auto"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.id}`}
              id={`tab-trigger-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`tab-panel-${tab.id}`}
            aria-labelledby={`tab-trigger-${tab.id}`}
            hidden={!isActive}
            className="flex flex-col gap-3 pt-3"
          >
            {tabContent?.[tab.id] ?? (
              <p className="text-xs text-muted-foreground">
                {/* Dev placeholder when engine hasn't injected tab content */}
                Tab "{tab.label}" — engine renders widgets with spec.tab === "{tab.id}" here.
                TODO: Phase 3a engine integration.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

TabsWidget.displayName = "TabsWidget";
