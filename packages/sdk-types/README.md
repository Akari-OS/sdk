# @akari-os/sdk

TypeScript type definitions for the **AKARI Module SDK**.

Module developers `import type { ... }` from this package to get full
IDE-level type checking and hover documentation when building AKARI Modules.
This package ships **declaration files only** — no runtime code.

---

## Install

```bash
npm install -D @akari-os/sdk
# or
pnpm add -D @akari-os/sdk
```

Add `"@akari-os/sdk"` to `peerDependencies.typescript` (`>=5.0.0`).

---

## Usage

```typescript
import type {
  AgentSpec,
  AgentInvokeOptions,
  AgentInvokeResult,
  AceContext,
  HandoffPayload,
  PanelSchema,
  PermissionScope,
  Manifest,
} from "@akari-os/sdk"
```

You can also import from sub-paths for tree-shaking in type-check tooling:

```typescript
import type { AgentSpec }     from "@akari-os/sdk/agent"
import type { AmpRecord }     from "@akari-os/sdk/memory"
import type { AceContext }    from "@akari-os/sdk/context"
import type { ShellAPI }      from "@akari-os/sdk/ui"
import type { ModuleAPI }     from "@akari-os/sdk/inter-app"
import type { PermissionAPI } from "@akari-os/sdk/permission"
import type { SkillDef }      from "@akari-os/sdk/skill"
import type { PanelSchema }   from "@akari-os/sdk/panel-schema"
import type { Manifest }      from "@akari-os/sdk/manifest"
```

---

## API groups

| Module | Description |
|---|---|
| [`/agent`](./src/agent.ts) | Agent API — register, invoke, spawn, handoff |
| [`/memory`](./src/memory.ts) | Memory API — Pool (Content-Addressed storage) + AMP (Agent Memory Protocol) |
| [`/context`](./src/context.ts) | Context API — ACE context builder, `SelectOptions`, `LintIssue` |
| [`/ui`](./src/ui.ts) | UI API — `ShellAPI`, panels, dialogs, toasts, HITL preview |
| [`/inter-app`](./src/inter-app.ts) | Inter-App API — `ModuleAPI`, `HandoffPayload`, `HandoffHandler` |
| [`/permission`](./src/permission.ts) | Permission API — scoped gates, HITL, OAuth, audit records |
| [`/skill`](./src/skill.ts) | Skill API — typed callable units shared between Modules |
| [`/panel-schema`](./src/panel-schema.ts) | Panel Schema v0 — declarative UI (widget catalog, bindings, actions) |
| [`/manifest`](./src/manifest.ts) | `akari.toml` manifest — identity, permissions, panels, agents, skills |
| [`/errors`](./src/errors.ts) | Shared `AkariError` base class and `AkariErrorCode` enum |

---

## Example — Full Tier Module

```typescript
import type {
  AgentSpec,
  AgentInvokeOptions,
  AgentInvokeResult,
  PermissionGateOptions,
  AceContext,
} from "@akari-os/sdk"

// Declare a Module-supplied agent spec
const editorSpec: AgentSpec = {
  persona: "SNS copywriting editor specialised in opening hooks.",
  specFile: "agents/editor.md",
  tools: ["pool.read", "amp.query"],
  model: "claude-sonnet-4-6",
}

// Build invoke options
const opts: AgentInvokeOptions = {
  context: aceCtx,      // AceContext built via Context API
  timeoutMs: 60_000,
}
```

## Example — MCP-Declarative Module

```typescript
import type { PanelSchema, Manifest } from "@akari-os/sdk"

const schema: PanelSchema = {
  $schema: "akari://panel-schema/v0",
  title: "X Sender",
  layout: "form",
  fields: [
    { id: "text", type: "textarea", maxLength: 280, bind: "mcp.x.post.text", required: true },
    { id: "media", type: "pool-picker", accept: ["image", "video"], max: 4 },
  ],
  actions: [
    {
      id: "post",
      label: "Post",
      kind: "primary",
      mcp: { tool: "x.post", args: { text: "$text", media: "$media" } },
      hitl: { require: true, preview: "text-summary" },
    },
  ],
}
```

---

## License

MIT — see [LICENSE](../../LICENSE).
