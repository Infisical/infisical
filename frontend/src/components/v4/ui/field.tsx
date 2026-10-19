"use client";

import * as React from "react";
import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Label } from "@app/components/v4/ui/label";
import { Separator } from "@app/components/v4/ui/separator";

import { FieldControlContext } from "../lib/field-context";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import helperStyles from "./helpers.module.css";

const FieldSet = React.forwardRef<
  React.ComponentRef<"fieldset">,
  React.ComponentPropsWithoutRef<"fieldset">
>(({ className, ...props }, ref) => {
  return (
    <fieldset
      ref={ref}
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  );
});
FieldSet.displayName = "FieldSet";

const FieldLegend = React.forwardRef<
  React.ComponentRef<"legend">,
  React.ComponentPropsWithoutRef<"legend"> & { variant?: "legend" | "label" }
>(({ className, variant = "legend", ...props }, ref) => {
  return (
    <legend
      ref={ref}
      data-slot="field-legend"
      data-variant={variant}
      className={cn(helperStyles.fieldLegend, className)}
      {...props}
    />
  );
});
FieldLegend.displayName = "FieldLegend";

const FieldGroup = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
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
});
FieldGroup.displayName = "FieldGroup";

const fieldVariants = cva("group/field flex w-full", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});

const Field = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> &
    VariantProps<typeof fieldVariants> & {
      label?: string;
      description?: string;
      error?: string;
      optional?: boolean;
      group?: boolean;
    }
>(
  (
    {
      className,
      orientation = "vertical",
      label,
      description,
      error,
      optional = false,
      group = false,
      children,
      id,
      ...props
    },
    ref
  ) => {
    const generated = React.useId();
    const child = React.isValidElement<{ id?: string }>(children) ? children : null;
    const controlId = child?.props.id ?? id ?? generated;
    const noteId = `${controlId}-note`;
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
      <FieldControlContext.Provider value={label ? attributes : {}}>
        <div
          ref={ref}
          role={label ? undefined : "group"}
          data-slot="field"
          data-orientation={orientation}
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
      </FieldControlContext.Provider>
    );
  }
);
Field.displayName = "Field";

const FieldContent = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
});
FieldContent.displayName = "FieldContent";

const FieldLabel = React.forwardRef<
  React.ComponentRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  return (
    <Label
      ref={ref}
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 border-[color:var(--v4-line)] group-data-[disabled=true]/field:opacity-50 has-data-[state=checked]:border-[color:var(--v4-choice-selected-border)] has-data-[state=checked]:bg-[color:var(--v4-choice-selected-surface)] has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-2 has-[>[data-slot=field]]:has-[:focus-visible]:ring-[color:var(--v4-focus-ring)] *:data-[slot=field]:p-2.5",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    />
  );
});
FieldLabel.displayName = "FieldLabel";

const FieldTitle = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
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
});
FieldTitle.displayName = "FieldTitle";

const FieldDescription = React.forwardRef<
  React.ComponentRef<"p">,
  React.ComponentPropsWithoutRef<"p">
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="field-description"
      className={cn(
        helperStyles.fieldDescription,
        "text-muted-foreground text-left group-data-[orientation=horizontal]/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  );
});
FieldDescription.displayName = "FieldDescription";

const FieldSeparator = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    children?: React.ReactNode;
  }
>(({ children, className, ...props }, ref) => {
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
});
FieldSeparator.displayName = "FieldSeparator";

const FieldError = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    errors?: Array<{ message?: string } | undefined>;
  }
>(({ className, children, errors, ...props }, ref) => {
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
});
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
