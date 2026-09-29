import { Fragment, ReactNode } from "react";
import { TrashIcon } from "lucide-react";

import { Field, FieldContent, FieldLabel, IconButton } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

export type TCertificateFilterItem = {
  key: string;
  label: string;
  body: ReactNode;
  onRemove?: () => void;
};

type Props = {
  items: TCertificateFilterItem[];
  className?: string;
};

export const CertificateFilterList = ({ items, className }: Props) => (
  <div className={cn("flex flex-col gap-3", className)}>
    {items.map((item, index) => (
      <Fragment key={item.key}>
        {index > 0 && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted">AND</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        <div className="flex items-start gap-3">
          <Field className="min-w-0 flex-1">
            <FieldLabel className="text-xs">{item.label}</FieldLabel>
            <FieldContent>{item.body}</FieldContent>
          </Field>
          {item.onRemove && (
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              className="mt-6.5 hover:text-danger"
              aria-label={`Remove ${item.label} filter`}
              onClick={item.onRemove}
            >
              <TrashIcon className="size-4" />
            </IconButton>
          )}
        </div>
      </Fragment>
    ))}
  </div>
);
