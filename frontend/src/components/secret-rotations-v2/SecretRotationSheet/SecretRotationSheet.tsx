import { ComponentProps, forwardRef } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

function SecretRotationSheet(props: ComponentProps<typeof Sheet>) {
  return <Sheet {...props} />;
}

function SecretRotationSheetContent({ className, ...props }: ComponentProps<typeof SheetContent>) {
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

function SecretRotationSheetScrollArea({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="secret-rotation-sheet-scroll-area"
      className={cn("min-h-0 thin-scrollbar flex-1 overflow-x-hidden overflow-y-auto", className)}
      {...props}
    />
  );
}

function SecretRotationSheetContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="secret-rotation-sheet-container"
      className={cn("space-y-6 p-6", className)}
      {...props}
    />
  );
}

function SecretRotationSheetHeader({ className, ...props }: ComponentProps<typeof SheetHeader>) {
  return <SheetHeader className={cn("gap-0 border-0 p-0", className)} {...props} />;
}

function SecretRotationSheetTitle({ className, ...props }: ComponentProps<typeof SheetTitle>) {
  return <SheetTitle className={cn("font-alliance text-lg font-medium", className)} {...props} />;
}

function SecretRotationSheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetDescription>) {
  return <SheetDescription className={cn("mt-1", className)} {...props} />;
}

function SecretRotationSheetInputSection({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="secret-rotation-sheet-input-section"
      className={cn("space-y-3", className)}
      {...props}
    />
  );
}

function SecretRotationSheetSelectionGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="secret-rotation-sheet-selection-group"
      className={cn("grid grid-cols-2 gap-2", className)}
      {...props}
    />
  );
}

const SecretRotationSheetOption = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="secret-rotation-sheet-option"
        className={cn("rounded-md border border-border bg-card p-2", className)}
        {...props}
      />
    );
  }
);
SecretRotationSheetOption.displayName = "SecretRotationSheetOption";

function SecretRotationSheetOptionHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="secret-rotation-sheet-option-header"
      className={cn("text-sm font-normal text-label", className)}
      {...props}
    />
  );
}

function SecretRotationSheetFooter({ className, ...props }: ComponentProps<typeof SheetFooter>) {
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
  SecretRotationSheet,
  SecretRotationSheetContainer,
  SecretRotationSheetContent,
  SecretRotationSheetDescription,
  SecretRotationSheetFooter,
  SecretRotationSheetHeader,
  SecretRotationSheetInputSection,
  SecretRotationSheetOption,
  SecretRotationSheetOptionHeader,
  SecretRotationSheetScrollArea,
  SecretRotationSheetSelectionGroup,
  SecretRotationSheetTitle
};
