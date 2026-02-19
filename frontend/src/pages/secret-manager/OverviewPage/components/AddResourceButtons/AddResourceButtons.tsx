import {
  ChevronDown,
  ClipboardPasteIcon,
  FingerprintIcon,
  FolderIcon,
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
  onImportSecrets: () => void;
  onReplicateSecrets: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isReplicateSecretsAvailable: boolean;
};

export function AddResourceButtons({
  onAddSecret,
  onAddFolder,
  onAddDyanamicSecret,
  onAddSecretRotation,
  onImportSecrets,
  onReplicateSecrets,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isReplicateSecretsAvailable
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
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretFolders}
          >
            {(isAllowed) => (
              <Tooltip open={!isReplicateSecretsAvailable || !isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <UnstableDropdownMenuItem
                    onClick={onReplicateSecrets}
                    isDisabled={!isReplicateSecretsAvailable || !isAllowed}
                  >
                    <ClipboardPasteIcon className="text-accent" />
                    Replicate Secrets
                  </UnstableDropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {!isReplicateSecretsAvailable
                    ? "Select a single environment to replicate secrets"
                    : "Access Denied"}
                </TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </UnstableDropdownMenuContent>
      </UnstableDropdownMenu>
    </UnstableButtonGroup>
  );
}
