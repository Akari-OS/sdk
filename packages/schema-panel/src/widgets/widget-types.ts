/**
 * widget-types.ts
 *
 * Local widget interface definitions, defined here so widgets compile independently
 * of Phase 3a's engine/types. Once Phase 3a ships its canonical types, import from
 * "../types/index" and remove / alias these.
 *
 * TODO: Phase 3a integration — replace with:
 *   import { WidgetProps, WidgetSpec, RenderContext } from "../types";
 */

// ---------------------------------------------------------------------------
// WidgetSpec — mirrors Panel Schema v0 §6.2 field schema
// ---------------------------------------------------------------------------

export type BindingPath = string; // e.g. "mcp.x.post.text" | "pool.q1" | "state.foo"

export interface SelectOption {
  value: string;
  label: string;
}

export interface WidgetSpec {
  id: string;
  type: string;
  label?: string;
  placeholder?: string;
  help?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  read_only?: boolean;

  // Condition expressions evaluated by context.expr
  enabled_when?: string;
  visible_when?: string;

  // Binding — see Panel Schema v0 §6.4
  bind?: BindingPath;

  // Text / number constraints
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;

  // Select / multi-select / radio / checkbox options
  options?: SelectOption[];
  options_source?: string;
  options_source_args?: Record<string, unknown>;

  // Number
  precision?: number;

  // Datetime
  /** "datetime" | "datetime-optional" | "date" | "time" | "duration" */
  format?: string;

  // Pool-picker
  accept?: string[];

  // Rich-text-editor toolbar items
  toolbar?: string[];

  // Doc-outline-tree
  source?: string;
  source_args?: Record<string, unknown>;

  // Repeat / section children
  children?: WidgetSpec[];

  // Tabs
  tabs?: Array<{ id: string; label: string }>;
  tab?: string;

  // Table columns
  columns?: Array<{ key: string; label: string; type?: string }>;

  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// RenderContext — expected API surface from Phase 3a's engine
// ---------------------------------------------------------------------------

export interface I18nResolver {
  /** Resolves "{{t:key}}" patterns inside a string. Returns raw string if already resolved. */
  resolve(template: string): string;
}

export interface ExprEvaluator {
  /** Evaluates a Panel Schema v0 condition expression like "$field != null" against current state. */
  evaluate(expr: string): boolean;
}

export interface PoolQueryResult {
  id: string;
  name: string;
  type: string;
  thumbnail?: string;
  [key: string]: unknown;
}

export interface PoolClient {
  /** Search Pool Knowledge Store. Returns matching items. */
  query(params: { types?: string[]; q?: string; limit?: number }): Promise<PoolQueryResult[]>;
}

export interface AmpClient {
  /** Search AMP records. */
  search(params: { kind?: string; q?: string; limit?: number }): Promise<unknown[]>;
}

export interface ActionDispatcher {
  /** Invoke a registered action by id. */
  invoke(actionId: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * RenderContext — injected from SchemaPanel engine (Phase 3a).
 *
 * TODO: Phase 3a integration — replace with import from "../engine/RenderContext".
 * Use optional chaining on pool/amp in case the engine version is older.
 */
export interface RenderContext {
  i18n: I18nResolver;
  expr: ExprEvaluator;
  action: ActionDispatcher;
  /** Available when Shell initialises Pool MCP client */
  pool?: PoolClient;
  /** Available when Shell initialises AMP client */
  amp?: AmpClient;
  /** Arbitrary runtime escape hatch for future extensions */
  runtime?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WidgetProps — the contract every Widget component must satisfy
// ---------------------------------------------------------------------------

export interface WidgetProps<V = unknown> {
  spec: WidgetSpec;
  value: V;
  onChange: (v: V) => void;
  context: RenderContext;
  /** Override from parent (e.g. section disabled_when) */
  disabled?: boolean;
}

/** Convenience alias */
export type Widget<V = unknown> = React.FC<WidgetProps<V>>;

// ---------------------------------------------------------------------------
// WidgetRegistry contract (Phase 3a will provide the implementation)
// ---------------------------------------------------------------------------

/**
 * TODO: Phase 3a integration — import WidgetRegistry from "../engine/WidgetRegistry"
 * and remove this interface. The interface here documents the expected contract.
 */
export interface WidgetRegistry {
  register(type: string, widget: Widget): void;
  resolve(type: string): Widget | undefined;
}
