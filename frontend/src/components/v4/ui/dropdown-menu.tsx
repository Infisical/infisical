import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { useV4CollisionBoundary, useV4PortalContainer } from "@app/components/v4/scope";

import { ListHighlight } from "../lib/list-highlight";
import { useMenuPrimitive } from "../lib/menu-kind";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { menuRowContent, menuShortcutContent } from "./menu-content";
import { useMenuInset } from "./menu-inset";

import menu from "./menu.module.css";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal
      container={useV4PortalContainer()}
      data-slot="dropdown-menu-portal"
      {...props}
    />
  );
}

function DropdownMenuTrigger({
  className,
  asChild,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return asChild ? (
    <DropdownMenuPrimitive.Trigger
      ref={ref}
      asChild
      data-slot="dropdown-menu-trigger"
      className={className}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Trigger>
  ) : (
    <DropdownMenuPrimitive.Trigger ref={ref} asChild data-slot="dropdown-menu-trigger" {...props}>
      <Button type="button" variant="outline" className={className}>
        {children}
      </Button>
    </DropdownMenuPrimitive.Trigger>
  );
}
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

function DropdownMenuContent({
  className,
  children,
  collisionPadding = 8,
  align = "start",
  sideOffset = 4,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const insetRef = useMenuInset(ref);
  return (
    <DropdownMenuPrimitive.Portal container={useV4PortalContainer()}>
      <DropdownMenuPrimitive.Content
        ref={insetRef}
        data-slot="dropdown-menu-content"
        collisionPadding={collisionPadding}
        collisionBoundary={useV4CollisionBoundary()}
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50", menu.surface, menu.panel, menu.inset, menu.motion, className)}
        data-scroll-fade="y"
        {...props}
      >
        {children}
        <ListHighlight />
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}
DropdownMenuContent.displayName = "DropdownMenuContent";

function DropdownMenuGroup({
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  const Primitive = useMenuPrimitive();
  return <Primitive.Group ref={ref} data-slot="dropdown-menu-group" {...props} />;
}
DropdownMenuGroup.displayName = "DropdownMenuGroup";

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  description,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  description?: React.ReactNode;
} & { ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.Item>> }) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children, description)}
    </Primitive.Item>
  );
}
DropdownMenuItem.displayName = "DropdownMenuItem";

function DropdownMenuCheckboxItem({
  className,
  children,
  description,
  checked,
  inset,
  onSelect,
  closeOnSelect = false,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
  description?: React.ReactNode;
  closeOnSelect?: boolean;
} & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>> }) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.CheckboxItem
      ref={ref}
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(menu.row, className)}
      checked={checked}
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!closeOnSelect) event.preventDefault();
      }}
    >
      <span className={menu.indicator} data-slot="dropdown-menu-checkbox-item-indicator">
        <Primitive.ItemIndicator>
          <Icon name="check" />
        </Primitive.ItemIndicator>
      </span>
      {menuRowContent(children, description)}
    </Primitive.CheckboxItem>
  );
}
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

function DropdownMenuRadioGroup({
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  const Primitive = useMenuPrimitive();
  return <Primitive.RadioGroup ref={ref} data-slot="dropdown-menu-radio-group" {...props} />;
}
DropdownMenuRadioGroup.displayName = "DropdownMenuRadioGroup";

function DropdownMenuRadioItem({
  className,
  children,
  description,
  inset,
  onSelect,
  closeOnSelect = false,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
  description?: React.ReactNode;
  closeOnSelect?: boolean;
} & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.RadioItem>> }) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.RadioItem
      ref={ref}
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!closeOnSelect) event.preventDefault();
      }}
    >
      <span className={menu.indicator} data-slot="dropdown-menu-radio-item-indicator">
        <Primitive.ItemIndicator>
          <Icon name="check" />
        </Primitive.ItemIndicator>
      </span>
      {menuRowContent(children, description)}
    </Primitive.RadioItem>
  );
}
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

function DropdownMenuLabel({
  className,
  inset,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.Label>> }) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.Label
      ref={ref}
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(menu.label, className)}
      {...props}
    />
  );
}
DropdownMenuLabel.displayName = "DropdownMenuLabel";

function DropdownMenuSeparator({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.Separator
      ref={ref}
      data-slot="dropdown-menu-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
}
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

function DropdownMenuShortcut({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      data-slot="dropdown-menu-shortcut"
      className={cn(menu.shortcut, className)}
      {...props}
    >
      {menuShortcutContent(children)}
    </span>
  );
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  const Primitive = useMenuPrimitive();
  return <Primitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>> }) {
  const Primitive = useMenuPrimitive();
  return (
    <Primitive.SubTrigger
      ref={ref}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children)}
      <Icon name="chev-right" className={menu.trail} />
    </Primitive.SubTrigger>
  );
}
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

function DropdownMenuSubContent({
  className,
  children,
  collisionPadding = 8,
  sideOffset = 4,
  alignOffset = -3,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  const Primitive = useMenuPrimitive();
  const insetRef = useMenuInset(ref);
  return (
    <Primitive.Portal container={useV4PortalContainer()}>
      <Primitive.SubContent
        ref={insetRef}
        data-slot="dropdown-menu-sub-content"
        collisionPadding={collisionPadding}
        collisionBoundary={useV4CollisionBoundary()}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={cn(
          "z-50",
          menu.surface,
          menu.panel,
          menu.sub,
          menu.inset,
          menu.motion,
          className
        )}
        data-scroll-fade="y"
        {...props}
      >
        {children}
        <ListHighlight />
      </Primitive.SubContent>
    </Primitive.Portal>
  );
}
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
};
