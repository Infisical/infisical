import { BanIcon, CheckIcon, PencilIcon, UnplugIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EditSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import {
  Badge,
  Detail,
  DetailLabel,
  DetailValue,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { DataSourceConfigDisplay } from "./DataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningDataSourceSection = ({ dataSource }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["editDataSource"] as const);

  const { name, description, connection, isAutoScanEnabled, isDisconnected } = dataSource;

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-border-control bg-surface-base px-4 py-3">
        <div className="flex items-center justify-between border-b border-border-emphasis pb-2">
          <div className="mr-2 flex flex-1 items-center justify-between">
            <h3 className="font-normal text-foreground">Details</h3>
            {isDisconnected && (
              <Tooltip hoverable delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="ml-auto">
                    <Badge variant="danger">
                      <UnplugIcon />
                      Disconnected
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The external data source has been removed and can no longer be scanned. Delete
                  this data source and re-initialize the connection.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningDataSourceActions.Edit}
            a={ProjectPermissionSub.SecretScanningDataSources}
          >
            {(isAllowed) => (
              <IconButton
                variant="ghost"
                size="xs"
                isDisabled={!isAllowed}
                aria-label="Edit data source"
                onClick={() => handlePopUpOpen("editDataSource")}
              >
                <PencilIcon />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div>
          <div className="space-y-3">
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>
                {description || <span className="text-muted italic">None</span>}
              </DetailValue>
            </Detail>
            {connection && (
              <Detail>
                <DetailLabel>Connection</DetailLabel>
                <DetailValue>{connection.name}</DetailValue>
              </Detail>
            )}
            <DataSourceConfigDisplay dataSource={dataSource} />
            <Detail>
              <DetailLabel>Auto-Scan</DetailLabel>
              <DetailValue>
                {isAutoScanEnabled ? (
                  <Badge variant="success">
                    <CheckIcon />
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="neutral">
                    <BanIcon />
                    Disabled
                  </Badge>
                )}
              </DetailValue>
            </Detail>
          </div>
        </div>
      </div>
      <EditSecretScanningDataSourceModal
        dataSource={dataSource}
        onOpenChange={(isOpen) => handlePopUpToggle("editDataSource", isOpen)}
        isOpen={popUp.editDataSource.isOpen}
      />
    </>
  );
};
