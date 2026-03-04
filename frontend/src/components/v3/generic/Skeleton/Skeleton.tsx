import { cn } from "../../utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-sm bg-muted/25", className)}
      {...props}
    />
  );
}

export { Skeleton };
