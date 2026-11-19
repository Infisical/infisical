import { useState } from "react";
import { ChevronDownIcon, ListPlusIcon, PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  getAddedResourceScanDescription,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource,
  useAddAllSecretScanningResources
} from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { AddSecretScanningResourceSheet } from "./AddSecretScanningResourceSheet";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const AddSecretScanningResourcesButton = ({ dataSource }: Props) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddAllOpen, setIsAddAllOpen] = useState(false);

  const addAllResources = useAddAllSecretScanningResources();

  const { singularTitle, singularNoun, pluralTitle, pluralNoun } =
    RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  // GitLab has no account-level webhook, so new commits are only reported for projects added one by one;
  // hooking every project the connection can access could mean thousands of them.
  const isAddAllUnsupported =
    dataSource.type === SecretScanningDataSource.GitLab &&
    dataSource.config.scope === GitLabDataSourceScope.Account;

  const handleAddAll = async () => {
    const added = await addAllResources.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId
    });

    setIsAddAllOpen(false);
    createNotification({
      text: added.length
        ? `Added ${added.length} ${added.length === 1 ? singularNoun : pluralNoun}. ${getAddedResourceScanDescription(dataSource)}`
        : `Every ${singularNoun} the connection can access is already added.`,
      type: "success"
    });
  };

  return (
    <>
      <ProjectPermissionCan
        I={ProjectPermissionSecretScanningDataSourceActions.Edit}
        a={ProjectPermissionSub.SecretScanningDataSources}
      >
        {(isAllowed) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ss" isDisabled={!isAllowed || dataSource.isDisconnected}>
                <ChevronDownIcon />
                Add {singularTitle}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsSheetOpen(true)}>
                <PlusIcon />
                Add {singularTitle}
              </DropdownMenuItem>
              <Tooltip hoverable delayDuration={50} open={isAddAllUnsupported ? undefined : false}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    isDisabled={isAddAllUnsupported}
                    isDisabledFocusable={isAddAllUnsupported}
                    onClick={() => setIsAddAllOpen(true)}
                  >
                    <ListPlusIcon />
                    Add All {pluralTitle}
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Without a group, add projects individually so each one is watched for new commits.
                </TooltipContent>
              </Tooltip>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ProjectPermissionCan>
      <AddSecretScanningResourceSheet
        dataSource={dataSource}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      />
      <AlertDialog open={isAddAllOpen} onOpenChange={setIsAddAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add all {pluralNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every {singularNoun} the {SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name}{" "}
              connection can access will be added. {getAddedResourceScanDescription(dataSource)}
              {dataSource.isDiscoveryEnabled &&
                ` ${pluralTitle} created later are added automatically.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={addAllResources.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ss"
              isPending={addAllResources.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleAddAll();
              }}
            >
              Add All {pluralTitle}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
