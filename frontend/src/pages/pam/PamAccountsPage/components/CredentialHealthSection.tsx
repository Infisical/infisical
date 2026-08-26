import { formatDistanceToNow } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { PamHeartbeatStatus } from "@app/hooks/api/pam/enums";
import { useCheckPamAccountHeartbeat } from "@app/hooks/api/pam/mutations";
import { useGetPamAccountHeartbeat } from "@app/hooks/api/pam/queries";

const STATUS: Record<PamHeartbeatStatus, { label: string; indicator: string; className: string }> =
  {
    [PamHeartbeatStatus.Healthy]: {
      label: "Healthy",
      indicator: "●",
      className: "text-success"
    },
    [PamHeartbeatStatus.InvalidCredentials]: {
      label: "Rejected",
      indicator: "●",
      className: "text-danger"
    },
    [PamHeartbeatStatus.CannotCheck]: {
      label: "Unreachable",
      indicator: "●",
      className: "text-warning"
    },
    [PamHeartbeatStatus.Unknown]: {
      label: "Not checked",
      indicator: "○",
      className: "text-muted"
    }
  };

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
    <span className="text-sm text-foreground">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const relative = (value?: string | null) =>
  value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "Never";

type Props = {
  accountId?: string;
};

export const CredentialHealthSection = ({ accountId }: Props) => {
  const { data: heartbeat, isPending } = useGetPamAccountHeartbeat(accountId);
  const checkNow = useCheckPamAccountHeartbeat();

  if (!accountId || isPending || !heartbeat) return null;

  const status = heartbeat.status ?? PamHeartbeatStatus.Unknown;
  const { label, indicator, className } = STATUS[status];
  const isHealthy = status === PamHeartbeatStatus.Healthy;
  const hasFailure =
    status === PamHeartbeatStatus.InvalidCredentials && Boolean(heartbeat.lastMessage);

  const handleCheckNow = async () => {
    try {
      await checkNow.mutateAsync({ accountId });
      createNotification({ text: "Credential check complete", type: "success" });
    } catch {
      createNotification({ text: "Failed to check credential", type: "error" });
    }
  };

  return (
    <div className="mt-2 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Credential health</h3>
          <p className="text-xs text-muted">Whether this credential still signs in.</p>
        </div>
        <span className={`text-xs font-medium ${className}`}>
          {indicator} {label}
        </span>
      </div>

      <DetailRow label="Last checked">
        <span className="text-sm text-muted">{relative(heartbeat.lastCheckedAt)}</span>
      </DetailRow>
      {!isHealthy && (
        <DetailRow label="Last healthy">
          <span className="text-sm text-muted">{relative(heartbeat.lastHealthyAt)}</span>
        </DetailRow>
      )}

      <Button
        type="button"
        variant="pam"
        className="mt-4 w-full"
        isPending={checkNow.isPending}
        onClick={handleCheckNow}
      >
        Check now
      </Button>

      {hasFailure && (
        <Alert variant="danger" className="mt-4">
          <AlertTitle>The target rejected this credential</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {heartbeat.lastMessage}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
