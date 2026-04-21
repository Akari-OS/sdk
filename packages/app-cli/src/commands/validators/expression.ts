/**
 * expression.ts — JSONLogic 式 syntactic validator (ADR-012)
 *
 * Validates `enabled_when` / `visible_when` expressions found in:
 *   - panel.schema.json fields and actions (HUB-025 §6.4, §6.5)
 *
 * Supports:
 *   1. JSONLogic object syntax:  { "!=": [{ "var": "when" }, null] }
 *   2. Sugar string syntax:      "$when != null"  (converted to JSONLogic internally)
 *
 * ADR-012 Decision:
 *   - JSONLogic is adopted as the expression language.
 *   - Sugar strings are spec-internal shorthand that compilers convert to JSONLogic form.
 *   - Only null checks, comparisons, and logical operators are used in v0.
 *
 * Dependencies (add to package.json):
 *   json-logic-js — JSONLogic evaluator for syntactic validation
 *   (npm install json-logic-js)
 *
 * Reference: ADR-012-panel-schema-expression-language.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionValidationResult {
  valid: boolean;
  errors: ExpressionError[];
  warnings: string[];
  expressionType: "jsonlogic" | "sugar" | "unknown";
  normalizedJsonLogic?: unknown;
}

export interface ExpressionError {
  path: string;
  expression: string | unknown;
  message: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Sugar → JSONLogic conversion
// ---------------------------------------------------------------------------

/**
 * Check if a value looks like a sugar expression string.
 * Sugar strings begin with '$' or contain familiar comparison operators.
 *
 * Examples:
 *   "$when != null"
 *   "$count > 0"
 *   "$text && $media"
 */
function isSugarString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\$[a-z]/.test(value.trim()) || /\$[a-z][a-z0-9_]* (!=|==|>|<|>=|<=)/.test(value);
}

/**
 * Minimal sugar → JSONLogic converter.
 * Only handles the patterns explicitly needed for v0 (ADR-012):
 *   "$x != null"     → { "!=": [{"var": "x"}, null] }
 *   "$x == null"     → { "==": [{"var": "x"}, null] }
 *   "$x"             → { "var": "x" }   (truthiness check)
 *   "$x != null && $y" — not supported in v0, returns null (caller emits warning)
 *
 * Full sugar parser is deferred to HUB-025 T-2 implementation.
 */
export function sugarToJsonLogic(sugar: string): unknown | null {
  const trimmed = sugar.trim();

  // "$x != null"
  const neqNull = /^\$([a-z][a-z0-9_]*)\s*!=\s*null$/.exec(trimmed);
  if (neqNull) {
    return { "!=": [{ var: neqNull[1] }, null] };
  }

  // "$x == null"
  const eqNull = /^\$([a-z][a-z0-9_]*)\s*==\s*null$/.exec(trimmed);
  if (eqNull) {
    return { "==": [{ var: eqNull[1] }, null] };
  }

  // "$x > 0"
  const gtNum = /^\$([a-z][a-z0-9_]*)\s*>\s*(\d+)$/.exec(trimmed);
  if (gtNum) {
    return { ">": [{ var: gtNum[1] }, Number(gtNum[2])] };
  }

  // "$x >= 0"
  const gteNum = /^\$([a-z][a-z0-9_]*)\s*>=\s*(\d+)$/.exec(trimmed);
  if (gteNum) {
    return { ">=": [{ var: gteNum[1] }, Number(gteNum[2])] };
  }

  // "$x" — bare field reference (truthy check)
  const bareRef = /^\$([a-z][a-z0-9_]*)$/.exec(trimmed);
  if (bareRef) {
    return { var: bareRef[1] };
  }

  // Compound / unsupported — return null
  return null;
}

// ---------------------------------------------------------------------------
// JSONLogic structural validator
// ---------------------------------------------------------------------------

/**
 * Allowed JSONLogic operators for Panel Schema v0 (ADR-012).
 * Compound boolean operators and null/equality comparisons only.
 * v1 may extend this set via custom operators.
 */
const ALLOWED_OPERATORS = new Set([
  "var",
  "==", "!=", ">", ">=", "<", "<=",
  "and", "or", "not", "!",
  "if",
  "in",
  // null/missing checks
  "missing", "missing_some",
]);

/**
 * Recursively validate a JSONLogic object structure.
 * Checks that all operators are in the allowed set and the structure is valid.
 */
