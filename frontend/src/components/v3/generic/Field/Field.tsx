import { useMemo } from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";
import { Label } from "../Label";
import { Separator } from "../Separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "m-0 flex min-w-0 flex-col gap-4 border-0 p-0 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-1.5 font-medium text-foreground data-[variant=label]:text-sm data-[variant=legend]:text-base",
        className
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
        className
      )}
      {...props}
    />
  );
}

const fieldVariants = cva("data-[invalid=true]:text-destructive gap-2 group/field flex w-full", {
  variants: {
    orientation: {
      vertical: "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-0.5 leading-snug", className)}
      {...props}
    />
  );
}

const fieldLabelVariants = cva(
  cn(
    "group/field-label peer/field-label flex w-fit items-center gap-1.5 border-border text-xs leading-snug text-accent transition-colors duration-75 group-data-[disabled=true]/field:opacity-50",
    "has-[>[data-slot=field]]:cursor-pointer has-[>[data-slot=field]]:rounded-md",
    "has-[>[data-slot=field]]:border has-[>[data-slot=field]]:bg-transparent has-[>[data-slot=field]]:hover:bg-container-hover [&>*]:data-[slot=field]:p-2.5 [&>svg]:size-3",
    "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col"
  ),
  {
    variants: {
      variant: {
        default: "has-[[data-state=checked]]:bg-container!", // uses base styling
        project:
          "has-[[data-state=checked]]:border-project/30 has-[[data-state=checked]]:bg-project/5!",
        org: "has-[[data-state=checked]]:border-org/30 has-[[data-state=checked]]:bg-org/5!",
        "sub-org":
          "has-[[data-state=checked]]:border-sub-org/30 has-[[data-state=checked]]:bg-sub-org/5!"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function FieldLabel({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof Label> & VariantProps<typeof fieldLabelVariants>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(fieldLabelVariants({ variant }), className)}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled=true]/field:opacity-50 [&>svg]:mb-px [&>svg]:size-3.5 [&>svg]:text-muted",
        className
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "mt-0.5 text-left text-xs leading-snug font-normal text-muted group-has-[[data-orientation=horizontal]]/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      {children ? (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-medium text-muted/65" data-slot="field-separator-content">
            {children}
          </span>
          <Separator className="flex-1" />
        </div>
      ) : (
        <Separator className="absolute inset-0 top-1/2" />
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors?.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) => error?.message && <li key={`error-${index + 1}`}>{error.message}</li>
        )}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("mt-0.5 text-xs leading-snug font-normal text-danger", className)}
      {...props}
    >
      {content}
    </div>
  );
}

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
