import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

import { useV4CollisionBoundary, useV4PortalContainer } from "@app/components/v4/scope";

import { ListHighlight } from "../lib/list-highlight";
import { MenuKindContext } from "../lib/menu-kind";
import { cn } from "../lib/utils";
import { Icon } from "./icon";
import { menuRowContent, menuShortcutContent } from "./menu-content";

import menu from "./menu.module.css";

/**
 * Whether a pointer has pressed inside the open menu. Radix selects the item under a pointerup that
 * had no pointerdown on it, so the release of the opening right-click or long press would select
 * whichever item the menu placed under the cursor. Items take pointer releases only after a press.
 */
const PressedSinceOpenContext = React.createContext<React.RefObject<boolean> | null>(null);

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const pressedSinceOpen = React.useRef(false);
  return (
    <PressedSinceOpenContext value={pressedSinceOpen}>
      <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
    </PressedSinceOpenContext>
  );
}

function ContextMenuTrigger({
  className,
  disabled,
  onKeyDown,
  onContextMenuCapture,
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  const pressedSinceOpen = React.useContext(PressedSinceOpenContext);
  return (
    <ContextMenuPrimitive.Trigger
      ref={ref}
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      disabled={disabled}
      {...props}
      onContextMenuCapture={(event) => {
        onContextMenuCapture?.(event);
        if (pressedSinceOpen) pressedSinceOpen.current = false;
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled || event.repeat) return;
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          })
        );
      }}
    />
  );
}
ContextMenuTrigger.displayName = "ContextMenuTrigger";

function ContextMenuGroup({
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return <ContextMenuPrimitive.Group ref={ref} data-slot="context-menu-group" {...props} />;
}
ContextMenuGroup.displayName = "ContextMenuGroup";

function ContextMenuPortal({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal
      container={useV4PortalContainer()}
      data-slot="context-menu-portal"
      {...props}
    />
  );
}

function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuRadioGroup({
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup ref={ref} data-slot="context-menu-radio-group" {...props} />
  );
}
ContextMenuRadioGroup.displayName = "ContextMenuRadioGroup";

function ContextMenuContent({
  className,
  children,
  collisionPadding = 8,
  onPointerDownCapture,
  onPointerUpCapture,
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  const pressedSinceOpen = React.useContext(PressedSinceOpenContext);
  return (
    <ContextMenuPrimitive.Portal container={useV4PortalContainer()}>
      <ContextMenuPrimitive.Content
        ref={ref}
        data-slot="context-menu-content"
        collisionPadding={collisionPadding}
        collisionBoundary={useV4CollisionBoundary()}
        className={cn("z-50", menu.surface, menu.panel, menu.inset, menu.motion, className)}
        data-scroll-fade="y"
        {...props}
        onPointerDownCapture={(event) => {
          onPointerDownCapture?.(event);
          if (pressedSinceOpen) pressedSinceOpen.current = true;
        }}
        onPointerUpCapture={(event) => {
          onPointerUpCapture?.(event);
          if (pressedSinceOpen && !pressedSinceOpen.current) event.preventDefault();
        }}
      >
        <MenuKindContext value="context">{children}</MenuKindContext>
        <ListHighlight />
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}
ContextMenuContent.displayName = "ContextMenuContent";

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
} & { ref?: React.Ref<React.ComponentRef<typeof ContextMenuPrimitive.Item>> }) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children)}
    </ContextMenuPrimitive.Item>
  );
}
ContextMenuItem.displayName = "ContextMenuItem";

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof ContextMenuPrimitive.SubTrigger>> }) {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children)}
      <Icon name="chev-right" className={menu.trail} />
    </ContextMenuPrimitive.SubTrigger>
  );
}
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

function ContextMenuSubContent({
  className,
  children,
  collisionPadding = 8,
  sideOffset = 4,
  alignOffset = -3,
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal container={useV4PortalContainer()}>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        data-slot="context-menu-sub-content"
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
        <MenuKindContext value="context">{children}</MenuKindContext>
        <ListHighlight />
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
ContextMenuSubContent.displayName = "ContextMenuSubContent";

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  onSelect,
  closeOnSelect = false,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> & {
  closeOnSelect?: boolean;
} & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof ContextMenuPrimitive.CheckboxItem>> }) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={cn(menu.row, className)}
      checked={checked}
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!closeOnSelect) event.preventDefault();
      }}
    >
      <span className={menu.indicator}>
        <ContextMenuPrimitive.ItemIndicator>
          <Icon name="check" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {menuRowContent(children)}
    </ContextMenuPrimitive.CheckboxItem>
  );
}
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

function ContextMenuRadioItem({
  className,
  children,
  inset,
  onSelect,
  closeOnSelect = false,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem> & {
  closeOnSelect?: boolean;
} & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof ContextMenuPrimitive.RadioItem>> }) {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!closeOnSelect) event.preventDefault();
      }}
    >
      <span className={menu.indicator}>
        <ContextMenuPrimitive.ItemIndicator>
          <Icon name="check" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {menuRowContent(children)}
    </ContextMenuPrimitive.RadioItem>
  );
}
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

function ContextMenuLabel({
  className,
  inset,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof ContextMenuPrimitive.Label>> }) {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(menu.label, className)}
      {...props}
    />
  );
}
ContextMenuLabel.displayName = "ContextMenuLabel";

function ContextMenuSeparator({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      data-slot="context-menu-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
}
ContextMenuSeparator.displayName = "ContextMenuSeparator";

function ContextMenuShortcut({ className, children, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      data-slot="context-menu-shortcut"
      className={cn(menu.shortcut, className)}
      {...props}
    >
      {menuShortcutContent(children)}
    </span>
  );
}
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
};
