/**
 * ExpressionEvaluator
 *
 * JSONLogic expression spec 採用の JSONLogic を json-logic-js 経由で評価する薄いラッパー。
 *
 * Panel Schema v0 の enabled_when / visible_when はシュガー記法（文字列）か
 * JSONLogic オブジェクト（正規形）のどちらかを受け付ける。
 *
 * シュガー記法:
 *   "$when != null"
 *   "$a == 'existing'"
 *   "$a && $b"
 *   "$a != null && $a != 'is_empty'"
 *
 * JSONLogic 正規形:
 *   { "!=": [{ "var": "when" }, null] }
 *
 * @see JSONLogic expression spec.md
 * @see https://jsonlogic.com
 */

// json-logic-js は CommonJS モジュール。型定義は @types/json-logic-js がある。
// TODO: Shell 側で "json-logic-js" をインストール済みであること。
import jsonLogic from "json-logic-js";

import type { Expression } from "../types/schema";

// ---------------------------------------------------------------------------
// Sugar parser
// ---------------------------------------------------------------------------

// シュガー記法で受け入れるトークン
// "$fieldId != null" のような比較式を JSONLogic AST に変換する
// JSONLogic expression spec: シュガー変換仕様は Panel Schema v0 実装時に確定する、とされているため
//          v0 は最小限の変換ルールのみ実装し、未対応は警告を出す

type JsonLogicNode = Record<string, unknown>;

/**
 * "$varName" を { "var": "varName" } に変換する。
 */
function parseVarRef(token: string): JsonLogicNode | string {
  const match = token.trim().match(/^\$([A-Za-z_][A-Za-z0-9_.]*)/);
  if (match) {
    return { var: match[1] };
  }
  // リテラル値の処理
  const trimmed = token.trim();
  if (trimmed === "null") return null as unknown as string;
  if (trimmed === "true") return true as unknown as string;
  if (trimmed === "false") return false as unknown as string;
  // 数値リテラル
  const num = Number(trimmed);
  if (!isNaN(num)) return num as unknown as string;
  // 文字列リテラル（クォート除去）
  const strMatch = trimmed.match(/^['"](.*)['"]$/);
  if (strMatch && strMatch[1] !== undefined) return strMatch[1];

  // 不明トークン（そのまま文字列として返す）
  console.warn(`[ExpressionEvaluator] Unknown token: "${token}"`);
  return trimmed;
}

/**
 * 単純な二項比較式 ("$a != null", "$a == 'existing'") をパースする。
 */
function parseBinaryOp(expr: string): JsonLogicNode | null {
  const OPS: [string, string][] = [
    ["!=", "!="],
    ["==", "=="],
    [">=", ">="],
    ["<=", "<="],
    [">", ">"],
    ["<", "<"],
  ];

  for (const [sugarOp, jlOp] of OPS) {
    const idx = expr.indexOf(sugarOp);
    if (idx !== -1) {
      const left = parseVarRef(expr.slice(0, idx));
      const right = parseVarRef(expr.slice(idx + sugarOp.length));
      return { [jlOp]: [left, right] };
    }
  }
  return null;
}

/**
 * シュガー記法文字列を JSONLogic AST に変換する。
 *
 * サポートする構文:
 * - "$a != null"
 * - "$a == 'value'"
 * - "$a && $b"  (&&)
 * - "$a || $b"  (||)
 * - 上記の組み合わせ（左結合、演算子優先度: && > ||）
 *
 * TODO: 優先度付きパーサを実装する（v0 は単純 split のみ）
 * TODO: 括弧のサポート（v1）
 */
function parseSugar(expr: string): JsonLogicNode {
  // ||  で分割
  const orParts = expr.split("||").map((s) => s.trim());
  if (orParts.length > 1) {
    const parsed = orParts.map((part) => parseSugar(part));
    return { or: parsed };
  }

  // && で分割
  const andParts = expr.split("&&").map((s) => s.trim());
  if (andParts.length > 1) {
    const parsed = andParts.map((part) => parseSugar(part));
    return { and: parsed };
  }

  // 二項比較
  const binOp = parseBinaryOp(expr);
  if (binOp) return binOp;

  // 単純な変数参照（真偽評価）
  const varRef = parseVarRef(expr);
  if (typeof varRef === "object" && varRef !== null && "var" in varRef) {
    return varRef as JsonLogicNode;
  }

  // フォールバック: 評価できない → 警告して true（表示 / 有効）を返す
  console.warn(
    `[ExpressionEvaluator] Cannot parse sugar expression: "${expr}". Falling back to true.`
  );
  return { "==": [1, 1] }; // always true
}

// ---------------------------------------------------------------------------
// ExpressionEvaluator
// ---------------------------------------------------------------------------

/**
 * 式評価の入力コンテキスト。
 * キーはフィールド ID、値はそのフィールドの現在値。
 */
export type ExpressionContext = Record<string, unknown>;

/**
 * 式を評価するメインクラス。
 *
 * 使い方:
 * ```ts
 * const evaluator = new ExpressionEvaluator();
 * const ctx = { db_id: "abc", db_filter_property: null };
 * const isVisible = evaluator.evaluate("$db_id != null", ctx); // true
 * ```
 */
export class ExpressionEvaluator {
  /**
   * Expression（シュガー文字列 または JSONLogic オブジェクト）を評価する。
   *
   * @param expression  評価する式
   * @param context     フィールド値マップ
   * @param defaultValue  評価失敗時のデフォルト値（デフォルト: false）
   * @returns           評価結果（boolean）
   */
  evaluate(
    expression: Expression,
    context: ExpressionContext,
    defaultValue = false
  ): boolean {
    try {
      let logic: JsonLogicNode;

      if (typeof expression === "string") {
        logic = parseSugar(expression.trim());
      } else if (typeof expression === "object" && expression !== null) {
        logic = expression as JsonLogicNode;
      } else {
        console.warn("[ExpressionEvaluator] Invalid expression:", expression);
        return defaultValue;
      }

      const result = jsonLogic.apply(logic, context);
      return Boolean(result);
    } catch (err) {
      console.error("[ExpressionEvaluator] Evaluation error:", err, expression);
      return defaultValue;
    }
  }

  /**
   * visible_when を評価する。
   * 式が未定義の場合は常に表示（true）を返す。
   */
  isVisible(
    expression: Expression | undefined,
    context: ExpressionContext
  ): boolean {
    if (expression === undefined || expression === null) return true;
    return this.evaluate(expression, context, true);
  }

  /**
   * enabled_when を評価する。
   * 式が未定義の場合は常に有効（true）を返す。
   */
  isEnabled(
    expression: Expression | undefined,
    context: ExpressionContext
  ): boolean {
    if (expression === undefined || expression === null) return true;
    return this.evaluate(expression, context, true);
  }
}

/** シングルトンインスタンス（再利用推奨） */
export const expressionEvaluator = new ExpressionEvaluator();
