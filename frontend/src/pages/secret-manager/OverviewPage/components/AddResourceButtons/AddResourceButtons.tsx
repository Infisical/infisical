import {
  ChevronDown,
  FingerprintIcon,
  FolderIcon,
  ImportIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableButtonGroup,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

type Props = {
  onAddSecret: () => void;
  onAddFolder: () => void;
  onAddDyanamicSecret: () => void;
  onAddSecretRotation: () => void;
  onAddSecretImport: () => void;
  onImportSecrets: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isSecretImportAvailable: boolean;
};

export function AddResourceButtons({
  onAddSecret,
  onAddFolder,
  onAddDyanamicSecret,
  onAddSecretRotation,
  onAddSecretImport,
  onImportSecrets,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isSecretImportAvailable
}: Props) {
  return (
    <UnstableButtonGroup>
      <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Secrets}>
        {(isAllowed) => (
          <Tooltip open={!isAllowed ? undefined : false}>
            <TooltipTrigger>
              <Button
                className="rounded-r-none"
                isDisabled={!isAllowed}
                variant="project"
                onClick={onAddSecret}
              >
                <PlusIcon />
                Add Secret
              </Button>
            </TooltipTrigger>
            <TooltipContent>Access Denied</TooltipContent>
          </Tooltip>
        )}
      </ProjectPermissionCan>
      <UnstableDropdownMenu>
        <UnstableDropdownMenuTrigger asChild>
          <UnstableIconButton variant="project">
            <ChevronDown />
          </UnstableIconButton>
        </UnstableDropdownMenuTrigger>
        <UnstableDropdownMenuContent align="end">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretFolders}
          >
            {(isAllowed) => (
              <Tooltip open={!isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <UnstableDropdownMenuItem onClick={onAddFolder} isDisabled={!isAllowed}>
                    <FolderIcon className="text-folder" />
                    Add Folder
                  </UnstableDropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">Access Restricted</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
          <Tooltip open={!isDyanmicSecretAvailable ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <UnstableDropdownMenuItem
                onClick={onAddDyanamicSecret}
                isDisabled={!isDyanmicSecretAvailable}
              >
                <FingerprintIcon className="text-dynamic-secret" />
                Add Dynamic Secret
              </UnstableDropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={!isSecretRotationAvailable ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <UnstableDropdownMenuItem
                onClick={onAddSecretRotation}
                isDisabled={!isSecretRotationAvailable}
              >
                <RefreshCwIcon className="text-secret-rotation" />
                Add Secret Rotation
              </UnstableDropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={!isSecretImportAvailable ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <UnstableDropdownMenuItem
                onClick={onAddSecretImport}
                isDisabled={!isSecretImportAvailable}
              >
                <ImportIcon className="text-import" />
                Add Secret Import
              </UnstableDropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Secrets}
          >
            {(isAllowed) => (
              <Tooltip open={!isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <UnstableDropdownMenuItem onClick={onImportSecrets} isDisabled={!isAllowed}>
                    <UploadIcon className="text-accent" />
                    Upload Secrets
                  </UnstableDropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">Access Restricted</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </UnstableDropdownMenuContent>
      </UnstableDropdownMenu>
    </UnstableButtonGroup>
  );
}
