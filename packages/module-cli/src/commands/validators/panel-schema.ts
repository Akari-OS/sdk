/**
 * panel-schema.ts — Panel Schema v0 バリデータ (AKARI-HUB-025)
 *
 * Validates a panel.schema.json file against the AKARI Panel Schema v0 meta-schema.
 * Uses Ajv JSON Schema validator.
 *
 * Dependencies (add to package.json):
 *   ajv          — JSON Schema validator (^8.x)
 *   ajv-formats  — additional format validators (optional)
 *
 * Reference: spec-akari-panel-schema.md (AKARI-HUB-025)
 */

// ---------------------------------------------------------------------------
// Panel Schema v0 — Inline Meta-schema (simplified)
//
// The canonical meta-schema is defined in spec-akari-panel-schema.md §6.
// This inline version covers the structural rules checked at certify time.
// The full meta-schema including all widget subtypes should live in
// a published @akari/sdk package when it stabilises (HUB-025 T-1).
// ---------------------------------------------------------------------------

const PANEL_SCHEMA_META: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "akari://panel-schema/v0/meta",
  title: "AKARI Panel Schema v0 meta-schema",
  type: "object",
  required: ["$schema", "layout", "fields"],
  additionalProperties: true,
  properties: {
    $schema: {
      type: "string",
      const: "akari://panel-schema/v0",
      description: "Must be exactly 'akari://panel-schema/v0'",
    },
    title: { type: "string" },
    layout: {
      type: "string",
      enum: ["form", "tabs", "split", "dashboard", "list"],
      description: "Top-level layout type (HUB-025 §6.3)",
    },
    fields: {
      type: "array",
      items: { $ref: "#/definitions/Field" },
    },
    actions: {
      type: "array",
      items: { $ref: "#/definitions/Action" },
    },
  },
  definitions: {
    Field: {
      type: "object",
      required: ["id", "type"],
      additionalProperties: true,
      properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9_-]*$" },
        type: {
          type: "string",
          enum: [
            // テキスト入力
            "text", "textarea", "password", "email", "url",
            // 数値
            "number", "slider", "stepper",
            // 選択
            "select", "multi-select", "radio", "checkbox", "toggle",
            // 日時
            "date", "time", "datetime", "datetime-optional", "duration",
            // AKARI 固有
            "pool-picker", "amp-query", "module-picker", "agent-picker",
            // Documents（Office 系）
            "rich-text-editor", "doc-outline-tree",
            "sheet-row-picker", "cell-range-picker",
            "slide-template-picker", "slide-preview",
            // ファイル
            "file-upload", "image-preview", "video-preview",
            // 表示
            "markdown", "badge", "stat", "progress", "image", "divider",
            // 構造
            "tabs", "accordion", "split", "group", "repeater",
            // データ
            "table", "list", "card-grid",
            // Action
            "button", "link", "menu",
          ],
        },
        label: { type: "string" },
        bind: { type: "string" },
        required: { type: "boolean" },
        visible_when: {
          description: "JSONLogic expression or sugar string (ADR-012)",
        },
        enabled_when: {
          description: "JSONLogic expression or sugar string (ADR-012)",
        },
      },
    },
    Action: {
      type: "object",
      required: ["id", "label"],
      additionalProperties: true,
      properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9_-]*$" },
        label: { type: "string" },
        kind: {
          type: "string",
          enum: ["primary", "secondary", "destructive", "ghost"],
        },
        mcp: { type: "object" },
        handoff: { type: "object" },
        hitl: { type: "object" },
        enabled_when: {
          description: "JSONLogic expression or sugar string (ADR-012)",
        },
        visible_when: {
          description: "JSONLogic expression or sugar string (ADR-012)",
        },
        on_success: { type: "object" },
        on_error: { type: "object" },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

export interface PanelSchemaValidationResult {
  valid: boolean;
  errors: PanelSchemaError[];
  warnings: string[];
}

