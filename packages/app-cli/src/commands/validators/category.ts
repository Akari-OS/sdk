/**
 * category.ts — App category enum lint (ADR-013)
 *
 * Validates the [app] category field in akari.toml against:
 *   - Core 11 fixed enum (HUB-005)
 *   - or x-<kebab-slug> extension pattern
 *
 * Reference: ADR-013-capability-app-category-enum.md
 */

// ---------------------------------------------------------------------------
// Core 11 Category Enum (HUB-005 / ADR-013)
// ---------------------------------------------------------------------------

/**
 * The fixed Core 11 category values managed by AKARI-HUB-005.
 * Any of these strings is valid as-is.
 */
export const CORE_CATEGORIES = [
  "publishing",
  "documents",
  "design",
  "asset-generation",
  "research",
  "translation",
  "analytics",
  "notification",
  "storage",
  "commerce",
  "community",
] as const;

export type CoreCategory = (typeof CORE_CATEGORIES)[number];

/**
 * Extension category pattern: x-<kebab-slug>
 * e.g. x-education, x-health, x-legal
 * Must be lowercase, start with a letter after 'x-'.
 * (ADR-013 §Decision)
 */
const EXTENSION_CATEGORY_PATTERN = /^x-[a-z][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryLintResult {
  valid: boolean;
  errors: CategoryLintError[];
  warnings: string[];
  isCore: boolean;
  isExtension: boolean;
}

export interface CategoryLintError {
  field: string;
  message: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a single category string.
 */
export function validateCategory(category: unknown): CategoryLintResult {
  const errors: CategoryLintError[] = [];
  const warnings: string[] = [];

  if (category === undefined || category === null || category === "") {
    // category is recommended but may be missing (manifest.ts warns separately)
    return { valid: true, errors: [], warnings: ["[app] category is not set — recommended for Marketplace filtering"], isCore: false, isExtension: false };
  }

  if (typeof category !== "string") {
    return {
      valid: false,
      errors: [{ field: "[app] category", message: "category must be a string", code: "CATEGORY_NOT_STRING" }],
      warnings,
      isCore: false,
      isExtension: false,
    };
  }

  const isCore = (CORE_CATEGORIES as readonly string[]).includes(category);
  const isExtension = EXTENSION_CATEGORY_PATTERN.test(category);

  if (!isCore && !isExtension) {
    errors.push({
      field: "[app] category",
      message:
        `Invalid category "${category}". ` +
        `Must be one of the Core 11 categories (${CORE_CATEGORIES.join(", ")}) ` +
        `or a custom extension using the "x-<slug>" prefix (e.g. "x-education", "x-health"). ` +
        `See ADR-013.`,
      code: "INVALID_CATEGORY",
    });
  }

  if (isExtension) {
    warnings.push(
      `Category "${category}" is a custom extension (x-prefix). ` +
        "It will appear under 'Custom' in the Marketplace rather than a named category filter. " +
        "If this category represents a common need, consider proposing it for Core inclusion via HUB-005."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    isCore,
    isExtension,
  };
}

/**
 * Convenience: validate category from a parsed manifest object.
 */
export function validateCategoryFromManifest(manifest: {
  app?: { category?: unknown };
}): CategoryLintResult {
  return validateCategory(manifest.app?.category);
}
