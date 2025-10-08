import { cva, type VariantProps } from "cva";
import { cn } from "../../utils";

const Empty = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty"
    className={cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 text-balance rounded-lg border-dashed p-6 text-center text-foreground md:p-12",
      className
    )}
    {...props}
  />
);

const EmptyHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-header"
    className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
    {...props}
  />
);

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-neutral-700 text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

const EmptyMedia = ({
  className,
  variant = "icon",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) => (
  <div
    data-slot="empty-icon"
    data-variant={variant}
    className={cn(emptyMediaVariants({ variant, className }))}
    {...props}
  />
);

const EmptyTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-title"
    className={cn("text-lg font-medium tracking-tight", className)}
    {...props}
  />
);

const EmptyDescription = ({ className, ...props }: React.ComponentProps<"p">) => (
  <div
    data-slot="empty-description"
    className={cn(
      "text-muted-foreground text-sm/relaxed [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
      className
    )}
    {...props}
  />
);

const EmptyContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-content"
    className={cn(
      "flex w-full min-w-0 max-w-sm flex-col items-center gap-4 text-balance text-sm",
      className
    )}
    {...props}
  />
);

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia };
