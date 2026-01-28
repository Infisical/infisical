import { ChevronDown, FingerprintIcon, FolderIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

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
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
};

export function AddResourceButtons({
  onAddSecret,
  onAddFolder,
  onAddDyanamicSecret,
  onAddSecretRotation,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable
}: Props) {
  return (
    <UnstableButtonGroup>
      <Button variant="project" onClick={onAddSecret}>
        <PlusIcon />
        Add Secret
      </Button>
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
              <UnstableDropdownMenuItem onClick={onAddFolder} isDisabled={!isAllowed}>
                <FolderIcon className="text-folder" />
                Add Folder
              </UnstableDropdownMenuItem>
            )}
          </ProjectPermissionCan>
          <Tooltip open={!isDyanmicSecretAvailable ? undefined : false}>
            <TooltipTrigger>
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
            <TooltipTrigger asChild>
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
        </UnstableDropdownMenuContent>
      </UnstableDropdownMenu>
    </UnstableButtonGroup>
  );
}
