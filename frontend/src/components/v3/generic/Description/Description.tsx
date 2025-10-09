import { cn } from "../../utils";

const Description = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="description" className={cn("text-foreground", className)} {...props} />
);

const DescriptionHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="description-header"
    className={cn("text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
);

const DescriptionContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="description-content" className={cn("text-sm", className)} {...props} />
);

export { Description, DescriptionContent, DescriptionHeader };