function validateJsonLogicStructure(
  logic: unknown,
  path: string,
  errors: ExpressionError[]
): void {
  if (logic === null || typeof logic !== "object" || Array.isArray(logic)) {
    // Primitives and arrays are valid as JSONLogic values (data references, literals)
    return;
  }

  const obj = logic as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length !== 1) {
    errors.push({
      path,
      expression: logic,
      message: `JSONLogic operator object must have exactly 1 key, got [${keys.join(", ")}]`,
      code: "JSONLOGIC_MULTIPLE_KEYS",
    });
    return;
  }

  const operator = keys[0];

  if (!ALLOWED_OPERATORS.has(operator)) {
    errors.push({
      path,
      expression: logic,
      message: `JSONLogic operator "${operator}" is not permitted in Panel Schema v0. ` +
        `Allowed: ${[...ALLOWED_OPERATORS].join(", ")}. ` +
        "Custom operators are planned for v1 (ADR-012).",
      code: "JSONLOGIC_DISALLOWED_OPERATOR",
    });
    return;
  }

  // Recurse into operands
  const operands = obj[operator];
  if (Array.isArray(operands)) {
    for (let i = 0; i < operands.length; i++) {
      validateJsonLogicStructure(operands[i], `${path}/${operator}[${i}]`, errors);
    }
  } else if (typeof operands === "object" && operands !== null) {
    validateJsonLogicStructure(operands, `${path}/${operator}`, errors);
  }
  // Primitive operands (strings, numbers, null, boolean) are fine as-is
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a single expression value (enabled_when / visible_when).
 */
export function validateExpression(
  expression: unknown,
  contextPath: string
): ExpressionValidationResult {
  const errors: ExpressionError[] = [];
  const warnings: string[] = [];

  // Sugar string path
  if (isSugarString(expression)) {
    const converted = sugarToJsonLogic(expression as string);
    if (converted === null) {
      warnings.push(
        `Expression "${expression}" at ${contextPath} looks like a sugar string but could not be parsed. ` +
          "Use JSONLogic object syntax for complex expressions (ADR-012). " +
          "Full sugar parser is planned for HUB-025 T-2."
      );
      return {
        valid: true, // warn but don't fail — may be valid JSON sugar not yet parsed
        errors: [],
        warnings,
        expressionType: "sugar",
      };
    }

    // Validate the converted JSONLogic
    validateJsonLogicStructure(converted, contextPath, errors);
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      expressionType: "sugar",
      normalizedJsonLogic: converted,
    };
  }

  // JSONLogic object path
  if (typeof expression === "object" && expression !== null && !Array.isArray(expression)) {
    validateJsonLogicStructure(expression, contextPath, errors);

    // Optional: use json-logic-js to attempt evaluation with dummy data
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jsonLogic = require("json-logic-js") as { apply: (logic: unknown, data: unknown) => unknown };
      try {
        jsonLogic.apply(expression, {});
        // Evaluation succeeded — no runtime errors
      } catch {
        warnings.push(
          `json-logic-js could not evaluate expression at ${contextPath} with empty data — this is expected for field references, but may indicate a malformed rule.`
        );
      }
    } catch {
      warnings.push("json-logic-js is not installed. Install it for runtime expression validation: npm install json-logic-js");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      expressionType: "jsonlogic",
      normalizedJsonLogic: expression,
    };
  }

  // Unknown / unsupported type
  errors.push({
    path: contextPath,
    expression,
    message: `Expression at ${contextPath} must be a JSONLogic object or a sugar string, got ${typeof expression}`,
    code: "EXPRESSION_INVALID_TYPE",
  });

  return {
    valid: false,
    errors,
    warnings,
    expressionType: "unknown",
  };
}

/**
 * Scan a panel.schema.json object and validate all expression fields.
 *
 * Checks:
 *   - fields[*].enabled_when / visible_when
 *   - actions[*].enabled_when / visible_when
 */
export function validateAllExpressions(panelSchema: unknown): {
  valid: boolean;
  errors: ExpressionError[];
  warnings: string[];
} {
  const allErrors: ExpressionError[] = [];
  const allWarnings: string[] = [];

  if (typeof panelSchema !== "object" || panelSchema === null) {
    return { valid: true, errors: [], warnings: [] };
  }

  const schema = panelSchema as Record<string, unknown>;

  // Validate field expressions
  if (Array.isArray(schema.fields)) {
    for (let i = 0; i < schema.fields.length; i++) {
      const field = schema.fields[i] as Record<string, unknown>;
      for (const prop of ["enabled_when", "visible_when"] as const) {
        if (field[prop] !== undefined) {
          const result = validateExpression(field[prop], `fields[${i}].${prop}`);
          allErrors.push(...result.errors);
          allWarnings.push(...result.warnings);
        }
      }
    }
  }

  // Validate action expressions
  if (Array.isArray(schema.actions)) {
    for (let i = 0; i < schema.actions.length; i++) {
      const action = schema.actions[i] as Record<string, unknown>;
      for (const prop of ["enabled_when", "visible_when"] as const) {
        if (action[prop] !== undefined) {
          const result = validateExpression(action[prop], `actions[${i}].${prop}`);
          allErrors.push(...result.errors);
          allWarnings.push(...result.warnings);
        }
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
