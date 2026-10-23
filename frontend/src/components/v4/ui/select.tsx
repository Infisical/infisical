import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { useFieldControlAttributes } from "../lib/field-context";
import { ListHighlight } from "../lib/list-highlight";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import picker from "./picker.module.css";

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
          <SelectContent
            align={align}
            style={
              menuWidth
                ? { width: menuWidth, maxWidth: "var(--radix-select-content-available-width)" }
                : undefined
            }
          >
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

function SelectGroup({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group ref={ref} data-slot="select-group" className={className} {...props} />
  );
}
SelectGroup.displayName = "SelectGroup";

function SelectValue({ ref, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value ref={ref} data-slot="select-value" {...props} />;
}
SelectValue.displayName = "SelectValue";

function SelectTrigger({
  className,
  size = "default",
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default" | "md" | "lg";
} & { ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Trigger>> }) {
  const fieldAttributes = useFieldControlAttributes(props);
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        controlStyles.field,
        controlStyles.trigger,
        controlStyles.triggerHover,
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
}
SelectTrigger.displayName = "SelectTrigger";

function SelectContent({
  className,
  collisionPadding = 8,
  children,
  align = "start",
  sideOffset = 4,
  style,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>, "position"> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Content>>;
}) {
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
        style={{ width: "var(--radix-select-trigger-width)", ...style }}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className={menu.inset} data-scroll-fade="y">
          {children}
          <ListHighlight />
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
SelectContent.displayName = "SelectContent";

function SelectLabel({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      data-slot="select-label"
      className={cn(menu.label, className)}
      {...props}
    />
  );
}
SelectLabel.displayName = "SelectLabel";

function SelectItem({
  className,
  children,
  description,
  "aria-describedby": describedBy,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { description?: string } & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Item>>;
}) {
  const descriptionId = React.useId();
  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      aria-describedby={
        [describedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") ||
        undefined
      }
      className={cn(menu.row, picker.option, className)}
      {...props}
    >
      <span className={picker.optionLabel}>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </span>
      {description && (
        <span id={descriptionId} className={picker.optionMeta}>
          {description}
        </span>
      )}
      <span className={picker.optionCheck}>
        <SelectPrimitive.ItemIndicator>
          <Icon name="check" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}
SelectItem.displayName = "SelectItem";

function SelectSeparator({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      data-slot="select-separator"
      className={cn(menu.separator, className)}
      {...props}
    />
  );
}
SelectSeparator.displayName = "SelectSeparator";

function SelectScrollUpButton({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
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
}
SelectScrollUpButton.displayName = "SelectScrollUpButton";

function SelectScrollDownButton({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
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
}
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
