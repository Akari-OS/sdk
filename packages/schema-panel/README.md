# @akari-os/schema-panel

Reference React renderer for **AKARI Panel Schema v0** — the declarative UI schema that allows MCP-powered AKARI modules to describe their UI without shipping custom React code.

This package provides: core renderer + binding engine + action dispatcher + HITL preview. Widget implementations (Phase 3b) are registered separately via `WidgetRegistry`.

---

## Installation

```bash
npm install @akari-os/schema-panel
# or
pnpm add @akari-os/schema-panel
```

**Peer dependencies**: `react >= 19`, `react-dom >= 19`

---

## Quick start

### Development / stub context

```tsx
import { SchemaPanel, createStubRenderContext } from "@akari-os/schema-panel";
import notionSchema from "./tests/fixtures/notion.schema.json";

function App() {
  const context = createStubRenderContext("ja");
  return <SchemaPanel schema={notionSchema} context={context} />;
}
```

### Shell integration (Tauri / React)

Wire real clients into `RenderContext` and pass them to `SchemaPanel`:

```tsx
import { SchemaPanel } from "@akari-os/schema-panel";
import type { RenderContext } from "@akari-os/schema-panel";

const mcpClient = {
  async call(tool: string, args: Record<string, unknown>) {
    return await invoke("mcp_call", { tool, args });
  },
};

const poolClient = {
  async search(options) { /* Pool daemon socket */ },
  async get(id) { /* ... */ },
  async put(item) { /* ... */ },
};

const navigationClient = {
  navigate(target: string) {
    if (target.startsWith("tab:")) {
      // tab switch
    } else {
      router.navigate({ to: target });
    }
  },
};

const context: RenderContext = {
  mcpClient,
  poolClient,
  ampClient,
  moduleClient,
  navigationClient,
  toastClient,
  locale: "ja",
  fallbackLocale: "en",
};

<SchemaPanel schema={panelSchema} context={context} />
```

---

## Directory structure

```
schema-panel/
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                       public exports
│   ├── SchemaPanel.tsx                main component
│   ├── WidgetRegistry.ts              WidgetRegistry interface + defaultRegistry
│   ├── types/
│   │   ├── schema.ts                  Panel Schema v0 TypeScript types
│   │   └── context.ts                 RenderContext type + stub implementations
│   ├── engine/
│   │   ├── BindingResolver.ts         mcp.* / pool.* / amp.* / state / const resolution
│   │   ├── ExpressionEvaluator.ts     JSONLogic wrapper (enabled_when / visible_when)
│   │   ├── ActionDispatcher.ts        per-action-type handlers
│   │   └── I18nResolver.ts            {{t:key}} expansion
│   ├── hitl/
│   │   ├── PreviewDialog.tsx          HITL preview router component
│   │   ├── CustomMarkdownPreview.tsx  custom-markdown type
│   │   ├── DiffPreview.tsx            diff type
│   │   ├── ScheduleSummaryPreview.tsx schedule-summary type
│   │   └── TextSummaryPreview.tsx     text-summary type
│   ├── state/
│   │   └── usePanelState.ts           Zustand store hook (panel-local state)
│   └── widgets/                       42 widget stubs (Phase 3b fills implementations)
└── tests/
    └── fixtures/
        └── notion.schema.json         example Panel Schema (Notion module)
```

---

## Registering custom widgets (Phase 3b)

```tsx
import { SchemaPanel, defaultWidgetRegistry } from "@akari-os/schema-panel";
import type { WidgetProps } from "@akari-os/schema-panel";

// 1. Implement a widget
const TextWidget: React.FC<WidgetProps> = ({ field, value, onChange, isEnabled, i18nResolver }) => {
  const label = field.label ? i18nResolver.resolve(field.label) : field.id;
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={!isEnabled}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
    </div>
  );
};

// 2. Register widgets
const shellWidgetRegistry = {
  ...defaultWidgetRegistry,
  text: TextWidget,
  // textarea: TextareaWidget,
  // select: SelectWidget,
  // ...
};

// 3. Pass to SchemaPanel
<SchemaPanel schema={schema} context={context} widgetRegistry={shellWidgetRegistry} />
```

### Widget implementation priority

| Priority | Widget types |
|---|---|
| High | `text`, `textarea`, `select`, `datetime-optional`, `button`, `toggle`, `radio` |
| Medium | `pool-picker`, `multi-select`, `stepper`, `number`, `markdown`, `table` |
| Low | Documents series, AKARI-specific |

---

## Shell panel mounting

`SchemaPanel` is designed to integrate with the AKARI Shell panel API. When the shell detects a `schema` property instead of a React `component`, it automatically wraps with `SchemaPanel`:

```typescript
// Full Tier: React component
shell.mountPanel({
  id: "writer.main",
  title: "Writer",
  icon: "pen",
  component: WriterPanel,
})

// MCP-Declarative Tier: Panel Schema v0
shell.mountPanel({
  id: "notion.main",
  title: "Notion",
  icon: "notion",
  schema: panelSchema,
  context: renderContext,
})
```

