/* eslint-disable react/prop-types */

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@app/components/v3/utils";

function UnstableDropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function UnstableDropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function UnstableDropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function UnstableDropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "z-50 overflow-x-hidden overflow-y-auto rounded-[6px] border border-border bg-popover p-1.5 text-sm text-foreground shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function UnstableDropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

type DropdownMenuProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Item>,
  "disabled"
> & {
  inset?: boolean;
  variant?: "default" | "danger";
  isDisabled?: boolean;
};

const UnstableDropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuProps>(
  ({ className, inset, variant = "default", isDisabled, ...props }, ref): JSX.Element => {
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        data-slot="dropdown-menu-item"
        data-inset={inset}
        data-variant={variant}
        className={cn(
          "text-sm",
          "data-[variant=danger]:text-danger data-[variant=danger]:focus:bg-danger/10 data-[variant=danger]:*:[svg]:!text-danger",
          "relative flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 outline-0 select-none focus:bg-foreground/5",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
        disabled={isDisabled}
        {...props}
      />
    );
  }
);

function UnstableDropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 rounded-sm py-2 pr-10 pl-2 text-sm outline-0 select-none",
        "focus:bg-foreground/5",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:mb-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function UnstableDropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function UnstableDropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm pt-2 pr-8 pb-1.5 pl-2 text-sm outline-0 select-none",
        "focus:bg-foreground/10",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:mb-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function UnstableDropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("px-2 py-1.5 text-xs font-medium text-accent data-[inset]:pl-8", className)}
      {...props}
    />
  );
}

function UnstableDropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function UnstableDropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-sm tracking-widest text-accent", className)}
      {...props}
    />
  );
}

function UnstableDropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function UnstableDropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-0 select-none focus:bg-foreground/10 data-[inset]:pl-8 data-[state=open]:bg-foreground/10",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-3.5" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function UnstableDropdownMenuSubContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-[6px] border border-border bg-popover p-1 text-foreground shadow-lg",
        className
      )}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

type UnstableDropdownMenuChecked = DropdownMenuPrimitive.DropdownMenuCheckboxItemProps["checked"];

export {
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  type UnstableDropdownMenuChecked,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuGroup,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuPortal,
  UnstableDropdownMenuRadioGroup,
  UnstableDropdownMenuRadioItem,
  UnstableDropdownMenuSeparator,
  UnstableDropdownMenuShortcut,
  UnstableDropdownMenuSub,
  UnstableDropdownMenuSubContent,
  UnstableDropdownMenuSubTrigger,
  UnstableDropdownMenuTrigger
};
