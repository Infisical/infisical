import { ReactNode } from "react";

import { FieldGroup } from "@app/components/v3";

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
  <section className="border-b border-border px-4 py-5 last:border-b-0">
    <h3 className="flex items-center gap-2 font-medium text-foreground">
      {title}
      {badge}
    </h3>
    <p className="mt-1 mb-4 text-sm text-muted">{description}</p>
    <FieldGroup>{children}</FieldGroup>
  </section>
);

export const FieldHint = ({ children }: { children: ReactNode }) => (
  <span className="ml-1.5 font-normal text-muted">{children}</span>
);
