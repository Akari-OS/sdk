# AKARI Writer Phase 0 MVP — Tiny Writer

**spec-id**: `AKARI-HUB-003`  
**version**: 0.1.0  
**status**: in-progress (skeleton implemented, API integration pending)

## Overview

Tiny Writer は AKARI Writer の **Phase 0 MVP** — X (Twitter) の 140/280 字投稿に特化したシンプルエディタ。

複雑な Writer Studio の全機能ではなく、以下のみに絞った最小限の実装:

- Plain text input + 軽い Markdown support
- 文字数カウンタ (140 / 280 字モード)
- Partner チャットパネル
- "X に投稿" ボタン + HITL permission gate
- Post history save to Pool
- Writing style Memory integration

## Component Structure

```
Phase0WriterApp.tsx
  ├── TinyWriterEditor.tsx (UI)
  │   ├── textarea (editor)
  │   ├── char counter
  │   ├── action buttons (Post, Chat toggle)
  │   └── ChatPanel (Partner interaction)
  └── usePhase0Writer.ts (API integration)
      ├── Pool operations (save draft, load history)
      ├── Memory operations (writing style)
      ├── Inter-App handoff (to Publishing app)
      ├── Permission gate (HITL)
      └── Partner chat integration
```

## Implementation Status

### ✅ Completed

- [x] `TinyWriterEditor.tsx` — UI skeleton (textarea, char counter, chat panel)
- [x] `usePhase0Writer.ts` — API hook structure + mock implementations
- [x] `Phase0WriterApp.tsx` — App container & integration point
- [x] CSS styling (both light/dark mode)

### ⏳ In Progress / TODO

- [ ] **API Integration** — Actual `window.akari.*` API calls (Pool, Memory, App handoff, Permission)
- [ ] **Toast notifications** — Success/error feedback
- [ ] **Keyboard shortcuts** — cmd+enter (post), cmd+/ (toggle chat), cmd+shift+m (mode toggle)
- [ ] **Error handling** — Graceful fallbacks when APIs unavailable
- [ ] **Unit tests** — Textarea behavior, char counter, API mocks
- [ ] **Clipboard adapter implementation** — MVP では clipboard to X format conversion

## Spec Fulfillment (HUB-003 §7 Phase 0 Tasks)

| Task | Component | Status | Notes |
|---|---|---|---|
| T-0a | App scaffold | ✅ | manifest + entry (index.tsx delegates to Phase0WriterApp) |
| T-0b | Text area | ✅ | Plain text, no WYSIWYG |
| T-0c | Char counter | ✅ | 140/280 toggle, over-limit warning |
| T-0d | Partner chat | ✅ | ChatPanel with message list & input |
| T-0e | "X に投稿" button | ✅ | Calls `handoffToPublisher()` → Publishing app |
| T-0f | Pool post history save | ⏳ | Hook structure ready, API call pending |
| T-0g | Load past posts | ⏳ | Hook structure ready, API call pending |
| T-0h | Memory writing style | ⏳ | Hook structure ready, API call pending |
| T-0i | Toast notifications | ⏳ | Placeholder in Phase0WriterApp footer |
| T-0j | Dogfood 1 week | ⏳ | After API integration complete |

## API Integration Checklist

When `window.akari.*` API becomes available, integrate:

- [ ] `window.akari.pool.put()` — Draft save
- [ ] `window.akari.pool.search()` — Post history load
- [ ] `window.akari.memory.get()` / `.put()` — Writing style
- [ ] `window.akari.permission.gate()` — HITL before external post
- [ ] `window.akari.app.handoff()` — Inter-App to Publishing category
- [ ] `window.akari.agent.chat()` — Partner response generation
- [ ] Toast API (from Shell/SDK) — Feedback UI

## Known Limitations (Phase 0)

- No image/media attachment (Phase 2)
- No long-form mode (Phase 1)
- No out-of-box Publishing app integration (clipboard fallback only)
- No Guardian public check (Phase 3)
- No derivative variants (Phase 3)
- Simple Markdown only (no tables, embeds, etc)

## Usage

```tsx
import { Phase0WriterApp } from './Phase0WriterApp'

export default function WriterApp() {
  return <Phase0WriterApp agentName="Partner (Writer)" />
}
```

## Testing Strategy

### Unit Tests

- Char counter logic (including emoji)
- Mode toggle (140 ↔ 280)
- Over-limit state

### Integration Tests (after API)

- Draft save → Pool
- History load → display
- Partner chat → response mock
- Handoff → clipboard fallback

### E2E Dogfood

- Write text → Toggle chat → Get suggestion → Post → See in history

## References

- **spec**: `akari-os/docs/sdd/specs/spec-akari-writer.md` (AKARI-HUB-003)
- **SDK**: `akari-sdk/packages/sdk` (window.akari.* APIs)
- **App SDK**: `akari-os/docs/sdd/specs/spec-akari-app-sdk.md` (AKARI-HUB-024)
- **Data model**: `akari-os/docs/sdd/specs/spec-work-asset-variant-data-model.md` (AKARI-HUB-028)
- **Pool**: `akari-os/docs/sdd/specs/spec-pool-tier-and-cross-reference.md` (AKARI-HUB-029)
