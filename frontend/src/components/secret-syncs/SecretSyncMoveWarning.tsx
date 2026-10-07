import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Checkbox, Label } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { TItemMove } from "@app/helpers/secretSyncCoverage";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useListSecretSyncsCoveringMove } from "@app/hooks/api/secretSyncs";

type TAcknowledgement = {
  isRequired: boolean;
  isAcknowledged: boolean;
  setIsAcknowledged: (value: boolean) => void;
};

export type TSecretSyncMoveWarning = {
  secretSyncs: TSecretSync[];
  duplicatedSecretSyncs: TSecretSync[];
  isChecking: boolean;
  hasError: boolean;
  coverageAcknowledgement: TAcknowledgement;
  isBlockingSubmit: boolean;
};

// remembers the warning the user ticked. it is cleared on any change, so returning to a warning ticked
// earlier asks again rather than carrying a yes over to syncs the user has not seen.
const useAcknowledgement = (isRequired: boolean, warningKey: string): TAcknowledgement => {
  const [acknowledgedWarningKey, setAcknowledgedWarningKey] = useState<string | null>(null);

  useEffect(() => {
    setAcknowledgedWarningKey(null);
  }, [warningKey]);

  return {
    isRequired,
    isAcknowledged: acknowledgedWarningKey === warningKey,
    setIsAcknowledged: (value: boolean) => setAcknowledgedWarningKey(value ? warningKey : null)
  };
};

// intentionally warns only about syncs the user can read
export const useSecretSyncMoveWarning = (
  projectId: string,
  moves: TItemMove[],
  { isCopy = false }: { isCopy?: boolean } = {}
): TSecretSyncMoveWarning => {
  const { permission } = useProjectPermission();
  const canReadSecretSyncs = permission.can(
    ProjectPermissionSecretSyncActions.Read,
    ProjectPermissionSub.SecretSyncs
  );

  const {
    data,
    isLoading: isChecking,
    isError
  } = useListSecretSyncsCoveringMove(projectId, moves, {
    enabled: canReadSecretSyncs && moves.length > 0,
    isCopy
  });

  // a disabled query keeps its last result, so a user whose read access is revoked mid-dialog must not
  // keep seeing the syncs it listed
  const secretSyncs = (canReadSecretSyncs && data?.newSecretSyncs) || [];
  const duplicatedSecretSyncs = (canReadSecretSyncs && data?.duplicatedSecretSyncs) || [];
  const hasError = canReadSecretSyncs && isError;

  const coverageAcknowledgement = useAcknowledgement(
    hasError || secretSyncs.length > 0,
    JSON.stringify({ moves, syncIds: secretSyncs.map(({ id }) => id), hasError })
  );

  return {
    secretSyncs,
    duplicatedSecretSyncs,
    isChecking,
    hasError,
    coverageAcknowledgement,
    isBlockingSubmit:
      isChecking ||
      duplicatedSecretSyncs.length > 0 ||
      (coverageAcknowledgement.isRequired && !coverageAcknowledgement.isAcknowledged)
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
  projectId,
  manualSyncNote
}: {
  sync: TSecretSync;
  orgId: string;
  projectId: string;
  manualSyncNote?: string;
}) => (
  <li>
    <span className="font-medium text-foreground">{sync.name}</span>
    {` (${SECRET_SYNC_MAP[sync.destination].name}) syncs `}
    <code>{sync.folder?.path ?? "/"}</code>
    {sync.syncOptions.includeAllSubFolders ? " and all its subfolders." : "."}
    {manualSyncNote && !sync.isAutoSyncEnabled && ` Auto-sync is off, so ${manualSyncNote}.`}{" "}
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

const SecretSyncMoveWarningList = ({
  syncs,
  projectId,
  manualSyncNote
}: {
  syncs: TSecretSync[];
  projectId: string;
  manualSyncNote?: string;
}) => {
  const { currentOrg } = useOrganization();

  return (
    <ul className="max-h-40 list-disc overflow-y-auto pl-4">
      {syncs.map((sync) => (
        <SecretSyncMoveWarningItem
          key={sync.id}
          sync={sync}
          orgId={currentOrg.id}
          projectId={projectId}
          manualSyncNote={manualSyncNote}
        />
      ))}
    </ul>
  );
};

const AcknowledgementCheckbox = ({
  id,
  acknowledgement,
  label
}: {
  id: string;
  acknowledgement: TAcknowledgement;
  label: string;
}) => (
  <div className="mt-2 flex items-center gap-2">
    <Checkbox
      id={id}
      variant="warning"
      isChecked={acknowledgement.isAcknowledged}
      onCheckedChange={(checked) => acknowledgement.setIsAcknowledged(checked === true)}
    />
    <Label htmlFor={id}>{label}</Label>
  </div>
);

export const SecretSyncMoveWarning = ({ warning, projectId, noun, verb }: Props) => {
  const { isChecking, hasError, secretSyncs, duplicatedSecretSyncs, coverageAcknowledgement } =
    warning;

  if (isChecking) return null;

  return (
    <>
      {coverageAcknowledgement.isRequired && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{getTitle({ noun, verb, count: secretSyncs.length, hasError })}</AlertTitle>
          <AlertDescription>
            {hasError && <p>Secret syncs may send these {noun} to external destinations.</p>}
            {secretSyncs.length > 0 && (
              <SecretSyncMoveWarningList
                syncs={secretSyncs}
                projectId={projectId}
                manualSyncNote="it sends them on its next manual sync"
              />
            )}
            <AcknowledgementCheckbox
              id="secret-sync-move-warning-acknowledgement"
              acknowledgement={coverageAcknowledgement}
              label={`I understand these ${noun} ${hasError ? "may" : "will"} be synced to external destinations`}
            />
          </AlertDescription>
        </Alert>
      )}
      {duplicatedSecretSyncs.length > 0 && (
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertTitle>Cannot copy these secrets here</AlertTitle>
          <AlertDescription>
            <p>
              The following secret syncs cover both folders and cannot send two secrets with the
              same name. Choose a destination outside them:
            </p>
            <SecretSyncMoveWarningList syncs={duplicatedSecretSyncs} projectId={projectId} />
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