Both tiers share the same `mountPanel` interface. The shell panel registry detects `schema` and wraps with `<SchemaPanel>` automatically.

---

## Engine modules

### BindingResolver

Resolves `bind` strings per the AKARI Panel Schema v0 binding spec:

| Pattern | Resolution |
|---|---|
| `mcp.*` | Delegates to ActionDispatcher for arg extraction |
| `pool.*` | `poolClient.search(queryId)` for initial value |
| `amp.*` | `ampClient.query({ kind })` latest record field |
| `state.*` | Zustand store get/set |
| `const.*` | Literal conversion (null / true / false / number / string) |

### ExpressionEvaluator

Evaluates **JSONLogic** expressions (via `json-logic-js`) for `enabled_when` / `visible_when`.

Sugar notation is converted to JSONLogic AST:

| Sugar | JSONLogic |
|---|---|
| `"$when != null"` | `{ "!=": [{ "var": "when" }, null] }` |
| `"$a == 'existing'"` | `{ "==": [{ "var": "a" }, "existing"] }` |
| `"$a && $b"` | `{ "and": [...] }` |
| `"$a \|\| $b"` | `{ "or": [...] }` |

### ActionDispatcher

| Action type | Flow |
|---|---|
| `mcp.invoke` | HITL check → PreviewDialog (if approval required) → MCP tool call → on_success / on_error |
| `handoff` | `moduleClient.handoff()` → inter-app navigation |
| `navigate` | `navigationClient.navigate()` → tab switch etc. |
| `submit` | Same as `mcp.invoke` |

### I18nResolver

Expands `{{t:key}}` using `schema.locales[locale][key]`.
Fallback order: specified locale → `"en"` → key string as-is.

---

## HITL preview types

| Type | Component | Status |
|---|---|---|
| `text-summary` | `TextSummaryPreview` | Implemented (field enumeration + char count) |
| `schedule-summary` | `ScheduleSummaryPreview` | Implemented (ISO 8601 via `Intl.DateTimeFormat`) |
| `diff` | `DiffPreview` | Implemented (preview_template expansion / children preview) |
| `custom-markdown` | `CustomMarkdownPreview` | Implemented (template expansion + basic markdown) |

---

## API

### `<SchemaPanel>`

| Prop | Type | Required | Description |
|---|---|---|---|
| `schema` | `PanelSchema` | Yes | Parsed `panel.schema.json` |
| `context` | `RenderContext` | Yes | Runtime clients injected by the shell |
| `widgetRegistry` | `WidgetRegistry` | No | Custom widgets; falls back to `defaultWidgetRegistry` |
| `className` | `string` | No | Additional CSS class on root element |

### `RenderContext`

```ts
interface RenderContext {
  mcpClient: McpClient;
  poolClient: PoolClient;
  ampClient: AmpClient;
  moduleClient: ModuleClient;
  navigationClient: NavigationClient;
  toastClient: ToastClient;
  locale: string;
  fallbackLocale?: string;
}
```

Use `createStubRenderContext(locale)` for development and testing.

---

## Dependencies

| Package | Purpose | Version |
|---|---|---|
| `json-logic-js` | JSONLogic evaluation for `enabled_when` / `visible_when` | ^2.0.2 |
| `zustand` | Panel-local state management (`state.*` bindings) | ^5.0.0 |

`react >= 19` and `react-dom >= 19` are peer dependencies.
`ajv` is a dev dependency for JSON Schema validation (future use in schema certification).

---

## TODO / wiring not yet implemented

- [ ] **MCP client** — replace `createStubMcpClient` with a real Tauri command wrapper (shell responsibility)
- [ ] **Pool client** — implement Unix socket connection to Pool daemon
- [ ] **AMP client** — implement AMP connection
- [ ] **Inter-app handoff** — wire `moduleClient.handoff()` to the AKARI Shell inter-app API
- [ ] **TanStack Router** — wire `navigationClient.navigate()` to TanStack Router
- [ ] **shadcn/ui Toast** — wire `toastClient` to shadcn/ui `Toaster`
- [ ] **Phase 3b widgets** — implement shadcn/ui-based widgets in `src/widgets/` and build `shellWidgetRegistry`
- [ ] **MCP resource binding** — read-only data fetch for `mcp.*` bindings
- [ ] **react-markdown** — replace basic markdown in `CustomMarkdownPreview`
- [ ] **diff-match-patch** — implement real diff calculation in `DiffPreview`
- [ ] **AMP audit log** — auto-record each action execution to AMP
- [ ] **repeater / accordion / split / dashboard layouts** — extend `SchemaPanel` layout renderer
- [ ] **options_source dynamic resolution** — call MCP from `select` / `multi-select` widgets
- [ ] **Form validation** — client-side `required` / `minLength` / `maxLength` / `pattern`

---

## Schema spec

This package implements **AKARI Panel Schema v0**. See the [AKARI SDK docs](https://github.com/Akari-OS/sdk/tree/main/docs) for the full schema specification and the example fixture at `tests/fixtures/notion.schema.json`.

---

## License

MIT — see [LICENSE](../../LICENSE)
