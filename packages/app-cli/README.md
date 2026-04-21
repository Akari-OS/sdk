# @akari-os/app-cli

CLI for scaffolding, developing, and certifying [AKARI OS](https://github.com/akari-os) apps.
Implements the Toolchain defined in [AKARI-HUB-024 §6.9](./docs/).

```
create-next-app for AKARI apps
```

---

## Installation

```bash
npm install -g @akari-os/app-cli
```

> After installation both `akari-app-cli` and `akari` are available as commands.

---

## Usage

### Scaffold a new app

```bash
# Interactive (prompts for tier, author, category)
akari-app-cli create my-app

# With all options
akari-app-cli create my-app --tier mcp-declarative --author "Your Name" --category sns

# Full Tier (React panel + agents + skills)
akari-app-cli create my-writer-plus --tier full
```

This creates `./<name>/` with a ready-to-run app scaffold.

### Start local dev server

```bash
cd my-app
npm install
akari dev           # hot-reload dev server, mounts app into local Shell
```

> `akari dev` is implemented in Phase 2b. Running it now prints a helpful message.

### Certify an app

```bash
akari app certify   # Automated Lint + Contract Tests (HUB-024 §6.8)
```

> `akari app certify` is implemented in Phase 2b (`src/commands/certify.ts`).

### Publish

```bash
# AKARI Marketplace (requires certify to pass + Manual Review for Full Tier)
akari app publish

# Self-distribution via npm (Automated Lint + Contract Test only)
npm publish
```

### Install an app (user side)

```bash
akari app add com.akari.writer
akari app add @user/my-writer-plus
```

---

## Tier Selection Guide

AKARI apps come in two tiers (AKARI-HUB-024 §6.2):

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
my-app/
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
[app]
id   = "com.user.my-app"
tier = "full"
sdk  = ">=0.1.0 <1.0"

[panels]
main = { title = "My App", mount = "panels/main.tsx" }

[agents]
my_app_assistant = "agents/assistant.md"
```

### MCP-Declarative Tier (`--tier mcp-declarative`)

```
my-app/
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
[app]
id   = "com.user.my-app"
tier = "mcp-declarative"
sdk  = ">=0.1.0 <1.0"

[mcp]
server = "mcp-server"
tools  = ["my-app.sample_action"]

[panels]
main = { title = "My App", schema = "panel.schema.json" }
```

---

## Handlebars template variables

Templates receive these variables:

| Variable | Example | Description |
|---|---|---|
| `{{appId}}` | `com.user.my-app` | Reverse-domain app ID (HUB-024 §6.7) |
| `{{appName}}` | `My App` | Display name (Title Case) |
| `{{appSlug}}` | `my-app` | kebab-case slug (= CLI `<name>` argument) |
| `{{appShortId}}` | `my_app` | snake_case short ID for agent/tool prefix (ADR-011) |
| `{{category}}` | `productivity` | App category |
| `{{tier}}` | `full` | App tier |
| `{{author}}` | `Your Name` | Author |
| `{{year}}` | `2026` | Current year |
| `{{sdkRange}}` | `>=0.1.0 <1.0` | SDK compatibility range |

---

## Related specifications

- [AKARI-HUB-024 App SDK](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-app-sdk.md) — App contract, 7 APIs, Tier model, Certification
- [AKARI-HUB-025 Panel Schema v0](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-panel-schema.md) — Declarative UI schema (`panel.schema.json`)
- [AKARI-HUB-005 Declarative Capability Apps](https://github.com/akari-os/akari-os/docs/sdd/specs/spec-akari-declarative-capability-apps.md) — MCP-Declarative reference catalog
- [ADR-011 App Agent Naming Convention](https://github.com/akari-os/akari-os/docs/sdd/adr/ADR-011-app-agent-naming-convention.md) — `<app-short-id>_<agent-role>` snake_case

---

## Development (CLI itself)

```bash
npm install
npm run build    # tsup → dist/cli.js
npm run dev      # watch mode
npm run typecheck
```

Phase 2b (`src/commands/certify.ts`) is reserved for the Certification command.
The `app certify` stub currently exits with a clear error message.
