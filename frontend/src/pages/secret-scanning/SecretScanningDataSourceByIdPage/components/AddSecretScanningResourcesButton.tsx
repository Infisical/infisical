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
  DropdownMenuTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  areAllSecretScanningResourcesIncluded,
  getAddedResourceScanDescription,
  getConfigWithAllResourcesIncluded,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  TSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { AddSecretScanningResourceSheet } from "./AddSecretScanningResourceSheet";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const AddSecretScanningResourcesButton = ({ dataSource }: Props) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddAllOpen, setIsAddAllOpen] = useState(false);

  const updateDataSource = useUpdateSecretScanningDataSource();

  const { singularTitle, singularNoun, pluralTitle, pluralNoun } =
    RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const isEverythingIncluded = areAllSecretScanningResourcesIncluded(dataSource);

  const handleAddAll = async () => {
    const config = getConfigWithAllResourcesIncluded(dataSource);
    if (!config) return;

    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      config
    });

    setIsAddAllOpen(false);
    createNotification({
      text: `Added all ${pluralNoun}. ${getAddedResourceScanDescription(dataSource)}`,
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
              <Button variant="project" isDisabled={!isAllowed || dataSource.isDisconnected}>
                <ChevronDownIcon />
                Add {singularTitle}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                isDisabled={isEverythingIncluded}
                onClick={() => setIsSheetOpen(true)}
              >
                <PlusIcon />
                Add {singularTitle}
              </DropdownMenuItem>
              <DropdownMenuItem
                isDisabled={isEverythingIncluded}
                onClick={() => setIsAddAllOpen(true)}
              >
                <ListPlusIcon />
                Add All {pluralTitle}
              </DropdownMenuItem>
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
            <AlertDialogCancel isDisabled={updateDataSource.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              isPending={updateDataSource.isPending}
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
