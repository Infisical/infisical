import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

const STATUS_MAP: Record<string, { label: string; variant: "info" | "success" | "danger" }> = {
  running: { label: "Running", variant: "info" },
  completed: { label: "Healthy", variant: "success" },
  failed: { label: "Failed", variant: "danger" }
};

export const DiscoveryStatusBadge = ({
  status,
  error
}: {
  status?: string | null;
  error?: string | null;
}) => {
  const meta = status ? STATUS_MAP[status] : undefined;
  if (!meta) return <Badge variant="neutral">Never scanned</Badge>;

  const badge = (
    <Badge variant={meta.variant} className={status === "running" ? "animate-pulse" : undefined}>
      {meta.label}
    </Badge>
  );

  if (status === "failed" && error) {
    return (
      <Tooltip>
        <TooltipTrigger>{badge}</TooltipTrigger>
        <TooltipContent>{error}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
};
