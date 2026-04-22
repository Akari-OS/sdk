/**
 * TemplateFields — テンプレートのフィールドを動的にレンダリング
 *
 * spec: AKARI-HUB-014 §3
 */

import type { TemplateField } from "@akari-os/templates-core";

interface TemplateFieldsProps {
  fields: TemplateField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}

export function TemplateFields({ fields, values, onChange }: TemplateFieldsProps) {
  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[10px] font-medium text-muted-foreground">入力項目</div>
      {fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.id] ?? ""}
          onChange={(v) => onChange(field.id, v)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// フィールド入力コンポーネント
// ---------------------------------------------------------------------------

interface FieldInputProps {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const labelEl = (
    <label className="text-[10px] text-muted-foreground flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-red-400">*</span>}
    </label>
  );

  const baseClass =
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40";

  switch (field.type) {
    case "textarea":
      return (
        <div className="flex flex-col gap-0.5">
          {labelEl}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={`${baseClass} resize-y min-h-[60px]`}
          />
        </div>
      );

    case "select":
      return (
        <div className="flex flex-col gap-0.5">
          {labelEl}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={baseClass}
          >
            <option value="">選択してください</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case "date":
      return (
        <div className="flex flex-col gap-0.5">
          {labelEl}
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={baseClass}
          />
        </div>
      );

    default:
      return (
        <div className="flex flex-col gap-0.5">
          {labelEl}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={baseClass}
          />
        </div>
      );
  }
}
