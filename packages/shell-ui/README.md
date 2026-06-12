# @akari-os/shell-ui

Shared UI components for [AKARI OS](https://github.com/Akari-OS/sdk) — shadcn-based building blocks used by both the Shell host and Full Tier apps.

---

## Install

```bash
npm install @akari-os/shell-ui
# or
pnpm add @akari-os/shell-ui
```

**Peer dependencies**: `react ^18||^19`, `react-dom ^18||^19`

---

## Usage

```tsx
import { AppLayout } from "@akari-os/shell-ui/AppLayout";
import { InspectorShell } from "@akari-os/shell-ui/InspectorShell";
import { WorkPanel } from "@akari-os/shell-ui/WorkPanel";

export function MyPanel() {
  return (
    <AppLayout>
      <WorkPanel />
      <InspectorShell />
    </AppLayout>
  );
}
```

See the [AKARI SDK docs](https://github.com/Akari-OS/sdk/blob/main/docs/) for the full component catalogue and usage examples.

---

## License

MIT — see [LICENSE](../../LICENSE).
