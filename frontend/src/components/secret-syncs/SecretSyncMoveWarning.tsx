import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Checkbox, Label } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import {
  getSecretSyncsNewlyCoveringPaths,
  TMoveWarningsCheck
} from "@app/helpers/secretSyncCoverage";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { useListSecretSyncs } from "@app/hooks/api/secretSyncs";

// the acknowledgement is tied to the checks and the warning it was given for, and cleared whenever
// either changes, so a yes never carries over to a destination or a set of syncs the user has not seen.
// like the synced indicator on the dashboard, syncs the user cannot read are left out entirely.
export const useSecretSyncMoveWarning = (projectId: string, checks: TMoveWarningsCheck[]) => {
  const { permission } = useProjectPermission();
  const canReadSecretSyncs = permission.can(
    ProjectPermissionSecretSyncActions.Read,
    ProjectPermissionSub.SecretSyncs
  );
  const isEnabled = canReadSecretSyncs && checks.length > 0;

  // never served from cache, so a sync created since the list was last loaded is not missed
  const {
    data: projectSyncs,
    isLoading,
    isError
  } = useListSecretSyncs(projectId, {
    enabled: isEnabled,
    staleTime: 0
  });

  const secretSyncs = useMemo(
    () => (isEnabled && projectSyncs ? getSecretSyncsNewlyCoveringPaths(projectSyncs, checks) : []),
    [isEnabled, projectSyncs, checks]
  );
  const isChecking = isEnabled && isLoading;
  const hasError = isEnabled && isError;

  const warningKey = JSON.stringify({
    checks,
    syncIds: secretSyncs.map(({ id }) => id),
    hasError
  });
  const [acknowledgedWarningKey, setAcknowledgedWarningKey] = useState<string | null>(null);

  useEffect(() => {
    setAcknowledgedWarningKey(null);
  }, [warningKey]);

  const isAcknowledged = acknowledgedWarningKey === warningKey;
  const needsAcknowledgement = hasError || secretSyncs.length > 0;

  return {
    secretSyncs,
    isChecking,
    hasError,
    needsAcknowledgement,
    isAcknowledged,
    setIsAcknowledged: (value: boolean) => setAcknowledgedWarningKey(value ? warningKey : null),
    isBlockingSubmit: isChecking || (needsAcknowledgement && !isAcknowledged)
  };
};

type Props = {
  warning: ReturnType<typeof useSecretSyncMoveWarning>;
  projectId: string;
  noun: string;
  verb: "moved" | "copied";
};

const getTitle = ({
  subject,
  count,
  hasError
}: {
  subject: string;
  count: number;
  hasError: boolean;
}) => {
  if (hasError) return "Could not check the destination for secret syncs";
  return `${subject} here will be synced to ${count} external destination${count === 1 ? "" : "s"}`;
};

export const SecretSyncMoveWarning = ({ warning, projectId, noun, verb }: Props) => {
  const { currentOrg } = useOrganization();
  const { needsAcknowledgement, isChecking, hasError, secretSyncs } = warning;

  if (isChecking || !needsAcknowledgement) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>
        {getTitle({
          subject: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`,
          count: secretSyncs.length,
          hasError
        })}
      </AlertTitle>
      <AlertDescription>
        {hasError && <p>Secret syncs may send these {noun} to external destinations.</p>}
        {secretSyncs.length > 0 && (
          <ul className="max-h-40 list-disc overflow-y-auto pl-4">
            {secretSyncs.map((sync) => (
              <li key={sync.id}>
                <span className="font-medium text-foreground">{sync.name}</span>
                {` (${SECRET_SYNC_MAP[sync.destination].name}) syncs `}
                <code>{sync.folder?.path ?? "/"}</code>
                {sync.syncOptions.includeAllSubFolders ? " and all its subfolders." : "."}
                {!sync.isAutoSyncEnabled &&
                  " Auto-sync is off, so it sends them on its next manual sync."}{" "}
                <Link
                  to={ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path}
                  params={{
                    orgId: currentOrg.id,
                    projectId,
                    destination: sync.destination,
                    syncId: sync.id
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  View Sync
                  <ExternalLinkIcon className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Checkbox
            id="secret-sync-move-warning-acknowledgement"
            variant="warning"
            isChecked={warning.isAcknowledged}
            onCheckedChange={(checked) => warning.setIsAcknowledged(checked === true)}
          />
          <Label htmlFor="secret-sync-move-warning-acknowledgement">
            I understand these {noun} {hasError ? "may" : "will"} be synced to external destinations
          </Label>
        </div>
      </AlertDescription>
    </Alert>
  );
};
