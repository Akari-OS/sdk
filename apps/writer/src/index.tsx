/**
 * @file index.tsx
 * AKARI Writer App — entry point for AppHost.
 *
 * Phase 1 (session 25 → 26): shell の modules/writer + WriterStudio を物理的にここに移植。
 * components/writer/* / lib/writer-style / lib/markdown / InspectorPanel 等は
 * 暫定で shell 側の実装を @/ alias で参照する（Vite fs.allow + app 側 tsconfig paths）。
 * Phase 2 で共通層を shared lib に分離予定。
 *
 * See: akari-os/docs/planning/handoff-2026-04-22-session25.md
 */

import { WriterStudio } from "./WriterStudio";
import "./styles.css";

export default function WriterApp() {
  return <WriterStudio />;
}
