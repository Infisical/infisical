"use client";

import * as React from "react";
import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Label } from "@app/components/v4/ui/label";
import { Separator } from "@app/components/v4/ui/separator";

import { useDescendantFlags } from "../lib/descendant-flags";
import { FieldControlContext } from "../lib/field-context";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import helperStyles from "./helpers.module.css";

const setFlags = {
  "data-has-choice-group": ':scope > :is([data-slot="checkbox-group"], [data-slot="radio-group"])'
};
const childrenOnly = { subtree: false };
const fieldFlags = {
  "data-has-content": ':scope > [data-slot="field-content"]',
  "data-has-disabled": ":disabled"
};
const fieldWatch = { attributes: ["disabled"] };
const labelFlags = {
  "data-has-checked": '[data-state="checked"]',
  "data-has-field": ':scope > [data-slot="field"]',
  "data-has-disabled": ":disabled, [data-disabled]",
  "data-has-focus-visible": ":focus-visible"
};
const labelWatch = { attributes: ["data-state", "disabled", "data-disabled"], focus: true };

function FieldSet({ className, ref, ...props }: React.ComponentProps<"fieldset">) {
  const setRef = useDescendantFlags(setFlags, childrenOnly, ref);
  return (
    <fieldset
      ref={setRef}
      data-slot="field-set"
      className={cn("flex flex-col gap-4 data-[has-choice-group]:gap-3", className)}
      {...props}
    />
  );
}
FieldSet.displayName = "FieldSet";

function FieldLegend({
  className,
  variant = "legend",
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"legend"> & { variant?: "legend" | "label" } & {
  ref?: React.Ref<React.ComponentRef<"legend">>;
}) {
  return (
    <legend
      ref={ref}
      data-slot="field-legend"
      data-variant={variant}
      className={cn(helperStyles.fieldLegend, className)}
      {...props}
    />
  );
}
FieldLegend.displayName = "FieldLegend";

function FieldGroup({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="field-group"
      className={cn(
        helperStyles.fieldGroup,
        "group/field-group @container/field-group flex w-full flex-col data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  );
}
FieldGroup.displayName = "FieldGroup";

const fieldVariants = cva("group/field flex w-full", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center data-[has-content]:items-start *:data-[slot=field-label]:flex-auto data-[has-content]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:data-[has-content]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:data-[has-content]:[&>[role=checkbox],[role=radio]]:mt-px"
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});

function Field({
  className,
  orientation = "vertical",
  label,
  description,
  error,
  optional = false,
  group = false,
  wide = false,
  children,
  id,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> &
  VariantProps<typeof fieldVariants> & {
    label?: React.ReactNode;
    description?: string;
    error?: string;
    optional?: boolean;
    group?: boolean;
    wide?: boolean;
  } & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  const generated = React.useId();
  const child = React.isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = child?.props.id ?? id ?? generated;
  const noteId = `${controlId}-note`;
  const fieldRef = useDescendantFlags(fieldFlags, fieldWatch, ref);
  const labelId = `${controlId}-label`;
  const attributes = {
    id: group ? undefined : controlId,
    "aria-describedby": error || description ? noteId : undefined,
    "aria-invalid": Boolean(error) || undefined,
    "aria-labelledby": group ? undefined : labelId
  };
  const control =
    child && typeof child.type === "string"
      ? React.cloneElement(child, { ...attributes })
      : children;
  const note = (error || description) && (
    <p
      id={noteId}
      role={error ? "alert" : undefined}
      className={error ? helperStyles.fieldError : helperStyles.fieldDescription}
    >
      {error && <Icon name="alert" size={14} />}
      {error ? <span>{error}</span> : description}
    </p>
  );
  return (
    <FieldControlContext value={label ? attributes : {}}>
      <div
        ref={fieldRef}
        role={label ? undefined : "group"}
        data-slot="field"
        data-orientation={orientation}
        data-width={wide ? "wide" : undefined}
        data-invalid={Boolean(error) || undefined}
        className={cn(fieldVariants({ orientation }), helperStyles.field, className)}
        {...props}
      >
        {label ? (
          group ? (
            <fieldset className={helperStyles.fieldset}>
              <legend id={labelId}>
                {label}
                {optional && " (optional)"}
              </legend>
              <div className={helperStyles.fieldControl}>{control}</div>
              {note}
            </fieldset>
          ) : (
            <>
              <div className={helperStyles.fieldLabels}>
                <FieldLabel id={labelId} htmlFor={controlId}>
                  {label}
                  {optional && " (optional)"}
                </FieldLabel>
              </div>
              <div className={helperStyles.fieldControl}>
                {control}
                {note}
              </div>
            </>
          )
        ) : (
          children
        )}
      </div>
    </FieldControlContext>
  );
}
Field.displayName = "Field";

function FieldContent({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}
FieldContent.displayName = "FieldContent";

function FieldLabel({ className, ref, ...props }: React.ComponentProps<typeof Label>) {
  const labelRef = useDescendantFlags(labelFlags, labelWatch, ref);
  return (
    <Label
      ref={labelRef}
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 border-[color:var(--v4-line-soft)] group-data-[disabled=true]/field:opacity-50 data-[has-checked]:border-[color:var(--v4-choice-selected-border)] data-[has-checked]:bg-[color:var(--v4-choice-selected-surface)] data-[has-field]:rounded-lg data-[has-field]:border data-[has-field]:not-data-[has-disabled]:hover:bg-[color:var(--v4-hover)] data-[has-field]:data-[has-focus-visible]:border-ring data-[has-field]:data-[has-focus-visible]:ring-2 data-[has-field]:data-[has-focus-visible]:ring-[color:var(--v4-focus-ring)] *:data-[slot=field]:p-2.5",
        "data-[has-field]:w-full data-[has-field]:flex-col",
        className
      )}
      {...props}
    />
  );
}
FieldLabel.displayName = "FieldLabel";

function FieldTitle({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="field-label"
      className={cn(
        helperStyles.fieldTitle,
        "flex w-fit items-center gap-2 group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  );
}
FieldTitle.displayName = "FieldTitle";

function FieldDescription({ className, ref, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      ref={ref}
      data-slot="field-description"
      className={cn(
        helperStyles.fieldDescription,
        "text-muted-foreground text-left group-data-[orientation=horizontal]/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        className
      )}
      {...props}
    />
  );
}
FieldDescription.displayName = "FieldDescription";

function FieldSeparator({
  children,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  children?: React.ReactNode;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  return (
    <div
      ref={ref}
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="text-muted-foreground relative mx-auto block w-fit bg-background px-2"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}
FieldSeparator.displayName = "FieldSeparator";

function FieldError({
  className,
  children,
  errors,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    const messages = [
      ...new Set((errors ?? []).map((error) => error?.message).filter(Boolean))
    ] as string[];
    if (messages.length < 2) return messages[0] ?? null;
    return (
      <span className={helperStyles.fieldErrorLines}>
        {messages.map((message) => (
          <span key={message}>{message}</span>
        ))}
      </span>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      ref={ref}
      role="alert"
      data-slot="field-error"
      className={cn(helperStyles.fieldError, className)}
      {...props}
    >
      <Icon name="alert" size={14} />
      <span>{content}</span>
    </div>
  );
}
FieldError.displayName = "FieldError";

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
};
