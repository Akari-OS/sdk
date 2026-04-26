/**
 * @file compatibility.ts
 * Compatibility Manifest types and validation for `compatibility.toml`.
 *
 * Each component (Shell, Agents, Pool impl, SDK, and protocol implementations)
 * declares its version and the version ranges of its dependencies in a
 * `compatibility.toml` file at the repo root.
 *
 * This module provides TypeScript types for parsing and validating such manifests,
 * as well as utility functions for SemVer range checking.
 *
 * @see spec-os-update-and-compatibility.md §6.4
 * @example
 * ```typescript
 * import type {
 *   CompatibilityManifest,
 *   ComponentSpec,
 *   DependencyConstraints,
 * } from "@akari-os/sdk"
 * import { validateCompatibilityManifest } from "@akari-os/sdk"
 *
 * const manifest: CompatibilityManifest = {
 *   component: {
 *     name: "shell",
 *     version: "0.4.2",
 *   },
 *   requires: {
 *     agents: ">=0.3.0, <0.5.0",
 *     pool_impl: ">=0.5.0, <0.7.0",
 *     sdk: ">=0.5.0, <0.6.0",
 *     m2c_protocol: "^0.2",
 *   },
 *   provides: {
 *     shell_api: "0.4",
 *   },
 * }
 *
 * const valid = validateCompatibilityManifest(manifest)
 * if (!valid) console.error("Invalid manifest")
 * ```
 */

/**
 * Component identifier (e.g., "shell", "agents", "pool_impl").
 * Must be kebab-case or snake_case for TOML compatibility.
 */
export type ComponentName =
  | "shell"
  | "agents"
  | "pool_impl"
  | "sdk"
  | "m2c_protocol"
  | "amp_protocol"
  | "ace_protocol"
  | string

/**
 * SemVer version string (e.g., "0.4.2", "1.0.0").
 */
export type SemVerVersion = string & { readonly __brand: "SemVerVersion" }

/**
 * Version range constraint using SemVer range syntax.
 * Supports:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (compatible within major)
 * - Tilde: "~1.2.3" (compatible within minor)
 * - Comparison: ">=1.0.0", "<=2.0.0", "=1.2.3", ">1.0.0", "<2.0.0"
 * - Range: ">=1.0.0, <2.0.0" (comma-separated AND conditions)
 *
 * @see https://semver.org/
 * @see https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html
 */
export type VersionRange = string

/**
 * Dependency constraints for a single component.
 * Maps component name to version range.
 */
export type DependencyConstraints = Record<ComponentName, VersionRange>

/**
 * Provided API surface and their versions.
 * Allows components to declare what APIs they expose and at what version.
 */
export type ProvidesMap = Record<string, SemVerVersion>

/**
 * Component metadata (name and version).
 */
export interface ComponentSpec {
  /**
   * Component name (e.g., "shell", "agents").
   * Should match directory/repo name in kebab-case or snake_case.
   */
  name: ComponentName

  /**
   * Component's semantic version (e.g., "0.4.2").
   * Used as the version of this component in compatibility checks.
   */
  version: SemVerVersion
}

/**
 * Complete compatibility manifest for a component.
 *
 * Parsed from `compatibility.toml` in the component repo root.
 * Declares the component's version and its dependency version ranges.
 */
export interface CompatibilityManifest {
  /**
   * Component identification (name and version).
   */
  component: ComponentSpec

  /**
   * Required versions of upstream dependencies.
   * Maps component name to version range constraint.
   *
   * Example:
   * ```
   * requires = {
   *   agents: ">=0.3.0, <0.5.0",
   *   pool_impl: ">=0.5.0, <0.7.0",
   *   sdk: ">=0.5.0, <0.6.0",
   *   m2c_protocol: "^0.2",
   * }
   * ```
   */
  requires?: DependencyConstraints

  /**
   * API surface provided by this component and their versions.
   * Maps API name to version number.
   *
   * Example:
   * ```
   * provides = {
   *   shell_api: "0.4",
   *   window_manager_api: "0.2",
   * }
   * ```
   */
  provides?: ProvidesMap
}

/**
 * Parsed SemVer version for comparison operations.
 */
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease?: string
  metadata?: string
}

/**
 * Validation error for compatibility manifests.
 */
export interface ValidationError {
  field: string
  message: string
}

/**
 * Result of validating a compatibility manifest.
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validates a compatibility manifest structure and content.
 *
 * Checks:
 * - `component.name` is non-empty string
 * - `component.version` is valid SemVer format
 * - `requires` (if present) contains valid version range strings
 * - `provides` (if present) contains valid version strings
 *
 * @param manifest - The manifest to validate
 * @returns Validation result with errors list if invalid
 *
 * @example
 * ```typescript
 * const result = validateCompatibilityManifest(manifest)
 * if (!result.valid) {
 *   console.error("Manifest errors:", result.errors)
 * }
 * ```
 */
