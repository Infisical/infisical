import React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "../../utils";

const Sheet: React.FC<SheetPrimitive.DialogProps> = (props) => (
  <SheetPrimitive.Root data-slot="sheet" {...props} />
);

const SheetTrigger: React.FC<SheetPrimitive.DialogTriggerProps> = (props) => (
  <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
);

const SheetClose: React.FC<SheetPrimitive.DialogCloseProps> = (props) => (
  <SheetPrimitive.Close data-slot="sheet-close" {...props} />
);

const SheetPortal: React.FC<SheetPrimitive.DialogPortalProps> = (props) => (
  <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
);

const SheetOverlay: React.FC<SheetPrimitive.DialogOverlayProps> = ({ className, ...props }) => (
  <SheetPrimitive.Overlay
    data-slot="sheet-overlay"
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
      className
    )}
    {...props}
  />
);

interface SheetContentProps extends SheetPrimitive.DialogContentProps {
  side?: "top" | "right" | "bottom" | "left";
}

const SheetContent: React.FC<SheetContentProps> = ({
  className,
  children,
  side = "right",
  ...props
}) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      data-slot="sheet-content"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 border-background bg-background text-foreground shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
        side === "right" &&
          "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
        side === "left" &&
          "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
        side === "top" &&
          "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
        side === "bottom" &&
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
        className
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="rounded-xs focus:outline-hidden absolute right-4 top-4 opacity-70 ring-offset-accent transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent">
        <XIcon className="size-4 text-accent" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
);

const SheetHeader: React.FC<React.ComponentProps<"div">> = ({ className, ...props }) => (
  <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
);

const SheetFooter: React.FC<React.ComponentProps<"div">> = ({ className, ...props }) => (
  <div
    data-slot="sheet-footer"
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);

const SheetTitle: React.FC<SheetPrimitive.DialogTitleProps> = ({ className, ...props }) => (
  <SheetPrimitive.Title
    data-slot="sheet-title"
    className={cn("font-medium text-foreground", className)}
    {...props}
  />
);

const SheetDescription: React.FC<SheetPrimitive.DialogDescriptionProps> = ({
  className,
  ...props
}) => (
  <SheetPrimitive.Description
    data-slot="sheet-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
};
