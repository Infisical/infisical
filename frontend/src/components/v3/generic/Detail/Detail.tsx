import { cn } from "../../utils";

function Detail({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="detail" className={cn("flex flex-col gap-y-1", className)} {...props} />;
}

function DetailLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="detail-label" className={cn("text-xs text-label", className)} {...props} />
  );
}

function DetailValue({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="detail-value" className={cn("text-sm break-all", className)} {...props} />;
}

function DetailHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="detail-header"
      className={cn("-mb-1 flex items-center text-sm font-medium", className)}
      {...props}
    />
  );
}

function DetailGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="detail-group" className={cn("flex flex-col gap-y-4", className)} {...props} />
  );
}

export { Detail, DetailGroup, DetailHeader, DetailLabel, DetailValue };
