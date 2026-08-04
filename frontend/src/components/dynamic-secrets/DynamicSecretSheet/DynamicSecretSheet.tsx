import { ComponentProps, forwardRef, type ReactNode, useId, useState } from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronDownIcon } from "lucide-react";

import {
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

function DynamicSecretSheet(props: ComponentProps<typeof Sheet>) {
  return <Sheet {...props} />;
}

function DynamicSecretSheetContent({ className, ...props }: ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      className={cn(
        "flex h-full w-full max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
        className
      )}
      {...props}
    />
  );
}

function DynamicSecretSheetScrollArea({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-scroll-area"
      className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto thin-scrollbar", className)}
      {...props}
    />
  );
}

function DynamicSecretSheetContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-container"
      className={cn("space-y-6 p-6", className)}
      {...props}
    />
  );
}

function DynamicSecretSheetHeader({ className, ...props }: ComponentProps<typeof SheetHeader>) {
  return <SheetHeader className={cn("gap-0 border-0 p-0", className)} {...props} />;
}

function DynamicSecretSheetTitle({ className, ...props }: ComponentProps<typeof SheetTitle>) {
  return <SheetTitle className={cn("font-alliance text-lg font-medium", className)} {...props} />;
}

function DynamicSecretSheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetDescription>) {
  return <SheetDescription className={cn("mt-1", className)} {...props} />;
}

function DynamicSecretSheetInputSection({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-input-section"
      className={cn("space-y-3", className)}
      {...props}
    />
  );
}

/** Major content block under a section title — segment-level rhythm (`gap-5`). */
function DynamicSecretSheetContentSection({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-content-section"
      className={cn("flex flex-col gap-5", className)}
      {...props}
    />
  );
}

const SHEET_SECTION_TITLE_TEXT_CLASSNAME =
  "shrink-0 font-alliance text-base font-medium text-foreground";

/**
 * Static sheet section header (e.g. Configuration).
 * Sheet-local for now — paired with `DynamicSecretSheetCollapsibleSection`.
 */
function DynamicSecretSheetSectionTitle({
  className,
  children,
  ...props
}: ComponentProps<"h3">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-section-title"
      className={cn("flex w-full items-center gap-3", className)}
    >
      <h3 data-slot="section-title-text" className={SHEET_SECTION_TITLE_TEXT_CLASSNAME} {...props}>
        {children}
      </h3>
      <Separator className="min-w-0 flex-1" />
    </div>
  );
}

type DynamicSecretSheetCollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
  id?: string;
};

/**
 * Collapsible sheet section peer to `DynamicSecretSheetSectionTitle`.
 * Same Alliance title + hairline rule, with a leading chevron.
 */
function DynamicSecretSheetCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  contentClassName,
  id
}: DynamicSecretSheetCollapsibleSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const titleId = useId();
  const headingId = id ?? titleId;

  return (
    <CollapsiblePrimitive.Root
      data-slot="dynamic-secret-sheet-collapsible-section"
      open={open}
      onOpenChange={(nextOpen) => {
        if (openProp === undefined) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
      className={cn("group/section-collapse flex flex-col", className)}
    >
      <CollapsiblePrimitive.Trigger
        type="button"
        className={cn(
          "flex w-full items-center gap-3 rounded-sm text-left outline-none",
          "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-labelledby={headingId}
      >
        <ChevronDownIcon
          data-slot="dynamic-secret-sheet-collapsible-chevron"
          className="size-4 shrink-0 text-label transition-transform duration-200 group-data-[state=closed]/section-collapse:-rotate-90"
        />
        <h3 id={headingId} data-slot="section-title-text" className={SHEET_SECTION_TITLE_TEXT_CLASSNAME}>
          {title}
        </h3>
        <Separator className="min-w-0 flex-1" />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        data-slot="dynamic-secret-sheet-collapsible-content"
        className={cn(
          "overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
          contentClassName
        )}
      >
        <div className="flex flex-col gap-5 pt-5">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

/** Cluster of related fields inside a content section — field-level rhythm (`gap-3`). */
function DynamicSecretSheetFieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-field-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function DynamicSecretSheetSelectionGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-selection-group"
      className={cn("grid grid-cols-2 gap-2", className)}
      {...props}
    />
  );
}

const DynamicSecretSheetOption = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="dynamic-secret-sheet-option"
        className={cn("rounded-md border border-border bg-card p-2", className)}
        {...props}
      />
    );
  }
);
DynamicSecretSheetOption.displayName = "DynamicSecretSheetOption";

function DynamicSecretSheetOptionHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-option-header"
      className={cn("text-sm font-normal text-label", className)}
      {...props}
    />
  );
}

function DynamicSecretSheetOptionConfiguration({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dynamic-secret-sheet-option-configuration"
      className={cn("mt-4 pl-8", className)}
      {...props}
    />
  );
}

function DynamicSecretSheetFooter({ className, ...props }: ComponentProps<typeof SheetFooter>) {
  return (
    <SheetFooter
      className={cn(
        "mt-0 shrink-0 flex-row flex-wrap justify-end border-t border-border p-3",
        className
      )}
      {...props}
    />
  );
}

export {
  DynamicSecretSheet,
  DynamicSecretSheetCollapsibleSection,
  DynamicSecretSheetContainer,
  DynamicSecretSheetContent,
  DynamicSecretSheetContentSection,
  DynamicSecretSheetDescription,
  DynamicSecretSheetFieldGroup,
  DynamicSecretSheetFooter,
  DynamicSecretSheetHeader,
  DynamicSecretSheetInputSection,
  DynamicSecretSheetOption,
  DynamicSecretSheetOptionConfiguration,
  DynamicSecretSheetOptionHeader,
  DynamicSecretSheetScrollArea,
  DynamicSecretSheetSectionTitle,
  DynamicSecretSheetSelectionGroup,
  DynamicSecretSheetTitle
};
