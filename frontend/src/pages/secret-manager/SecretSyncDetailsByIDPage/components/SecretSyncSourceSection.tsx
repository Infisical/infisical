import { AlertTriangleIcon } from "lucide-react";

import {
  Badge,
  Detail,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AzureEntraIdScimSyncSourceSection } from "./AzureEntraIdScimSyncSourceSection";

type Props = {
  secretSync: TSecretSync;
};

const DefaultSecretSyncSourceSection = ({ secretSync }: Props) => {
  const { folder, environment } = secretSync;

  return (
    <>
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
    </>
  );
};

export const SecretSyncSourceSection = ({ secretSync }: Props) => {
  switch (secretSync.destination) {
    case SecretSync.AzureEntraIdScim:
      return <AzureEntraIdScimSyncSourceSection secretSync={secretSync} />;
    default:
      return <DefaultSecretSyncSourceSection secretSync={secretSync} />;
  }
};
