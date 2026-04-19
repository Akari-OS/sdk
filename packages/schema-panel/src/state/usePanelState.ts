/**
 * usePanelState
 *
 * Panel ローカル state を管理する Zustand ストアフック。
 *
 * Panel Schema v0 Binding 規約の "state.<key>" バインディングを担う。
 * BindingResolver が PanelStateAccessor インターフェース経由でここを read/write する。
 *
 * 設計:
 * - Panel ごとに独立した store（createPanelStore で都度生成）
 * - SchemaPanel が mount 時に schema.fields の bind="state.*" を収集して初期値を設定
 * - アンマウント時にクリアすることを推奨（Panel 間の state 汚染を防ぐ）
 *
 * 使い方（SchemaPanel 内から）:
 * ```tsx
 * const [store, accessor] = usePanelStore(schema);
 * // accessor.get("db_results") → state.db_results の値
 * // accessor.set("db_results", rows) → 更新
 * ```
 */

import { create } from "zustand";
import type { PanelStateAccessor } from "../engine/BindingResolver";
import type { PanelSchema, Field } from "../types/schema";

// ---------------------------------------------------------------------------
// Store 型定義
// ---------------------------------------------------------------------------

export interface PanelStateStore {
  /** フィールド値マップ（フィールド ID → 現在値） */
  fieldValues: Record<string, unknown>;

  /** フィールド値を設定する */
  setFieldValue: (fieldId: string, value: unknown) => void;

  /** 複数フィールド値を一括設定する */
  setFieldValues: (values: Record<string, unknown>) => void;

  /** フィールド値をクリアする */
  clearFieldValues: () => void;

  /** 初期値を設定する（schema の default フィールドから） */
  initFromSchema: (schema: PanelSchema) => void;
}

// ---------------------------------------------------------------------------
// Store ファクトリ
// ---------------------------------------------------------------------------

/**
 * Panel 専用の Zustand ストアを生成する。
 * SchemaPanel が useRef 等で保持し、Panel ライフサイクルに合わせて管理する。
 */
export const createPanelStore = () =>
  create<PanelStateStore>((set) => ({
    fieldValues: {},

    setFieldValue: (fieldId, value) =>
      set((state) => ({
        fieldValues: { ...state.fieldValues, [fieldId]: value },
      })),

    setFieldValues: (values) =>
      set((state) => ({
        fieldValues: { ...state.fieldValues, ...values },
      })),

    clearFieldValues: () => set({ fieldValues: {} }),

    initFromSchema: (schema: PanelSchema) => {
      const defaults: Record<string, unknown> = {};
      for (const field of schema.fields) {
        if ("default" in field && field.default !== undefined) {
          defaults[field.id] = field.default;
        }
      }
      set((state) => ({
        fieldValues: { ...defaults, ...state.fieldValues },
      }));
    },
  }));

// ---------------------------------------------------------------------------
// 型定義（createPanelStore の返り値型を取り出す）
// ---------------------------------------------------------------------------

type PanelStore = ReturnType<typeof createPanelStore>;

// ---------------------------------------------------------------------------
// usePanelState フック
// ---------------------------------------------------------------------------

/**
 * SchemaPanel 内で使う Panel state フック。
 *
 * @param store  createPanelStore() で生成したストア
 * @returns      現在のフィールド値マップ
 */
export function usePanelFieldValues(
  store: PanelStore
): Record<string, unknown> {
  return store((s) => s.fieldValues);
}

/**
 * 特定フィールドの値を取得するフック。
 */
export function usePanelFieldValue(
  store: PanelStore,
  fieldId: string
): unknown {
  return store((s) => s.fieldValues[fieldId]);
}

/**
 * フィールド値を更新する setter を返すフック。
 */
export function usePanelSetFieldValue(
  store: PanelStore
): (fieldId: string, value: unknown) => void {
  return store((s) => s.setFieldValue);
}

// ---------------------------------------------------------------------------
// PanelStateAccessor ファクトリ
// ---------------------------------------------------------------------------

/**
 * Zustand ストアから BindingResolver が使える PanelStateAccessor を作る。
 *
 * 同期的な get/set インターフェースを提供する。
 * （Zustand の getState() は同期なので問題なし）
 */
export function createStateAccessor(store: PanelStore): PanelStateAccessor {
  return {
    get(key: string): unknown {
      return store.getState().fieldValues[key];
    },
    set(key: string, value: unknown): void {
      store.getState().setFieldValue(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Field から state.* バインディングを収集するユーティリティ
// ---------------------------------------------------------------------------

/**
 * Schema の fields から state.* バインディングを持つフィールドの
 * フィールド ID → state キー のマッピングを返す。
 *
 * SchemaPanel が mount 時に Zustand と連携するために使う。
 */
export function extractStateBindings(
  fields: Field[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    if (field.bind?.startsWith("state.")) {
      const stateKey = field.bind.slice("state.".length);
      map[field.id] = stateKey;
    }
  }
  return map;
}
