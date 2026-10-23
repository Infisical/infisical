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

import { ListHighlight } from "../lib/list-highlight";
import { cn } from "../lib/utils";
import { menuShortcutContent } from "./menu-content";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import overlay from "./overlay.module.css";

function Command({ className, ref, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      ref={ref}
      data-slot="command"
      className={cn("flex size-full flex-col overflow-hidden text-foreground", className)}
      {...props}
    />
  );
}
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

function CommandInput({
  className,
  trailing,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
  trailing?: React.ReactNode;
} & { ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Input>> }) {
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
}
CommandInput.displayName = "CommandInput";

function CommandList({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      ref={ref}
      data-slot="command-list"
      data-scroll-fade="y"
      className={cn(menu.list, menu.inset, className)}
      {...props}
    >
      {children}
      <ListHighlight />
    </CommandPrimitive.List>
  );
}
CommandList.displayName = "CommandList";

function CommandEmpty({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      data-slot="command-empty"
      className={cn(menu.empty, className)}
      {...props}
    />
  );
}
CommandEmpty.displayName = "CommandEmpty";

function CommandGroup({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      data-slot="command-group"
      className={cn(menu.group, className)}
      {...props}
    />
  );
}
CommandGroup.displayName = "CommandGroup";

function CommandSeparator({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      data-slot="command-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
}
CommandSeparator.displayName = "CommandSeparator";

function CommandItem({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { "data-checked"?: boolean } & {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Item>>;
}) {
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
}
CommandItem.displayName = "CommandItem";

function CommandShortcut({ className, children, ref, ...props }: React.ComponentProps<"span">) {
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
}
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
