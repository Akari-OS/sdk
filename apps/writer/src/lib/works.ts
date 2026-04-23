import { uuid } from "@akari-os/sdk/partner";
import { SOURCE_PLATFORM_ID, type ToneId } from "./platforms";
import type { PolicyData } from "@akari-os/templates-core";
import { migrateSourceDraft } from "@akari-os/templates-core";
import {
  loadStyles,
  getActiveStyleId,
  createDefaultWorkStyle,
  type WorkStyleConfig,
} from "@akari-os/writer-style-core";
import type { MediaAttachment } from "./media";

export interface PlatformContent {
  text: string;
  media: MediaAttachment[];
}

export interface Work {
  id: string;
  title: string;
  contents: Record<string, PlatformContent>;
  platformId: string;
  selectedPlatforms?: string[];
  tone: ToneId | null;
  status: "draft" | "published";
  conversationId?: string;
  aiContext?: string;
  sourceDraft?: string;
  policy?: PolicyData;
  style?: WorkStyleConfig;
  url?: string;
  createdAt: number;
  updatedAt: number;
}

export const WORKS_KEY = "akari.writer.works";
export const ACTIVE_WORK_KEY = "akari.writer.activeWorkId";

export function loadWorks(): Work[] {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map((w) => {
      let contents = w.contents as Record<string, PlatformContent> | undefined;
      if (!contents || typeof contents !== "object") {
        const oldText = (w.text as string) ?? "";
        const oldMedia = Array.isArray(w.media) ? (w.media as MediaAttachment[]) : [];
        const pid = (w.platformId as string) ?? "";
        contents = pid ? { [pid]: { text: oldText, media: oldMedia } } : {};
      }
      if (!contents[SOURCE_PLATFORM_ID]) {
        contents[SOURCE_PLATFORM_ID] = { text: "", media: [] };
      }
      return {
        id: (w.id as string) ?? uuid(),
        title: (w.title as string) ?? "",
        contents,
        platformId: (w.platformId as string) || SOURCE_PLATFORM_ID,
        selectedPlatforms: Array.isArray(w.selectedPlatforms)
          ? (w.selectedPlatforms as string[])
          : (w.platformId ? [w.platformId as string] : []),
        tone: (w.tone as ToneId | null) ?? null,
        status: (w.status as "draft" | "published") ?? "draft",
        sourceDraft: (w.sourceDraft as string) ?? "",
        policy: w.policy
          ? (w.policy as PolicyData)
          : (w.sourceDraft as string)?.trim()
            ? migrateSourceDraft((w.sourceDraft as string))
            : undefined,
        style: w.style
          ? (w.style as WorkStyleConfig)
          : (() => {
              const globalStyles = loadStyles();
              const activeId = getActiveStyleId();
              const active = globalStyles.find((s) => s.id === activeId) ?? globalStyles[0];
              if (!active) return undefined;
              return {
                base: { name: active.name, tone: active.tone, emojiUsage: active.emojiUsage, hashtagRule: active.hashtagRule, notes: active.notes },
                overrides: {},
              };
            })(),
        conversationId: w.conversationId as string | undefined,
        aiContext: w.aiContext as string | undefined,
        url: w.url as string | undefined,
        createdAt: (w.createdAt as number) ?? Date.now(),
        updatedAt: (w.updatedAt as number) ?? Date.now(),
      };
    });
  } catch {
    return [];
  }
}

export function saveWorks(works: Work[]) {
  const forStorage = works.map((w) => {
    const contents: Record<string, PlatformContent> = {};
    for (const [pid, c] of Object.entries(w.contents)) {
      contents[pid] = { text: c.text, media: [] };
    }
    return { ...w, contents };
  });
  localStorage.setItem(WORKS_KEY, JSON.stringify(forStorage));
}

export function createWork(): Work {
  return {
    id: uuid(),
    title: "",
    contents: { [SOURCE_PLATFORM_ID]: { text: "", media: [] } },
    platformId: SOURCE_PLATFORM_ID,
    selectedPlatforms: [],
    tone: null,
    status: "draft",
    style: createDefaultWorkStyle(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
