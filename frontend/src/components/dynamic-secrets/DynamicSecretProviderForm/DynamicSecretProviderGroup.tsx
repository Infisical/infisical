import { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FieldDescription,
  FieldLegend,
  FieldSet
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { TDynamicSecretProviderFieldGroupPresentation } from "./types";

const GROUP_SURFACE_CLASSNAME = "rounded-md border border-border bg-container p-3 text-foreground";

type PanelProps = {
  presentation?: "panel";
  title?: string;
  description?: string;
  id: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  surface?: boolean;
};

type CollapseProps = {
  presentation: "collapse";
  title: string;
  description?: string;
  id: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type DynamicSecretProviderGroupProps = PanelProps | CollapseProps;

/** Sheet-agnostic field clustering for provider forms. */
export const DynamicSecretProviderGroup = (props: DynamicSecretProviderGroupProps) => {
  const { presentation } = props;

  if (presentation === "collapse") {
    const {
      id,
      title,
      description,
      children,
      className,
      contentClassName,
      defaultOpen,
      open,
      onOpenChange
    } = props;
    const descriptionId = `${id}-description`;
    const controlledProps =
      open === undefined
        ? { defaultValue: defaultOpen ? id : undefined }
        : {
            value: open ? id : "",
            onValueChange: (value: string) => onOpenChange?.(value === id)
          };

    return (
      <Accordion
        type="single"
        collapsible
        variant="ghost"
        className={className}
        {...controlledProps}
      >
        <AccordionItem value={id}>
          <AccordionTrigger aria-describedby={description ? descriptionId : undefined}>
            {title}
          </AccordionTrigger>
          <AccordionContent className={cn("flex flex-col gap-4", contentClassName)}>
            {description ? (
              <FieldDescription id={descriptionId}>{description}</FieldDescription>
            ) : null}
            {children}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  const { id, title, description, children, className, contentClassName, surface = false } = props;
  const descriptionId = `${id}-description`;
  const hasHeading = Boolean(title || description);

  return (
    <div
      data-slot="dynamic-secret-provider-group"
      data-presentation={"panel" satisfies TDynamicSecretProviderFieldGroupPresentation}
      data-surface={surface ? "true" : "false"}
      className={cn(surface && GROUP_SURFACE_CLASSNAME, className)}
    >
      {hasHeading ? (
        <FieldSet className={contentClassName}>
          {title ? <FieldLegend>{title}</FieldLegend> : null}
          {description ? (
            <FieldDescription id={descriptionId}>{description}</FieldDescription>
          ) : null}
          {children}
        </FieldSet>
      ) : (
        <div className={cn("flex flex-col gap-4", contentClassName)}>{children}</div>
      )}
    </div>
  );
};
