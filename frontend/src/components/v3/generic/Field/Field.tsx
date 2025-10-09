import { useMemo } from "react";
import { cva, type VariantProps } from "cva";
import { cn } from "../../utils";
import { Label } from "../Label";
import { Separator } from "../Separator";

const FieldSet = ({ className, ...props }: React.ComponentProps<"fieldset">) => (
  <fieldset
    data-slot="field-set"
    className={cn(
      "flex flex-col gap-6",
      "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
      className
    )}
    {...props}
  />
);

const FieldLegend = ({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) => (
  <legend
    data-slot="field-legend"
    data-variant={variant}
    className={cn(
      "mb-3 font-medium text-foreground",
      "data-[variant=legend]:text-base",
      "data-[variant=label]:text-sm",
      className
    )}
    {...props}
  />
);

const FieldGroup = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="field-group"
    className={cn(
      "group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
      className
    )}
    {...props}
  />
);

const fieldVariants = cva("group/field flex w-full gap-3 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: ["flex-col [&>*]:w-full [&>.sr-only]:w-auto"],
      horizontal: [
        "flex-row items-center",
        "[&>[data-slot=field-label]]:flex-auto",
        "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
      ],
      responsive: [
        "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto",
        "@md/field-group:[&>[data-slot=field-label]]:flex-auto",
        "@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
      ]
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});

const Field = ({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) => (
  <div
    role="group"
    data-slot="field"
    data-orientation={orientation}
    className={cn("text-foreground", fieldVariants({ orientation }), className)}
    {...props}
  />
);

const FieldContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="field-content"
    className={cn("group/field-content flex flex-1 flex-col gap-1.5 leading-snug", className)}
    {...props}
  />
);

const FieldLabel = ({ className, ...props }: React.ComponentProps<typeof Label>) => (
  <Label
    data-slot="field-label"
    className={cn(
      "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
      "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4",
      "has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10",
      className
    )}
    {...props}
  />
);

const FieldTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="field-label"
    className={cn(
      "flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",
      className
    )}
    {...props}
  />
);

const FieldDescription = ({ className, ...props }: React.ComponentProps<"p">) => (
  <p
    data-slot="field-description"
    className={cn(
      "text-sm font-normal leading-normal text-muted-foreground group-has-[[data-orientation=horizontal]]/field:text-balance",
      "nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5",
      "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
      className
    )}
    {...props}
  />
);

const FieldSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) => (
  <div
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
        className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
        data-slot="field-separator-content"
      >
        {children}
      </span>
    )}
  </div>
);

const FieldError = ({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) => {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors) {
      return null;
    }

    if (errors?.length === 1 && errors[0]?.message) {
      return errors[0].message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1 text-danger">
        {errors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
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
      className={cn("text-sm font-normal text-danger", className)}
      {...props}
    >
      {content}
    </div>
  );
};

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle
};
