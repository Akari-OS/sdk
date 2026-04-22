/**
 * SidePanel — 横長タブ切替 + アコーディオンセクションの左サイドパネル。
 *
 * タブが増えて見切れた場合は横スクロール (overflow-x-auto)。
 * 同じタブをもう一度クリックするとパネルが閉じる (VS Code と同じ挙動)。
 *
 * spec: AKARI-HUB-009 §9
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { PLATFORMS, type PlatformConfig } from "@/lib/platforms";
import { PlatformIcon } from "@/components/icons/SnsIcons";

/** Tauri WebView 環境かどうか（D&D が不安定なため検出） */
function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// === Tab system ===

export interface SidePanelTab {
  id: string;
  icon: ReactNode;
  label: string;
  content: ReactNode;
}

interface SidePanelProps {
  tabs: SidePanelTab[];
  onCollapse?: () => void;
  /** 初期表示するタブ ID（未指定なら tabs[0]） */
  defaultTabId?: string;
  /** 外から制御する場合の activeTabId（controlled mode） */
  activeTabId?: string;
  /** controlled mode 時のタブ変更通知 */
  onTabChange?: (tabId: string) => void;
  /** アクティブタブをハイライト表示（プランモード時のフォーカス表示） */
  highlight?: boolean;
}

export function SidePanel({ tabs, onCollapse, defaultTabId, activeTabId: controlledTabId, onTabChange, highlight }: SidePanelProps) {
  const [internalTabId, setInternalTabId] = useState<string | null>(
    defaultTabId ?? tabs[0]?.id ?? null,
  );

  // controlled mode: 外から制御されたら内部 state も同期
  const isControlled = controlledTabId !== undefined;
  const activeTabId = isControlled ? controlledTabId : internalTabId;

  function handleTabClick(tabId: string) {
    if (activeTabId === tabId) {
      if (onCollapse) onCollapse();
      else if (!isControlled) setInternalTabId(null);
    } else {
      if (isControlled) {
        onTabChange?.(tabId);
      } else {
        setInternalTabId(tabId);
      }
    }
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-full flex flex-col bg-card">
      {/* 横長タブバー (overflow-x-auto でスクロール対応) */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border overflow-x-auto shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition whitespace-nowrap ${
                isActive
                  ? "text-primary bg-primary/10 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      {activeTab && (
        <div className={`flex-1 overflow-y-auto relative ${
          highlight ? "ring-2 ring-primary/40 ring-inset animate-pulse-slow" : ""
        }`}>
          {activeTab.content}
        </div>
      )}
    </div>
  );
}

// === Accordion Section ===

interface AccordionSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionSection({
  title,
  count,
  defaultOpen = true,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title}
        {count !== undefined && (
          <span className="ml-auto text-[10px] opacity-60">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// === SNS Platform List ===

interface SnsPlatformListProps {
  platformId: string;
  onSelect: (platformId: string) => void;
  /** メインに追加済みのプラットフォーム */
  selectedPlatforms?: string[];
}

export function SnsPlatformList({ platformId, onSelect, selectedPlatforms = [] }: SnsPlatformListProps) {
  return (
    <div className="p-2 flex flex-col gap-1">
      {PLATFORMS.map((p: PlatformConfig) => {
        const isActive = p.id === platformId;
        const isAdded = selectedPlatforms.includes(p.id);
        return (
          <button
            key={p.id}
            draggable={!isTauriEnv()}
            onDragStart={(e) => {
              e.dataTransfer.setData("platform-id", p.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 cursor-pointer ${
              isActive
                ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                : isAdded
                  ? "text-foreground bg-muted/30"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <PlatformIcon platformId={p.id} size={18} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{p.name}</div>
              <div className="text-[10px] opacity-60 truncate">{p.description}</div>
            </div>
            {isAdded && <Check className="w-3.5 h-3.5 text-primary/60 shrink-0" />}
          </button>
        );
      })}
      <div className="text-[9px] text-muted-foreground/40 px-3 pt-1">
        クリックで投稿先に追加
      </div>
    </div>
  );
}
