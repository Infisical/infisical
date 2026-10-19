import * as React from "react";
import { cn } from "cn";
import { Select as SelectPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { useFieldControlAttributes } from "../lib/field-context";
import { Icon } from "./icon";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
};
function Select({
  options,
  label,
  placeholder = "Choose an option",
  size,
  invalid,
  align = "start",
  menuWidth,
  onChange,
  onValueChange,
  children,
  id,
  "aria-describedby": describedBy,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root> & {
  options?: readonly SelectOption[];
  label?: string;
  placeholder?: string;
  size?: "sm" | "default" | "md" | "lg";
  invalid?: boolean;
  align?: "start" | "center" | "end";
  menuWidth?: React.CSSProperties["width"];
  onChange?: (value: string) => void;
  id?: string;
  "aria-describedby"?: string;
}) {
  const groups = [...new Set(options?.map((option) => option.group ?? ""))];
  return (
    <SelectPrimitive.Root
      data-slot="select"
      onValueChange={(value) => {
        onValueChange?.(value);
        onChange?.(value);
      }}
      {...props}
    >
      {options ? (
        <>
          <SelectTrigger
            id={id}
            size={size ?? "default"}
            aria-label={label}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent align={align} style={{ width: menuWidth }}>
            {groups.map((group) => (
              <SelectGroup key={group}>
                {group && <SelectLabel>{group}</SelectLabel>}
                {options
                  .filter((option) => (option.group ?? "") === group)
                  .map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      description={option.description}
                    >
                      <span data-slot="select-option-label">{option.label}</span>
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </>
      ) : (
        children
      )}
    </SelectPrimitive.Root>
  );
}

const SelectGroup = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Group>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Group ref={ref} data-slot="select-group" className={className} {...props} />
  );
});
SelectGroup.displayName = "SelectGroup";

const SelectValue = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Value>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>
>(({ ...props }, ref) => {
  return <SelectPrimitive.Value ref={ref} data-slot="select-value" {...props} />;
});
SelectValue.displayName = "SelectValue";

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    size?: "sm" | "default" | "md" | "lg";
  }
>(({ className, size = "default", children, ...props }, ref) => {
  const fieldAttributes = useFieldControlAttributes(props);
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        controlStyles.field,
        controlStyles.trigger,
        controlStyles.insetHover,
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        controlStyles.selectTrigger,
        className
      )}
      {...props}
      {...fieldAttributes}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon name="chev-down" className={controlStyles.chevron} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>, "position">
>(
  (
    { className, collisionPadding = 8, children, align = "start", sideOffset = 4, ...props },
    ref
  ) => {
    return (
      <SelectPrimitive.Portal container={useV4PortalContainer()}>
        <SelectPrimitive.Content
          ref={ref}
          data-slot="select-content"
          collisionPadding={collisionPadding}
          className={cn("relative z-50", menu.surface, menu.panel, menu.motion, className)}
          position="popper"
          align={align}
          sideOffset={sideOffset}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport className={menu.inset}>{children}</SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  }
);
SelectContent.displayName = "SelectContent";

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Label
      ref={ref}
      data-slot="select-label"
      className={cn(menu.label, className)}
      {...props}
    />
  );
});
SelectLabel.displayName = "SelectLabel";

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { description?: string }
>(({ className, children, description, "aria-describedby": describedBy, ...props }, ref) => {
  const descriptionId = React.useId();
  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      aria-describedby={
        [describedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") ||
        undefined
      }
      className={cn(menu.row, className)}
      {...props}
    >
      <span className={menu.indicator}>
        <SelectPrimitive.ItemIndicator>
          <Icon name="check" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <span className={menu.text}>
        <SelectPrimitive.ItemText className={menu.title}>{children}</SelectPrimitive.ItemText>
        {description && (
          <span id={descriptionId} className={menu.description}>
            {description}
          </span>
        )}
      </span>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = "SelectItem";

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      data-slot="select-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
});
SelectSeparator.displayName = "SelectSeparator";

const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name="chev-down" className="rotate-180" />
    </SelectPrimitive.ScrollUpButton>
  );
});
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name="chev-down" />
    </SelectPrimitive.ScrollDownButton>
  );
});
SelectScrollDownButton.displayName = "SelectScrollDownButton";

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue
};