export interface PanelSchemaError {
  path: string;
  message: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a parsed panel.schema.json object against the Panel Schema v0 meta-schema.
 *
 * Uses Ajv internally. Requires `ajv` in package.json dependencies.
 */
export function validatePanelSchema(panelSchema: unknown): PanelSchemaValidationResult {
  const errors: PanelSchemaError[] = [];
  const warnings: string[] = [];

  if (typeof panelSchema !== "object" || panelSchema === null) {
    return {
      valid: false,
      errors: [{ path: "/", message: "panel.schema.json must be a JSON object", code: "NOT_OBJECT" }],
      warnings,
    };
  }

  const schema = panelSchema as Record<string, unknown>;

  // ── $schema check ──────────────────────────────────────────────────────
  if (!schema.$schema) {
    errors.push({
      path: "$schema",
      message: 'Missing required "$schema" field. Must be "akari://panel-schema/v0"',
      code: "MISSING_DOLLAR_SCHEMA",
    });
  } else if (schema.$schema !== "akari://panel-schema/v0") {
    errors.push({
      path: "$schema",
      message: `Invalid $schema "${schema.$schema}". Must be exactly "akari://panel-schema/v0"`,
      code: "INVALID_SCHEMA_URI",
    });
  }

  // ── layout check ───────────────────────────────────────────────────────
  const validLayouts = ["form", "tabs", "split", "dashboard", "list"];
  if (!schema.layout) {
    errors.push({ path: "layout", message: 'Missing required "layout" field', code: "MISSING_LAYOUT" });
  } else if (!validLayouts.includes(schema.layout as string)) {
    errors.push({
      path: "layout",
      message: `Invalid layout "${schema.layout}". Must be one of: ${validLayouts.join(", ")}`,
      code: "INVALID_LAYOUT",
    });
  }

  // ── fields check ───────────────────────────────────────────────────────
  if (!Array.isArray(schema.fields)) {
    errors.push({ path: "fields", message: 'Missing or invalid "fields" array', code: "MISSING_FIELDS" });
  } else {
    const validWidgetTypes = new Set([
      "text", "textarea", "password", "email", "url",
      "number", "slider", "stepper",
      "select", "multi-select", "radio", "checkbox", "toggle",
      "date", "time", "datetime", "datetime-optional", "duration",
      "pool-picker", "amp-query", "module-picker", "agent-picker",
      "rich-text-editor", "doc-outline-tree",
      "sheet-row-picker", "cell-range-picker",
      "slide-template-picker", "slide-preview",
      "file-upload", "image-preview", "video-preview",
      "markdown", "badge", "stat", "progress", "image", "divider",
      "tabs", "accordion", "split", "group", "repeater",
      "table", "list", "card-grid",
      "button", "link", "menu",
    ]);

    const fieldIds = new Set<string>();

    for (let i = 0; i < schema.fields.length; i++) {
      const field = schema.fields[i] as Record<string, unknown>;
      const basePath = `fields[${i}]`;

      if (!field.id || typeof field.id !== "string") {
        errors.push({ path: `${basePath}.id`, message: "Field is missing required 'id'", code: "FIELD_MISSING_ID" });
      } else {
        if (fieldIds.has(field.id as string)) {
          errors.push({
            path: `${basePath}.id`,
            message: `Duplicate field id "${field.id}"`,
            code: "DUPLICATE_FIELD_ID",
          });
        }
        fieldIds.add(field.id as string);
        if (!/^[a-z][a-z0-9_-]*$/.test(field.id as string)) {
          errors.push({
            path: `${basePath}.id`,
            message: `Field id "${field.id}" must match ^[a-z][a-z0-9_-]*$`,
            code: "INVALID_FIELD_ID",
          });
        }
      }

      if (!field.type || typeof field.type !== "string") {
        errors.push({ path: `${basePath}.type`, message: "Field is missing required 'type'", code: "FIELD_MISSING_TYPE" });
      } else if (!validWidgetTypes.has(field.type as string)) {
        errors.push({
          path: `${basePath}.type`,
          message: `Unknown widget type "${field.type}". See HUB-025 §6.2 Widget Catalog.`,
          code: "UNKNOWN_WIDGET_TYPE",
        });
      }
    }
  }

  // ── actions check ──────────────────────────────────────────────────────
  if (schema.actions !== undefined && !Array.isArray(schema.actions)) {
    errors.push({ path: "actions", message: '"actions" must be an array if present', code: "INVALID_ACTIONS" });
  } else if (Array.isArray(schema.actions)) {
    const validActionKinds = new Set(["primary", "secondary", "destructive", "ghost"]);
    const actionIds = new Set<string>();

    for (let i = 0; i < schema.actions.length; i++) {
      const action = schema.actions[i] as Record<string, unknown>;
      const basePath = `actions[${i}]`;

      if (!action.id || typeof action.id !== "string") {
        errors.push({ path: `${basePath}.id`, message: "Action is missing required 'id'", code: "ACTION_MISSING_ID" });
      } else {
        if (actionIds.has(action.id as string)) {
          errors.push({ path: `${basePath}.id`, message: `Duplicate action id "${action.id}"`, code: "DUPLICATE_ACTION_ID" });
        }
        actionIds.add(action.id as string);
      }

      if (!action.label || typeof action.label !== "string") {
        errors.push({ path: `${basePath}.label`, message: "Action is missing required 'label'", code: "ACTION_MISSING_LABEL" });
      }

      if (action.kind && !validActionKinds.has(action.kind as string)) {
        errors.push({
          path: `${basePath}.kind`,
          message: `Invalid action kind "${action.kind}". Must be one of: ${[...validActionKinds].join(", ")}`,
          code: "INVALID_ACTION_KIND",
        });
      }

      // mcp and handoff are mutually exclusive
      if (action.mcp && action.handoff) {
        errors.push({
          path: `${basePath}`,
          message: "Action cannot have both 'mcp' and 'handoff'. They are mutually exclusive (HUB-025 §6.5)",
          code: "MCP_HANDOFF_EXCLUSIVE",
        });
      }
    }
  }

  // ── Ajv deep validation (optional, requires ajv to be installed) ────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv = require("ajv") as { new(opts?: Record<string, unknown>): {
      compile(schema: unknown): (data: unknown) => boolean;
      errors: Array<{ instancePath: string; message?: string }> | null;
    }};
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(PANEL_SCHEMA_META);
    const valid = validate(panelSchema);
    if (!valid && ajv.errors) {
      for (const err of ajv.errors) {
        warnings.push(`Ajv: ${err.instancePath || "/"} — ${err.message ?? "validation error"}`);
      }
    }
  } catch {
    // ajv not installed — skip deep validation, surface warning
    warnings.push(
      "ajv is not installed. Install it for deep Schema validation: npm install ajv"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * High-level helper: read and validate a panel.schema.json file.
 */
export async function loadAndValidatePanelSchema(
  schemaPath: string
): Promise<PanelSchemaValidationResult> {
  const fs = await import("fs/promises");

  let content: string;
  try {
    content = await fs.readFile(schemaPath, "utf-8");
  } catch {
    return {
      valid: false,
      errors: [{ path: schemaPath, message: `Cannot read file: ${schemaPath}`, code: "FILE_NOT_FOUND" }],
      warnings: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ path: schemaPath, message: `JSON parse error: ${msg}`, code: "JSON_PARSE_ERROR" }],
      warnings: [],
    };
  }

  return validatePanelSchema(parsed);
}
