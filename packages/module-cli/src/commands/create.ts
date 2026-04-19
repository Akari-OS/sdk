/**
 * `akari-module-cli create <name> [--tier <full|mcp-declarative>]`
 *
 * Scaffolds a new AKARI module directory from Handlebars templates.
 * Spec contract: AKARI-HUB-024 §6.9 (Toolchain) + §6.2 (Module Tier).
 * Naming convention for agent IDs: ADR-011.
 */

import path from "path";
import { Command } from "commander";
import fs from "fs-extra";
import Handlebars from "handlebars";
import chalk from "chalk";
import { select, input } from "@inquirer/prompts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = "full" | "mcp-declarative";

interface TemplateVars {
  moduleId: string;          // e.g. "com.user.my-module"
  moduleName: string;        // e.g. "My Module"
  moduleSlug: string;        // e.g. "my-module"
  moduleShortId: string;     // e.g. "my_module" (snake_case, last segment of reverse-domain)
  category: string;          // e.g. "productivity"
  tier: Tier;
  author: string;
  year: string;
  sdkRange: string;
}

// ---------------------------------------------------------------------------
// Template expansion helpers
// ---------------------------------------------------------------------------

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

/**
 * Recursively walk a template directory, render each *.hbs file with Handlebars,
 * and write the output (without the .hbs extension) into `destDir`.
 */
async function expandTemplate(
  templateDir: string,
  destDir: string,
  vars: TemplateVars
): Promise<void> {
  const entries = await fs.readdir(templateDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(templateDir, entry.name);
    // Render the entry name itself (allows {{moduleName}} in dir/file names)
    const renderedName = Handlebars.compile(entry.name)(vars).replace(/\.hbs$/, "");
    const destPath = path.join(destDir, renderedName);

    if (entry.isDirectory()) {
      await fs.ensureDir(destPath);
      await expandTemplate(srcPath, destPath, vars);
    } else if (entry.name.endsWith(".hbs")) {
      const template = await fs.readFile(srcPath, "utf8");
      const rendered = Handlebars.compile(template)(vars);
      await fs.outputFile(destPath, rendered);
    } else {
      // Non-template files are copied as-is
      await fs.copy(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Variable derivation
// ---------------------------------------------------------------------------

/** Convert a kebab-case slug to Title Case display name */
function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Convert the last segment of a reverse-domain ID to snake_case module-short-id (ADR-011) */
function moduleShortIdFromId(moduleId: string): string {
  const last = moduleId.split(".").at(-1) ?? moduleId;
  return last.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerCreateCommand(program: Command): void {
  program
    .command("create <name>")
    .description(
      "Scaffold a new AKARI module (Full or MCP-Declarative tier)"
    )
    .option(
      "--tier <tier>",
      "Module tier: full | mcp-declarative (interactive if omitted)"
    )
    .option(
      "--author <author>",
      "Author name (defaults to $USER or 'anonymous')"
    )
    .option(
      "--category <category>",
      "Module category, e.g. productivity, sns, research"
    )
    .action(async (name: string, opts: { tier?: string; author?: string; category?: string }) => {
      // -----------------------------------------------------------------------
      // 1. Validate name (kebab-case slug)
      // -----------------------------------------------------------------------
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        console.error(
          chalk.red(
            `Error: module name "${name}" must be kebab-case (lowercase letters, digits, hyphens) and start with a letter.`
          )
        );
        process.exit(1);
      }

      const destDir = path.resolve(process.cwd(), name);
      if (await fs.pathExists(destDir)) {
        console.error(chalk.red(`Error: directory "${name}" already exists.`));
        process.exit(1);
      }

      // -----------------------------------------------------------------------
      // 2. Resolve tier (interactive if not provided)
      // -----------------------------------------------------------------------
      let tier: Tier;
      if (opts.tier) {
        if (opts.tier !== "full" && opts.tier !== "mcp-declarative") {
          console.error(
            chalk.red(`Error: --tier must be "full" or "mcp-declarative", got "${opts.tier}".`)
          );
          process.exit(1);
        }
        tier = opts.tier as Tier;
      } else {
        tier = await select({
          message: "Select module tier:",
          choices: [
            {
              name: "Full — React/Rust panel + agents + skills (richer UI, heavier review)",
              value: "full" as Tier,
            },
            {
              name: "MCP-Declarative — MCP server + panel.schema.json (lightweight, schema-driven UI)",
              value: "mcp-declarative" as Tier,
            },
          ],
        });
      }

      // -----------------------------------------------------------------------
      // 3. Gather remaining variables (with defaults)
      // -----------------------------------------------------------------------
      const authorDefault = opts.author ?? process.env.USER ?? "anonymous";
      const categoryDefault = opts.category ?? "productivity";

      const author =
        opts.author ??
        (await input({
          message: "Author name:",
          default: authorDefault,
        }));

      const category =
        opts.category ??
        (await input({
          message: "Category (e.g. productivity, sns, research):",
          default: categoryDefault,
        }));

      // Module ID follows reverse-domain convention (ADR-011 / HUB-024 §6.7)
      const moduleId = `com.user.${name}`;
      const moduleSlug = name;
      const moduleName = slugToName(name);
      const moduleShortId = moduleShortIdFromId(moduleId);

      const vars: TemplateVars = {
        moduleId,
        moduleName,
        moduleSlug,
        moduleShortId,
        category,
        tier,
        author,
        year: String(new Date().getFullYear()),
        sdkRange: ">=0.1.0 <1.0",
      };

      // -----------------------------------------------------------------------
      // 4. Expand templates
      // -----------------------------------------------------------------------
      const templateDir = path.join(TEMPLATES_DIR, tier);

      if (!(await fs.pathExists(templateDir))) {
        console.error(
          chalk.red(`Error: template directory not found for tier "${tier}": ${templateDir}`)
        );
        process.exit(1);
      }

      console.log();
      console.log(
        chalk.cyan(`Creating ${tier} module`) +
          chalk.white(` "${moduleName}"`) +
          chalk.dim(` → ./${name}/`)
      );

      await fs.ensureDir(destDir);
      await expandTemplate(templateDir, destDir, vars);

      // -----------------------------------------------------------------------
      // 5. Success message
      // -----------------------------------------------------------------------
      console.log();
      console.log(chalk.green("Module scaffolded successfully!"));
      console.log();
      console.log("  Module ID   :", chalk.bold(moduleId));
      console.log("  Tier        :", chalk.bold(tier));
      console.log("  Directory   :", chalk.bold(`./${name}/`));
      console.log();
      console.log("Next steps:");
      console.log(chalk.dim(`  cd ${name}`));
      console.log(chalk.dim("  npm install"));
      console.log(chalk.dim("  akari dev"));
      console.log();
      console.log(
        chalk.dim("When ready: akari module certify (Phase 2b)")
      );
    });
}
