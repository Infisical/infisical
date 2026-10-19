import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Icon } from "@app/components/v4/ui/icon";

import { cn } from "../lib/utils";
import { menuShortcutContent } from "./menu-content";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import overlay from "./overlay.module.css";

const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => {
  return (
    <CommandPrimitive
      ref={ref}
      data-slot="command"
      className={cn("flex size-full flex-col overflow-hidden text-foreground", className)}
      {...props}
    />
  );
});
Command.displayName = "Command";

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}) {
  const opener = React.useRef<Element | null>(null);
  React.useLayoutEffect(() => {
    if (props.open) opener.current = document.activeElement;
  }, [props.open]);
  return (
    <Dialog {...props}>
      <DialogContent
        data-command-dialog=""
        className={cn(overlay.palette, className)}
        showCloseButton={showCloseButton}
        onEscapeKeyDown={onEscapeKeyDown}
        onCloseAutoFocus={(event) => {
          const target = opener.current;
          if (!(target instanceof HTMLElement) || !target.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { trailing?: React.ReactNode }
>(({ className, trailing, ...props }, ref) => {
  return (
    <div data-slot="command-input-wrapper" className={controlStyles.searchRow}>
      <Icon name="search" />
      <CommandPrimitive.Input
        ref={ref}
        data-slot="command-input"
        className={className}
        {...props}
      />
      {trailing && (
        <span data-slot="command-input-trailing" className={controlStyles.searchTrailing}>
          {trailing}
        </span>
      )}
    </div>
  );
});
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => {
  return (
    <CommandPrimitive.List
      ref={ref}
      data-slot="command-list"
      className={cn(menu.list, menu.inset, className)}
      {...props}
    />
  );
});
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      data-slot="command-empty"
      className={cn(menu.empty, className)}
      {...props}
    />
  );
});
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => {
  return (
    <CommandPrimitive.Group
      ref={ref}
      data-slot="command-group"
      className={cn(menu.group, className)}
      {...props}
    />
  );
});
CommandGroup.displayName = "CommandGroup";

const CommandSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      data-slot="command-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
});
CommandSeparator.displayName = "CommandSeparator";

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { "data-checked"?: boolean }
>(({ className, children, ...props }, ref) => {
  const checkable = props["data-checked"] !== undefined;
  return (
    <CommandPrimitive.Item
      ref={ref}
      data-slot="command-item"
      className={cn(menu.row, className)}
      {...props}
    >
      {checkable && (
        <span className={menu.indicator} data-command="">
          <Icon name="check" />
        </span>
      )}
      {children}
    </CommandPrimitive.Item>
  );
});
CommandItem.displayName = "CommandItem";

const CommandShortcut = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="command-shortcut"
      className={cn(menu.shortcut, className)}
      {...props}
    >
      {menuShortcutContent(children)}
    </span>
  );
});
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
};
