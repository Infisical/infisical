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
  return (
    <div data-slot="detail-value" className={cn("text-sm break-words", className)} {...props} />
  );
}

function DetailGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="detail-group" className={cn("flex flex-col gap-y-4", className)} {...props} />
  );
}

export { Detail, DetailGroup, DetailLabel, DetailValue };
