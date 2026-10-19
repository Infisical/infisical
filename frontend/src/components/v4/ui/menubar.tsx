import * as React from "react";
import { cn } from "cn";
import { Menubar as MenubarPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { Icon } from "./icon";
import { menuRowContent, menuShortcutContent } from "./menu-content";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";

const Menubar = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <MenubarPrimitive.Root
      ref={ref}
      data-slot="menubar"
      className={cn("flex items-center rounded-lg border border-[color:var(--v4-line)]", className)}
      {...props}
    />
  );
});
Menubar.displayName = "Menubar";

function MenubarMenu({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />;
}

const MenubarGroup = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Group>
>(({ ...props }, ref) => {
  return <MenubarPrimitive.Group ref={ref} data-slot="menubar-group" {...props} />;
});
MenubarGroup.displayName = "MenubarGroup";

function MenubarPortal({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return (
    <MenubarPrimitive.Portal
      container={useV4PortalContainer()}
      data-slot="menubar-portal"
      {...props}
    />
  );
}

const MenubarRadioGroup = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioGroup>
>(({ ...props }, ref) => {
  return <MenubarPrimitive.RadioGroup ref={ref} data-slot="menubar-radio-group" {...props} />;
});
MenubarRadioGroup.displayName = "MenubarRadioGroup";

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  return (
    <MenubarPrimitive.Trigger
      ref={ref}
      data-slot="menubar-trigger"
      className={cn(
        controlStyles.focusOutline,
        "flex items-center rounded-sm px-1.5 py-[2px] select-none hover:bg-muted aria-expanded:bg-muted",
        className
      )}
      {...props}
    />
  );
});
MenubarTrigger.displayName = "MenubarTrigger";

const MenubarContent = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(
  (
    {
      className,
      collisionPadding = 8,
      align = "start",
      alignOffset = -4,
      sideOffset = 8,
      ...props
    },
    ref
  ) => {
    return (
      <MenubarPortal>
        <MenubarPrimitive.Content
          ref={ref}
          data-slot="menubar-content"
          collisionPadding={collisionPadding}
          align={align}
          alignOffset={alignOffset}
          sideOffset={sideOffset}
          className={cn("z-50", menu.surface, menu.panel, menu.inset, menu.motion, className)}
          {...props}
        />
      </MenubarPortal>
    );
  }
);
MenubarContent.displayName = "MenubarContent";

const MenubarItem = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  }
>(({ className, inset, variant = "default", children, ...props }, ref) => {
  return (
    <MenubarPrimitive.Item
      ref={ref}
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children)}
    </MenubarPrimitive.Item>
  );
});
MenubarItem.displayName = "MenubarItem";

const MenubarCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem> & {
    closeOnSelect?: boolean;
  } & {
    inset?: boolean;
  }
>(({ className, children, checked, inset, onSelect, closeOnSelect = false, ...props }, ref) => {
  return (
    <MenubarPrimitive.CheckboxItem
      ref={ref}
      data-slot="menubar-checkbox-item"
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
        <MenubarPrimitive.ItemIndicator>
          <Icon name="check" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {menuRowContent(children)}
    </MenubarPrimitive.CheckboxItem>
  );
});
MenubarCheckboxItem.displayName = "MenubarCheckboxItem";

const MenubarRadioItem = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem> & {
    closeOnSelect?: boolean;
  } & {
    inset?: boolean;
  }
>(({ className, children, inset, onSelect, closeOnSelect = false, ...props }, ref) => {
  return (
    <MenubarPrimitive.RadioItem
      ref={ref}
      data-slot="menubar-radio-item"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!closeOnSelect) event.preventDefault();
      }}
    >
      <span className={menu.indicator}>
        <MenubarPrimitive.ItemIndicator>
          <Icon name="check" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {menuRowContent(children)}
    </MenubarPrimitive.RadioItem>
  );
});
MenubarRadioItem.displayName = "MenubarRadioItem";

const MenubarLabel = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => {
  return (
    <MenubarPrimitive.Label
      ref={ref}
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(menu.label, className)}
      {...props}
    />
  );
});
MenubarLabel.displayName = "MenubarLabel";

const MenubarSeparator = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <MenubarPrimitive.Separator
      ref={ref}
      data-slot="menubar-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
});
MenubarSeparator.displayName = "MenubarSeparator";

const MenubarShortcut = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, children, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="menubar-shortcut"
      className={cn(menu.shortcut, className)}
      {...props}
    >
      {menuShortcutContent(children)}
    </span>
  );
});
MenubarShortcut.displayName = "MenubarShortcut";

function MenubarSub({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />;
}

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => {
  return (
    <MenubarPrimitive.SubTrigger
      ref={ref}
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(menu.row, className)}
      {...props}
    >
      {menuRowContent(children)}
      <Icon name="chev-right" className={menu.trail} />
    </MenubarPrimitive.SubTrigger>
  );
});
MenubarSubTrigger.displayName = "MenubarSubTrigger";

const MenubarSubContent = React.forwardRef<
  React.ComponentRef<typeof MenubarPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>
>(({ className, collisionPadding = 8, ...props }, ref) => {
  return (
    <MenubarPrimitive.SubContent
      ref={ref}
      data-slot="menubar-sub-content"
      collisionPadding={collisionPadding}
      className={cn("z-50", menu.surface, menu.panel, menu.sub, menu.inset, menu.motion, className)}
      {...props}
    />
  );
});
MenubarSubContent.displayName = "MenubarSubContent";

export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
};
