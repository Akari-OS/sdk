/**
 * TemplateSelector — テンプレート選択ドロップダウン
 *
 * spec: AKARI-HUB-014 §3
 */

import { TEMPLATES } from "@/lib/templates";

interface TemplateSelectorProps {
  selectedId: string;
  onChange: (templateId: string) => void;
}

export function TemplateSelector({ selectedId, onChange }: TemplateSelectorProps) {
  const selected = TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0]!;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium text-muted-foreground">
        テンプレート
      </label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.icon} {t.name}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-muted-foreground/70">
        {selected.description}
      </p>
    </div>
  );
}
