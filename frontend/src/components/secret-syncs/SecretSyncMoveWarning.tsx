import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Checkbox, Label } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { TItemMove } from "@app/helpers/secretSyncCoverage";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useListSecretSyncsCoveringMove } from "@app/hooks/api/secretSyncs";

export type TSecretSyncMoveWarning = {
  secretSyncs: TSecretSync[];
  isChecking: boolean;
  hasError: boolean;
  needsAcknowledgement: boolean;
  isAcknowledged: boolean;
  setIsAcknowledged: (value: boolean) => void;
  isBlockingSubmit: boolean;
};

// remembers the warning the user ticked. it is cleared on any change, so returning to a warning ticked
// earlier asks again rather than carrying a yes over to syncs the user has not seen.
const useAcknowledgement = (warningKey: string) => {
  const [acknowledgedWarningKey, setAcknowledgedWarningKey] = useState<string | null>(null);

  useEffect(() => {
    setAcknowledgedWarningKey(null);
  }, [warningKey]);

  return {
    isAcknowledged: acknowledgedWarningKey === warningKey,
    setIsAcknowledged: (value: boolean) => setAcknowledgedWarningKey(value ? warningKey : null)
  };
};

// intentionally warns only about syncs the user can read
export const useSecretSyncMoveWarning = (
  projectId: string,
  moves: TItemMove[]
): TSecretSyncMoveWarning => {
  const { permission } = useProjectPermission();
  const canReadSecretSyncs = permission.can(
    ProjectPermissionSecretSyncActions.Read,
    ProjectPermissionSub.SecretSyncs
  );

  const {
    data: fetchedSecretSyncs = [],
    isLoading: isChecking,
    isError
  } = useListSecretSyncsCoveringMove(projectId, moves, {
    enabled: canReadSecretSyncs && moves.length > 0
  });

  // a disabled query keeps its last result, so a user whose read access is revoked mid-dialog must not
  // keep seeing the syncs it listed
  const secretSyncs = canReadSecretSyncs ? fetchedSecretSyncs : [];
  const hasError = canReadSecretSyncs && isError;
  const needsAcknowledgement = hasError || secretSyncs.length > 0;
  const { isAcknowledged, setIsAcknowledged } = useAcknowledgement(
    JSON.stringify({ moves, syncIds: secretSyncs.map(({ id }) => id), hasError })
  );

  return {
    secretSyncs,
    isChecking,
    hasError,
    needsAcknowledgement,
    isAcknowledged,
    setIsAcknowledged,
    isBlockingSubmit: isChecking || (needsAcknowledgement && !isAcknowledged)
  };
};

type Props = {
  warning: TSecretSyncMoveWarning;
  projectId: string;
  noun: string;
  verb: "moved" | "copied";
};

const getTitle = ({
  noun,
  verb,
  count,
  hasError
}: {
  noun: string;
  verb: Props["verb"];
  count: number;
  hasError: boolean;
}) => {
  if (hasError) return "Could not check the destination for secret syncs";

  const subject = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`;
  return `${subject} here will be synced to ${count} external destination${count === 1 ? "" : "s"}`;
};

const SecretSyncMoveWarningItem = ({
  sync,
  orgId,
  projectId
}: {
  sync: TSecretSync;
  orgId: string;
  projectId: string;
}) => (
  <li>
    <span className="font-medium text-foreground">{sync.name}</span>
    {` (${SECRET_SYNC_MAP[sync.destination].name}) syncs `}
    <code>{sync.folder?.path ?? "/"}</code>
    {sync.syncOptions.includeAllSubFolders ? " and all its subfolders." : "."}
    {!sync.isAutoSyncEnabled && " Auto-sync is off, so it sends them on its next manual sync."}{" "}
    <Link
      to={ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path}
      params={{
        orgId,
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
);

export const SecretSyncMoveWarning = ({ warning, projectId, noun, verb }: Props) => {
  const { currentOrg } = useOrganization();
  const { needsAcknowledgement, isChecking, hasError, secretSyncs } = warning;

  if (isChecking || !needsAcknowledgement) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{getTitle({ noun, verb, count: secretSyncs.length, hasError })}</AlertTitle>
      <AlertDescription>
        {hasError && <p>Secret syncs may send these {noun} to external destinations.</p>}
        {secretSyncs.length > 0 && (
          <ul className="max-h-40 list-disc overflow-y-auto pl-4">
            {secretSyncs.map((sync) => (
              <SecretSyncMoveWarningItem
                key={sync.id}
                sync={sync}
                orgId={currentOrg.id}
                projectId={projectId}
              />
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
