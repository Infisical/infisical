import type { ReactNode } from "react";

import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@app/components/v4/ui/field";
import { Inline } from "@app/components/v4/ui/layout";

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
  <FieldSet>
    <FieldLegend>
      <Inline gap={8} wrap={false}>
        {title}
        {badge}
      </Inline>
    </FieldLegend>
    <FieldDescription>{description}</FieldDescription>
    <FieldGroup>{children}</FieldGroup>
  </FieldSet>
);
