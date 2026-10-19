"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "@app/components/v4/ui/button";

import { FieldControlContext, useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";

import geometry from "./button-geometry.module.css";
import controlStyles from "./controls.module.css";

const InputGroup = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & { size?: "sm" | "md" | "lg"; invalid?: boolean }
>(({ className, size = "sm", invalid, ...props }, ref) => {
  const field = React.useContext(FieldControlContext);
  return (
    <FieldControlContext.Provider
      value={{ ...field, "aria-invalid": invalid || field["aria-invalid"] }}
    >
      <div
        ref={ref}
        data-slot="input-group"
        data-size={size}
        data-invalid={invalid || undefined}
        role="group"
        className={cn(
          "group/input-group relative flex w-full min-w-0 items-center",
          controlStyles.field,
          controlStyles.inputGroup,
          geometry.inputGroup,
          className
        )}
        {...props}
      />
    </FieldControlContext.Provider>
  );
});
InputGroup.displayName = "InputGroup";

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-2 has-[>kbd]:ml-[-0.15rem]",
        "inline-end": "order-last pr-2 has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2"
      }
    },
    defaultVariants: {
      align: "inline-start"
    }
  }
);

const InputGroupAddon = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & VariantProps<typeof inputGroupAddonVariants>
>(({ className, align = "inline-start", ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (
          e.defaultPrevented ||
          (e.target instanceof Element && e.target.closest("button, a, input, textarea, select"))
        ) {
          return;
        }
        e.currentTarget.parentElement
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
          ?.focus();
      }}
    />
  );
});
InputGroupAddon.displayName = "InputGroupAddon";

const InputGroupButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentPropsWithoutRef<typeof Button>, "size"> & {
    size?: "xs" | "sm" | "icon-xs" | "icon-sm" | null;
  }
>(({ className, type = "button", variant = "ghost", size = "xs", ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type={type}
      data-slot="input-group-button"
      size={size}
      variant={variant}
      className={cn(geometry.nestedAction, "shadow-none", className)}
      {...props}
    />
  );
});
InputGroupButton.displayName = "InputGroupButton";

const InputGroupText = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
});
InputGroupText.displayName = "InputGroupText";

const InputGroupInput = React.forwardRef<
  React.ElementRef<"input">,
  React.ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => {
  const field = useFieldControlAttributes(props);
  return (
    <input
      ref={ref}
      data-slot="input-group-control"
      data-field-control=""
      className={cn(controlStyles.bare, className)}
      {...props}
      {...field}
    />
  );
});
InputGroupInput.displayName = "InputGroupInput";

const InputGroupTextarea = React.forwardRef<
  React.ElementRef<"textarea">,
  React.ComponentPropsWithoutRef<"textarea">
>(({ className, ...props }, ref) => {
  const field = useFieldControlAttributes(props);
  return (
    <textarea
      ref={ref}
      data-slot="input-group-control"
      data-field-control=""
      className={cn(controlStyles.bare, controlStyles.textarea, "resize-none", className)}
      {...props}
      {...field}
    />
  );
});
InputGroupTextarea.displayName = "InputGroupTextarea";

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea
};
