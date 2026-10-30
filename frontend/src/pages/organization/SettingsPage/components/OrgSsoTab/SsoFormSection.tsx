import { ReactNode } from "react";

import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@app/components/v3";

// The backend matches signal values case-insensitively, so two casings of one value are the same entry.
export const rejectDuplicateTag = (tag: string, existing: string[]) =>
  existing.some((item) => item.toLowerCase() === tag.toLowerCase())
    ? `${tag} is already listed`
    : null;

export const FormSection = ({
  title,
  description,
  badge,
  children
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
}) => (
  // The padding sits on the wrapper because a browser draws a fieldset's legend above its padding box.
  <div className="border-b border-border p-4 last:border-b-0">
    <FieldSet className="gap-0">
      <FieldLegend className="mb-0 flex items-center gap-2">
        {title}
        {badge}
      </FieldLegend>
      <FieldDescription className="mb-4 text-sm">{description}</FieldDescription>
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
  </div>
);
