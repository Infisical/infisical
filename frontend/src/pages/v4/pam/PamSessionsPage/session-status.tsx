import { Badge } from "@infisical/cipher/ui/badge";

import { PamSessionStatus } from "@app/hooks/api/pam";

const STATUS: Record<PamSessionStatus, { label: string; tone: "soft" | "ok" | "outline" | "bad" }> =
  {
    [PamSessionStatus.Starting]: { label: "Starting", tone: "soft" },
    [PamSessionStatus.Active]: { label: "Active", tone: "ok" },
    [PamSessionStatus.Ended]: { label: "Ended", tone: "outline" },
    [PamSessionStatus.Terminated]: { label: "Terminated", tone: "bad" }
  };

export const SessionStatus = ({ status }: { status: PamSessionStatus }) => {
  const meta = STATUS[status] ?? { label: status, tone: "outline" as const };
  return (
    <Badge tone={meta.tone} dot={status === PamSessionStatus.Active}>
      {meta.label}
    </Badge>
  );
};
