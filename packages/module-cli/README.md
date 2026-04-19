# @akari-os/module-cli

CLI for scaffolding, developing, and certifying [AKARI OS](https://github.com/akari-os) modules.
Implements the Toolchain defined in [AKARI-HUB-024 §6.9](./docs/).

```
create-next-app for AKARI modules
```

---

## Installation

```bash
npm install -g @akari-os/module-cli
```

> After installation both `akari-module-cli` and `akari` are available as commands.

---

## Usage

### Scaffold a new module

```bash
# Interactive (prompts for tier, author, category)
akari-module-cli create my-module

# With all options
akari-module-cli create my-module --tier mcp-declarative --author "Your Name" --category sns

# Full Tier (React panel + agents + skills)
akari-module-cli create my-writer-plus --tier full
```

This creates `./<name>/` with a ready-to-run module scaffold.

### Start local dev server

```bash
cd my-module
npm install
akari dev           # hot-reload dev server, mounts module into local Shell
```

> `akari dev` is implemented in Phase 2b. Running it now prints a helpful message.

### Certify a module

```bash
akari module certify   # Automated Lint + Contract Tests (HUB-024 §6.8)
```

> `akari module certify` is implemented in Phase 2b (`src/commands/certify.ts`).

### Publish

```bash
# AKARI Marketplace (requires certify to pass + Manual Review for Full Tier)
akari module publish

# Self-distribution via npm (Automated Lint + Contract Test only)
npm publish
```

### Install a module (user side)

```bash
akari module add com.akari.writer
akari module add @user/my-writer-plus
```

---

## Tier Selection Guide

AKARI modules come in two tiers (AKARI-HUB-024 §6.2):

| | **Full Tier** | **MCP-Declarative Tier** |
|---|---|---|
| **What you write** | `akari.toml` + React panel + agents | `akari.toml` + MCP server + `panel.schema.json` |
| **UI freedom** | High — any React component | Medium — Shell generic renderer draws the UI |
| **Review weight** | Heavy (Automated + Contract + Manual Review for Marketplace) | Light (Automated + Contract only; schema & MCP contract audit) |
| **Upgrade path** | — | Can promote to Full Tier later (`tier = "full"`) |
| **Typical use** | Writer, Video, rich editor UX | SNS posting, API wrappers, form-driven tools |

**When to use MCP-Declarative:**
- Your UI fits forms / lists / tabs (standard widgets cover 90% of cases)
- You want the lightest review path to Marketplace
- You are wrapping an existing MCP server or REST API

**When to use Full:**
- You need custom React components beyond standard widgets
- You need a Rust-backed panel (e.g. video editing, heavy computation)
- You need fine-grained control over Shell panel layout

**Migration:** Start MCP-Declarative, upgrade to Full when needed — no data migration required.

---

## What the scaffolds generate

### Full Tier (`--tier full`)

```
my-module/
├── akari.toml               Manifest: tier, permissions, panels, agents (HUB-024 §6.5)
├── package.json
├── README.md
├── .gitignore
└── src/
    ├── index.ts             Entry: shell.mountPanel() + skill.register()
    └── panel.tsx            React panel (uses @akari/sdk pool, amp, shell APIs)
```

Example generated `akari.toml`:
```toml
[module]
id   = "com.user.my-module"
tier = "full"
sdk  = ">=0.1.0 <1.0"

[panels]
main = { title = "My Module", mount = "panels/main.tsx" }

[agents]
my_module_assistant = "agents/assistant.md"
```

### MCP-Declarative Tier (`--tier mcp-declarative`)

```
my-module/
├── akari.toml               Manifest: tier, mcp server path + tools, panels (HUB-024 §6.5)
├── panel.schema.json        Panel Schema v0 (HUB-025): fields + actions + i18n
├── package.json
├── README.md
├── .gitignore
└── mcp-server/
    ├── index.ts             MCP server (@modelcontextprotocol/sdk)
    └── tools.ts             Tool implementations (pool/amp access via @akari/sdk)
```

Example generated `akari.toml`:
```toml
[module]
id   = "com.user.my-module"
tier = "mcp-declarative"
sdk  = ">=0.1.0 <1.0"

[mcp]
server = "mcp-server"
tools  = ["my-module.sample_action"]

[panels]
main = { title = "My Module", schema = "panel.schema.json" }
```

---

## Handlebars template variables

Templates receive these variables:

| Variable | Example | Description |
|---|---|---|
| `{{moduleId}}` | `com.user.my-module` | Reverse-domain module ID (HUB-024 §6.7) |
| `{{moduleName}}` | `My Module` | Display name (Title Case) |
| `{{moduleSlug}}` | `my-module` | kebab-case slug (= CLI `<name>` argument) |
| `{{moduleShortId}}` | `my_module` | snake_case short ID for agent/tool prefix (ADR-011) |
| `{{category}}` | `productivity` | Module category |
| `{{tier}}` | `full` | Module tier |
| `{{author}}` | `Your Name` | Author |
| `{{year}}` | `2026` | Current year |
| `{{sdkRange}}` | `>=0.1.0 <1.0` | SDK compatibility range |

---

## Related specifications

- [AKARI-HUB-024 Module SDK](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-module-sdk.md) — Module contract, 7 APIs, Tier model, Certification
- [AKARI-HUB-025 Panel Schema v0](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-panel-schema.md) — Declarative UI schema (`panel.schema.json`)
- [AKARI-HUB-005 Declarative Capability Modules](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-declarative-capability-modules.md) — MCP-Declarative reference catalog
- [ADR-011 Module Agent Naming Convention](https://github.com/akari-os/akari-os/docs/sdd/adr/ADR-011-module-agent-naming-convention.md) — `<module-short-id>_<agent-role>` snake_case

---

## Development (CLI itself)

```bash
npm install
npm run build    # tsup → dist/cli.js
npm run dev      # watch mode
npm run typecheck
```

Phase 2b (`src/commands/certify.ts`) is reserved for the Certification command.
The `module certify` stub currently exits with a clear error message.
