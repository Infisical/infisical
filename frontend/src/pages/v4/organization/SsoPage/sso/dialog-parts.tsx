import type { ReactNode } from "react";

import { FieldDescription, FieldLegend, FieldSet } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";

// The backend matches signal values case-insensitively, so two casings of one value are the same entry.
export const rejectDuplicateTag = (tag: string, existing: string[]) =>
  existing.some((item) => item.toLowerCase() === tag.toLowerCase())
    ? `${tag} is already listed`
    : null;

export const DialogSection = ({
  title,
  description,
  badge,
  children
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) => (
  <FieldSet>
    <FieldLegend>
      <Inline gap={8}>
        {title}
        {badge}
      </Inline>
    </FieldLegend>
    {description && <FieldDescription>{description}</FieldDescription>}
    <Stack gap={16}>{children}</Stack>
  </FieldSet>
);

export const TagsField = ({
  id,
  label,
  placeholder,
  value,
  onChange,
  validate,
  onValidationError,
  invalid
}: {
  id?: string;
  label: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
  validate: (tag: string, existing: string[]) => string | null;
  onValidationError: (message: string | null) => void;
  invalid?: boolean;
}) => (
  <MultiSelect
    id={id}
    label={label}
    placeholder={placeholder}
    invalid={invalid}
    searchable
    quickActions={false}
    options={value.map((tag) => ({ value: tag, label: tag }))}
    value={value}
    onChange={(next) => {
      onValidationError(null);
      onChange(next);
    }}
    onCreate={(query) => {
      const message = validate(query, value);
      onValidationError(message);
      if (!message) onChange([...value, query]);
    }}
  />
);
