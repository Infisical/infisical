import { cva, VariantProps } from "cva";

import { cn } from "../../utils";

const PageHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="page-header" className={cn("text-foreground", className)} {...props} />
);

const pageHeaderTitleVariants = cva("font-medium flex items-center gap-3", {
  variants: {
    size: {
      md: "text-xl",
      lg: "text-2xl"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

const PageHeaderTitle = ({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof pageHeaderTitleVariants>) => (
  <div
    data-slot="page-header-title"
    className={cn(pageHeaderTitleVariants({ size }), className)}
    {...props}
  />
);

const PageHeaderDescription = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="page-header-desc" className={cn("text-muted-foreground", className)} {...props} />
);

const pageHeaderMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none group-has-[[data-slot=item-description]]/item:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 border rounded-sm bg-muted [&_svg:not([class*='size-'])]:size-4",
        image: "size-10 rounded-sm overflow-hidden [&_img]:size-full [&_img]:object-cover"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

const PageHeaderMedia: React.FC<
  React.ComponentProps<"div"> & VariantProps<typeof pageHeaderMediaVariants>
> = ({ className, variant = "default", ...props }) => (
  <div
    data-slot="page-header-media"
    data-variant={variant}
    className={cn(pageHeaderMediaVariants({ variant, className }))}
    {...props}
  />
);

export { PageHeader, PageHeaderDescription, PageHeaderMedia, PageHeaderTitle };
