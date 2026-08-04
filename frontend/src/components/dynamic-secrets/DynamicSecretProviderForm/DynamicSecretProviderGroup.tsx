import { ReactNode } from "react";

import { FieldDescription, FieldLegend, FieldSet } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { DynamicSecretSheetCollapsibleSection } from "../DynamicSecretSheet";
import { TDynamicSecretProviderFieldGroupPresentation } from "./types";

/** Opt-in bordered cluster. Reserved for groups that render a real header. */
const GROUP_SURFACE_CLASSNAME =
  "rounded-md border border-border bg-container p-3 text-foreground";

type PanelProps = {
  presentation?: "panel";
  title?: string;
  description?: string;
  id: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * Opt-in bordered surface (padding, border, background).
   * Groups are unstyled by default — reserve `surface` for clusters with a header.
   */
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

/**
 * Field clustering under a sheet section.
 * - `panel` — logical field cluster; unstyled by default. Pass `surface` for the bordered treatment.
 * - `collapse` — sheet-section peer to Configuration (collapsible section title)
 */
export const DynamicSecretProviderGroup = (props: DynamicSecretProviderGroupProps) => {
  if (props.presentation === "collapse") {
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

    return (
      <DynamicSecretSheetCollapsibleSection
        id={id}
        title={title}
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
        className={className}
        contentClassName={contentClassName}
      >
        {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
        {children}
      </DynamicSecretSheetCollapsibleSection>
    );
  }

  const {
    id,
    title,
    description,
    children,
    className,
    contentClassName,
    surface = false
  } = props;
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
