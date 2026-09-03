import { formatDistanceToNow } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import {
  formatRotationInterval,
  PamHeartbeatStatus,
  PamResourcePermissionActions
} from "@app/hooks/api/pam/enums";
import { useCheckPamAccountHeartbeat } from "@app/hooks/api/pam/mutations";
import { useGetPamAccountHeartbeat, usePamAccountActions } from "@app/hooks/api/pam/queries";

type StatusPresentation = {
  label: string;
  indicator: string;
  className: string;
  reasonClassName: string;
};

const STATUS: Record<PamHeartbeatStatus, StatusPresentation> = {
  [PamHeartbeatStatus.Healthy]: {
    label: "Healthy",
    indicator: "●",
    className: "text-success",
    reasonClassName: ""
  },
  [PamHeartbeatStatus.InvalidCredentials]: {
    label: "Out of Sync",
    indicator: "●",
    className: "text-danger",
    reasonClassName: "border-danger/40 bg-danger/10 text-danger"
  },
  [PamHeartbeatStatus.CannotCheck]: {
    label: "Unreachable",
    indicator: "●",
    className: "text-warning",
    reasonClassName: "border-warning/40 bg-warning/10 text-warning"
  },
  [PamHeartbeatStatus.Unknown]: {
    label: "Unchecked",
    indicator: "○",
    className: "text-muted",
    reasonClassName: "border-border bg-container text-muted"
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
  const { can } = usePamAccountActions(accountId ?? "", Boolean(accountId));
  const checkNow = useCheckPamAccountHeartbeat();

  if (!accountId || isPending || !heartbeat) return null;

  const canCheckNow = can(PamResourcePermissionActions.ViewCredentials);

  const status = heartbeat.status ?? PamHeartbeatStatus.Unknown;
  const { label, indicator, className, reasonClassName } =
    STATUS[status] ?? STATUS[PamHeartbeatStatus.Unknown];
  const isHealthy = status === PamHeartbeatStatus.Healthy;
  const reason = !isHealthy && heartbeat.lastMessage ? heartbeat.lastMessage : null;

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
          <p className="text-xs text-muted">
            {heartbeat.enabled
              ? `Checked every ${formatRotationInterval(heartbeat.intervalSeconds)}, from ${heartbeat.templateName}.`
              : `Scheduled checks are off for ${heartbeat.templateName}.`}
          </p>
        </div>
        <span className={`text-xs font-medium ${className}`}>
          {indicator} {label}
        </span>
      </div>

      {!heartbeat.enabled && status !== PamHeartbeatStatus.Unknown && (
        <DetailRow label="Result">
          <span className="text-sm text-muted">
            From the last check, before checking was turned off
          </span>
        </DetailRow>
      )}
      <DetailRow label="Last checked">
        <span className="text-sm text-muted">{relative(heartbeat.lastCheckedAt)}</span>
      </DetailRow>
      {!isHealthy && (
        <DetailRow label="Last healthy">
          <span className="text-sm text-muted">{relative(heartbeat.lastHealthyAt)}</span>
        </DetailRow>
      )}
      {reason && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs break-words whitespace-pre-line ${reasonClassName}`}
        >
          {reason}
        </div>
      )}

      <Button
        type="button"
        variant="pam"
        className="mt-4 w-full"
        isDisabled={!canCheckNow}
        isPending={checkNow.isPending}
        onClick={handleCheckNow}
      >
        Check now
      </Button>
    </div>
  );
};
