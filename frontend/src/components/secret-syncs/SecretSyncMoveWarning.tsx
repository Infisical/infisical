import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Checkbox, Label } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { useGetMoveWarnings } from "@app/hooks/api/dashboard/queries";
import { TMoveWarningsCheck } from "@app/hooks/api/dashboard/types";

// the acknowledgement is tied to the checks it was given for, so changing the destination clears it
// and a user never carries a yes over to a path they have not seen the warning for.
export const useSecretSyncMoveWarning = (checks: TMoveWarningsCheck[]) => {
  const warnings = useGetMoveWarnings(checks);
  const checksKey = JSON.stringify(checks);
  const [acknowledgedChecksKey, setAcknowledgedChecksKey] = useState<string | null>(null);

  const isAcknowledged = acknowledgedChecksKey === checksKey;
  const needsAcknowledgement =
    warnings.hasError || warnings.hasHiddenSecretSyncs || warnings.secretSyncs.length > 0;

  return {
    ...warnings,
    needsAcknowledgement,
    isAcknowledged,
    setIsAcknowledged: (value: boolean) => setAcknowledgedChecksKey(value ? checksKey : null),
    isBlockingSubmit: warnings.isChecking || (needsAcknowledgement && !isAcknowledged)
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
  visibleCount,
  hasHidden,
  hasError
}: {
  subject: string;
  visibleCount: number;
  hasHidden: boolean;
  hasError: boolean;
}) => {
  if (hasError) return "Could not check the destination for secret syncs";
  if (hasHidden) return `${subject} here will be synced to external destinations`;
  return `${subject} here will be synced to ${visibleCount} external destination${visibleCount === 1 ? "" : "s"}`;
};

export const SecretSyncMoveWarning = ({ warning, projectId, noun, verb }: Props) => {
  const { currentOrg } = useOrganization();
  const { needsAcknowledgement, isChecking, hasError, hasHiddenSecretSyncs, secretSyncs } = warning;

  if (isChecking || !needsAcknowledgement) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>
        {getTitle({
          subject: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`,
          visibleCount: secretSyncs.length,
          hasHidden: hasHiddenSecretSyncs,
          hasError
        })}
      </AlertTitle>
      <AlertDescription>
        {hasError && <p>Secret syncs may send these {noun} to external destinations.</p>}
        {secretSyncs.length > 0 && (
          <ul className="list-disc pl-4">
            {secretSyncs.map((sync) => (
              <li key={sync.id}>
                <span className="font-medium text-foreground">{sync.name}</span>
                {` (${SECRET_SYNC_MAP[sync.destination].name}) syncs `}
                <code>{sync.secretPath ?? "/"}</code>
                {sync.includeAllSubFolders ? " and all its subfolders." : "."}
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
        {hasHiddenSecretSyncs && (
          <p>
            {secretSyncs.length
              ? "Other secret syncs you don't have access to also cover the destination."
              : "Secret syncs you don't have access to cover the destination."}
          </p>
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
