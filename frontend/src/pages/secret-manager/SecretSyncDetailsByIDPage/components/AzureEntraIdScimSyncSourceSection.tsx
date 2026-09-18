import { AlertTriangleIcon } from "lucide-react";

import {
  Badge,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
import { TAzureEntraIdScimSync } from "@app/hooks/api/secretSyncs/types/azure-entra-id-scim-sync";

type Props = {
  secretSync: TSecretSync;
};

export const AzureEntraIdScimSyncSourceSection = ({ secretSync }: Props) => {
  const { folder, environment } = secretSync;
  const { currentProject } = useProject();

  const scimSync = secretSync as TAzureEntraIdScimSync;
  const secretId = scimSync.syncOptions?.secretId;

  const { data: secrets } = useGetProjectSecrets({
    projectId: currentProject.id,
    environment: environment?.slug ?? "",
    secretPath: folder?.path ?? "/",
    viewSecretValue: false,
    options: {
      enabled: Boolean(secretId && environment?.slug && folder?.path)
    }
  });

  const secretName = secretId ? secrets?.find((s) => s.id === secretId)?.key : undefined;

  return (
    <DetailGroup>
      <DetailGroupHeader>
        Source
        {(!folder || !environment) && (
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Badge variant="danger">
                    <AlertTriangleIcon />
                    Folder Deleted
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                The source location for this sync has been deleted. Configure a new source or remove
                this sync.
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </DetailGroupHeader>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment?.name}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{folder?.path}</DetailValue>
      </Detail>
      {secretName && (
        <Detail>
          <DetailLabel>Secret</DetailLabel>
          <DetailValue>{secretName}</DetailValue>
        </Detail>
      )}
    </DetailGroup>
  );
};