export function validateCompatibilityManifest(
  manifest: unknown
): ValidationResult {
  const errors: ValidationError[] = []

  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      errors: [{ field: "root", message: "Manifest must be an object" }],
    }
  }

  const m = manifest as Record<string, unknown>

  // Validate component section
  if (!m.component || typeof m.component !== "object") {
    errors.push({ field: "component", message: "component section is required" })
  } else {
    const comp = m.component as Record<string, unknown>

    if (!comp.name || typeof comp.name !== "string" || comp.name.length === 0) {
      errors.push({
        field: "component.name",
        message: "component.name must be a non-empty string",
      })
    }

    if (!comp.version || typeof comp.version !== "string") {
      errors.push({
        field: "component.version",
        message: "component.version must be a string",
      })
    } else if (!isValidSemVer(comp.version as string)) {
      errors.push({
        field: "component.version",
        message: `component.version "${comp.version}" is not valid SemVer`,
      })
    }
  }

  // Validate requires section (optional)
  if (m.requires !== undefined) {
    if (typeof m.requires !== "object" || m.requires === null) {
      errors.push({
        field: "requires",
        message: "requires must be an object",
      })
    } else {
      const reqs = m.requires as Record<string, unknown>
      for (const key in reqs) {
        const value = reqs[key]
        if (typeof value !== "string") {
          errors.push({
            field: `requires.${key}`,
            message: `requires.${key} must be a string, got ${typeof value}`,
          })
        } else if (!isValidVersionRange(value)) {
          errors.push({
            field: `requires.${key}`,
            message: `requires.${key} "${value}" is not a valid version range`,
          })
        }
      }
    }
  }

  // Validate provides section (optional)
  if (m.provides !== undefined) {
    if (typeof m.provides !== "object" || m.provides === null) {
      errors.push({
        field: "provides",
        message: "provides must be an object",
      })
    } else {
      const prov = m.provides as Record<string, unknown>
      for (const key in prov) {
        const value = prov[key]
        if (typeof value !== "string") {
          errors.push({
            field: `provides.${key}`,
            message: `provides.${key} must be a string, got ${typeof value}`,
          })
        } else if (!isValidSemVer(value)) {
          errors.push({
            field: `provides.${key}`,
            message: `provides.${key} "${value}" is not valid SemVer`,
          })
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Checks if a string is a valid SemVer version.
 *
 * Accepts:
 * - "1.2.3"
 * - "0.0.0"
 * - "1.2.3-alpha.1"
 * - "1.2.3+build.123"
 * - "1.2.3-rc.1+build.456"
 *
 * @param version - Version string to validate
 * @returns true if valid SemVer format
 */
export function isValidSemVer(version: string): boolean {
  // SemVer regex per https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
  return semverRegex.test(version)
}

/**
 * Checks if a string is a valid version range (SemVer constraint).
 *
 * Accepts:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3"
 * - Tilde: "~1.2.3"
 * - Comparison: ">=1.0.0", "<=2.0.0", ">1.0.0", "<2.0.0", "=1.2.3"
 * - Range: ">=1.0.0, <2.0.0" (comma-separated AND)
 *
 * @param range - Version range string to validate
 * @returns true if valid version range format
 */
export function isValidVersionRange(range: string): boolean {
  if (!range || typeof range !== "string") return false

  // Trim whitespace
  const trimmed = range.trim()
  if (trimmed.length === 0) return false

  // Split by comma for compound ranges
  const parts = trimmed.split(",").map((s) => s.trim())

  for (const part of parts) {
    if (!part) return false

    // Check for exact version (^X.Y.Z or ~X.Y.Z or plain X.Y.Z)
    if (/^[\^~]?/.test(part)) {
      // Caret or tilde prefix
      const versionPart = part.replace(/^[\^~]/, "")
      if (!isValidSemVer(versionPart)) return false
    } else if (/^(>=|<=|>|<|=)/.test(part)) {
      // Comparison operator
      const versionPart = part.replace(/^(>=|<=|>|<|=)/, "")
      if (!isValidSemVer(versionPart)) return false
    } else {
      // Assume it's a bare version
      if (!isValidSemVer(part)) return false
    }
  }

  return true
}

/**
 * Parses a SemVer version string into components.
 *
 * @param version - SemVer version string (e.g., "1.2.3-alpha.1+build.123")
 * @returns Parsed version components, or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parseSemVer("1.2.3-alpha.1")
 * if (parsed) {
 *   console.log(parsed.major) // 1
 *   console.log(parsed.minor) // 2
 *   console.log(parsed.patch) // 3
 *   console.log(parsed.prerelease) // "alpha.1"
 * }
 * ```
 */
export function parseSemVer(version: string): ParsedVersion | null {
  if (!isValidSemVer(version)) return null

  // Match SemVer components
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/
  )
  if (!match) return null

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    metadata: match[5],
  }
}

/**
 * Compares two parsed SemVer versions.
 *
 * @param a - First parsed version
 * @param b - Second parsed version
 * @returns negative if a < b, zero if a == b, positive if a > b
 *
 * @example
 * ```typescript
 * const v1 = parseSemVer("1.0.0")!
 * const v2 = parseSemVer("1.1.0")!
 * console.log(compareVersions(v1, v2)) // negative (v1 < v2)
 * ```
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  // Compare major.minor.patch
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch

  // Compare prerelease (versions without prerelease > versions with prerelease)
  const aHasPrerelease = a.prerelease !== undefined
  const bHasPrerelease = b.prerelease !== undefined

  if (aHasPrerelease && !bHasPrerelease) return -1
  if (!aHasPrerelease && bHasPrerelease) return 1
  if (!aHasPrerelease && !bHasPrerelease) return 0

  // Both have prerelease, compare lexicographically
  // (simplified: exact string comparison; full semver would split by dots)
  return (a.prerelease ?? "").localeCompare(b.prerelease ?? "")
}
